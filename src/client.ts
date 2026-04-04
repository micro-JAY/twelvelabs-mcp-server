/**
 * TwelveLabs API Client — wraps the ElevenLabs Conversational AI API.
 *
 * A single shared Axios instance used by all tools. This is important for two
 * reasons: (1) we only configure auth headers in one place, and (2) all error
 * handling lives here so individual tools stay clean.
 *
 * Every request to ElevenLabs needs the xi-api-key header. We pull the key
 * from the environment variable ELEVENLABS_API_KEY at startup.
 */

import axios, { AxiosError, type AxiosRequestConfig } from "axios";

export const BASE_URL = "https://api.elevenlabs.io";

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

/** Build a pre-configured Axios instance with the API key baked in. */
export function createClient(apiKey: string) {
  return axios.create({
    baseURL: BASE_URL,
    timeout: 30_000,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });
}

// Module-level singleton — initialised once when the server starts.
let _client: ReturnType<typeof createClient> | null = null;

export function getClient(): ReturnType<typeof createClient> {
  if (!_client) throw new Error("API client not initialised — call initClient() first.");
  return _client;
}

export function initClient(): void {
  const key = requireApiKey();
  _client = createClient(key);
}

/**
 * Perform a typed GET request.
 * Generic T lets callers declare the expected response shape, keeping
 * the return type precise without casting everywhere.
 */
export async function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const cfg: AxiosRequestConfig = params ? { params } : {};
  const res = await getClient().get<T>(path, cfg);
  return res.data;
}

/** Typed PATCH — used for partial agent updates. */
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await getClient().patch<T>(path, body);
  return res.data;
}

/** Typed POST — used for creating KB docs, etc. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await getClient().post<T>(path, body);
  return res.data;
}

/** DELETE — returns nothing meaningful, so no generic needed. */
export async function apiDelete(path: string): Promise<void> {
  await getClient().delete(path);
}

/**
 * Convert any thrown value into a readable error string.
 * Axios wraps HTTP errors in AxiosError objects that contain the response body,
 * which is usually the most useful thing to show the caller.
 */
export function formatError(error: unknown): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;

    // Specific status messages
    if (status === 401) return "Error: Unauthorized — check your ELEVENLABS_API_KEY.";
    if (status === 404) return "Error: Not found — check the ID is correct.";
    if (status === 429) return "Error: Rate limit exceeded — wait a moment before retrying.";

    if (status === 400) {
      const detail = error.response?.data?.detail;
      const msg = typeof detail === "string"
        ? detail
        : detail?.message ?? JSON.stringify(detail ?? error.response?.data ?? "Bad request");
      return `Error: Validation failed (400) — ${truncate(msg, 500)}`;
    }

    if (status && status >= 500) {
      return `Error: ElevenLabs API returned ${status} — this is a server-side issue, try again later.`;
    }

    // Network-level errors (no HTTP response)
    if (!error.response) {
      const code = error.code;
      if (code === "ECONNREFUSED" || code === "ECONNRESET")
        return "Error: Cannot connect to ElevenLabs API — check your network.";
      if (code === "ETIMEDOUT" || code === "ECONNABORTED")
        return "Error: Request to ElevenLabs timed out — try again.";
      if (code === "ENOTFOUND")
        return "Error: DNS lookup failed for ElevenLabs API — check your network.";
      return `Error: Network error — ${error.message}`;
    }

    // Generic HTTP error — sanitize body
    const body = sanitizeErrorBody(error.response.data);
    return `Error: ElevenLabs API returned ${status}: ${truncate(body, 500)}`;
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
