import type { WsEvent } from "@synoptic/types/ws-events";
import { sendEvent } from "./handler.js";

interface WsSocketLike {
  send: (payload: string) => void;
  on: (event: "close" | "error", listener: () => void) => void;
}

export class WsHub {
  private readonly sockets = new Set<WsSocketLike>();

  subscribe(socket: WsSocketLike): void {
    this.sockets.add(socket);
    const detach = () => {
      this.sockets.delete(socket);
    };
    socket.on("close", detach);
    socket.on("error", detach);
  }

  broadcast(event: WsEvent): void {
    for (const socket of this.sockets) {
      try {
        sendEvent(socket, event);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  connectedClients(): number {
    return this.sockets.size;
  }
}
