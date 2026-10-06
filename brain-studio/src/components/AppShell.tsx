"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StoreProvider, useStore } from "./StoreProvider";
import { UIProvider } from "./UIProvider";

const NAV = [
  { href: "/", label: "ダッシュボード" },
  { href: "/new", label: "新規企画" },
  { href: "/library", label: "ライブラリ" },
  { href: "/cases", label: "事例・根拠" },
  { href: "/settings", label: "設定" },
];

function Header() {
  const pathname = usePathname();
  const { status, store, usesApi } = useStore();
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        <Link href="/" className="font-bold text-emerald-900">
          Brain企画・執筆ツール
        </Link>
        <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto text-sm">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href) || (n.href === "/library" && pathname.startsWith("/projects"));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap rounded px-2 py-1 ${active ? "bg-emerald-50 font-semibold text-emerald-900" : "text-stone-600 hover:bg-stone-100"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        {status && (
          <Link
            href="/settings"
            className={`badge ${usesApi ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}
            title={usesApi ? `モデル：${status.model}` : "APIを使わず定型のデモ出力で動作します"}
          >
            {usesApi ? "API接続：設定済み" : status.hasApiKey && store?.settings.forceDemo ? "デモモード（手動）" : "デモモード：APIキー未設定"}
          </Link>
        )}
      </div>
    </header>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  const { store, loadError, reload } = useStore();
  if (loadError) {
    return (
      <div className="card mx-auto mt-10 max-w-lg">
        <p className="font-bold text-red-700">データを読み込めませんでした</p>
        <p className="mt-1 text-sm text-stone-600">{loadError}</p>
        <button className="btn mt-3" onClick={() => void reload()}>
          再読み込み
        </button>
      </div>
    );
  }
  if (!store) return <p className="p-8 text-center text-stone-500">読み込み中…</p>;
  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <UIProvider>
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-6">
          <Body>{children}</Body>
        </main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-stone-500">
          生成物は下書きです。内容・表現・根拠をご自身で確認・編集したうえで、Brainへは手動で登録してください。本ツールは販売や収益を保証しません。
        </footer>
      </UIProvider>
    </StoreProvider>
  );
}
