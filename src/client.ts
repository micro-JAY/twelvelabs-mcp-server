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
    console.error("ERROR: ELEVENLABS_API_KEY environment variable is not set.");
    process.exit(1);
  }
  return key;
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
    const body = JSON.stringify(error.response?.data ?? error.message);
    if (status === 401) return "Error: Unauthorized — check your ELEVENLABS_API_KEY.";
    if (status === 404) return "Error: Not found — check the ID is correct.";
    if (status === 429) return "Error: Rate limit exceeded — wait before retrying.";
    return `Error: ElevenLabs API returned ${status}: ${body}`;
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
