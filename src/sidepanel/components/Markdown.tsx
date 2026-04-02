/**
 * Lightweight zero-dependency markdown renderer for the analysis panel.
 * Handles the subset Claude produces: headings, bold, bullets, horizontal rules.
 * No external libraries — keeps the extension self-contained.
 */

import type { ReactNode } from "react";

const COLORS = {
  h1: "#f8fafc",
  h2: "#e2e8f0",
  h3: "#cbd5e1",
  bullet: "#94a3b8",
  rule: "#1e293b",
  text: "#cbd5e1",
  bold: "#f1f5f9",
  disclaimer: "#475569",
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
        borderBottom: level <= 2 ? "1px solid #1e293b" : "none",
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

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Blank line
    if (line.trim() === "") {
      // Only add spacer if previous wasn't already a block spacer
      elements.push(<div key={key++} style={{ height: "2px" }} />);
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
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      const level = Math.min(hMatch[1].length, 3) as 1 | 2 | 3;
      elements.push(<Heading key={key++} level={level} text={hMatch[2]} />);
      continue;
    }

    // Bullet / list items (-, *, +, or numbered)
    const bulletMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)/);
    if (bulletMatch) {
      const depth = Math.floor(bulletMatch[1].length / 2);
      elements.push(<BulletItem key={key++} text={bulletMatch[3]} depth={depth} />);
      continue;
    }

    // Everything else is a paragraph
    elements.push(<Paragraph key={key++} text={line} />);
  }

  return <div style={{ fontSize: "13px", lineHeight: "1.6" }}>{elements}</div>;
}
