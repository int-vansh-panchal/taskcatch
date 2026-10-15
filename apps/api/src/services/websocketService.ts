import type { WebSocket } from "ws";
import type { WebSocketServerEvent } from "@taskcatch/shared";

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  deviceId?: string;
}

class WebSocketService {
  private clients: Set<ClientConnection> = new Set();

  register(ws: WebSocket, userId: string, deviceId?: string) {
    const conn: ClientConnection = { ws, userId, deviceId };
    this.clients.add(conn);

    ws.on("close", () => {
      this.clients.delete(conn);
    });

    ws.on("error", () => {
      this.clients.delete(conn);
    });
  }

  broadcastToUser(userId: string, event: WebSocketServerEvent, excludeDeviceId?: string) {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.userId === userId) {
        if (excludeDeviceId && client.deviceId === excludeDeviceId) {
          continue;
        }
        if (client.ws.readyState === client.ws.OPEN) {
          client.ws.send(message);
        }
      }
    }
  }

  broadcast(event: WebSocketServerEvent) {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(message);
      }
    }
  }
}

export const wsService = new WebSocketService();
