import type { ChartData, ChartDataUpdateMessage, IndicatorValues } from "../types";

// ─── Host Detection ───────────────────────────────────────────────────────────

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

// ─── TV Chart Presence Check ──────────────────────────────────────────────────
// TradingView's charting library always renders at least one <canvas> element.
// We use that as the most reliable signal that the chart has mounted, with
// additional class-based checks as early signals.

function hasTradingViewChart(): boolean {
  // Canvas is the most reliable — TV always renders into canvas
  const canvases = document.querySelectorAll("canvas");
  if (canvases.length > 0) return true;

  // Class-based checks as secondary signals
  return !!(
    document.querySelector('div[class*="chart-container"]') ||
    document.querySelector('div[class*="pane-legend"]') ||
    document.querySelector('div[class*="tv-chart"]') ||
    document.querySelector("#header-toolbar-symbol-search")
  );
}

// ─── DOM Selectors ────────────────────────────────────────────────────────────

const SELECTORS = {
  symbolButton: "#header-toolbar-symbol-search",
  timeframeActive: [
    'button[class*="isActive"][class*="item-"][class*="timeframe"]',
    'div[class*="timeframes"] button[class*="active"]',
    'button[data-value][class*="selected"]',
    'div[class*="group-"] button[class*="isActive"]',
    'button[class*="isActive"]',
  ],
  lastPrice: [
    'div[class*="lastPrice"]',
    'div[class*="price-axis"] span[class*="price"]',
    'div[class*="chart-value-item"] span',
    'div[class*="markPrice"]',
    'span[class*="lastPrice"]',
    '[data-testid="last-price"]',
  ],
  legendRows: [
    'div[class*="pane-legend-line"]',
    'div[class*="legend-source-item"]',
    'div[class*="legendItem"]',
  ].join(", "),
  anyTimeframeButton: 'button[class*="item-"]',
} as const;

// ─── Per-host symbol scrapers ─────────────────────────────────────────────────

const HOST_SYMBOL_SCRAPERS: Partial<Record<KnownHost, () => string | null>> = {
  hyperliquid: () => {
    const match = window.location.pathname.match(/\/trade\/([A-Z0-9-]+)/i);
    if (match?.[1]) return match[1].toUpperCase().replace(/-PERP$/i, "");
    return null;
  },
  binance: () => {
    const match = window.location.pathname.match(/\/trade\/([A-Z0-9_]+)/i);
    if (match?.[1]) return match[1].replace("_", "");
    return null;
  },
  bybit: () => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const tradeIdx = parts.indexOf("trade");
    if (tradeIdx !== -1 && parts[tradeIdx + 2])
      return (parts[tradeIdx + 1] + parts[tradeIdx + 2]).toUpperCase();
    if (tradeIdx !== -1 && parts[tradeIdx + 1])
      return parts[tradeIdx + 1].toUpperCase();
    return null;
  },
  kraken: () => {
    const match = window.location.pathname.match(/\/trade\/([A-Z0-9-]+)/i);
    return match?.[1]?.toUpperCase() ?? null;
  },
  okx: () => {
    const match = window.location.pathname.match(/\/trade-[^/]+\/([a-z0-9-]+)/i);
    return match?.[1]?.toUpperCase().replace(/-/g, "") ?? null;
  },
  coinbase: () => {
    const match = window.location.pathname.match(/\/advanced-trade\/[^/]+\/([A-Z0-9-]+)/i);
    return match?.[1]?.toUpperCase() ?? null;
  },
};

// ─── Scrapers ─────────────────────────────────────────────────────────────────

function tryQueryText(selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) return el.textContent.trim();
    } catch { /* continue */ }
  }
  return null;
}

function scrapeSymbol(host: KnownHost): string {
  // 1. Host-specific URL scraper (most reliable — URL never lies)
  const hostScraper = HOST_SYMBOL_SCRAPERS[host];
  if (hostScraper) {
    const result = hostScraper();
    if (result) return result;
  }

  // 2. Native TV toolbar symbol button
  const symbolBtn = document.querySelector(SELECTORS.symbolButton);
  if (symbolBtn?.textContent?.trim()) {
    const text = symbolBtn.textContent.trim().split(/\s+/)[0];
    if (text) return text;
  }

  // 3. Page title: "BTCUSDT — TradingView", "BTC/USDT | Hyperliquid"
  const title = document.title;
  if (title) {
    const match = title.match(/^([A-Z0-9.:/-]+)\s*[—–|/\\]/);
    if (match?.[1]) return match[1].replace(/\//g, "");
  }

  return "UNKNOWN";
}

function scrapeTimeframe(host: KnownHost): string {
  // 1. Standard TV active timeframe buttons
  for (const selector of SELECTORS.timeframeActive) {
    try {
      const el = document.querySelector(selector);
      const text = el?.textContent?.trim() ?? "";
      if (text && /^(1|3|5|15|30|45|60|120|180|240|D|W|M|1D|1W|1M|\d+[mhDW])$/i.test(text)) {
        return text;
      }
    } catch { /* continue */ }
  }

  // 2. data attribute
  const byData = document.querySelector("[data-active-chart-timeframe]");
  if (byData?.getAttribute("data-active-chart-timeframe")) {
    return byData.getAttribute("data-active-chart-timeframe")!;
  }

  // 3. Scan ALL buttons for one with an active/selected class and a timeframe label
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    const text = btn.textContent?.trim() ?? "";
    if (/^(1|3|5|15|30|45|60|120|180|240|D|W|M|1D|1W|1M)$/.test(text)) {
      const cls = btn.className;
      if (
        cls.includes("active") ||
        cls.includes("selected") ||
        cls.includes("isActive") ||
        btn.getAttribute("aria-selected") === "true" ||
        btn.getAttribute("data-active") === "true"
      ) {
        return text;
      }
    }
  }

  // 4. Hyperliquid renders the active timeframe in its own toolbar above the chart.
  //    The selected button often has a distinct background/border class.
  //    Scan all buttons matching short timeframe patterns and pick the "active" one.
  if (host === "hyperliquid") {
    const allBtns = document.querySelectorAll("button");
    // Collect candidates that look like timeframe buttons
    const tfCandidates: Element[] = [];
    for (const btn of allBtns) {
      const text = btn.textContent?.trim() ?? "";
      if (/^\d+[mhDW]$|^[DWM]$/i.test(text)) {
        tfCandidates.push(btn);
      }
    }
    // Among candidates, pick the one whose parent or self has a visual selection cue
    for (const btn of tfCandidates) {
      const combined = btn.className + (btn.parentElement?.className ?? "");
      if (
        combined.includes("active") ||
        combined.includes("selected") ||
        combined.includes("current") ||
        combined.includes("highlight") ||
        combined.includes("bold") ||
        btn.getAttribute("aria-pressed") === "true"
      ) {
        return btn.textContent?.trim() ?? "UNKNOWN";
      }
    }
  }

  // 5. Parse the TV legend title: "BTCUSD · 4h · Hyperliquid"
  const legendTitle = document.querySelector(
    'div[class*="pane-legend-title"], div[class*="chart-title"], div[class*="main-title"]'
  );
  if (legendTitle?.textContent) {
    const tfMatch = legendTitle.textContent.match(/\b(\d+[mhDW]|[DWM])\b/i);
    if (tfMatch?.[1]) return tfMatch[1];
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
      if (!text) continue;

      // RSI — "RSI 14 · 39.89", "RSI (14) ▲ 58.24"
      if (/^RSI/i.test(text)) {
        const match = text.match(/[▲▼]?\s*(\d+\.?\d+)\s*$/) ?? text.match(/(\d+\.?\d+)\s*$/);
        if (match?.[1]) indicators.rsi = Number.parseFloat(match[1]);
      }

      // MACD — "MACD 12 26 close 9 · -71.398 · -26.533 · 44.755"
      if (/^MACD/i.test(text)) {
        const values = text.match(/[-−]?\d+\.\d+/g);
        if (values?.[0]) indicators.macd = values[0];
        if (values?.[1]) indicators.macdSignal = values[1];
        if (values?.[2]) indicators.macdHistogram = values[2];
      }

      // Bollinger Bands — "BB 20 2 · 67,554 · 69,084 · 66,025"
      if (/^BB\s/i.test(text)) {
        const nums = text.replace(/,/g, "").match(/\d+\.?\d*/g);
        if (nums && nums.length >= 4) {
          indicators.bbMiddle = Number.parseFloat(nums[1]);
          indicators.bbUpper = Number.parseFloat(nums[2]);
          indicators.bbLower = Number.parseFloat(nums[3]);
        }
      }

      // Moving averages
      if (/^(MA|EMA)\s*20\b/i.test(text)) {
        const match = text.replace(/,/g, "").match(/(\d+\.?\d*)\s*$/);
        if (match?.[1]) indicators.ma20 = Number.parseFloat(match[1]);
      }
      if (/^(MA|EMA)\s*50\b/i.test(text)) {
        const match = text.replace(/,/g, "").match(/(\d+\.?\d*)\s*$/);
        if (match?.[1]) indicators.ma50 = Number.parseFloat(match[1]);
      }
      if (/^(MA|EMA)\s*200\b/i.test(text)) {
        const match = text.replace(/,/g, "").match(/(\d+\.?\d*)\s*$/);
        if (match?.[1]) indicators.ma200 = Number.parseFloat(match[1]);
      }

      // Volume — "Volume SMA · 735.28"
      if (/^Vol/i.test(text)) {
        const match = text.replace(/,/g, "").match(/([\d.]+[KMB]?)\s*$/i);
        if (match?.[1]) indicators.volume = match[1];
      }
    }
  } catch { /* return whatever we have */ }

  return indicators;
}

// ─── Debug report ─────────────────────────────────────────────────────────────

function buildDebugReport(): object {
  const host = detectHost();
  const hasChart = hasTradingViewChart();
  const data = scrapeChartData();

  const legendEls = document.querySelectorAll(SELECTORS.legendRows);
  const legendTexts = Array.from(legendEls)
    .map((el) => el.textContent?.trim())
    .filter(Boolean);

  const canvasCount = document.querySelectorAll("canvas").length;

  // All buttons that look like timeframe buttons
  const allButtons = Array.from(document.querySelectorAll("button"))
    .filter((b) => /^(\d+[mhDW]?|[DWM])$/i.test(b.textContent?.trim() ?? ""))
    .map((b) => ({
      text: b.textContent?.trim(),
      className: b.className.slice(0, 120),
      ariaSelected: b.getAttribute("aria-selected"),
      ariaPressed: b.getAttribute("aria-pressed"),
      dataActive: b.getAttribute("data-active"),
    }));

  return {
    host,
    hasChart,
    canvasCount,
    url: window.location.href,
    title: document.title,
    scrapedData: data,
    legendRowsFound: legendTexts.length,
    legendTexts,
    timeframeButtonCandidates: allButtons,
  };
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
  // Only suppress if we're on an unknown host with no data at all —
  // on supported hosts always send even if partial, so the side panel
  // can at least show the symbol and trigger an analysis.
  const host = detectHost();
  const hasAnything = data.symbol !== "UNKNOWN" ||
    Object.keys(data.indicators).length > 0 ||
    !!data.price;

  if (host === "unknown" && !hasAnything) return;

  const message: ChartDataUpdateMessage = {
    type: "CHART_DATA_UPDATE",
    payload: data,
  };
  chrome.runtime.sendMessage(message).catch(() => { /* extension reloaded */ });
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 1500;

function onChartMutation(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    sendChartDataToBackground(scrapeChartData());
  }, DEBOUNCE_MS);
}

function startObserver(): void {
  const targets: Element[] = [];

  const symbolEl = document.querySelector(SELECTORS.symbolButton);
  if (symbolEl) targets.push(symbolEl);

  const toolbar = document.querySelector('div[class*="toolbar-"], div[id*="header-toolbar"]');
  if (toolbar) targets.push(toolbar);

  // Watch the legend container so indicator values update as the chart moves
  const legend = document.querySelector('div[class*="pane-legend"], div[class*="chart-container"]');
  if (legend) targets.push(legend);

  if (targets.length === 0) targets.push(document.body);

  const observer = new MutationObserver(onChartMutation);
  for (const target of targets) {
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "data-value"],
    });
  }
}

// ─── SPA Navigation Detection ─────────────────────────────────────────────────

function watchSpaNavigation(): void {
  const handleNavigation = () => {
    setTimeout(() => sendChartDataToBackground(scrapeChartData()), 1500);
  };

  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args) => {
    originalPushState(...args);
    handleNavigation();
  };
  window.addEventListener("popstate", handleNavigation);
}

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCRAPE_REQUEST") {
    const data = scrapeChartData();
    sendResponse({ success: true, data });
    sendChartDataToBackground(data);
  }
  if (message?.type === "DEBUG_SCRAPE") {
    sendResponse(buildDebugReport());
  }
  return true;
});

// ─── Init ─────────────────────────────────────────────────────────────────────
// Strategy:
// - On native TradingView: scrape immediately, the chart is always present.
// - On embedded/SPA hosts (Hyperliquid etc.): the chart loads async after the
//   JS framework mounts. Poll every 500ms until we see canvas elements (the
//   most reliable signal that TV has rendered), then scrape.

(function init() {
  const host = detectHost();

  if (host === "unknown") return; // Not a supported platform

  if (host === "tradingview") {
    // Native TV — chart is present at document_idle
    sendChartDataToBackground(scrapeChartData());
    startObserver();
    watchSpaNavigation();
    return;
  }

  // SPA host (Hyperliquid, Binance, etc.)
  // Step 1: send the symbol from the URL immediately — the background will
  //         detect missing indicators and auto-fetch from the platform API.
  sendChartDataToBackground(scrapeChartData());

  // Step 2: also poll for the chart to render so we can pick up the timeframe
  //         from the UI (the API fetch will use a default if we never find it).
  let attempts = 0;
  const MAX_ATTEMPTS = 40; // 20 seconds
  const poll = setInterval(() => {
    attempts++;
    const data = scrapeChartData();
    const hasTimeframe = data.timeframe !== "UNKNOWN";
    if (hasTimeframe || attempts >= MAX_ATTEMPTS) {
      clearInterval(poll);
      if (hasTimeframe) sendChartDataToBackground(data);
      startObserver();
    }
  }, 500);

  watchSpaNavigation();
})();
