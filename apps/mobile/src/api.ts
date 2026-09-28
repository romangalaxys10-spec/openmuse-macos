import { Platform } from "react-native";

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (typeof window !== "undefined" &&
  window.location?.origin &&
  !window.location.origin.startsWith("file:") &&
  window.location.origin !== "null" &&
  window.location.port !== "8081"
    ? window.location.origin
    : Platform.OS === "android"
      ? "http://10.0.2.2:8787"
      : "http://localhost:8787")
).replace(/\/$/, "");

export class MuseApi {
  constructor(readonly token: string) {}
  async request<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined || body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(
        typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`,
      );
    return payload;
  }
  url(path: string) {
    return path.startsWith("http") ? path : `${API_URL}${path}`;
  }
}

export async function createSession(
  accessKey?: string,
): Promise<{ token: string; mode: "sample" | "live" }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${API_URL}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not open your workspace.");
      return payload;
    } catch (err: any) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  if (message.includes("NetworkError") || message.includes("Failed to fetch")) {
    throw new Error(`Cannot reach OpenMuse server at ${API_URL}. Server is starting or unavailable.`);
  }
  throw lastError instanceof Error ? lastError : new Error(message || "Could not open your workspace.");
}
