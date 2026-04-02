import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Pure helpers replicated from tradingview-scraper.ts for unit testing ─────
// (The module itself can't be imported in JSDOM because it calls chrome.runtime
//  at module level — so we test the extractable pure logic directly.)

type KnownHost = "tradingview" | "hyperliquid" | "binance" | "bybit" | "kraken" | "okx" | "coinbase" | "unknown";

function detectHostFromHostname(hostname: string): KnownHost {
  if (hostname.includes("tradingview.com")) return "tradingview";
  if (hostname.includes("hyperliquid.xyz")) return "hyperliquid";
  if (hostname.includes("binance.com")) return "binance";
  if (hostname.includes("bybit.com")) return "bybit";
  if (hostname.includes("kraken.com")) return "kraken";
  if (hostname.includes("okx.com")) return "okx";
  if (hostname.includes("coinbase.com")) return "coinbase";
  return "unknown";
}

function symbolFromHyperliquidPath(pathname: string): string | null {
  const match = pathname.match(/\/trade\/([A-Z0-9-]+)/i);
  if (match?.[1]) return match[1].toUpperCase().replace(/-PERP$/i, "");
  return null;
}

function symbolFromBinancePath(pathname: string): string | null {
  const match = pathname.match(/\/trade\/([A-Z0-9_]+)/i);
  if (match?.[1]) return match[1].replace("_", "");
  return null;
}

function symbolFromBybitPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const tradeIdx = parts.indexOf("trade");
  if (tradeIdx !== -1 && parts[tradeIdx + 2]) {
    return (parts[tradeIdx + 1] + parts[tradeIdx + 2]).toUpperCase();
  }
  if (tradeIdx !== -1 && parts[tradeIdx + 1] && !parts[tradeIdx + 2]) {
    return parts[tradeIdx + 1].toUpperCase();
  }
  return null;
}

function symbolFromKrakenPath(pathname: string): string | null {
  const match = pathname.match(/\/trade\/([A-Z0-9-]+)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function symbolFromOkxPath(pathname: string): string | null {
  const match = pathname.match(/\/trade-[^/]+\/([a-z0-9-]+)/i);
  return match?.[1]?.toUpperCase().replace(/-/g, "") ?? null;
}

function symbolFromCoinbasePath(pathname: string): string | null {
  const match = pathname.match(/\/advanced-trade\/[^/]+\/([A-Z0-9-]+)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function formatSymbolFromTitle(title: string): string | null {
  const match = title.match(/^([A-Z0-9.:/-]+)\s*[—–|/\\]/);
  return match?.[1]?.replace(/\//g, "") ?? null;
}

function isTimeframeLike(text: string): boolean {
  return /^(1|3|5|15|30|45|60|120|180|240|D|W|M|1D|1W|1M)$/.test(text);
}

function parseIndicatorLine(text: string): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  if (/^RSI/i.test(text)) {
    const match = text.match(/(\d+\.?\d*)\s*$/);
    if (match?.[1]) result.rsi = parseFloat(match[1]);
  }
  if (/^MACD/i.test(text)) {
    const values = text.match(/[-]?\d+\.?\d*/g);
    if (values?.[0]) result.macd = values[0];
    if (values?.[1]) result.macdSignal = values[1];
  }
  if (/^MA\s*200|EMA\s*200/i.test(text)) {
    const match = text.match(/(\d+\.?\d*)\s*$/);
    if (match?.[1]) result.ma200 = parseFloat(match[1]);
  }
  if (/^Vol/i.test(text)) {
    const match = text.match(/([\d,.]+[KMB]?)\s*$/i);
    if (match?.[1]) result.volume = match[1];
  }
  return result;
}

// ─── Host Detection ───────────────────────────────────────────────────────────

describe("detectHostFromHostname", () => {
  it("identifies tradingview.com correctly", () => {
    expect(detectHostFromHostname("www.tradingview.com")).toBe("tradingview");
  });

  it("identifies hyperliquid.xyz correctly", () => {
    expect(detectHostFromHostname("app.hyperliquid.xyz")).toBe("hyperliquid");
  });

  it("identifies binance.com correctly", () => {
    expect(detectHostFromHostname("www.binance.com")).toBe("binance");
  });

  it("identifies bybit.com correctly", () => {
    expect(detectHostFromHostname("www.bybit.com")).toBe("bybit");
  });

  it("identifies kraken.com correctly", () => {
    expect(detectHostFromHostname("pro.kraken.com")).toBe("kraken");
  });

  it("identifies okx.com correctly", () => {
    expect(detectHostFromHostname("www.okx.com")).toBe("okx");
  });

  it("identifies coinbase.com correctly", () => {
    expect(detectHostFromHostname("www.coinbase.com")).toBe("coinbase");
  });

  it("returns unknown for unrecognised hosts", () => {
    expect(detectHostFromHostname("someotherdex.io")).toBe("unknown");
  });
});

// ─── URL-based Symbol Scrapers ────────────────────────────────────────────────

describe("symbolFromHyperliquidPath", () => {
  it("extracts BTC from /trade/BTC", () => {
    expect(symbolFromHyperliquidPath("/trade/BTC")).toBe("BTC");
  });

  it("extracts ETH from /trade/ETH-PERP and strips -PERP suffix", () => {
    expect(symbolFromHyperliquidPath("/trade/ETH-PERP")).toBe("ETH");
  });

  it("handles lowercase paths", () => {
    expect(symbolFromHyperliquidPath("/trade/sol")).toBe("SOL");
  });

  it("returns null for non-trade paths", () => {
    expect(symbolFromHyperliquidPath("/portfolio")).toBeNull();
  });
});

describe("symbolFromBinancePath", () => {
  it("extracts BTCUSDT from /en/trade/BTC_USDT", () => {
    expect(symbolFromBinancePath("/en/trade/BTC_USDT")).toBe("BTCUSDT");
  });

  it("handles pairs without underscore", () => {
    expect(symbolFromBinancePath("/en/trade/ETHUSDT")).toBe("ETHUSDT");
  });
});

describe("symbolFromBybitPath", () => {
  it("extracts BTCUSDT from /trade/spot/BTC/USDT", () => {
    expect(symbolFromBybitPath("/trade/spot/BTC/USDT")).toBe("BTCUSDT");
  });

  it("extracts ETHUSDT from /trade/usdt/ETHUSDT", () => {
    expect(symbolFromBybitPath("/trade/usdt/ETHUSDT")).toBe("ETHUSDT");
  });
});

describe("symbolFromKrakenPath", () => {
  it("extracts BTC-USD from /app/trade/BTC-USD", () => {
    expect(symbolFromKrakenPath("/app/trade/BTC-USD")).toBe("BTC-USD");
  });
});

describe("symbolFromOkxPath", () => {
  it("extracts BTCUSDT from /trade-spot/btc-usdt", () => {
    expect(symbolFromOkxPath("/trade-spot/btc-usdt")).toBe("BTCUSDT");
  });

  it("extracts ETHUSDT from /trade-futures/eth-usdt", () => {
    expect(symbolFromOkxPath("/trade-futures/eth-usdt")).toBe("ETHUSDT");
  });
});

describe("symbolFromCoinbasePath", () => {
  it("extracts BTC-USD from /advanced-trade/spot/BTC-USD", () => {
    expect(symbolFromCoinbasePath("/advanced-trade/spot/BTC-USD")).toBe("BTC-USD");
  });
});

// ─── Title-based Symbol Fallback ──────────────────────────────────────────────

describe("formatSymbolFromTitle", () => {
  it("extracts from native TradingView title format", () => {
    expect(formatSymbolFromTitle("BTCUSDT — TradingView")).toBe("BTCUSDT");
  });

  it("extracts from pipe-separated title (Hyperliquid/Binance style)", () => {
    expect(formatSymbolFromTitle("BTC/USDT | Hyperliquid")).toBe("BTCUSDT");
  });

  it("handles em-dash and en-dash", () => {
    expect(formatSymbolFromTitle("ETHUSDT – TradingView")).toBe("ETHUSDT");
    expect(formatSymbolFromTitle("TSLA - TradingView")).toBe("TSLA");
  });

  it("returns null for unrecognised formats", () => {
    expect(formatSymbolFromTitle("Welcome to the exchange")).toBeNull();
  });
});

// ─── Timeframe Detection ──────────────────────────────────────────────────────

describe("isTimeframeLike", () => {
  it("accepts standard numeric timeframes", () => {
    for (const t of ["1", "5", "15", "30", "60", "240"]) {
      expect(isTimeframeLike(t)).toBe(true);
    }
  });

  it("accepts letter timeframes", () => {
    for (const t of ["D", "W", "M", "1D", "1W", "1M"]) {
      expect(isTimeframeLike(t)).toBe(true);
    }
  });

  it("rejects non-timeframe strings", () => {
    for (const t of ["BTC", "1hour", "99999", ""]) {
      expect(isTimeframeLike(t)).toBe(false);
    }
  });
});

// ─── Indicator Line Parsing ───────────────────────────────────────────────────

describe("parseIndicatorLine", () => {
  it("parses RSI from legend text", () => {
    expect(parseIndicatorLine("RSI (14) ▲ 58.24").rsi).toBe(58.24);
  });

  it("parses RSI at oversold boundary", () => {
    expect(parseIndicatorLine("RSI 30").rsi).toBe(30);
  });

  it("parses MACD values including signal", () => {
    const result = parseIndicatorLine("MACD 0.15 0.10 0.05");
    expect(result.macd).toBe("0.15");
    expect(result.macdSignal).toBe("0.10");
  });

  it("parses MACD with negative values", () => {
    const result = parseIndicatorLine("MACD -0.5 -0.3");
    expect(result.macd).toBe("-0.5");
    expect(result.macdSignal).toBe("-0.3");
  });

  it("parses MA200 value", () => {
    expect(parseIndicatorLine("MA 200 62000.50").ma200).toBe(62000.5);
  });

  it("parses volume with B suffix", () => {
    expect(parseIndicatorLine("Volume 1.2B").volume).toBe("1.2B");
  });

  it("returns empty object for unknown legend text", () => {
    expect(Object.keys(parseIndicatorLine("Ichimoku Cloud base 100"))).toHaveLength(0);
  });
});
