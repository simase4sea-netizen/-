// 書き出し用の文字列生成（すべてUTF-8）。Brainへの自動投稿は行わない。

import { countNeedsCheck } from "./checks";
import { STATUS_LABELS, type CaseRecord, type Project } from "./types";
import { createZip, type ZipEntry } from "./zip";

export function safeFileName(name: string, max = 40): string {
  const s = name
    .replace(/^【[^】]*】/, "")
    .replace(/[\\/:*?"<>|\r\n\t]/g, "_")
    .replace(/\s+/g, "_")
    .trim();
  return (Array.from(s).slice(0, max).join("") || "untitled").replace(/^\.+/, "_");
}

function tidy(md: string): string {
  // 見出しの前後に空行を入れ、3行以上の空行を詰める
  return md
    .replace(/\r\n/g, "\n")
    .replace(/([^\n])\n(#{1,6} )/g, "$1\n\n$2")
    .replace(/(^#{1,6} .+)\n(?!\n)/gm, "$1\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

export function bodyMarkdown(p: Project): string {
  const chapters = p.chapters
    .map((c, i) => `## 第${i + 1}章 ${c.title}\n\n${c.content.trim() || "【未執筆】"}`)
    .join("\n\n");
  return tidy(`# ${p.title}\n\n${chapters || "【本文未作成】"}`);
}

export function overviewMarkdown(p: Project, cases: CaseRecord[]): string {
  const used = cases.filter((c) => p.brief.caseIds.includes(c.id));
  const all = allText(p);
  const lines = [
    `# 企画概要：${p.title}`,
    "",
    `- ステータス：${STATUS_LABELS[p.status]}`,
    `- テーマ：${p.theme}`,
    `- 形式：${p.format}`,
    `- 想定読者：${p.audience}`,
    `- 解決する課題：${p.problem}`,
    `- 読者が実行できるようになること：${p.outcome}`,
    `- この商品固有の価値：${p.uniqueValue}`,
    `- 独自性の根拠：${p.uniquenessBasis}`,
    `- 【要確認】の残り：${countNeedsCheck(all)}件`,
    `- 最終確認者：${p.quality.approvedBy ? `${p.quality.approvedBy}（${p.quality.approvedAt?.slice(0, 10)}）` : "未承認"}`,
    "",
    "## 使用した事例と根拠",
    used.length
      ? used.map((c) => `- ${c.name}（対象期間：${c.period || "未入力"}／確認日：${c.checkedAt || "未入力"}）\n  - 結果（入力値）：${c.result}\n  - 出典・メモ：${c.source}`).join("\n")
      : "- なし（事例・数値は使用していません）",
    "",
    "> この内容はツールで作成した下書きです。販売前にご自身で内容・表現・根拠を確認し、Brainへ手動で登録してください。",
  ];
  return tidy(lines.join("\n"));
}

function allText(p: Project): string {
  return [p.sections.design.content, p.sections.free.content, ...p.chapters.map((c) => c.content), p.sections.sales.content, p.sections.bonus.content, p.sections.promo.content].join("\n");
}

export function markdownFiles(p: Project, cases: CaseRecord[]): ZipEntry[] {
  const wrap = (title: string, content: string) => tidy(`# ${title}\n\n${content.trim() || "【未作成】"}`);
  return [
    { name: "00_企画概要.md", content: overviewMarkdown(p, cases) },
    { name: "01_無料部分.md", content: wrap(p.title, p.sections.free.content) },
    { name: "02_有料本文.md", content: bodyMarkdown(p) },
    { name: "03_販売ページ.md", content: wrap(`販売ページ下書き：${p.title}`, p.sections.sales.content) },
    { name: "04_告知文.md", content: wrap(`告知文：${p.title}`, p.sections.promo.content) },
    { name: "05_特典素材.md", content: wrap(`特典・実務素材：${p.title}`, p.sections.bonus.content) },
    { name: "06_基本設計と目次.md", content: wrap(`基本設計と目次：${p.title}`, `${p.sections.design.content}\n\n${p.sections.toc.content}`) },
  ];
}

/** Brainの本文欄に貼る想定の1ファイル版（無料部分→本文） */
export function brainMarkdown(p: Project): string {
  const chapters = p.chapters.map((c, i) => `## 第${i + 1}章 ${c.title}\n\n${c.content.trim()}`).join("\n\n");
  return tidy(`# ${p.title}\n\n${p.sections.free.content}\n\n---\n\n（ここから有料部分）\n\n${chapters}\n\n${p.sections.bonus.content ? `## 特典・実務素材\n\n${p.sections.bonus.content}` : ""}`);
}

export function markdownToText(md: string): string {
  return md
    .replace(/^#{1,6}\s+(.+)$/gm, (_m, t: string) => `■ ${t}`)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^- \[ \] /gm, "□ ")
    .replace(/^- \[x\] /gim, "☑ ")
    .replace(/^[-*] /gm, "・")
    .replace(/`([^`]+)`/g, "$1");
}

export function projectJson(p: Project, cases: CaseRecord[]): string {
  return JSON.stringify(
    {
      app: "brain-studio",
      format: "project-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      project: p,
      cases: cases.filter((c) => p.brief.caseIds.includes(c.id)),
    },
    null,
    2,
  );
}

function csvCell(v: string | number | undefined): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function projectsCsv(projects: Project[]): string {
  const header = ["ID", "仮タイトル", "テーマ", "形式", "想定読者", "解決する課題", "実行できるようになること", "固有の価値", "独自性の根拠", "ステータス", "章数", "要確認の数", "承認者", "作成日時", "更新日時"];
  const rows = projects.map((p) =>
    [p.id, p.title, p.theme, p.format, p.audience, p.problem, p.outcome, p.uniqueValue, p.uniquenessBasis, STATUS_LABELS[p.status], p.chapters.length, countNeedsCheck(allText(p)), p.quality.approvedBy ?? "", p.createdAt, p.updatedAt]
      .map(csvCell)
      .join(","),
  );
  // Excelで文字化けしないようBOMを付ける
  return "﻿" + [header.join(","), ...rows].join("\r\n") + "\r\n";
}

export function projectsZip(projects: Project[], cases: CaseRecord[]): Uint8Array {
  const entries: ZipEntry[] = [{ name: "企画一覧.csv", content: projectsCsv(projects) }];
  const used = new Set<string>();
  projects.forEach((p, i) => {
    let dir = `${String(i + 1).padStart(2, "0")}_${safeFileName(p.title)}`;
    while (used.has(dir)) dir += "_";
    used.add(dir);
    for (const f of markdownFiles(p, cases)) entries.push({ name: `${dir}/${f.name}`, content: f.content });
    entries.push({ name: `${dir}/Brain貼り付け用.md`, content: brainMarkdown(p) });
    entries.push({ name: `${dir}/全体.txt`, content: markdownToText(fullMarkdown(p, cases)) });
    entries.push({ name: `${dir}/backup.json`, content: projectJson(p, cases) });
  });
  return createZip(entries);
}

export function fullMarkdown(p: Project, cases: CaseRecord[]): string {
  return markdownFiles(p, cases)
    .map((f) => f.content)
    .join("\n\n---\n\n");
}

/** ブラウザでファイルを保存させる */
export function download(filename: string, content: string | Uint8Array, mime: string) {
  const part: BlobPart = typeof content === "string" ? content : (content.slice().buffer as ArrayBuffer);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
