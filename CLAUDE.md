# CLAUDE.md — TradingView AI Analysis Chrome Extension

## Project Overview

A Manifest V3 Chrome Extension that activates on TradingView chart pages and surfaces an AI-powered trade analysis side panel powered by Claude Sonnet (`claude-sonnet-4-5`). The extension scrapes visible chart data, sends it to the Anthropic Messages API, and returns structured trade analysis with follow-up chat capability.

---

## Tech Stack

| Concern | Tool |
|---|---|
| Package manager | `pnpm` |
| Build tool | Vite 5 + `vite-plugin-web-extension` |
| Frontend | React 18 + TypeScript |
| Linting / Formatting | Biome |
| Git hooks | Lefthook |
| Testing | Vitest |
| AI model | `claude-sonnet-4-5` via Anthropic Messages API |

---

## Project Structure

```
trading-extension/
├── manifest.json                  # MV3 manifest — DO NOT add permissions without review
├── biome.json                     # Linting + formatting config (replaces eslint + prettier)
├── lefthook.yml                   # Pre-commit and pre-push git hooks
├── vite.config.ts                 # Vite build config for MV3
├── public/
│   └── icons/                     # 16px, 48px, 128px extension icons (PNG)
├── src/
│   ├── background/
│   │   └── service-worker.ts      # Message routing + Anthropic API calls
│   ├── content/
│   │   └── tradingview-scraper.ts # DOM scraping + MutationObserver
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/            # AnalysisPanel, ChatThread, MessageInput, SettingsPanel, Disclaimer
│   │   └── hooks/                 # useChartData, useAnalysis
│   ├── prompts/
│   │   └── templates.ts           # Prompt templates by trading style
│   └── types/
│       └── index.ts               # Shared TypeScript types
└── src/**/*.test.ts               # Unit tests co-located near the files they test
```

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Development (watch mode — reload dist on save)
pnpm dev

# Production build
pnpm build

# Run unit tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Lint source files
pnpm lint

# Format source files
pnpm format

# Lint + format + fix in one step
pnpm check
```

---

## Loading the Extension in Chrome

1. Run `pnpm build` to generate the `dist/` folder.
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select the `dist/` folder
5. Navigate to any `https://www.tradingview.com/chart/...` page
6. Open the extension's side panel via the Chrome toolbar

---

## Architecture Notes

### Message Passing Pattern

All communication between the content script, service worker, and side panel uses `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`. Messages follow the `ExtensionMessage` type defined in `src/types/index.ts`.

```
Content Script ──sendMessage──► Service Worker ──sendMessage──► Side Panel
                                       │
                                       ▼
                               Anthropic API
```

### Chrome Storage Keys

| Key | Type | Purpose |
|---|---|---|
| `apiKey` | `string` | Anthropic API key (masked in UI) |
| `tradingStyle` | `TradingStyle` | `scalp` / `swing` / `position` |
| `riskTolerance` | `RiskTolerance` | `conservative` / `moderate` / `aggressive` |
| `autoRefresh` | `boolean` | Re-analyze on chart change |
| `conversationHistory` | `Message[]` | Optional: persisted chat history |

### Prompt Template System

Prompts live in `src/prompts/templates.ts`. Each trading style (`scalp`, `swing`, `position`) has its own user prompt template. A `riskTolerance` modifier is appended to every prompt. The system prompt is shared across all styles.

---

## Key Constraints & Decisions

- **No backend proxy** — users supply their own Anthropic API key, stored in `chrome.storage.local`
- **No API key logging** — the key must never appear in logs, console output, or error messages
- **Graceful DOM degradation** — the content script must never crash if TradingView changes its DOM selectors; always pass partial data
- **Non-streaming v1** — initial implementation uses synchronous API responses; streaming (SSE) is planned for v1.1
- **Isolated world** — the content script runs in an isolated execution context to avoid conflicts with TradingView's own JS

---

## TradingView DOM Selectors

These selectors are best-effort and may drift as TradingView updates its UI. The scraper must handle `null` results gracefully.

| Data Point | Selector Strategy |
|---|---|
| Symbol | `#header-toolbar-symbol-search` button text, fallback to `<title>` |
| Timeframe | Active button in the timeframe toolbar |
| Price | `.lastPrice` or visible price axis label |
| Indicators | Legend pane text nodes for RSI, MACD, MA overlays, Volume |

When updating selectors, also update the `SELECTORS` constant in `src/content/tradingview-scraper.ts`.

---

## Testing Philosophy

- Unit tests live in `*.test.ts` files co-located with the source file they test
- Focus tests on pure functions: prompt template builders, message parsers, scraper utilities
- Do NOT test Chrome extension APIs directly — mock `chrome.*` globals in tests
- Run `pnpm test` before pushing (enforced via lefthook pre-push hook)

---

## Security Checklist

- [ ] API key stored only in `chrome.storage.local` — never in code, logs, or console
- [ ] No external analytics, tracking scripts, or CDN dependencies at runtime
- [ ] Content Security Policy set in manifest for side panel
- [ ] `host_permissions` limited to `tradingview.com` and `api.anthropic.com` only
- [ ] Chart data (symbol + indicator values) is sent to Anthropic — users are warned in the UI

---

## Common Pitfalls

1. **Service workers don't persist state** — don't store conversation history in a module-level variable; use `chrome.storage.local`
2. **Side panel can't use `window.location`** — use `chrome.tabs.query` to get the active tab
3. **Content script isolation** — the content script runs in an isolated world; it cannot access TradingView's JS variables directly, only the DOM
4. **Manifest V3 restrictions** — no `eval()`, no remote code execution, no dynamic script injection beyond what's declared
