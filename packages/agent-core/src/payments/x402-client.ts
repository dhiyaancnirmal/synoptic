import type { X402Challenge } from "./x402-types.js";

export interface X402Response<T> {
  challenge?: X402Challenge;
  data?: T;
}

export interface RequestWithX402Input {
  url: string;
  init?: RequestInit;
  fetcher?: typeof fetch;
  getXPaymentHeader: (challenge: Record<string, unknown>) => Promise<string>;
}

export async function requestWithX402<T>(input: RequestWithX402Input): Promise<X402Response<T>> {
  const fetcher = input.fetcher ?? fetch;
  const initial = await fetcher(input.url, input.init);
  if (initial.status !== 402) {
    return { data: (await initial.json()) as T };
  }

  const challenge = (await initial.json()) as Record<string, unknown>;
  const xPayment = await input.getXPaymentHeader(challenge);
  const headers = new Headers(input.init?.headers);
  headers.set("x-payment", xPayment);
  const retried = await fetcher(input.url, {
    ...input.init,
    headers
  });

  return { challenge: challenge as unknown as X402Challenge, data: (await retried.json()) as T };
}
