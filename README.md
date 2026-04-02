# TradingView AI Analyst — Chrome Extension

An AI-powered trade analysis side panel for TradingView charts and popular trading platforms. Powered by Claude Sonnet via the Anthropic API.

---

## What it does

Open the side panel on any supported chart page and hit **Analyze Chart**. The extension reads the visible chart data from the DOM — symbol, timeframe, price, and any indicators you have loaded (RSI, MACD, moving averages, volume) — and sends it to Claude Sonnet, which returns a structured analysis covering:

- Trend assessment (bullish / bearish / neutral)
- Key support & resistance levels
- Indicator signal summary
- Trade setup suggestion (entry zone, target, stop-loss)
- Risk notes and invalidation conditions
- Confidence rating (Low / Medium / High)

You can then ask follow-up questions in the **Chat** tab for a full multi-turn conversation grounded in the chart context.

---

## Supported platforms

| Platform | URL pattern |
|---|---|
| TradingView | `tradingview.com/chart/*` |
| Hyperliquid | `app.hyperliquid.xyz/trade/*` |
| Binance | `binance.com/en/trade/*` |
| Bybit | `bybit.com/trade/*` |
| Kraken Pro | `pro.kraken.com/app/trade/*` |
| OKX | `okx.com/trade-spot/*` |
| Coinbase Advanced | `coinbase.com/advanced-trade/*` |

On third-party platforms, the symbol is read from the URL path. Indicator values (RSI, MACD, MAs, etc.) are read from TradingView's embedded charting library, which all of the above platforms use.

---

## Requirements

- [Node.js](https://nodejs.org) v18 or later
- [pnpm](https://pnpm.io) (`npm install -g pnpm`)
- An [Anthropic API key](https://console.anthropic.com) (you supply your own — no backend proxy)
- Google Chrome v114 or later (Side Panel API)

---

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Build the extension

```bash
pnpm build
```

This outputs a `dist/` folder — that's what Chrome loads.

### 3. Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** → select the `dist/` folder
4. The extension icon appears in your Chrome toolbar

### 4. Configure your API key

1. Open any supported chart page (e.g. `https://app.hyperliquid.xyz/trade/BTC`)
2. Click the extension icon to open the side panel
3. Go to the **Settings** tab
4. Paste your Anthropic API key and click **Save Key**
5. Optionally click **Test Connection** to verify

### 5. Run your first analysis

1. Make sure your chart has some indicators loaded (RSI, MACD, MAs — the more, the richer the analysis)
2. Select your **Trading Style** (Scalp / Swing / Position) and **Risk Tolerance** in Settings
3. Switch to the **Analysis** tab and click **Analyze Chart**

---

## Development

```bash
# Watch mode — rebuilds on save
pnpm dev

# Run unit tests
pnpm test

# Run tests with coverage report
pnpm test:coverage

# Lint
pnpm lint

# Format
pnpm format

# Lint + format + auto-fix in one step
pnpm check
```

After each rebuild in watch mode, go to `chrome://extensions` and click the **↺** icon next to the extension to reload it.

---

## Project structure

```
trading-extension/
├── manifest.json                  # MV3 manifest
├── biome.json                     # Linting + formatting (replaces ESLint + Prettier)
├── lefthook.yml                   # Git hooks: lint/typecheck on commit, test on push
├── src/
│   ├── background/
│   │   └── service-worker.ts      # Anthropic API calls + message routing
│   ├── content/
│   │   └── tradingview-scraper.ts # DOM scraping, host detection, SPA nav watcher
│   ├── sidepanel/
│   │   ├── App.tsx                # 3-tab shell (Analysis / Chat / Settings)
│   │   ├── components/            # AnalysisPanel, ChatThread, MessageInput, SettingsPanel, Disclaimer
│   │   └── hooks/                 # useChartData, useAnalysis
│   ├── prompts/
│   │   └── templates.ts           # System prompt + per-style user prompt templates
│   └── types/
│       └── index.ts               # Shared TypeScript types
└── public/
    └── icons/                     # 16, 48, 128px extension icons
```

---

## Configuration options

| Setting | Options | Default |
|---|---|---|
| Trading style | Scalp / Swing / Position | Swing |
| Risk tolerance | Conservative / Moderate / Aggressive | Moderate |
| Auto-refresh | On / Off | Off |

**Auto-refresh** triggers a new analysis automatically whenever the extension detects a symbol or timeframe change. Useful on TradingView; on SPA-based exchanges it's triggered by URL path changes.

---

## Architecture

```
Content Script ──CHART_DATA_UPDATE──► Service Worker ──ANALYSIS_RESULT──► Side Panel
     │                                      │
     │  (DOM scraping,                      │  (Anthropic API call,
     │   MutationObserver,                  │   conversation history
     │   SPA nav watcher)                   │   in chrome.storage.local)
     │                                      ▼
     └──────────────────────────────► chrome.storage.local
                                       (API key, preferences,
                                        conversation history)
```

All communication between extension components uses `chrome.runtime.sendMessage`. There is no backend server — your API key stays on your machine in `chrome.storage.local`.

---

## Security & privacy

- Your Anthropic API key is stored in `chrome.storage.local` (encrypted by Chrome, never synced)
- The key is never logged, never sent anywhere except `api.anthropic.com`
- Chart data (symbol, timeframe, indicator values) is sent to Anthropic as part of the analysis prompt — the UI displays a notice about this
- No external analytics, telemetry, or CDN dependencies at runtime

---

## Troubleshooting

**"No chart data" in the panel**
The content script only runs on supported URLs. Make sure you're on a supported page and the URL matches one of the patterns above. Try clicking **↺ Refresh** in the Analysis tab to manually re-scrape.

**Indicators not showing up in the analysis**
The scraper reads from TradingView's legend panes. Add RSI, MACD, or moving averages to your chart — only indicators you've actually added will be visible in the DOM.

**"Invalid API key" error**
Double-check the key in Settings. Keys should start with `sk-ant-`. Use **Test Connection** to validate before running a full analysis.

**Analysis seems stale after switching assets**
If **Auto-refresh** is off, click **Analyze Chart** again after switching. On SPA platforms (Hyperliquid, Binance, etc.) there may be a 1–2 second delay before the new chart DOM loads.

**Selectors broke after a TradingView UI update**
TradingView occasionally changes its class names. Update the `SELECTORS` constant in `src/content/tradingview-scraper.ts` and rebuild.

---

## Disclaimer

This tool is for informational purposes only. It does not constitute financial advice. All analysis is generated by an AI model and may be incomplete or incorrect. Trade at your own risk.
