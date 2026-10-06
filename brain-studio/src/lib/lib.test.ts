import { describe, expect, it } from "vitest";
import { countNeedsCheck, findRiskyExpressions, headingLengths, weightedLength } from "./checks";
import { emptyBrief, initialStore, sampleProjects } from "./defaults";
import { demoIdeas } from "./demo";
import { markdownFiles, projectsCsv, projectsZip, safeFileName } from "./export";
import { applyToc, duplicateProject, editVersioned, projectFromIdea, replaceVersioned, restoreVersioned } from "./projectOps";
import { findSimilar, projectToComparable, similarity, tokenize } from "./similarity";
import { crc32, createZip } from "./zip";
import type { HistoryEntry } from "./types";

describe("similarity", () => {
  it("日本語を文字n-gramに分割する", () => {
    expect(tokenize("集客設計")).toEqual(expect.arrayContaining(["集客", "客設", "集客設"]));
  });

  it("似た文は高く、無関係な文は低い", () => {
    const a = "スタッフ1人でも回るInstagram投稿の週次ルーティン";
    const b = "スタッフでも続くInstagram投稿の週間ルーティン作り";
    const c = "無料招待キャンペーンを始める前の判断基準チェック";
    const corpus = ["Meta広告の基本と効果測定", "Googleマップの店舗情報を整える手順", "リール動画の企画の立て方"];
    expect(similarity(a, b, corpus)).toBeGreaterThan(0.38);
    expect(similarity(a, c, corpus)).toBeLessThan(0.1);
  });

  it("サンプルの似た2件を重複として検出し、無関係な1件は検出しない", () => {
    const hits = findSimilar(sampleProjects().map(projectToComparable));
    expect(hits.get("sample_1")?.some((h) => h.otherId === "sample_2")).toBe(true);
    expect(hits.get("sample_3")).toBeUndefined();
  });
});

describe("checks", () => {
  it("成果保証の表現を検出する", () => {
    const issues = findRiskyExpressions("この方法なら必ず成功します。誰でも簡単に始められます。");
    expect(issues.map((i) => i.phrase)).toEqual(expect.arrayContaining(["必ず成功", "誰でも簡単"]));
    expect(findRiskyExpressions("手順に沿って記録を続けます。")).toHaveLength(0);
    expect(findRiskyExpressions("- 対象外：売上・来店数の増加を保証する内容")).toHaveLength(0);
    expect(findRiskyExpressions("必ず成功するわけではありません")).toHaveLength(0);
  });
  it("要確認の数を数える", () => {
    expect(countNeedsCheck("a【要確認】b【要確認：出典】")).toBe(2);
  });
  it("見出しごとの文字数", () => {
    const r = headingLengths("## X向け\nあいう\n## note\nabc");
    expect(r[0]).toMatchObject({ heading: "X向け", chars: 3 });
    expect(weightedLength("abcd")).toBe(2);
  });
});

describe("projectOps", () => {
  const base = sampleProjects()[0];
  it("置き換え時に元の内容を履歴に残し、復元できる", () => {
    const s1 = replaceVersioned(base.sections.design, "新しい内容", "再生成前");
    expect(s1.content).toBe("新しい内容");
    expect(s1.history[0].content).toBe(base.sections.design.content);
    const s2 = restoreVersioned(s1, 0);
    expect(s2.content).toBe(base.sections.design.content);
    expect(s2.history[0].content).toBe("新しい内容");
  });
  it("初回の手入力編集で編集前の内容を履歴に残す", () => {
    const s = editVersioned({ content: "前", history: [] as HistoryEntry[] }, "後");
    expect(s.history[0].content).toBe("前");
  });
  it("目次適用で同じタイトルの章の本文を引き継ぐ", () => {
    const p1 = applyToc(base, [{ title: "A", purpose: "", readerTask: "", materials: "" }], "toc");
    const withBody = { ...p1, chapters: p1.chapters.map((c) => ({ ...c, content: "本文A" })) };
    const p2 = applyToc(
      withBody,
      [
        { title: "B", purpose: "", readerTask: "", materials: "" },
        { title: "A", purpose: "新", readerTask: "", materials: "" },
      ],
      "toc2",
    );
    expect(p2.chapters.map((c) => c.title)).toEqual(["B", "A"]);
    expect(p2.chapters[1].content).toBe("本文A");
    expect(p2.sections.toc.history[0].content).toBe("toc");
  });
  it("複製は承認を引き継がない", () => {
    const approved = { ...base, status: "approved" as const, quality: { checks: {}, notes: "", approvedBy: "x", approvedAt: "2026-01-01" } };
    const d = duplicateProject(approved);
    expect(d.id).not.toBe(base.id);
    expect(d.status).toBe("review");
    expect(d.quality.approvedBy).toBeUndefined();
  });
});

describe("demo", () => {
  it("要求数どおりの企画案を作り、実績の数値を含めない", () => {
    const ideas = demoIdeas({ ...emptyBrief(), audience: "店主", problem: "投稿が続かない" }, 5, []);
    expect(ideas).toHaveLength(5);
    expect(new Set(ideas.map((i) => i.title)).size).toBe(5);
    for (const i of ideas) expect(i.uniquenessBasis).toContain("要確認");
  });
});

describe("export", () => {
  const store = initialStore();
  const p = projectFromIdea(demoIdeas(emptyBrief(), 1, [])[0], emptyBrief());

  it("セクション別のMarkdownファイルを作る", () => {
    const names = markdownFiles(p, store.cases).map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["01_無料部分.md", "02_有料本文.md", "03_販売ページ.md", "04_告知文.md"]));
  });
  it("CSVはBOM付きで改行・カンマをエスケープする", () => {
    const csv = projectsCsv([{ ...p, title: 'a,"b"\nc' }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"a,""b""\nc"');
  });
  it("ファイル名に使えない文字を除く", () => {
    expect(safeFileName("【デモ】a/b:c")).toBe("a_b_c");
  });
  it("ZIPの構造が正しい", () => {
    const zip = projectsZip([p], store.cases);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(1 + 10); // CSV + 1企画あたり10ファイル
    expect(v.getUint16(6, true) & 0x0800).toBe(0x0800); // UTF-8ファイル名
  });
  it("CRC32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(createZip([]).length).toBe(22);
  });
});
