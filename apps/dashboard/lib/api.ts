import type { HealthResponse } from "@synoptic/types/rest";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function pingApi(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    if (!res.ok) return `unreachable (${res.status})`;
    const data = (await res.json()) as HealthResponse;
    return data.status;
  } catch {
    return "unreachable";
  }
}
