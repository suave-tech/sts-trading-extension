/**
 * Lightweight zero-dependency markdown renderer for the analysis panel.
 * Handles: headings, bold, bullets, horizontal rules, and pipe tables.
 * No external libraries — keeps the extension self-contained.
 */

import type { ReactNode } from "react";

const COLORS = {
  h1: "#f8fafc",
  h2: "#e2e8f0",
  h3: "#cbd5e1",
  bullet: "#94a3b8",
  rule: "#2d3748",
  text: "#cbd5e1",
  bold: "#f1f5f9",
  disclaimer: "#475569",
  tableBorder: "#1e293b",
  tableHeader: "#1e293b",
  tableHeaderText: "#94a3b8",
  tableRowAlt: "#0f1117",
  badge: {
    bullish: { bg: "#14532d", color: "#4ade80" },
    bearish: { bg: "#450a0a", color: "#f87171" },
    neutral: { bg: "#1c1917", color: "#a8a29e" },
    high: { bg: "#14532d", color: "#4ade80" },
    medium: { bg: "#78350f", color: "#fcd34d" },
    low: { bg: "#450a0a", color: "#f87171" },
  },
};

// ─── Inline renderer: **bold** ────────────────────────────────────────────────

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  // biome-ignore lint/suspicious/noAssignInExpressions: intentional loop idiom
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <strong key={key++} style={{ color: COLORS.bold, fontWeight: 600 }}>
        {m[1]}
      </strong>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ─── Badge detector ───────────────────────────────────────────────────────────

interface Badge {
  label: string;
  style: { bg: string; color: string };
}

function detectBadge(line: string): Badge | null {
  const lower = line.toLowerCase();
  if (lower.includes("bullish")) return { label: "Bullish", style: COLORS.badge.bullish };
  if (lower.includes("bearish")) return { label: "Bearish", style: COLORS.badge.bearish };
  if (lower.includes("neutral")) return { label: "Neutral", style: COLORS.badge.neutral };
  return null;
}

function detectConfidenceBadge(line: string): Badge | null {
  const lower = line.toLowerCase();
  if (lower.includes("high confidence") || lower.includes("confidence: high"))
    return { label: "High Confidence", style: COLORS.badge.high };
  if (lower.includes("medium confidence") || lower.includes("confidence: medium"))
    return { label: "Medium Confidence", style: COLORS.badge.medium };
  if (lower.includes("low confidence") || lower.includes("confidence: low"))
    return { label: "Low Confidence", style: COLORS.badge.low };
  return null;
}

function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: "9999px",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: badge.style.bg,
        color: badge.style.color,
        marginLeft: "6px",
        verticalAlign: "middle",
      }}
    >
      {badge.label}
    </span>
  );
}

// ─── Table renderer ───────────────────────────────────────────────────────────

function isTableRow(line: string): boolean {
  return line.trimStart().startsWith("|");
}

function isSeparatorRow(line: string): boolean {
  // e.g. |---|---|---| or |:--|:--:|--:|
  return /^\s*\|[\s|:\-]+\|\s*$/.test(line);
}

function parseTableCells(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")   // strip leading |
    .replace(/\|\s*$/, "")   // strip trailing |
    .split("|")
    .map((c) => c.trim());
}

function MarkdownTable({ rows }: { rows: string[] }) {
  if (rows.length === 0) return null;

  // First row = header, second row = separator (skip), rest = body
  const headerCells = parseTableCells(rows[0]);
  const bodyRows = rows
    .slice(1)
    .filter((r) => !isSeparatorRow(r))
    .map(parseTableCells);

  const cellStyle = (isHeader: boolean, colIdx: number): React.CSSProperties => ({
    padding: "5px 8px",
    fontSize: "11px",
    color: isHeader ? COLORS.tableHeaderText : COLORS.text,
    fontWeight: isHeader ? 600 : 400,
    textAlign: colIdx === 0 ? "left" : "left",
    borderBottom: `1px solid ${COLORS.tableBorder}`,
    lineHeight: "1.5",
    whiteSpace: "normal",
    wordBreak: "break-word",
  });

  return (
    <div
      style={{
        overflowX: "auto",
        margin: "6px 0 10px",
        borderRadius: "6px",
        border: `1px solid ${COLORS.tableBorder}`,
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr style={{ background: COLORS.tableHeader }}>
            {headerCells.map((cell, ci) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static header columns
              <th key={ci} style={cellStyle(true, ci)}>
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((cells, ri) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: table rows have no stable id
            <tr key={ri} style={{ background: ri % 2 === 1 ? COLORS.tableRowAlt : "transparent" }}>
              {cells.map((cell, ci) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static columns per row
                <td key={ci} style={cellStyle(false, ci)}>
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Block renderers ──────────────────────────────────────────────────────────

function Heading({ level, text }: { level: 1 | 2 | 3; text: string }) {
  const sizes: Record<number, string> = { 1: "15px", 2: "13px", 3: "12px" };
  const margins: Record<number, string> = { 1: "16px 0 6px", 2: "14px 0 4px", 3: "10px 0 3px" };
  const trendBadge = level === 1 || level === 2 ? detectBadge(text) : null;
  const confBadge = detectConfidenceBadge(text);
  const cleanText = text.replace(/\*\*/g, "");

  return (
    <div
      style={{
        fontSize: sizes[level],
        fontWeight: level === 1 ? 700 : 600,
        color: COLORS[`h${level}` as keyof typeof COLORS] as string,
        margin: margins[level],
        borderBottom: level <= 2 ? `1px solid ${COLORS.tableBorder}` : "none",
        paddingBottom: level <= 2 ? "4px" : "0",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "4px",
      }}
    >
      <span>{cleanText}</span>
      {trendBadge && <BadgeChip badge={trendBadge} />}
      {confBadge && <BadgeChip badge={confBadge} />}
    </div>
  );
}

function BulletItem({ text, depth }: { text: string; depth: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "6px",
        marginBottom: "3px",
        paddingLeft: `${depth * 12}px`,
      }}
    >
      <span style={{ color: COLORS.bullet, flexShrink: 0, marginTop: "2px", fontSize: "10px" }}>
        {depth === 0 ? "▸" : "◦"}
      </span>
      <span style={{ color: COLORS.text, fontSize: "12px", lineHeight: "1.6" }}>
        {renderInline(text)}
      </span>
    </div>
  );
}

function Paragraph({ text }: { text: string }) {
  const isDisclaimer = text.includes("not financial advice") || text.startsWith("⚠️");
  return (
    <p
      style={{
        margin: "4px 0 8px",
        fontSize: "12px",
        lineHeight: "1.65",
        color: isDisclaimer ? COLORS.disclaimer : COLORS.text,
        fontStyle: isDisclaimer ? "italic" : "normal",
      }}
    >
      {renderInline(text)}
    </p>
  );
}

// ─── Main Markdown component ──────────────────────────────────────────────────

export function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Blank line
    if (line.trim() === "") {
      elements.push(<div key={key++} style={{ height: "2px" }} />);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      elements.push(
        <hr
          key={key++}
          style={{ border: "none", borderTop: `1px solid ${COLORS.rule}`, margin: "10px 0" }}
        />
      );
      i++;
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      const level = Math.min(hMatch[1].length, 3) as 1 | 2 | 3;
      elements.push(<Heading key={key++} level={level} text={hMatch[2]} />);
      i++;
      continue;
    }

    // Table — collect all consecutive pipe rows
    if (isTableRow(line)) {
      const tableRows: string[] = [];
      while (i < lines.length && isTableRow(lines[i].trimEnd())) {
        tableRows.push(lines[i].trimEnd());
        i++;
      }
      elements.push(<MarkdownTable key={key++} rows={tableRows} />);
      continue;
    }

    // Bullet / list items (-, *, +, or numbered)
    const bulletMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)/);
    if (bulletMatch) {
      const depth = Math.floor(bulletMatch[1].length / 2);
      elements.push(<BulletItem key={key++} text={bulletMatch[3]} depth={depth} />);
      i++;
      continue;
    }

    // Everything else is a paragraph
    elements.push(<Paragraph key={key++} text={line} />);
    i++;
  }

  return <div style={{ fontSize: "13px", lineHeight: "1.6" }}>{elements}</div>;
}
