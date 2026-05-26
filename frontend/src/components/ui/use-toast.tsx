"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type ToastVariant = "default" | "success" | "info" | "warning" | "error";

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastRecord = Required<Pick<ToastInput, "title">> & {
  id: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toasts: ToastRecord[];
  toast: (toast: ToastInput) => string;
  dismissToast: (toastId: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function createToastId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
    const timer = timers.current.get(toastId);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(toastId);
    }
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "default", durationMs = 4200 }: ToastInput) => {
      const id = createToastId();
      const record: ToastRecord = { id, title, description, variant };
      setToasts((current) => [record, ...current].slice(0, 4));
      const timer = window.setTimeout(() => dismissToast(id), durationMs);
      timers.current.set(id, timer);
      return id;
    },
    [dismissToast],
  );

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer);
      }
      timers.current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toasts, toast, dismissToast }), [dismissToast, toast, toasts]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export type { ToastInput, ToastRecord, ToastVariant };
