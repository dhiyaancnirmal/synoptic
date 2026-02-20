import assert from "node:assert/strict";
import test from "node:test";
import type { WsEvent } from "@synoptic/types/ws-events";
import { WsHub } from "./hub.js";

class FakeSocket {
  public readonly sent: string[] = [];
  private readonly listeners = new Map<"close" | "error", Array<() => void>>();

  send(payload: string): void {
    this.sent.push(payload);
  }

  on(event: "close" | "error", listener: () => void): void {
    const current = this.listeners.get(event) ?? [];
    current.push(listener);
    this.listeners.set(event, current);
  }

  trigger(event: "close" | "error"): void {
    const current = this.listeners.get(event) ?? [];
    for (const listener of current) {
      listener();
    }
  }
}

test("ws hub broadcasts events and drops closed sockets", () => {
  const hub = new WsHub();
  const first = new FakeSocket();
  const second = new FakeSocket();
  const event: WsEvent = {
    type: "agent.status",
    agentId: "agent-1",
    status: "running"
  };

  hub.subscribe(first);
  hub.subscribe(second);
  hub.broadcast(event);
  assert.equal(first.sent.length, 1);
  assert.equal(second.sent.length, 1);
  assert.equal(hub.connectedClients(), 2);

  second.trigger("close");
  hub.broadcast(event);
  assert.equal(first.sent.length, 2);
  assert.equal(second.sent.length, 1);
  assert.equal(hub.connectedClients(), 1);
});
