import type { ChartData, RiskTolerance, TradingStyle } from "../types";

// ─── System Prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are a concise, professional crypto trading analyst. Analyze chart data and give sharp, actionable insights. This is not financial advice.

Structure your response covering these areas:
- Trend assessment: overall direction (BULLISH / BEARISH / NEUTRAL)
- Key levels: support and resistance zones
- Indicator signals: RSI, MACD, moving averages, volume
- Trade setup: entry, target, and stop-loss
- Risk notes: invalidation conditions and position sizing

Rules:
- Be brief and direct. No filler sentences.
- Use bullet points within each section (2-4 bullets max). Do NOT use markdown tables — use bullets only.
- Bold key prices and signal names.
- If liquidation map data is provided, reference it — liquidation clusters act as price magnets and factor into targets/stops.
- End with one line stating your confidence level and a one-sentence reason.`;

// ─── Risk Tolerance Modifiers ─────────────────────────────────────────────────

const RISK_MODIFIERS: Record<RiskTolerance, string> = {
  conservative: "Prioritize capital preservation. Only flag high-confidence, well-defined setups. Skip speculative plays.",
  moderate: "Balance risk and reward. Mention medium-confidence setups but label them speculative.",
  aggressive: "Include higher-risk setups with asymmetric upside. Clearly label any speculative entries.",
};

// ─── Indicator Formatter ──────────────────────────────────────────────────────

function formatIndicators(indicators: ChartData["indicators"]): string {
  const parts: string[] = [];

  if (indicators.rsi !== undefined) parts.push(`RSI: ${indicators.rsi}`);
  if (indicators.macd !== undefined) {
    let macdStr = `MACD: ${indicators.macd}`;
    if (indicators.macdSignal !== undefined) macdStr += ` | Signal: ${indicators.macdSignal}`;
    if (indicators.macdHistogram !== undefined) macdStr += ` | Histogram: ${indicators.macdHistogram}`;
    parts.push(macdStr);
  }
  if (indicators.ma20 !== undefined) parts.push(`MA20: ${indicators.ma20}`);
  if (indicators.ma50 !== undefined) parts.push(`MA50: ${indicators.ma50}`);
  if (indicators.ma200 !== undefined) parts.push(`MA200: ${indicators.ma200}`);
  if (indicators.volume !== undefined) parts.push(`Volume: ${indicators.volume}`);

  const standardKeys = new Set([
    "rsi",
    "macd",
    "macdSignal",
    "macdHistogram",
    "ma20",
    "ma50",
    "ma200",
    "volume",
    "candleSummary",
  ]);
  for (const [key, value] of Object.entries(indicators)) {
    if (!standardKeys.has(key) && value !== undefined) {
      parts.push(`${key}: ${value}`);
    }
  }

  return parts.length > 0 ? parts.join(" | ") : "No indicators available";
}

function buildBaseContext(data: ChartData): string {
  const priceStr = data.price ? ` | Price: ${data.price}` : "";
  const indicatorLine = `Indicators: ${formatIndicators(data.indicators)}`;

  const candleBlock = data.indicators.candleSummary
    ? `\n\nRecent Price Action:\n${data.indicators.candleSummary}`
    : "";

  const liqBlock = data.liquidationSummary ? `\n\n${data.liquidationSummary}` : "";

  return `Symbol: ${data.symbol} | Timeframe: ${data.timeframe}${priceStr}\n${indicatorLine}${candleBlock}${liqBlock}`;
}

// ─── Trading Style Templates ──────────────────────────────────────────────────

const STYLE_TEMPLATES: Record<TradingStyle, (data: ChartData) => string> = {
  scalp: (data) =>
    `This is a scalp trade analysis (minutes to hours):
${buildBaseContext(data)}
Focus on: momentum, micro support/resistance, quick in/out entries.`,

  swing: (data) =>
    `This is a swing trade analysis (hours to a few days):
${buildBaseContext(data)}
Focus on: trend continuation, key levels, indicator confluence.`,

  position: (data) =>
    `This is a position trade analysis (days to weeks):
${buildBaseContext(data)}
Focus on: macro trend direction, major support/resistance, R:R ratio.`,
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildUserPrompt(
  chartData: ChartData,
  tradingStyle: TradingStyle,
  riskTolerance: RiskTolerance
): string {
  const stylePrompt = STYLE_TEMPLATES[tradingStyle](chartData);
  const riskModifier = RISK_MODIFIERS[riskTolerance];
  return `${stylePrompt}\n\nRisk: ${riskModifier}`;
}

export function buildFollowUpContext(chartData: ChartData | null): string {
  if (!chartData) return "";
  return `\n\n[Context: ${chartData.symbol} ${chartData.timeframe}${chartData.price ? ` @ ${chartData.price}` : ""}]`;
}

export { RISK_MODIFIERS, STYLE_TEMPLATES, formatIndicators };
