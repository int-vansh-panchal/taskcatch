import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useAuth } from "./AuthContext";

type EventCallback = (data: any) => void;

interface WebSocketContextType {
  isConnected: boolean;
  socket: WebSocket | null;
  subscribe: (eventType: string, cb: EventCallback) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<EventCallback>>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let unmounted = false;
    let reconnectTimeout: any = null;

    const connect = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const userId = user?.id || "user_personal_01";
      const wsUrl = `${protocol}//${host}/ws?userId=${encodeURIComponent(userId)}&deviceId=web_pwa`;

      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type) {
              const callbacks = listenersRef.current.get(data.type);
              if (callbacks) {
                callbacks.forEach((cb) => cb(data));
              }
              const allCallbacks = listenersRef.current.get("*");
              if (allCallbacks) {
                allCallbacks.forEach((cb) => cb(data));
              }
            }
          } catch {
            // non-json frame
          }
        };

        ws.onclose = () => {
          if (unmounted) return;
          setIsConnected(false);
          reconnectTimeout = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        reconnectTimeout = setTimeout(connect, 4000);
      }
    };

    connect();

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [user?.id]);

  const subscribe = (eventType: string, cb: EventCallback) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType)!.add(cb);

    return () => {
      listenersRef.current.get(eventType)?.delete(cb);
    };
  };

  return (
    <WebSocketContext.Provider value={{ isConnected, socket: socketRef.current, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
};
