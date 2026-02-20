"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WsEvent } from "@/lib/shared-types";
import { createApiClient, ensureDashboardSessionToken } from "@/lib/api/client";
import { mapActivity, mapPayment, mapTrade, type ActivityVM, type AgentVM, type ConnectionStatus, type PaymentVM, type TradeVM } from "@/lib/mappers";
import { createRealtimeClient } from "@/lib/realtime/ws-client";

interface RuntimeState {
  loading: boolean;
  error?: string;
  agents: AgentVM[];
  payments: PaymentVM[];
  trades: TradeVM[];
  activity: ActivityVM[];
  connectionStatus: ConnectionStatus;
  token: string;
  refresh: () => Promise<void>;
  startAgent: (agentId: string) => Promise<void>;
  stopAgent: (agentId: string) => Promise<void>;
  triggerAgent: (agentId: string) => Promise<void>;
}

export function useDashboardRuntime(): RuntimeState {
  const api = useMemo(() => createApiClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [token, setToken] = useState("");
  const [agents, setAgents] = useState<AgentVM[]>([]);
  const [payments, setPayments] = useState<PaymentVM[]>([]);
  const [trades, setTrades] = useState<TradeVM[]>([]);
  const [activity, setActivity] = useState<ActivityVM[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("offline");

  const mergeById = <T extends { id: string }>(current: T[], next: T): T[] => {
    const map = new Map(current.map((item) => [item.id, item]));
    map.set(next.id, next);
    return Array.from(map.values());
  };

  const sortByCreatedDesc = <T extends { createdAt?: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bTime - aTime;
    });

  const loadAll = useCallback(async () => {
    setError(undefined);
    const sessionToken = await ensureDashboardSessionToken();
    setToken(sessionToken);

    const [nextAgents, nextPayments, nextTrades, nextActivity] = await Promise.all([
      api.listAgents(sessionToken),
      api.listPayments(sessionToken),
      api.listTrades(sessionToken),
      api.listActivity(sessionToken)
    ]);

    setAgents(nextAgents);
    setPayments(nextPayments);
    setTrades(nextTrades);
    setActivity(nextActivity);
  }, [api]);

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      setLoading(true);
      try {
        await loadAll();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Dashboard data load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  useEffect(() => {
    const realtime = createRealtimeClient({ realtimeMode: process.env.NEXT_PUBLIC_REALTIME_MODE === "polling" ? "polling" : "ws" });

    const unsubStatus = realtime.onStatus((status) => {
      setConnectionStatus(status);
    });

    const unsubEvents = realtime.subscribe((event: WsEvent) => {
      if (event.type === "agent.status") {
        setAgents((current) =>
          current.map((agent) =>
            agent.id === event.agentId
              ? {
                  ...agent,
                  status: event.status === "running" || event.status === "paused" || event.status === "idle" || event.status === "error" ? event.status : "unknown"
                }
              : agent
          )
        );
      }

      if (event.type === "payment.update") {
        setPayments((current) => sortByCreatedDesc(mergeById(current, mapPayment(event.payment))));
      }

      if (event.type === "trade.update") {
        setTrades((current) => sortByCreatedDesc(mergeById(current, mapTrade(event.trade))));
      }

      if (event.type === "activity.new") {
        setActivity((current) => sortByCreatedDesc(mergeById(current, mapActivity(event.event))));
      }
    });

    realtime.connect();

    const poller = setInterval(() => {
      if (realtime.getStatus() === "polling-fallback" || realtime.getStatus() === "offline") {
        void loadAll();
      }
    }, 15_000);

    return () => {
      clearInterval(poller);
      unsubEvents();
      unsubStatus();
      realtime.disconnect();
    };
  }, [loadAll]);

  const runMutable = useCallback(
    async (fn: (agentId: string, token: string) => Promise<void>, agentId: string): Promise<void> => {
      try {
        const activeToken = token || (await ensureDashboardSessionToken());
        await fn(agentId, activeToken);
        await loadAll();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Agent mutation failed");
      }
    },
    [token, loadAll]
  );

  return {
    loading,
    error,
    agents,
    payments,
    trades,
    activity,
    connectionStatus,
    token,
    refresh: loadAll,
    startAgent: async (agentId) => runMutable(api.startAgent, agentId),
    stopAgent: async (agentId) => runMutable(api.stopAgent, agentId),
    triggerAgent: async (agentId) => runMutable(api.triggerAgent, agentId)
  };
}
