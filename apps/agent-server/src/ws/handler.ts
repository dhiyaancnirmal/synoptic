import type { WsEvent } from "@synoptic/types/ws-events";

export function sendEvent(socket: { send: (payload: string) => void }, event: WsEvent): void {
  socket.send(JSON.stringify(event));
}
