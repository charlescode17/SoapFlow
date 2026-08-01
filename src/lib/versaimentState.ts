import { useState, useEffect, useCallback } from "react";

export interface VersaimentRecord {
  approved: boolean;
  versaimentDate?: string;
  source: "cash" | "telephone";
}

type VersaimentMap = Record<string, VersaimentRecord>;

const STORAGE_KEY = "sf_versaiments";

function readStorage(): VersaimentMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStorage(map: VersaimentMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("sf-versaiment-update"));
}

export function keyFor(agentId: string, date: string) {
  return `${agentId}__${date}`;
}

export function useVersaimentState() {
  const [map, setMap] = useState<VersaimentMap>(() => readStorage());

  useEffect(() => {
    const handler = () => setMap(readStorage());
    window.addEventListener("sf-versaiment-update", handler);
    window.addEventListener("storage", handler); // cross-tab sync
    return () => {
      window.removeEventListener("sf-versaiment-update", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const setRecord = useCallback((key: string, record: VersaimentRecord) => {
    setMap((prev) => {
      const next = { ...prev, [key]: record };
      writeStorage(next);
      return next;
    });
  }, []);

  return { map, setRecord };
}