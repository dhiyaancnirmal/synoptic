import type { CreateAgentResponse, ListAgentsResponse, ListEventsResponse } from "@synoptic/types/rest";

const API_URL = process.env.SYNOPTIC_API_URL ?? "http://localhost:3001";
const API_TOKEN = process.env.SYNOPTIC_API_TOKEN ?? "";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");

  if (API_TOKEN) {
    headers.set("authorization", `Bearer ${API_TOKEN}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

export async function createAgent(ownerAddress: string): Promise<CreateAgentResponse> {
  return apiRequest<CreateAgentResponse>("/agents", {
    method: "POST",
    body: JSON.stringify({ ownerAddress })
  });
}

export async function listAgents(): Promise<ListAgentsResponse> {
  return apiRequest<ListAgentsResponse>("/agents");
}

export async function monitorAgent(agentId: string): Promise<ListEventsResponse> {
  return apiRequest<ListEventsResponse>(`/events?agentId=${encodeURIComponent(agentId)}`);
}
