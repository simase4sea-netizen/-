"use client";

// 依存なしの簡易Markdownプレビュー。HTMLは必ずエスケープしてから変換する。

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(【要確認[^】]*】)/g, "<mark>$1</mark>");
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  let i = 0;
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  while (i < lines.length) {
    const line = lines[i];
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      const lvl = Math.min(h[1].length, 4);
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      closeList();
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r: string) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      out.push(
        "<table>" +
          body
            .map((r, idx) => `<tr>${cells(r).map((c) => (idx === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join("")}</tr>`)
            .join("") +
          "</table>",
      );
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(\[[ xX]\]\s+)?(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const type = ul ? "ul" : "ol";
      if (list !== type) {
        closeList();
        out.push(`<${type}>`);
        list = type;
      }
      if (ul) {
        const box = ul[1] ? (/x/i.test(ul[1]) ? "☑ " : "☐ ") : "";
        out.push(`<li>${box}${inline(ul[2])}</li>`);
      } else out.push(`<li>${inline(ol![1])}</li>`);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
      i++;
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      flushPara();
      closeList();
      out.push("<hr>");
      i++;
      continue;
    }
    if (!line.trim()) {
      flushPara();
      closeList();
      i++;
      continue;
    }
    closeList();
    para.push(line);
    i++;
  }
  flushPara();
  closeList();
  return out.join("\n");
}

export function Markdown({ text }: { text: string }) {
  return <div className="md-preview text-sm" dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }} />;
}
