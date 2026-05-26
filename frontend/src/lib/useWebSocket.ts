"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { JobRecord } from "./dashboard-types";
import { readTokens } from "./authStorage";

const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE_URL ?? "ws://localhost:8000/ws";

export function useWebSocket(onEvent?: (event: JobRecord) => void) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(1000);
  const lastEventTimeRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current) return;

    const tokens = readTokens();
    if (!tokens.accessToken) {
      // Reconnect when auth is available
      reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
      return;
    }

    let url = `${WS_BASE}?token=${encodeURIComponent(tokens.accessToken)}`;
    if (lastEventTimeRef.current) {
      url += `&since=${encodeURIComponent(lastEventTimeRef.current)}`;
    }

    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectDelayRef.current = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as JobRecord;
        if (data && data.updated_at) {
          lastEventTimeRef.current = data.updated_at;
        }
        if (onEvent) {
          onEvent(data);
        }
      } catch (err) {
        console.error("Error parsing WebSocket event:", err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      socketRef.current = null;
      // Exponential backoff
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 1.5, 30000);
        connect();
      }, reconnectDelayRef.current);
    };

    ws.onerror = (err) => {
      console.error("WebSocket connection error:", err);
      ws.close();
    };
  }, [onEvent]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}
