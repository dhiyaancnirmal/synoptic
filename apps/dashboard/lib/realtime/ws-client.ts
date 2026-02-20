import type { WsEvent } from "@/lib/shared-types";
import type { ConnectionStatus } from "@/lib/mappers";

type Listener = (event: WsEvent) => void;
type StatusListener = (status: ConnectionStatus) => void;

export interface RealtimeClient {
  connect: () => void;
  disconnect: () => void;
  subscribe: (listener: Listener) => () => void;
  onStatus: (listener: StatusListener) => () => void;
  getStatus: () => ConnectionStatus;
  setFallbackMode: (enabled: boolean) => void;
}

interface Options {
  url?: string;
  realtimeMode?: "ws" | "polling";
}

const WS_URL = process.env.NEXT_PUBLIC_AGENT_SERVER_WS
  ? process.env.NEXT_PUBLIC_AGENT_SERVER_WS
  : process.env.NEXT_PUBLIC_AGENT_SERVER_URL
    ? `${process.env.NEXT_PUBLIC_AGENT_SERVER_URL.replace("http", "ws")}/ws`
    : "ws://localhost:3001/ws";

export function createRealtimeClient(options: Options = {}): RealtimeClient {
  let ws: WebSocket | null = null;
  let status: ConnectionStatus = "offline";
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let attempts = 0;
  let fallbackEnabled = options.realtimeMode === "polling";

  const listeners = new Set<Listener>();
  const statusListeners = new Set<StatusListener>();

  const endpoint = options.url ?? WS_URL;

  function setStatus(next: ConnectionStatus): void {
    status = next;
    for (const listener of statusListeners) listener(next);
  }

  function scheduleReconnect(): void {
    if (fallbackEnabled) {
      setStatus("polling-fallback");
      return;
    }

    attempts += 1;
    const jitter = Math.random() * 250;
    const backoff = Math.min(10_000, 300 * 2 ** attempts + jitter);
    setStatus("reconnecting");
    reconnectTimer = setTimeout(connect, backoff);
  }

  function clearTimers(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function connect(): void {
    if (typeof window === "undefined") return;
    if (fallbackEnabled || ws?.readyState === WebSocket.OPEN) {
      if (fallbackEnabled) setStatus("polling-fallback");
      return;
    }

    clearTimers();

    ws = new WebSocket(endpoint);

    ws.onopen = () => {
      attempts = 0;
      setStatus("connected");
      heartbeatTimer = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "ping", time: Date.now() }));
      }, 25_000);
    };

    ws.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data as string) as WsEvent;
        for (const listener of listeners) listener(payload);
      } catch {
        // ignore invalid payloads
      }
    };

    ws.onerror = () => {
      if (fallbackEnabled) {
        setStatus("polling-fallback");
        return;
      }
      setStatus("reconnecting");
    };

    ws.onclose = () => {
      ws = null;
      clearTimers();
      if (fallbackEnabled) {
        setStatus("polling-fallback");
        return;
      }
      scheduleReconnect();
    };
  }

  function disconnect(): void {
    fallbackEnabled = true;
    clearTimers();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    ws = null;
    setStatus("offline");
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function onStatus(listener: StatusListener): () => void {
    statusListeners.add(listener);
    listener(status);
    return () => statusListeners.delete(listener);
  }

  function setFallbackMode(enabled: boolean): void {
    fallbackEnabled = enabled;
    if (enabled) {
      clearTimers();
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
      ws = null;
      setStatus("polling-fallback");
      return;
    }

    connect();
  }

  return {
    connect,
    disconnect,
    subscribe,
    onStatus,
    getStatus: () => status,
    setFallbackMode
  };
}
