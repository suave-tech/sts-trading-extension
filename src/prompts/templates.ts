import type { ChartData, RiskTolerance, TradingStyle } from "../types";

// ─── System Prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are a professional trading analyst assistant. Your role is to analyze chart data provided by the user and give structured, objective insights.

Always include:
1. Trend assessment (bullish / bearish / neutral + reasoning)
2. Key support and resistance levels (based on available data)
3. Indicator signals (summarize each indicator provided)
4. Trade setup suggestion (entry zone, target, stop-loss if applicable)
5. Risk notes and conditions that would invalidate the setup
6. A confidence level: Low / Medium / High

Always end with: "⚠️ This is not financial advice. Trade at your own risk."

If data is missing or incomplete, work with what is available and note gaps.`;

// ─── Risk Tolerance Modifiers ─────────────────────────────────────────────────

const RISK_MODIFIERS: Record<RiskTolerance, string> = {
  conservative:
    "Prioritize capital preservation. Only suggest high-confidence setups.",
  moderate:
    "Balance risk and reward. Flag medium-confidence setups as speculative.",
  aggressive:
    "Include higher-risk setups. Clearly label speculative plays.",
};

// ─── Trading Style Templates ──────────────────────────────────────────────────

function formatIndicators(indicators: ChartData["indicators"]): string {
  const parts: string[] = [];

  if (indicators.rsi !== undefined)
    parts.push(`RSI: ${indicators.rsi}`);
  if (indicators.macd !== undefined)
    parts.push(
      `MACD: ${indicators.macd}${indicators.macdSignal ? ` | Signal: ${indicators.macdSignal}` : ""}${indicators.macdHistogram ? ` | Histogram: ${indicators.macdHistogram}` : ""}`
    );
  if (indicators.ma20 !== undefined)
    parts.push(`MA20: ${indicators.ma20}`);
  if (indicators.ma50 !== undefined)
    parts.push(`MA50: ${indicators.ma50}`);
  if (indicators.ma200 !== undefined)
    parts.push(`MA200: ${indicators.ma200}`);
  if (indicators.volume !== undefined)
    parts.push(`Volume: ${indicators.volume}`);

  // Any additional custom indicators
  const standardKeys = new Set(["rsi", "macd", "macdSignal", "macdHistogram", "ma20", "ma50", "ma200", "volume"]);
  for (const [key, value] of Object.entries(indicators)) {
    if (!standardKeys.has(key) && value !== undefined) {
      parts.push(`${key}: ${value}`);
    }
  }

  return parts.length > 0 ? parts.join(", ") : "No indicators available";
}

function buildBaseContext(data: ChartData): string {
  const priceStr = data.price ? ` | Price: ${data.price}` : "";
  return `Symbol: ${data.symbol} | Timeframe: ${data.timeframe}${priceStr}\nIndicators: ${formatIndicators(data.indicators)}`;
}

const STYLE_TEMPLATES: Record<TradingStyle, (data: ChartData) => string> = {
  scalp: (data) =>
    `Analyze this chart for a scalp trade opportunity (short-duration, quick in/out):
${buildBaseContext(data)}
Focus on: momentum, short-term price action, tight S/R levels.`,

  swing: (data) =>
    `Analyze this chart for a swing trade setup (holding hours to a few days):
${buildBaseContext(data)}
Focus on: trend continuation/reversal, key levels, indicator confluence.`,

  position: (data) =>
    `Analyze this chart for a position trade (multi-day to multi-week hold):
${buildBaseContext(data)}
Focus on: macro trend, major S/R, risk/reward ratio, fundamental context.`,
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildUserPrompt(
  chartData: ChartData,
  tradingStyle: TradingStyle,
  riskTolerance: RiskTolerance
): string {
  const stylePrompt = STYLE_TEMPLATES[tradingStyle](chartData);
  const riskModifier = RISK_MODIFIERS[riskTolerance];
  return `${stylePrompt}\n\nRisk guidance: ${riskModifier}`;
}

export function buildFollowUpContext(chartData: ChartData | null): string {
  if (!chartData) return "";
  return `\n\n[Current chart context: ${chartData.symbol} on ${chartData.timeframe}${chartData.price ? ` at ${chartData.price}` : ""}]`;
}

export { RISK_MODIFIERS, STYLE_TEMPLATES, formatIndicators };
