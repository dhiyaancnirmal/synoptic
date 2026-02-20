import assert from "node:assert/strict";
import test from "node:test";
import { createRealtimeClient } from "./ws-client.js";
import type { WsEvent } from "@/lib/shared-types";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(value: string): void {
    this.sent.push(value);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  emitMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitError(): void {
    this.onerror?.({} as Event);
  }

  emitClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("realtime client enters polling-fallback mode immediately when configured", () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousWebSocket = globalThis.WebSocket;
  (globalThis as { window?: unknown }).window = {};
  (globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
  MockWebSocket.instances = [];

  try {
    const statuses: string[] = [];
    const client = createRealtimeClient({ realtimeMode: "polling", url: "ws://example/ws" });
    client.onStatus((status) => statuses.push(status));
    client.connect();

    assert.equal(client.getStatus(), "polling-fallback");
    assert.equal(MockWebSocket.instances.length, 0);
    assert.ok(statuses.includes("polling-fallback"));
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
    globalThis.WebSocket = previousWebSocket;
  }
});

test("realtime client reconnects after websocket close and can be forced to fallback", async () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousWebSocket = globalThis.WebSocket;
  (globalThis as { window?: unknown }).window = {};
  (globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
  MockWebSocket.instances = [];

  try {
    const statuses: string[] = [];
    const client = createRealtimeClient({ realtimeMode: "ws", url: "ws://example/ws" });
    client.onStatus((status) => statuses.push(status));
    client.connect();

    assert.equal(MockWebSocket.instances.length, 1);
    const socket = MockWebSocket.instances[0]!;
    socket.emitOpen();
    assert.equal(client.getStatus(), "connected");

    socket.emitClose();
    assert.equal(client.getStatus(), "reconnecting");

    await wait(900);
    assert.ok(MockWebSocket.instances.length >= 2);

    client.setFallbackMode(true);
    assert.equal(client.getStatus(), "polling-fallback");
    client.disconnect();
    assert.equal(client.getStatus(), "offline");
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
    globalThis.WebSocket = previousWebSocket;
  }
});

test("realtime client emits valid websocket events and ignores invalid payloads", () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousWebSocket = globalThis.WebSocket;
  (globalThis as { window?: unknown }).window = {};
  (globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
  MockWebSocket.instances = [];

  try {
    const received: WsEvent[] = [];
    const client = createRealtimeClient({ realtimeMode: "ws", url: "ws://example/ws" });
    client.subscribe((event) => received.push(event));
    client.connect();

    const socket = MockWebSocket.instances[0]!;
    socket.emitOpen();
    socket.emitMessage("not-json");
    socket.emitMessage(
      JSON.stringify({
        type: "agent.status",
        agentId: "agent-1",
        status: "running"
      })
    );

    assert.equal(received.length, 1);
    assert.equal(received[0]?.type, "agent.status");
    client.disconnect();
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
    globalThis.WebSocket = previousWebSocket;
  }
});
