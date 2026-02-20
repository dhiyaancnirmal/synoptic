import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../server.js";
import { createTestAuthHeaders } from "./test-auth.js";

test("agent routes support create/list/get/start/stop/trigger", async (t) => {
  const app = await createServer();
  const headers = createTestAuthHeaders();
  t.after(async () => {
    await app.close();
  });

  const create = await app.inject({ method: "POST", url: "/api/agents", headers });
  assert.equal(create.statusCode, 200);
  assert.equal(create.json().code, "OK");
  const createdAgentId = create.json().data.agent.id as string;

  const list = await app.inject({ method: "GET", url: "/api/agents", headers });
  assert.equal(list.statusCode, 200);
  assert.ok(Array.isArray(list.json().data.agents));

  const getById = await app.inject({ method: "GET", url: `/api/agents/${createdAgentId}`, headers });
  assert.equal(getById.statusCode, 200);
  assert.equal(getById.json().data.agent.id, createdAgentId);

  const start = await app.inject({ method: "POST", url: `/api/agents/${createdAgentId}/start`, headers });
  assert.equal(start.statusCode, 200);
  assert.equal(start.json().data.status, "running");

  const stop = await app.inject({ method: "POST", url: `/api/agents/${createdAgentId}/stop`, headers });
  assert.equal(stop.statusCode, 200);
  assert.equal(stop.json().data.status, "paused");

  const trigger = await app.inject({ method: "POST", url: `/api/agents/${createdAgentId}/trigger`, headers });
  assert.equal(trigger.statusCode, 200);
  assert.equal(trigger.json().data.triggered, true);

  const activity = await app.inject({ method: "GET", url: `/api/activity?agentId=${createdAgentId}`, headers });
  assert.equal(activity.statusCode, 200);
  const events = activity.json().data.events as Array<{ eventType: string }>;
  assert.ok(events.some((event) => event.eventType === "agent.tick.completed"));
});
