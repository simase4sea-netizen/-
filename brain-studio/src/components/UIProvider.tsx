"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useStore } from "./StoreProvider";

interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ToastKind = "info" | "success" | "error";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface UICtx {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  notify: (text: string, kind?: ToastKind) => void;
  /**
   * API送信前の確認。デモ時は確認なしで true。
   * 同じブラウザタブでは「今後このタブでは表示しない」を選べる。
   */
  confirmApiSend: (what: string) => Promise<boolean>;
}

const Ctx = createContext<UICtx | null>(null);
const SKIP_KEY = "brain-studio:api-notice-skip";

export function UIProvider({ children }: { children: React.ReactNode }) {
  const { usesApi, status } = useStore();
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void; api?: boolean }) | null>(null);
  const [skipChecked, setSkipChecked] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })), []);

  const notify = useCallback((text: string, kind: ToastKind = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  const confirmApiSend = useCallback(
    (what: string) => {
      if (!usesApi) return Promise.resolve(true);
      try {
        if (sessionStorage.getItem(SKIP_KEY) === "1") return Promise.resolve(true);
      } catch {}
      setSkipChecked(false);
      return new Promise<boolean>((resolve) =>
        setDialog({
          api: true,
          title: "Anthropic APIへ送信します",
          message: (
            <div className="space-y-2">
              <p>
                生成のため、<strong>{what}</strong>をAnthropic API（モデル：{status?.model}）へ送信します。
                送信されるのはこの生成に必要な情報だけで、それ以外のデータはこのPC内に保存されたままです。
              </p>
              <p className="text-sm text-stone-600">API利用料金が発生します。生成結果は下書きです。公開前に必ずご自身で確認してください。</p>
            </div>
          ),
          confirmLabel: "送信して生成",
          resolve,
        }),
      );
    },
    [usesApi, status?.model],
  );

  const close = (v: boolean) => {
    if (dialog?.api && v && skipChecked) {
      try {
        sessionStorage.setItem(SKIP_KEY, "1");
      } catch {}
    }
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <Ctx.Provider value={{ confirm, notify, confirmApiSend }}>
      {children}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold">{dialog.title}</h2>
            {dialog.message && <div className="mt-2 text-sm leading-relaxed text-stone-700">{dialog.message}</div>}
            {dialog.api && (
              <label className="mt-3 flex items-center gap-2 text-sm text-stone-600">
                <input type="checkbox" checked={skipChecked} onChange={(e) => setSkipChecked(e.target.checked)} />
                このタブでは次回から表示しない
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn" onClick={() => close(false)} autoFocus>
                {dialog.cancelLabel ?? "キャンセル"}
              </button>
              <button className={dialog.danger ? "btn btn-danger" : "btn btn-primary"} onClick={() => close(true)}>
                {dialog.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-sm rounded-md px-4 py-2 text-sm shadow-lg ${
              t.kind === "error" ? "bg-red-700 text-white" : t.kind === "success" ? "bg-emerald-700 text-white" : "bg-stone-800 text-white"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useUI(): UICtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("UIProvider がありません");
  return c;
}
