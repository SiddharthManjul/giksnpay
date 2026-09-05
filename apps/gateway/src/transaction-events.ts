import { z } from "zod";

const broadcastSchema = z
  .object({
    events: z.array(
      z
        .object({
          eventType: z.string(),
          sequence: z.number().int().nonnegative(),
          transactionId: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Realtime messages are refresh hints only. D1 remains authoritative and the
 * frontend refetches the transaction plus audit stream after every reconnect.
 */
export class TransactionEventStream {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/publish" && request.method === "POST") {
      const message = broadcastSchema.parse(await request.json());
      const serialized = JSON.stringify({ kind: "AUDIT_COMMITTED", ...message });
      for (const socket of this.state.getWebSockets()) {
        try {
          socket.send(serialized);
        } catch {
          socket.close(1011, "Delivery failed");
        }
      }
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.send(JSON.stringify({ kind: "CONNECTED", refetchRequired: true }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === "string" && message === "ping") socket.send("pong");
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }
}
