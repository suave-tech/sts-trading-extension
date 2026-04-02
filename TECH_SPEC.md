# TradingView AI Analysis Chrome Extension — Tech Spec

**Version:** 1.0
**Date:** April 1, 2026
**Status:** Pre-development

---

## 1. Project Overview

A Chrome Extension (Manifest V3) that activates on TradingView chart pages and surfaces an AI-powered trade analysis side panel powered by Claude Sonnet. The extension reads visible chart data from the DOM, sends it to the Anthropic Messages API, and returns structured trade analysis with follow-up chat capability.

---

## 2. Goals & Non-Goals

### Goals
- Read symbol, timeframe, and visible indicator values from TradingView's DOM
- Display a native Chrome Side Panel with Claude-powered analysis
- Support follow-up questions in a persistent chat interface
- Allow configuration of trading style and risk tolerance
- Package as a `.zip` ready for Chrome developer mode loading

### Non-Goals
- No backend proxy server (user supplies their own API key)
- No real-time price streaming or broker integration
- No support for non-TradingView chart pages (v1)
- No Chrome Web Store publishing (v1)

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     Chrome Extension                        │
│                                                            │
│  ┌──────────────┐    ┌──────────────┐   ┌──────────────┐  │
│  │  Content     │    │  Background  │   │  Side Panel  │  │
│  │  Script      │◄──►│  Service     │◄──►│  (React UI)  │  │
│  │              │    │  Worker      │   │              │  │
│  │ DOM scraping │    │ API calls    │   │ Chat + Config│  │
│  │ MutationObs. │    │ Message bus  │   │              │  │
│  └──────────────┘    └──────────────┘   └──────────────┘  │
│                              │                             │
│                    ┌─────────▼──────────┐                  │
│                    │  chrome.storage    │                  │
│                    │  .local            │                  │
│                    │  (API key, prefs)  │                  │
│                    └────────────────────┘                  │
└────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Anthropic API     │
                    │  claude-sonnet-4-5 │
                    └────────────────────┘
```

### Component Responsibilities

| Component | Role |
|---|---|
| **Content Script** | Injected into TradingView pages. Scrapes DOM for symbol, timeframe, and indicator values. Watches for chart changes via MutationObserver. Sends data to background via `chrome.runtime.sendMessage`. |
| **Background Service Worker** | Receives scraped data. Holds conversation history. Makes fetch calls to Anthropic API. Routes responses back to Side Panel. |
| **Side Panel (React)** | The user-facing UI. Shows analysis output, chat thread, settings panel for API key and trading preferences. Built with React + Vite, compiled to static assets. |
| **chrome.storage.local** | Persists: API key, trading style, risk tolerance, conversation history (optional). |

---

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Extension manifest | Manifest V3 |
| Frontend framework | React 18 |
| Build tool | Vite 5 with `vite-plugin-web-extension` (or `crxjs`) |
| Styling | Tailwind CSS (via CDN or PostCSS in build) |
| API client | Native `fetch()` — no SDK needed in extension context |
| AI model | `claude-sonnet-4-5` via Anthropic Messages API |
| Storage | `chrome.storage.local` |
| Data extraction | DOM scraping + MutationObserver |

---

## 5. File Structure

```
trading-extension/
├── manifest.json                  # MV3 manifest
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── public/
│   └── icons/                     # 16, 48, 128px extension icons
├── src/
│   ├── background/
│   │   └── service-worker.ts      # Background script: API calls, message routing
│   ├── content/
│   │   └── tradingview-scraper.ts # DOM scraping + MutationObserver
│   ├── sidepanel/
│   │   ├── index.html             # Side panel entry HTML
│   │   ├── main.tsx               # React root
│   │   ├── App.tsx                # Root component with tab routing
│   │   ├── components/
│   │   │   ├── AnalysisPanel.tsx  # Displays Claude's structured analysis
│   │   │   ├── ChatThread.tsx     # Follow-up Q&A thread
│   │   │   ├── MessageInput.tsx   # User input + send button
│   │   │   ├── SettingsPanel.tsx  # API key + trading preferences
│   │   │   └── Disclaimer.tsx     # "Not financial advice" notice
│   │   └── hooks/
│   │       ├── useChartData.ts    # Listens for data from content script
│   │       └── useAnalysis.ts     # Manages analysis state + chat history
│   ├── prompts/
│   │   └── templates.ts           # Prompt templates by trading style
│   └── types/
│       └── index.ts               # Shared TypeScript types
└── dist/                          # Built extension (zip this for loading)
```

---

## 6. Data Flow

### Initial Analysis Flow

```
1. User navigates to tradingview.com/chart/...
2. Content script activates, scrapes DOM:
   - Symbol (e.g. "BTCUSDT")
   - Timeframe (e.g. "1H")
   - Visible indicators and their values
     (RSI: 58.2, MACD: bullish cross, MA200: below price, etc.)
3. Content script sends { symbol, timeframe, indicators } to background
4. Background builds prompt from template (based on user's trading style)
5. Background sends request to Anthropic Messages API
6. Response streamed back → forwarded to side panel
7. Side panel renders structured analysis
```

### Follow-up Chat Flow

```
1. User types question in MessageInput
2. Message sent to background service worker
3. Background appends to existing conversation history array
4. New API call made with full history (multi-turn)
5. Response appended to ChatThread
```

### Chart Change Detection

```
1. MutationObserver watches TradingView's symbol/timeframe DOM nodes
2. On change (debounced 1.5s), re-scrape and notify background
3. Background optionally triggers fresh analysis (if auto-refresh enabled)
```

---

## 7. TradingView DOM Scraping

TradingView renders chart metadata and indicator values in predictable DOM locations. We will target these selectors (subject to verification and maintenance):

| Data Point | Extraction Target |
|---|---|
| Symbol | `#header-toolbar-symbol-search` button text, or `<title>` tag |
| Timeframe | Active button in the timeframe toolbar |
| Price (last) | `.lastPrice` or `.price-axis` visible label |
| RSI value | Legend pane text for RSI indicator overlay |
| MACD | Legend pane text for MACD indicator |
| Moving averages | Legend pane text for MA overlays |
| Volume | Volume pane label or data-value attribute |

**Important caveats:**
- TradingView's DOM selectors can change with UI updates. The scraper must gracefully degrade if selectors are unavailable (pass partial data, never crash).
- Only indicators the user has added to their chart will be visible. Claude's prompt must handle missing fields cleanly.
- The extension will include a "Refresh" button for manual re-scrape if auto-detection misses a change.

---

## 8. Prompt Engineering

### System Prompt (shared across all styles)
```
You are a professional trading analyst assistant. Your role is to analyze
chart data provided by the user and give structured, objective insights.

Always include:
1. Trend assessment (bullish / bearish / neutral + reasoning)
2. Key support and resistance levels (based on available data)
3. Indicator signals (summarize each indicator provided)
4. Trade setup suggestion (entry zone, target, stop-loss if applicable)
5. Risk notes and conditions that would invalidate the setup
6. A confidence level: Low / Medium / High

Always end with: "⚠️ This is not financial advice. Trade at your own risk."

If data is missing or incomplete, work with what is available and note gaps.
```

### User Prompt Template (per trading style)

**Scalp (< 1 hour timeframes)**
```
Analyze this chart for a scalp trade opportunity (short-duration, quick in/out):
Symbol: {symbol} | Timeframe: {timeframe}
Indicators: {indicators}
Focus on: momentum, short-term price action, tight S/R levels.
```

**Swing (hours to days)**
```
Analyze this chart for a swing trade setup (holding hours to a few days):
Symbol: {symbol} | Timeframe: {timeframe}
Indicators: {indicators}
Focus on: trend continuation/reversal, key levels, indicator confluence.
```

**Position (days to weeks)**
```
Analyze this chart for a position trade (multi-day to multi-week hold):
Symbol: {symbol} | Timeframe: {timeframe}
Indicators: {indicators}
Focus on: macro trend, major S/R, risk/reward ratio, fundamental context.
```

### Risk Tolerance Modifier
Appended to the prompt based on user setting:
- **Conservative:** "Prioritize capital preservation. Only suggest high-confidence setups."
- **Moderate:** "Balance risk and reward. Flag medium-confidence setups as speculative."
- **Aggressive:** "Include higher-risk setups. Clearly label speculative plays."

---

## 9. Side Panel UI — Component Breakdown

### App.tsx — Tab structure
- **Analysis tab**: Latest Claude analysis output
- **Chat tab**: Conversation history + input
- **Settings tab**: API key, trading style, risk tolerance, auto-refresh toggle

### AnalysisPanel
Renders Claude's response as structured sections:
- Trend Assessment (with colored badge: 🟢 Bullish / 🔴 Bearish / 🟡 Neutral)
- Support & Resistance levels
- Indicator Signals (table or list)
- Trade Setup (entry / target / stop)
- Risk Notes
- Confidence badge (Low / Medium / High)
- Disclaimer footer

### ChatThread
- Scrollable message history
- User messages (right-aligned) and Claude responses (left-aligned)
- Typing indicator during streaming
- "Clear conversation" button

### SettingsPanel
- API key input (masked, saved to `chrome.storage.local`)
- Trading style selector: Scalp / Swing / Position
- Risk tolerance selector: Conservative / Moderate / Aggressive
- Auto-refresh toggle (re-analyze on chart change)
- "Test connection" button (validates API key with a minimal API call)

---

## 10. Permissions (manifest.json)

```json
{
  "permissions": [
    "storage",
    "sidePanel",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://www.tradingview.com/*",
    "https://api.anthropic.com/*"
  ]
}
```

**Why each permission:**
- `storage` — save API key and user preferences
- `sidePanel` — register and open the side panel
- `activeTab` — access the current tab's DOM
- `scripting` — inject content script programmatically
- `tradingview.com` host — content script needs DOM access
- `api.anthropic.com` host — fetch calls from service worker to Anthropic

---

## 11. API Integration

### Request format
```typescript
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: {userApiKey}
  anthropic-version: 2023-06-01
  content-type: application/json

Body:
{
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  system: "{systemPrompt}",
  messages: [
    { role: "user", content: "{chartContextPrompt}" },
    // ...conversation history for follow-ups
  ]
}
```

### Streaming
The initial implementation will use non-streaming responses for simplicity. Streaming (`stream: true` with SSE) can be added in v1.1 to improve perceived latency.

### Error handling
- 401: Invalid API key → surface "Invalid API key" in UI, direct to Settings
- 429: Rate limit → show retry countdown
- 5xx: Anthropic service error → retry once, then show error message
- Network error → "Check your connection" message

---

## 12. Security Considerations

- API key stored in `chrome.storage.local` (encrypted by Chrome, not synced)
- No API key ever sent to any third-party except `api.anthropic.com`
- Content Security Policy headers set in manifest for the side panel
- No external analytics or telemetry
- Users warned that their chart data (symbol, indicator values) is sent to Anthropic

---

## 13. Implementation Plan

### Phase 1 — Scaffold & Setup (Day 1)
- [ ] Initialize project with Vite + React + TypeScript
- [ ] Configure `vite-plugin-web-extension` for MV3 output
- [ ] Write `manifest.json` with all required fields and permissions
- [ ] Set up Tailwind CSS
- [ ] Create placeholder files for all components and scripts
- [ ] Verify extension loads in Chrome developer mode

### Phase 2 — Content Script & Data Extraction (Day 2)
- [ ] Implement DOM scraper for symbol, timeframe, and indicator values
- [ ] Add MutationObserver for chart change detection (debounced)
- [ ] Wire content script → background message passing
- [ ] Test on a live TradingView chart and log extracted data

### Phase 3 — Background Service Worker & API Integration (Day 2–3)
- [ ] Implement message handler in service worker
- [ ] Build prompt construction logic from templates
- [ ] Implement Anthropic API fetch with error handling
- [ ] Store and pass conversation history for multi-turn chat

### Phase 4 — Side Panel React UI (Day 3–4)
- [ ] Build Settings panel with API key input and preference selectors
- [ ] Build AnalysisPanel with structured output rendering
- [ ] Build ChatThread and MessageInput components
- [ ] Wire panel to background via `chrome.runtime` messaging
- [ ] Add loading states, error states, and disclaimer

### Phase 5 — Integration & Polish (Day 4–5)
- [ ] End-to-end test: chart load → scrape → analysis → display
- [ ] Test follow-up chat flow
- [ ] Test API key validation flow
- [ ] Add auto-refresh behavior
- [ ] Responsive layout tuning for side panel width
- [ ] Build extension icons (16/48/128px)

### Phase 6 — Packaging (Day 5)
- [ ] `npm run build` produces clean `/dist` folder
- [ ] Verify all assets are included and paths are correct
- [ ] Zip `/dist` → `trading-extension-v1.0.zip`
- [ ] Document install steps in README

---

## 14. Open Questions (to resolve before coding)

1. **Streaming responses** — Should v1 include SSE streaming for faster perceived response, or ship with synchronous responses first?
2. **Conversation persistence** — Should chat history persist across browser sessions (saved to `chrome.storage.local`) or reset each session?
3. **Auto-refresh default** — Should auto-refresh on chart change be ON or OFF by default?
4. **Model version** — The spec calls for `claude-sonnet-4-5`. Should we pin this or make it configurable in settings?

---

## 15. Known Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| TradingView DOM selectors change | Medium | Build scraper with fallbacks; document selector update process |
| Anthropic API latency | Low-Medium | Show loading skeleton; add streaming in v1.1 |
| Chrome Side Panel API limitations | Low | Side Panel is stable MV3 API since Chrome 114 |
| User API key exposure | Low | Stored in chrome.storage.local, never logged or transmitted elsewhere |
| Content script conflicts with TV | Low | Use isolated world execution context in manifest |

---

*This spec covers v1.0. Future versions may include: streaming responses, OHLCV data via TV internal JS objects, multi-tab support, export analysis to clipboard/notes, and a backend proxy for shared deployments.*
