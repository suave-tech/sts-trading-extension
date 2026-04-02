import type { ChartData, IndicatorValues } from "../types";

// ─── Hyperliquid Public API ───────────────────────────────────────────────────
// https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint

const HL_API = "https://api.hyperliquid.xyz/info";

// Timeframe label → Hyperliquid interval string
const TF_TO_INTERVAL: Record<string, string> = {
  // TV-style labels
  "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m",
  "60": "1h", "120": "2h", "240": "4h",
  "D": "1d", "1D": "1d", "W": "1w", "1W": "1w", "M": "1M", "1M": "1M",
  // Hyperliquid native labels
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "2h": "2h", "4h": "4h", "8h": "8h", "12h": "12h",
  "1d": "1d", "3d": "3d", "1w": "1w",
};

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000,
  "30m": 1_800_000, "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000,
  "8h": 28_800_000, "12h": 43_200_000, "1d": 86_400_000,
  "3d": 259_200_000, "1w": 604_800_000, "1M": 2_592_000_000,
};

interface HLCandle {
  t: number;  // open time ms
  T: number;  // close time ms
  s: string;  // symbol
  i: string;  // interval
  o: string;  // open
  h: string;  // high
  l: string;  // low
  c: string;  // close
  v: string;  // volume (base asset)
  n: number;  // number of trades
}

// ─── API Calls ────────────────────────────────────────────────────────────────

async function postHL(body: unknown): Promise<unknown> {
  const res = await fetch(HL_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hyperliquid API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchCandles(symbol: string, interval: string, count = 220): Promise<HLCandle[]> {
  const endTime = Date.now();
  const ms = INTERVAL_MS[interval] ?? INTERVAL_MS["4h"];
  const startTime = endTime - ms * count;

  const data = await postHL({
    type: "candleSnapshot",
    req: { coin: symbol, interval, startTime, endTime },
  });

  if (!Array.isArray(data)) {
    throw new Error(`Unexpected candle response: ${JSON.stringify(data).slice(0, 100)}`);
  }
  return data as HLCandle[];
}

async function fetchMarkPrice(symbol: string): Promise<string | undefined> {
  try {
    const data = await postHL({ type: "allMids" }) as Record<string, string>;
    // allMids returns { "BTC": "66341.0", "ETH": "2048.0", ... }
    return data[symbol] ?? data[symbol.toUpperCase()];
  } catch {
    return undefined;
  }
}

// ─── Indicator Calculations ───────────────────────────────────────────────────

function closes(candles: HLCandle[]): number[] {
  return candles.map((c) => Number.parseFloat(c.c));
}

function calcSMA(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function calcEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  // Seed with SMA of first `period` values
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: number[] = [prev];
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function calcRSI(values: number[], period = 14): number | undefined {
  if (values.length < period + 1) return undefined;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

interface MACDResult {
  macd: string;
  signal: string;
  histogram: string;
}

function calcMACD(values: number[]): MACDResult | undefined {
  if (values.length < 35) return undefined;
  const ema12 = calcEMA(values, 12);
  const ema26 = calcEMA(values, 26);
  if (!ema12.length || !ema26.length) return undefined;

  // Align ema12 and ema26 from the end
  const len = Math.min(ema12.length, ema26.length);
  const macdLine: number[] = [];
  for (let i = 0; i < len; i++) {
    macdLine.push(ema12[ema12.length - len + i] - ema26[ema26.length - len + i]);
  }

  const signalLine = calcEMA(macdLine, 9);
  if (!signalLine.length) return undefined;

  const lastMACD = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  const fmt = (n: number) => n.toFixed(2);

  return {
    macd: fmt(lastMACD),
    signal: fmt(lastSignal),
    histogram: fmt(lastMACD - lastSignal),
  };
}

function formatVolume(v: string): string {
  const n = Number.parseFloat(v);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

// Build a summary of recent OHLCV candles for Claude to reason about
// structure, swing highs/lows, and price action — things computed indicators alone can't convey.
function buildCandleSummary(candles: HLCandle[]): string {
  const recent = candles.slice(-10);
  const rows = recent.map((c) => {
    const d = new Date(c.t).toISOString().slice(0, 16).replace("T", " ");
    return `${d} O:${Number.parseFloat(c.o).toFixed(1)} H:${Number.parseFloat(c.h).toFixed(1)} L:${Number.parseFloat(c.l).toFixed(1)} C:${Number.parseFloat(c.c).toFixed(1)} V:${formatVolume(c.v)}`;
  });

  const highs = candles.map((c) => Number.parseFloat(c.h));
  const lows = candles.map((c) => Number.parseFloat(c.l));
  const periodHigh = Math.max(...highs).toFixed(1);
  const periodLow = Math.min(...lows).toFixed(1);

  return `Recent candles (last 10, newest last):\n${rows.join("\n")}\nPeriod high: ${periodHigh} | Period low: ${periodLow}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchHyperliquidChartData(
  symbol: string,
  timeframeLabel: string
): Promise<ChartData> {
  const interval = TF_TO_INTERVAL[timeframeLabel] ?? "4h";
  const resolvedTimeframe = timeframeLabel === "UNKNOWN" ? interval : timeframeLabel;

  // Parallel fetch
  const [candleResult, priceResult] = await Promise.allSettled([
    fetchCandles(symbol, interval, 220),
    fetchMarkPrice(symbol),
  ]);

  if (candleResult.status === "rejected") {
    throw new Error(`Failed to fetch candles: ${candleResult.reason}`);
  }

  const candles = candleResult.value;
  const price = priceResult.status === "fulfilled" ? priceResult.value : undefined;

  if (candles.length === 0) {
    throw new Error(`No candle data returned for ${symbol} ${interval}`);
  }

  const cs = closes(candles);
  const indicators: IndicatorValues = {};

  // RSI (14)
  const rsi = calcRSI(cs, 14);
  if (rsi !== undefined) indicators.rsi = rsi;

  // MACD (12, 26, 9)
  const macd = calcMACD(cs);
  if (macd) {
    indicators.macd = macd.macd;
    indicators.macdSignal = macd.signal;
    indicators.macdHistogram = macd.histogram;
  }

  // Moving averages
  if (cs.length >= 20) indicators.ma20 = Math.round(calcSMA(cs, 20) * 100) / 100;
  if (cs.length >= 50) indicators.ma50 = Math.round(calcSMA(cs, 50) * 100) / 100;
  if (cs.length >= 200) indicators.ma200 = Math.round(calcSMA(cs, 200) * 100) / 100;

  // Volume (last candle)
  const lastCandle = candles[candles.length - 1];
  if (lastCandle) indicators.volume = formatVolume(lastCandle.v);

  // Candle summary — gives Claude price action context
  indicators.candleSummary = buildCandleSummary(candles);

  // Current price — use mark price, fall back to last close
  const currentPrice = price ?? Number.parseFloat(lastCandle?.c ?? "0").toFixed(2);

  return {
    symbol,
    timeframe: resolvedTimeframe,
    price: currentPrice,
    indicators,
    scrapedAt: Date.now(),
  };
}
