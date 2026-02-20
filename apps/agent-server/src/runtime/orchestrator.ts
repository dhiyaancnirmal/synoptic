import type { ActivityEvent, Agent } from "@synoptic/types";
import type { AgentStatus } from "@synoptic/types/agent";
import { runAgentTick, type AgentTickRunner } from "./agent-loop.js";
import type { RuntimeStoreContract } from "../state/runtime-store.js";

export interface OrchestratorOptions {
  store: RuntimeStoreContract;
  tickIntervalMs: number;
  maxConsecutiveErrors: number;
  tickRunner?: AgentTickRunner;
  random?: () => number;
  onAgentStatus?: (agentId: string, status: AgentStatus) => void;
  onActivity?: (event: ActivityEvent) => void;
}

interface LoopState {
  timer: NodeJS.Timeout | null;
  stopRequested: boolean;
  consecutiveErrors: number;
  runningTick: Promise<void> | null;
}

const LOOP_EVENT_CHAIN = "kite-testnet";
const JITTER_RATIO = 0.2;
const MAX_BACKOFF_MULTIPLIER = 8;

export class Orchestrator {
  private readonly loops = new Map<string, LoopState>();
  private readonly random: () => number;
  private readonly tickRunner: AgentTickRunner;
  private readonly onAgentStatus?: (agentId: string, status: AgentStatus) => void;
  private readonly onActivity?: (event: ActivityEvent) => void;

  constructor(private readonly options: OrchestratorOptions) {
    this.random = options.random ?? Math.random;
    this.tickRunner = options.tickRunner ?? runAgentTick;
    this.onAgentStatus = options.onAgentStatus;
    this.onActivity = options.onActivity;
  }

  async boot(): Promise<void> {
    const agents = await this.options.store.listAgents();
    const running = agents.filter((agent) => agent.status === "running");
    await Promise.all(running.map(async (agent) => this.ensureLoop(agent.id)));
  }

  async startAgent(agentId: string): Promise<Agent | undefined> {
    const agent = await this.options.store.getAgent(agentId);
    if (!agent) return undefined;

    if (agent.status !== "running") {
      if (agent.status !== "idle" && agent.status !== "paused") {
        throw new Error(`invalid_transition:${agent.status}->running`);
      }
      await this.options.store.setAgentStatus(agentId, "running");
      this.onAgentStatus?.(agentId, "running");
    }

    await this.ensureLoop(agentId);
    return (await this.options.store.getAgent(agentId)) ?? agent;
  }

  async stopAgent(agentId: string): Promise<Agent | undefined> {
    const agent = await this.options.store.getAgent(agentId);
    if (!agent) return undefined;

    if (agent.status === "running") {
      await this.options.store.setAgentStatus(agentId, "paused");
      this.onAgentStatus?.(agentId, "paused");
    }

    await this.stopLoop(agentId);
    return await this.options.store.getAgent(agentId);
  }

  async triggerAgent(agentId: string): Promise<Agent | undefined> {
    const agent = await this.options.store.getAgent(agentId);
    if (!agent) return undefined;

    await this.runTick(agentId, true);
    return agent;
  }

  async stopAll(): Promise<void> {
    const ids = [...this.loops.keys()];
    await Promise.all(ids.map(async (agentId) => this.stopLoop(agentId)));
  }

  private async ensureLoop(agentId: string): Promise<void> {
    const existing = this.loops.get(agentId);
    if (existing) {
      return;
    }

    const state: LoopState = {
      timer: null,
      stopRequested: false,
      consecutiveErrors: 0,
      runningTick: null
    };
    this.loops.set(agentId, state);
    this.scheduleNext(agentId, state, 0);
  }

  private async stopLoop(agentId: string): Promise<void> {
    const state = this.loops.get(agentId);
    if (!state) return;
    state.stopRequested = true;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.runningTick) {
      await state.runningTick;
    }
    this.loops.delete(agentId);
  }

  private scheduleNext(agentId: string, state: LoopState, baseDelayMs: number): void {
    if (state.stopRequested) return;
    const jitter = 1 + (this.random() * 2 - 1) * JITTER_RATIO;
    const delay = Math.max(50, Math.floor(baseDelayMs * jitter));
    state.timer = setTimeout(() => {
      state.timer = null;
      state.runningTick = this.runTick(agentId, false).finally(() => {
        state.runningTick = null;
      });
    }, delay);
  }

  private async runTick(agentId: string, triggered: boolean): Promise<void> {
    const state = this.loops.get(agentId);
    if (!state && !triggered) return;
    const startedAt = Date.now();
    const started = await this.options.store.addActivity(agentId, "agent.tick.started", LOOP_EVENT_CHAIN, {
      source: triggered ? "trigger" : "scheduler"
    });
    this.onActivity?.(started);

    try {
      const result = await this.tickRunner({ agentId });
      const completed = await this.options.store.addActivity(agentId, "agent.tick.completed", LOOP_EVENT_CHAIN, {
        source: triggered ? "trigger" : "scheduler",
        durationMs: Date.now() - startedAt,
        detail: result.detail
      });
      this.onActivity?.(completed);

      if (state) {
        state.consecutiveErrors = 0;
        this.scheduleNext(agentId, state, this.options.tickIntervalMs);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const failed = await this.options.store.addActivity(agentId, "agent.tick.error", LOOP_EVENT_CHAIN, {
        source: triggered ? "trigger" : "scheduler",
        durationMs: Date.now() - startedAt,
        message
      });
      this.onActivity?.(failed);

      if (!state) return;

      state.consecutiveErrors += 1;
      if (state.consecutiveErrors >= this.options.maxConsecutiveErrors) {
        await this.options.store.setAgentStatus(agentId, "paused");
        this.onAgentStatus?.(agentId, "paused");
        const paused = await this.options.store.addActivity(agentId, "agent.auto_paused", LOOP_EVENT_CHAIN, {
          reason: "max_consecutive_errors",
          consecutiveErrors: state.consecutiveErrors
        });
        this.onActivity?.(paused);
        state.stopRequested = true;
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        this.loops.delete(agentId);
        return;
      }

      const backoffMultiplier = Math.min(2 ** state.consecutiveErrors, MAX_BACKOFF_MULTIPLIER);
      this.scheduleNext(agentId, state, this.options.tickIntervalMs * backoffMultiplier);
    }
  }
}
