import assert from "node:assert/strict";
import test from "node:test";
import { Orchestrator } from "./orchestrator.js";
import { RuntimeStore } from "../state/runtime-store.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("orchestrator boot starts loops for running agents and emits tick activity", async () => {
  const store = new RuntimeStore();
  const running = await store.createAgent({ name: "running-agent", status: "running" });
  await store.createAgent({ name: "idle-agent", status: "idle" });

  const orchestrator = new Orchestrator({
    store,
    tickIntervalMs: 50,
    maxConsecutiveErrors: 3
  });

  await orchestrator.boot();
  await sleep(130);
  await orchestrator.stopAll();

  const runningEvents = await store.listActivity(running.id);
  const runningTickEvents = runningEvents.filter((event) => event.eventType === "agent.tick.completed");
  assert.ok(runningTickEvents.length > 0);
});

test("orchestrator isolates failing agents and auto-pauses on max consecutive errors", async () => {
  const store = new RuntimeStore();
  const healthy = await store.createAgent({ name: "healthy", status: "running" });
  const failing = await store.createAgent({ name: "failing", status: "running" });

  const orchestrator = new Orchestrator({
    store,
    tickIntervalMs: 40,
    maxConsecutiveErrors: 2,
    tickRunner: async ({ agentId }) => {
      if (agentId === failing.id) {
        throw new Error("forced-failure");
      }
      return { detail: "ok" };
    }
  });

  await orchestrator.boot();
  await sleep(220);
  await orchestrator.stopAll();

  const healthyAgent = await store.getAgent(healthy.id);
  const failingAgent = await store.getAgent(failing.id);
  assert.equal(healthyAgent?.status, "running");
  assert.equal(failingAgent?.status, "paused");

  const healthyEvents = await store.listActivity(healthy.id);
  const failingEvents = await store.listActivity(failing.id);
  assert.ok(healthyEvents.some((event) => event.eventType === "agent.tick.completed"));
  assert.ok(failingEvents.some((event) => event.eventType === "agent.auto_paused"));
});
