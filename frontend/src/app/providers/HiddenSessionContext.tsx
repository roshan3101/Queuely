"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useToken } from "@/app/providers/TokenProvider";
import { apiFetch } from "@/lib/apiClient";

type HiddenSessionContextType = {
  hiddenSessionId: string | null;
};

const HiddenSessionContext = createContext<HiddenSessionContextType | undefined>(undefined);

export function HiddenSessionProvider({ children }: { children: ReactNode }) {
  const { tokenState } = useToken();
  const [hiddenSessionId, setHiddenSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenState?.accessToken) return;
    if (hiddenSessionId) return;

    // Load the static hidden file from public folder
    fetch("/hidden.txt")
      .then((res) => {
        if (!res.ok) throw new Error("Hidden file not reachable");
        return res.blob();
      })
      .then((blob) => new File([blob], "hidden.txt", { type: "text/plain" }))
      .then((file) => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("name", "hidden_context");
        return apiFetch("/sessions", { method: "POST", body: fd });
      })
      .then((resp) => resp.json())
      .then((json) => {
        const id = json?.data?.session_id;
        if (id) setHiddenSessionId(id);
      })
      .catch((e) => console.error("Failed to create hidden session:", e));
  }, [tokenState?.accessToken, hiddenSessionId]);

  return (
    <HiddenSessionContext.Provider value={{ hiddenSessionId }}>
      {children}
    </HiddenSessionContext.Provider>
  );
}

export function useHiddenSession() {
  const ctx = useContext(HiddenSessionContext);
  if (!ctx) throw new Error("useHiddenSession must be used within HiddenSessionProvider");
  return ctx;
}
