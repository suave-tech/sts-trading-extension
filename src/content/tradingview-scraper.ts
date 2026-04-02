import type { ChartData, ChartDataUpdateMessage, IndicatorValues } from "../types";

// ─── Host Detection ───────────────────────────────────────────────────────────
// Determines whether we're on native TradingView or an embedded TV chart host.

type KnownHost =
  | "tradingview"
  | "hyperliquid"
  | "binance"
  | "bybit"
  | "kraken"
  | "okx"
  | "coinbase"
  | "unknown";

function detectHost(): KnownHost {
  const host = window.location.hostname;
  if (host.includes("tradingview.com")) return "tradingview";
  if (host.includes("hyperliquid.xyz")) return "hyperliquid";
  if (host.includes("binance.com")) return "binance";
  if (host.includes("bybit.com")) return "bybit";
  if (host.includes("kraken.com")) return "kraken";
  if (host.includes("okx.com")) return "okx";
  if (host.includes("coinbase.com")) return "coinbase";
  return "unknown";
}

// ─── DOM Selectors ─────────────────────────────────────────────────────────────
// These are best-effort selectors that may drift as TradingView updates its UI.
// The scraper must handle null results gracefully — never crash on missing data.
//
// NOTE: When TradingView is *embedded* in third-party platforms, the TV charting
// library still renders the same legend/indicator DOM inside an iframe or shadow
// container. The toolbar (symbol search, timeframe buttons) is replaced by the
// host platform's own UI, so we fall back to URL path and page title for those.

const SELECTORS = {
  // Native TradingView toolbar
  symbolButton: "#header-toolbar-symbol-search",
  timeframeActive: [
    'button[class*="isActive"][class*="item-"][class*="timeframe"]',
    'div[class*="timeframes"] button[class*="active"]',
    'button[data-value][class*="selected"]',
  ],

  // Price — same across native + embedded (TV charting lib renders these)
  lastPrice: [
    'div[class*="lastPrice"]',
    'div[class*="price-axis"] span[class*="price"]',
    'div[class*="chart-value-item"] span',
    // Hyperliquid / generic exchange price tickers
    'div[class*="markPrice"]',
    'span[class*="lastPrice"]',
    '[data-testid="last-price"]',
  ],

  // TV charting legend rows — same DOM structure whether native or embedded
  legendRows:
    'div[class*="pane-legend-line"], div[class*="legend-source-item"], div[class*="legendItem"]',

  // Generic timeframe button sweep (used for embedded hosts)
  anyTimeframeButton: 'button[class*="item-"]',
} as const;

// ─── Per-host symbol scrapers ─────────────────────────────────────────────────

const HOST_SYMBOL_SCRAPERS: Partial<Record<KnownHost, () => string | null>> = {
  hyperliquid: () => {
    // URL pattern: /trade/BTC  or  /trade/BTC-PERP
    const match = window.location.pathname.match(/\/trade\/([A-Z0-9-]+)/i);
    if (match?.[1]) return match[1].toUpperCase().replace(/-PERP$/i, "");

    // Fallback: look for the selected asset in their UI
    const asset = document.querySelector(
      '[class*="selectedAsset"], [class*="assetName"], [class*="tradePair"]'
    );
    return asset?.textContent?.trim().split(/[\s/]/)[0] ?? null;
  },

  binance: () => {
    // URL: /en/trade/BTC_USDT
    const match = window.location.pathname.match(/\/trade\/([A-Z0-9_]+)/i);
    if (match?.[1]) return match[1].replace("_", "");

    return (
      document.querySelector('[class*="headerSymbol"], [class*="tradePair"]')
        ?.textContent?.trim()
        .split(/\s/)[0] ?? null
    );
  },

  bybit: () => {
    // URL: /trade/spot/BTC/USDT  or  /trade/usdt/BTCUSDT
    const parts = window.location.pathname.split("/").filter(Boolean);
    const tradeIdx = parts.indexOf("trade");
    if (tradeIdx !== -1 && parts[tradeIdx + 2]) {
      return (parts[tradeIdx + 1] + parts[tradeIdx + 2]).toUpperCase();
    }
    if (tradeIdx !== -1 && parts[tradeIdx + 2] === undefined && parts[tradeIdx + 1]) {
      return parts[tradeIdx + 1].toUpperCase();
    }
    return null;
  },

  kraken: () => {
    // URL: /app/trade/BTC-USD
    const match = window.location.pathname.match(/\/trade\/([A-Z0-9-]+)/i);
    return match?.[1]?.toUpperCase() ?? null;
  },

  okx: () => {
    // URL: /trade-spot/btc-usdt
    const match = window.location.pathname.match(/\/trade-[^/]+\/([a-z0-9-]+)/i);
    return match?.[1]?.toUpperCase().replace(/-/g, "") ?? null;
  },

  coinbase: () => {
    // URL: /advanced-trade/spot/BTC-USD
    const match = window.location.pathname.match(/\/advanced-trade\/[^/]+\/([A-Z0-9-]+)/i);
    return match?.[1]?.toUpperCase() ?? null;
  },
};

// ─── Scraper Utilities ────────────────────────────────────────────────────────

function tryQueryText(selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        return el.textContent.trim();
      }
    } catch {
      // Selector may be invalid after update — continue
    }
  }
  return null;
}

function scrapeSymbol(host: KnownHost): string {
  // 1. Use host-specific scraper if available
  const hostScraper = HOST_SYMBOL_SCRAPERS[host];
  if (hostScraper) {
    const result = hostScraper();
    if (result) return result;
  }

  // 2. Native TradingView toolbar symbol button
  const symbolBtn = document.querySelector(SELECTORS.symbolButton);
  if (symbolBtn?.textContent?.trim()) {
    const text = symbolBtn.textContent.trim().split(/\s+/)[0];
    if (text && text.length > 0) return text;
  }

  // 3. Parse the page title (works on native TV and many embedded hosts)
  //    Formats seen: "BTCUSDT — TradingView", "BTC/USDT | Hyperliquid", "BTC/USDT Perpetual | Binance"
  const title = document.title;
  if (title) {
    const match = title.match(/^([A-Z0-9.:/-]+)\s*[—–|/\\]/);
    if (match?.[1]) return match[1].replace(/\//g, "");
  }

  return "UNKNOWN";
}

function scrapeTimeframe(host: KnownHost): string {
  // All known hosts render the TV timeframe toolbar once the chart loads.
  // Try the standard selectors first.
  for (const selector of SELECTORS.timeframeActive) {
    try {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) return el.textContent.trim();
    } catch {
      // Continue
    }
  }

  // data attribute fallback (some embedded wrappers set this)
  const byData = document.querySelector("[data-active-chart-timeframe]");
  if (byData) {
    const val = byData.getAttribute("data-active-chart-timeframe");
    if (val) return val;
  }

  // Scan all item-class buttons for active timeframe labels
  const buttons = document.querySelectorAll(SELECTORS.anyTimeframeButton);
  for (const btn of buttons) {
    const text = btn.textContent?.trim() ?? "";
    if (/^(1|3|5|15|30|45|60|120|180|240|D|W|M|1D|1W|1M)$/.test(text)) {
      const classes = btn.className;
      if (
        classes.includes("active") ||
        classes.includes("selected") ||
        classes.includes("isActive")
      ) {
        return text;
      }
    }
  }

  // Hyperliquid-specific: timeframe is often in a segmented control
  if (host === "hyperliquid") {
    const tfBtn = document.querySelector(
      '[class*="timeframe"][class*="selected"], [class*="interval"][class*="active"]'
    );
    if (tfBtn?.textContent?.trim()) return tfBtn.textContent.trim();
  }

  return "UNKNOWN";
}

function scrapePrice(): string | undefined {
  return tryQueryText(SELECTORS.lastPrice) ?? undefined;
}

function scrapeLegendIndicators(): IndicatorValues {
  const indicators: IndicatorValues = {};

  try {
    const legendRows = document.querySelectorAll(SELECTORS.legendRows);

    for (const row of legendRows) {
      const text = row.textContent?.trim() ?? "";

      if (/^RSI/i.test(text)) {
        const match = text.match(/(\d+\.?\d*)\s*$/);
        if (match?.[1]) indicators.rsi = parseFloat(match[1]);
      }

      if (/^MACD/i.test(text)) {
        const values = text.match(/[-]?\d+\.?\d*/g);
        if (values?.[0]) indicators.macd = values[0];
        if (values?.[1]) indicators.macdSignal = values[1];
        if (values?.[2]) indicators.macdHistogram = values[2];
      }

      if (/^MA\s*20|EMA\s*20/i.test(text)) {
        const match = text.match(/(\d+\.?\d*)\s*$/);
        if (match?.[1]) indicators.ma20 = parseFloat(match[1]);
      }
      if (/^MA\s*50|EMA\s*50/i.test(text)) {
        const match = text.match(/(\d+\.?\d*)\s*$/);
        if (match?.[1]) indicators.ma50 = parseFloat(match[1]);
      }
      if (/^MA\s*200|EMA\s*200/i.test(text)) {
        const match = text.match(/(\d+\.?\d*)\s*$/);
        if (match?.[1]) indicators.ma200 = parseFloat(match[1]);
      }

      if (/^Vol/i.test(text)) {
        const match = text.match(/([\d,.]+[KMB]?)\s*$/i);
        if (match?.[1]) indicators.volume = match[1];
      }
    }
  } catch {
    // DOM query failed — return whatever we have
  }

  return indicators;
}

export function scrapeChartData(): ChartData {
  const host = detectHost();
  return {
    symbol: scrapeSymbol(host),
    timeframe: scrapeTimeframe(host),
    price: scrapePrice(),
    indicators: scrapeLegendIndicators(),
    scrapedAt: Date.now(),
  };
}

// ─── Message Dispatch ─────────────────────────────────────────────────────────

function sendChartDataToBackground(data: ChartData): void {
  const message: ChartDataUpdateMessage = {
    type: "CHART_DATA_UPDATE",
    payload: data,
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Extension may have been reloaded — ignore
  });
}

// ─── MutationObserver — Chart Change Detection ────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 1500;

function onChartMutation(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const data = scrapeChartData();
    sendChartDataToBackground(data);
  }, DEBOUNCE_MS);
}

function startObserver(): void {
  const targets: Element[] = [];

  // Native TV toolbar
  const symbolEl = document.querySelector(SELECTORS.symbolButton);
  if (symbolEl) targets.push(symbolEl);

  const toolbar = document.querySelector(
    'div[class*="toolbar-"], div[id*="header-toolbar"]'
  );
  if (toolbar) targets.push(toolbar);

  // Fallback: observe the full body (catches SPA route changes on embedded hosts)
  if (targets.length === 0) {
    targets.push(document.body);
  }

  const observer = new MutationObserver(onChartMutation);

  for (const target of targets) {
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "data-value", "href"],
    });
  }
}

// ─── SPA Navigation Detection ─────────────────────────────────────────────────
// Single-page apps (Hyperliquid, Binance, etc.) change the URL without a full
// page reload. We watch pushState / popstate to detect symbol changes.

function watchSpaNavigation(): void {
  const handleNavigation = () => {
    // Give the SPA time to render the new chart before scraping
    setTimeout(() => {
      const data = scrapeChartData();
      sendChartDataToBackground(data);
    }, 1500);
  };

  // Patch pushState
  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args) => {
    originalPushState(...args);
    handleNavigation();
  };

  // Also listen for browser back/forward
  window.addEventListener("popstate", handleNavigation);
}

// ─── Message Listener (respond to manual scrape requests) ─────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCRAPE_REQUEST") {
    const data = scrapeChartData();
    sendResponse({ success: true, data });
    sendChartDataToBackground(data);
  }
  return true;
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init() {
  const data = scrapeChartData();
  sendChartDataToBackground(data);
  startObserver();
  watchSpaNavigation();
})();
