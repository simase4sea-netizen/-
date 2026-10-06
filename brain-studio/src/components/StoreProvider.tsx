"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CaseRecord, Project, Settings, Store } from "@/lib/types";

export type SaveState = "saved" | "pending" | "saving" | "error";

interface ApiStatus {
  hasApiKey: boolean;
  model: string;
  dataPath: string;
}

interface StoreCtx {
  store: Store | null;
  loadError: string | null;
  status: ApiStatus | null;
  /** 実際に生成でAPIを使うか（キーあり かつ デモ強制でない） */
  usesApi: boolean;
  saveStates: Record<string, SaveState>;
  reload: () => Promise<void>;
  updateProject: (id: string, fn: (p: Project) => Project) => void;
  flushProject: (id: string) => Promise<void>;
  addProjects: (projects: Project[]) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  saveCases: (cases: CaseRecord[]) => Promise<void>;
  getProject: (id: string) => Project | undefined;
  /** 非同期処理の途中でも最新の内容を取り出す */
  getLatestProject: (id: string) => Project | undefined;
}

const Ctx = createContext<StoreCtx | null>(null);

const SAVE_DELAY = 800;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<Store | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const storeRef = useRef<Store | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inflight = useRef<Partial<Record<string, Promise<void>>>>({});

  storeRef.current = store;

  const reload = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([jsonFetch<Store>("/api/data"), jsonFetch<ApiStatus>("/api/status")]);
      setStore(s);
      setStatus(st);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setSave = (id: string, s: SaveState) => setSaveStates((prev) => ({ ...prev, [id]: s }));

  const persist = useCallback(async (id: string) => {
    const p = storeRef.current?.projects.find((x) => x.id === id);
    if (!p) return;
    setSave(id, "saving");
    const run = (async () => {
      try {
        await jsonFetch(`/api/projects/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ project: p }) });
        // 保存中にさらに編集があった場合は pending のまま
        setSaveStates((prev) => ({ ...prev, [id]: timers.current[id] ? "pending" : "saved" }));
      } catch {
        setSave(id, "error");
      }
    })();
    inflight.current[id] = run;
    await run;
  }, []);

  const updateProject = useCallback(
    (id: string, fn: (p: Project) => Project) => {
      setStore((prev) => {
        if (!prev) return prev;
        const next = { ...prev, projects: prev.projects.map((p) => (p.id === id ? fn(p) : p)) };
        storeRef.current = next;
        return next;
      });
      setSave(id, "pending");
      clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => {
        delete timers.current[id];
        void persist(id);
      }, SAVE_DELAY);
    },
    [persist],
  );

  const flushProject = useCallback(
    async (id: string) => {
      if (timers.current[id]) {
        clearTimeout(timers.current[id]);
        delete timers.current[id];
        await persist(id);
      } else if (inflight.current[id]) {
        await inflight.current[id];
      }
    },
    [persist],
  );

  // 未保存のままページを閉じようとしたら警告する
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (Object.keys(timers.current).length > 0) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const addProjects = useCallback(async (projects: Project[]) => {
    const { projects: added } = await jsonFetch<{ projects: Project[] }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ projects }),
    });
    setStore((prev) => (prev ? { ...prev, projects: [...added, ...prev.projects] } : prev));
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    await jsonFetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
    setStore((prev) => (prev ? { ...prev, projects: prev.projects.filter((p) => p.id !== id) } : prev));
  }, []);

  const saveSettings = useCallback(async (settings: Settings) => {
    const { settings: saved } = await jsonFetch<{ settings: Settings }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    });
    setStore((prev) => (prev ? { ...prev, settings: saved } : prev));
  }, []);

  const saveCases = useCallback(async (cases: CaseRecord[]) => {
    const { cases: saved } = await jsonFetch<{ cases: CaseRecord[] }>("/api/cases", {
      method: "PUT",
      body: JSON.stringify({ cases }),
    });
    setStore((prev) => (prev ? { ...prev, cases: saved } : prev));
  }, []);

  const getProject = useCallback((id: string) => store?.projects.find((p) => p.id === id), [store]);

  const getLatestProject = useCallback((id: string) => storeRef.current?.projects.find((p) => p.id === id), []);

  const usesApi = Boolean(status?.hasApiKey && !store?.settings.forceDemo);

  const value = useMemo<StoreCtx>(
    () => ({ store, loadError, status, usesApi, saveStates, reload, updateProject, flushProject, addProjects, deleteProject, saveSettings, saveCases, getProject, getLatestProject }),
    [store, loadError, status, usesApi, saveStates, reload, updateProject, flushProject, addProjects, deleteProject, saveSettings, saveCases, getProject, getLatestProject],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("StoreProvider がありません");
  return c;
}
