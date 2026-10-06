"use client";

import { useStore } from "@/components/StoreProvider";
import { useUI } from "@/components/UIProvider";
import { countNeedsCheck } from "@/lib/checks";
import { nowIso } from "@/lib/defaults";
import { brainMarkdown, download, fullMarkdown, markdownFiles, markdownToText, projectJson, projectsCsv, projectsZip, safeFileName } from "@/lib/export";
import { createZip } from "@/lib/zip";
import type { Project } from "@/lib/types";

export function ExportTab({ project, update }: { project: Project; update: (fn: (p: Project) => Project) => void }) {
  const { store, flushProject } = useStore();
  const { notify, confirm } = useUI();
  const cases = store?.cases ?? [];
  const base = safeFileName(project.title);
  const approved = project.status === "approved" || project.status === "exported";
  const files = markdownFiles(project, cases);
  const needs = countNeedsCheck(files.map((f) => f.content as string).join("\n"));

  const guard = async () => {
    await flushProject(project.id);
    if (approved) return true;
    return confirm({
      title: "未承認の内容です",
      message: "品質確認で承認していない下書きを書き出します。販売前に必ず内容を確認してください。",
      confirmLabel: "書き出す",
    });
  };

  const done = () => {
    update((p) => ({ ...p, exportedAt: nowIso(), status: p.status === "approved" ? "exported" : p.status }));
    notify(approved ? "書き出しました" : "書き出しました（未承認のためステータスは変わりません）", "success");
  };

  const exp = async (name: string, content: string | Uint8Array, mime: string) => {
    if (!(await guard())) return;
    download(name, content, mime);
    done();
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label}をコピーしました`, "success");
    } catch {
      notify("コピーできませんでした（ブラウザの権限を確認してください）", "error");
    }
  };

  const md = "text/markdown;charset=utf-8";

  return (
    <div className="space-y-4">
      <section className="card space-y-2 text-sm">
        <h2 className="font-bold">書き出し</h2>
        <p className="text-stone-600">
          Brainへの自動投稿・自動出品は行いません。書き出した内容を確認・修正したうえで、ご自身でBrainに登録してください。文字コードはUTF-8です。
        </p>
        {!approved && <p className="rounded bg-amber-50 p-2 text-amber-900">この企画はまだ承認されていません（品質確認タブで承認できます）。</p>}
        {needs > 0 && <p className="rounded bg-yellow-50 p-2 text-yellow-900">【要確認】が{needs}件残っています。販売前に解消してください。</p>}
      </section>

      <section className="card space-y-3">
        <h3 className="font-semibold">Markdown（Brain掲載用）</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => void exp(`${base}_Brain貼り付け用.md`, brainMarkdown(project), md)}>
            Brain貼り付け用（無料部分＋有料本文）
          </button>
          <button className="btn" onClick={() => void exp(`${base}_全体.md`, fullMarkdown(project, cases), md)}>
            全セクションを1ファイルで
          </button>
          <button className="btn" onClick={() => void exp(`${base}_分割.zip`, createZip(files.map((f) => ({ name: `${base}/${f.name}`, content: f.content }))), "application/zip")}>
            セクション別ファイルをZIPで
          </button>
        </div>
        <div>
          <p className="mb-1 text-xs text-stone-500">セクション別に書き出し・コピー</p>
          <ul className="divide-y divide-stone-100 rounded border border-stone-200">
            {files.map((f) => (
              <li key={f.name} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1">{f.name}</span>
                <button className="btn btn-sm" onClick={() => void copy(f.content as string, f.name)}>
                  コピー
                </button>
                <button className="btn btn-sm" onClick={() => void exp(`${base}_${f.name}`, f.content as string, md)}>
                  保存
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card space-y-2">
        <h3 className="font-semibold">その他の形式</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => void exp(`${base}.txt`, markdownToText(fullMarkdown(project, cases)), "text/plain;charset=utf-8")}>
            TXT
          </button>
          <button className="btn" onClick={() => void exp(`${base}_backup.json`, projectJson(project, cases), "application/json;charset=utf-8")}>
            JSON（バックアップ）
          </button>
          <button className="btn" onClick={() => void exp(`${base}_一覧.csv`, projectsCsv([project]), "text/csv;charset=utf-8")}>
            CSV（企画情報）
          </button>
          <button className="btn" onClick={() => void exp(`${base}_一式.zip`, projectsZip([project], cases), "application/zip")}>
            一式ZIP（MD・TXT・JSON・CSV）
          </button>
        </div>
        <p className="hint">複数の企画をまとめて書き出すときは、ライブラリで企画を選択して「選択をZIPで書き出し」を使います。</p>
      </section>
    </div>
  );
}
