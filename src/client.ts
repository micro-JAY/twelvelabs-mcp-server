/**
 * TwelveLabs API Client — wraps the ElevenLabs Conversational AI API.
 *
 * Uses the Node 18+ global `fetch`. A single shared client config (just the
 * API key) is held in module state and pulled in by every request helper —
 * we only configure auth in one place, and all error handling lives in
 * `formatError` so individual tools stay clean.
 *
 * Every request to ElevenLabs needs the xi-api-key header. We pull the key
 * from the environment variable ELEVENLABS_API_KEY at startup.
 */

export const BASE_URL = "https://api.elevenlabs.io";

const TIMEOUT_MS = 30_000;

/** Validate that the API key is present before the server starts accepting calls. */
export function requireApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY environment variable is not set. " +
      "Set it in your Claude Desktop config or shell environment."
    );
  }
  return key;
}

/**
 * Validate that a value is a safe URL path segment.
 * ElevenLabs IDs are alphanumeric strings, sometimes with hyphens/underscores.
 * Reject anything containing path separators, dots, or whitespace.
 */
export function validatePathSegment(value: string, label: string): string {
  if (!value || /[\/\\.\s]/.test(value) || value !== encodeURIComponent(value)) {
    throw new Error(`Invalid ${label}: "${value}" contains unsafe characters.`);
  }
  return value;
}

interface ClientConfig {
  readonly apiKey: string;
}

let _client: ClientConfig | null = null;

function getClient(): ClientConfig {
  if (!_client) throw new Error("API client not initialised — call initClient() first.");
  return _client;
}

export function initClient(): void {
  _client = { apiKey: requireApiKey() };
}

class HttpError extends Error {
  constructor(public readonly status: number, public readonly body: unknown) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

class NetworkError extends Error {
  constructor(message: string, public readonly cause: unknown) {
    super(message);
    this.name = "NetworkError";
  }
}

interface RequestOptions {
  readonly params?: Record<string, unknown>;
  readonly body?: unknown;
}

/**
 * Core request helper — every typed verb wrapper below funnels through this.
 * Throws HttpError on non-2xx responses and NetworkError on transport failures
 * (DNS, connection refused, timeout). formatError handles both shapes.
 */
async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const { apiKey } = getClient();

  let url = `${BASE_URL}${path}`;
  if (opts.params) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined && v !== null) usp.append(k, String(v));
    }
    const qs = usp.toString();
    if (qs) url += `?${qs}`;
  }

  const init: RequestInit = {
    method,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : String(err), err);
  }

  if (!res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    let body: unknown = null;
    try {
      body = ct.includes("application/json") ? await res.json() : await res.text();
    } catch {
      // Body unreadable — leave as null
    }
    throw new HttpError(res.status, body);
  }

  // 204 No Content (DELETE) — no JSON to parse
  if (res.status === 204) return undefined as T;

  // Some endpoints return empty 200 — guard against parse errors
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Perform a typed GET request.
 * Generic T lets callers declare the expected response shape, keeping
 * the return type precise without casting everywhere.
 */
export async function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  return request<T>("GET", path, params ? { params } : {});
}

/** Typed PATCH — used for partial agent updates. */
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PATCH", path, { body });
}

/** Typed POST — used for creating KB docs, etc. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, { body });
}

/** DELETE — returns nothing meaningful, so no generic needed. */
export async function apiDelete(path: string): Promise<void> {
  await request<void>("DELETE", path);
}

/**
 * Convert any thrown value into a readable error string.
 * HttpError carries status + parsed response body; NetworkError carries the
 * underlying cause from fetch (TimeoutError, TypeError with system errno, etc.).
 */
export function formatError(error: unknown): string {
  if (error instanceof HttpError) {
    const status = error.status;

    if (status === 401) return "Error: Unauthorized — check your ELEVENLABS_API_KEY.";
    if (status === 404) return "Error: Not found — check the ID is correct.";
    if (status === 429) return "Error: Rate limit exceeded — wait a moment before retrying.";

    if (status === 400) {
      const data = error.body as { detail?: string | { message?: string } } | null;
      const detail = data?.detail;
      const msg = typeof detail === "string"
        ? detail
        : detail?.message ?? JSON.stringify(detail ?? data ?? "Bad request");
      return `Error: Validation failed (400) — ${truncate(msg, 500)}`;
    }

    if (status >= 500) {
      return `Error: ElevenLabs API returned ${status} — this is a server-side issue, try again later.`;
    }

    const body = sanitizeErrorBody(error.body);
    return `Error: ElevenLabs API returned ${status}: ${truncate(body, 500)}`;
  }

  if (error instanceof NetworkError) {
    // AbortSignal.timeout fires a DOMException named "TimeoutError"
    const cause = error.cause as { name?: string; code?: string; cause?: { code?: string } } | undefined;
    if (cause?.name === "TimeoutError" || cause?.name === "AbortError") {
      return "Error: Request to ElevenLabs timed out — try again.";
    }
    // Node fetch wraps system errors in a TypeError; the errno code lives on .cause
    const code = cause?.cause?.code ?? cause?.code;
    if (code === "ECONNREFUSED" || code === "ECONNRESET")
      return "Error: Cannot connect to ElevenLabs API — check your network.";
    if (code === "ETIMEDOUT" || code === "ECONNABORTED")
      return "Error: Request to ElevenLabs timed out — try again.";
    if (code === "ENOTFOUND")
      return "Error: DNS lookup failed for ElevenLabs API — check your network.";
    return `Error: Network error — ${error.message}`;
  }

  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

const REDACT_KEYS = new Set(["headers", "authorization", "api_key", "xi-api-key", "secret", "api-key"]);

function sanitizeErrorBody(data: unknown): string {
  if (data == null) return "(no body)";
  if (typeof data === "string") return data;
  // Strip sensitive fields before serializing
  const cleaned = JSON.parse(JSON.stringify(data, (key, value) =>
    REDACT_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : value
  ));
  return JSON.stringify(cleaned);
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}
