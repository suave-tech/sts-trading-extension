import { buildFollowUpContext, buildUserPrompt, SYSTEM_PROMPT } from "../prompts/templates";
import { fetchLiquidationMap } from "./coinglass-api";
import { fetchHyperliquidChartData } from "./hyperliquid-api";
import type {
  AnalysisErrorMessage,
  AnalysisResultMessage,
  AnthropicMessage,
  AnthropicRequest,
  AnthropicResponse,
  ChatMessage,
  ChartData,
  ChartDataUpdateMessage,
  ExtensionMessage,
  RequestAnalysisMessage,
  SendChatMessageMessage,
  StorageData,
} from "../types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 1024;
const ANTHROPIC_VERSION = "2023-06-01";

// ─── Tab Finder ───────────────────────────────────────────────────────────────
// Finds the tab running a supported trading platform across ALL windows.
// This avoids the `currentWindow: true` trap when querying from the service
// worker DevTools (which has its own window context).

const SUPPORTED_HOSTS = [
  "tradingview.com",
  "hyperliquid.xyz",
  "binance.com",
  "bybit.com",
  "kraken.com",
  "okx.com",
  "coinbase.com",
];

function findTradingTab(callback: (tabId: number | null) => void): void {
  chrome.tabs.query({}, (tabs) => {
    const match = tabs.find((t) => t.url && SUPPORTED_HOSTS.some((h) => t.url?.includes(h)));
    callback(match?.id ?? null);
  });
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────
// NOTE: cachedChartData is intentionally NOT a module-level variable.
// Service workers are terminated and restarted frequently — any module-level
// state is reset to null on each restart. We persist chart data in
// chrome.storage.local so it survives SW restarts.

async function getStorageData(): Promise<StorageData> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["apiKey", "tradingStyle", "riskTolerance", "autoRefresh", "conversationHistory"],
      (result) => resolve(result as StorageData)
    );
  });
}

async function setStorageData(data: Partial<StorageData>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

async function getConversationHistory(): Promise<ChatMessage[]> {
  const { conversationHistory } = await getStorageData();
  return conversationHistory ?? [];
}

async function appendToHistory(message: ChatMessage): Promise<void> {
  const history = await getConversationHistory();
  history.push(message);
  await setStorageData({ conversationHistory: history });
}

async function clearHistory(): Promise<void> {
  await setStorageData({ conversationHistory: [] });
}

// Persist chart data to storage so it survives SW restarts
async function saveChartData(data: ChartData): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ cachedChartData: data }, resolve);
  });
}

async function loadChartData(): Promise<ChartData | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["cachedChartData"], (result) => {
      resolve((result.cachedChartData as ChartData) ?? null);
    });
  });
}

// ─── Anthropic API ────────────────────────────────────────────────────────────

function parseApiError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Not JSON
  }

  switch (status) {
    case 401:
      return "Invalid API key. Please check your key in Settings.";
    case 429:
      return "Rate limit exceeded. Please wait a moment and try again.";
    case 500:
    case 502:
    case 503:
      return "Anthropic service error. Please try again shortly.";
    default:
      return `API request failed with status ${status}.`;
  }
}

async function callAnthropicAPI(
  apiKey: string,
  messages: AnthropicMessage[],
  retries = 1
): Promise<string> {
  const body: AnthropicRequest = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages,
  };

  let lastError = "";

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();

      if (!response.ok) {
        lastError = parseApiError(response.status, text);
        if (response.status >= 400 && response.status < 500) break;
        continue;
      }

      const data = JSON.parse(text) as AnthropicResponse;
      const content = data.content?.[0];
      if (content?.type === "text") return content.text;

      throw new Error("Unexpected response format from Anthropic API.");
    } catch (err) {
      if (err instanceof Error) {
        lastError = err.message.includes("fetch")
          ? "Network error. Check your internet connection."
          : err.message;
      }
    }
  }

  throw new Error(lastError || "Unknown error calling Anthropic API.");
}

// ─── Message Handlers ─────────────────────────────────────────────────────────

function sendToSidePanel(message: AnalysisResultMessage | AnalysisErrorMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may not be open — that's fine
  });
}

async function handleRequestAnalysis(msg: RequestAnalysisMessage): Promise<void> {
  const { chartData: panelChartData, tradingStyle, riskTolerance } = msg.payload;
  const { apiKey } = await getStorageData();

  if (!apiKey) {
    sendToSidePanel({
      type: "ANALYSIS_ERROR",
      payload: { error: "No API key configured. Please add your Anthropic API key in Settings." },
    });
    return;
  }

  await clearHistory();

  // Load persisted chart data from storage (survives SW restarts).
  // Fall back to what the panel sent if nothing is stored yet.
  let chartData = (await loadChartData()) ?? panelChartData;

  console.log(
    "[SW] handleRequestAnalysis — loaded chart data:",
    JSON.stringify({
      symbol: chartData.symbol,
      timeframe: chartData.timeframe,
      price: chartData.price,
      indicatorKeys: Object.keys(chartData.indicators ?? {}),
      hasCandleSummary: !!chartData.indicators?.candleSummary,
    })
  );

  // If we still have no indicators, fetch them now before analyzing.
  // This handles the race where the user clicks Analyze before async
  // API enrichment has completed (or before the SW cached anything).
  const hasIndicators = Object.keys(chartData.indicators ?? {}).length > 0;
  if (!hasIndicators && chartData.symbol !== "UNKNOWN") {
    console.log("[SW] No indicators found — fetching from Hyperliquid API for", chartData.symbol);
    try {
      const enriched = await fetchHyperliquidChartData(chartData.symbol, chartData.timeframe);
      console.log(
        "[SW] Enrichment succeeded:",
        JSON.stringify({
          symbol: enriched.symbol,
          price: enriched.price,
          indicatorKeys: Object.keys(enriched.indicators),
          hasCandleSummary: !!enriched.indicators.candleSummary,
        })
      );
      await saveChartData(enriched);
      chartData = enriched;
      // Push updated data to the panel display
      chrome.runtime.sendMessage({ type: "CHART_DATA_UPDATE", payload: enriched }).catch(() => {});
    } catch (err) {
      console.error("[SW] Hyperliquid enrichment failed:", err);
      // Proceed with what we have — don't block the analysis entirely
    }
  }

  // Fetch Coinglass liquidation map data in parallel with building the prompt.
  // Best-effort — if unavailable, we proceed without it.
  if (chartData.symbol !== "UNKNOWN" && chartData.price) {
    try {
      const priceNum = Number.parseFloat(chartData.price);
      if (!Number.isNaN(priceNum)) {
        const liqSummary = await fetchLiquidationMap(chartData.symbol, priceNum);
        if (liqSummary) {
          chartData = { ...chartData, liquidationSummary: liqSummary.rawText };
          console.log("[SW] Liquidation map fetched:", liqSummary.rawText.slice(0, 120));
        }
      }
    } catch (err) {
      console.warn("[SW] Coinglass fetch failed (non-blocking):", err);
    }
  }

  const userPrompt = buildUserPrompt(chartData, tradingStyle, riskTolerance);
  console.log("[SW] Sending prompt to Claude (first 300 chars):", userPrompt.slice(0, 300));

  const messages: AnthropicMessage[] = [{ role: "user", content: userPrompt }];

  try {
    const responseText = await callAnthropicAPI(apiKey, messages);

    await appendToHistory({ role: "user", content: userPrompt, timestamp: Date.now() });
    await appendToHistory({ role: "assistant", content: responseText, timestamp: Date.now() });

    sendToSidePanel({
      type: "ANALYSIS_RESULT",
      payload: { content: responseText, isFollowUp: false },
    });
  } catch (err) {
    sendToSidePanel({
      type: "ANALYSIS_ERROR",
      payload: { error: err instanceof Error ? err.message : "Unknown error" },
    });
  }
}

async function handleSendChatMessage(msg: SendChatMessageMessage): Promise<void> {
  const { userMessage, chartData, tradingStyle, riskTolerance } = msg.payload;
  const { apiKey } = await getStorageData();

  if (!apiKey) {
    sendToSidePanel({
      type: "ANALYSIS_ERROR",
      payload: { error: "No API key configured. Please add your Anthropic API key in Settings." },
    });
    return;
  }

  const history = await getConversationHistory();

  const messages: AnthropicMessage[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const contextualMessage = userMessage + buildFollowUpContext(chartData);
  messages.push({ role: "user", content: contextualMessage });

  if (messages.length === 1) {
    const contextPrompt = buildUserPrompt(
      chartData ?? {
        symbol: "UNKNOWN",
        timeframe: "UNKNOWN",
        indicators: {},
        scrapedAt: Date.now(),
      },
      tradingStyle,
      riskTolerance
    );
    messages[0] = { role: "user", content: `${contextPrompt}\n\n${userMessage}` };
  }

  try {
    const responseText = await callAnthropicAPI(apiKey, messages);

    await appendToHistory({ role: "user", content: contextualMessage, timestamp: Date.now() });
    await appendToHistory({ role: "assistant", content: responseText, timestamp: Date.now() });

    sendToSidePanel({
      type: "ANALYSIS_RESULT",
      payload: { content: responseText, isFollowUp: true },
    });
  } catch (err) {
    sendToSidePanel({
      type: "ANALYSIS_ERROR",
      payload: { error: err instanceof Error ? err.message : "Unknown error" },
    });
  }
}

async function handleTestConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    await callAnthropicAPI(apiKey, [{ role: "user", content: "Reply with only the word: ok" }], 0);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

// ─── Side Panel Registration ──────────────────────────────────────────────────

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ─── Main Message Router ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  const type = (message as { type: string }).type;

  switch (type) {
    case "CHART_DATA_UPDATE": {
      const m = message as ChartDataUpdateMessage;
      const incoming = m.payload;
      const isUseful =
        incoming.symbol !== "UNKNOWN" ||
        Object.keys(incoming.indicators ?? {}).length > 0 ||
        !!incoming.price;
      if (!isUseful) return false;

      const hasIndicators = Object.keys(incoming.indicators ?? {}).length > 0;
      // Hyperliquid: symbol from URL but no DOM-scraped indicators
      const isHyperliquid = incoming.symbol !== "UNKNOWN" && !hasIndicators && !incoming.price;

      if (isHyperliquid) {
        // Store partial data first (so panel shows the symbol)
        saveChartData(incoming).catch(console.error);
        console.log("[SW] Hyperliquid symbol detected:", incoming.symbol, "— enriching via API");

        fetchHyperliquidChartData(incoming.symbol, incoming.timeframe)
          .then(async (enriched) => {
            console.log(
              "[SW] Enrichment complete:",
              enriched.symbol,
              "price:",
              enriched.price,
              "indicators:",
              Object.keys(enriched.indicators).join(", ")
            );
            await saveChartData(enriched);
            chrome.runtime
              .sendMessage({
                type: "CHART_DATA_UPDATE",
                payload: enriched,
              })
              .catch(() => {});
          })
          .catch((err) => {
            console.error("[SW] Hyperliquid API fetch failed:", err);
          });
      } else {
        saveChartData(incoming).catch(console.error);
      }
      return false;
    }

    case "FETCH_API_CHART_DATA": {
      const { symbol, timeframe } = message as unknown as {
        type: string;
        symbol: string;
        timeframe: string;
      };
      console.log("[SW] FETCH_API_CHART_DATA for", symbol, timeframe);
      fetchHyperliquidChartData(symbol, timeframe)
        .then(async (data) => {
          await saveChartData(data);
          sendResponse({ success: true, data });
        })
        .catch((err) => {
          console.error("[SW] FETCH_API_CHART_DATA failed:", err);
          sendResponse({ success: false, error: String(err) });
        });
      return true;
    }

    case "REQUEST_ANALYSIS": {
      handleRequestAnalysis(message as RequestAnalysisMessage);
      return false;
    }

    case "SEND_CHAT_MESSAGE": {
      handleSendChatMessage(message as SendChatMessageMessage);
      return false;
    }

    case "CLEAR_CONVERSATION": {
      clearHistory().catch(console.error);
      return false;
    }

    case "GET_CHART_DATA": {
      // Load from storage (not module-level variable) so it survives SW restarts
      loadChartData().then((data) => sendResponse({ success: true, data }));
      return true;
    }

    case "SCRAPE_REQUEST": {
      findTradingTab((tabId) => {
        if (!tabId) {
          sendResponse(null);
          return;
        }

        chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
          const allFrames = frames ?? [
            { frameId: 0, url: "" } as chrome.webNavigation.GetAllFrameResultDetails,
          ];
          let responded = false;
          let pending = allFrames.length;

          for (const frame of allFrames) {
            chrome.tabs.sendMessage(
              tabId,
              { type: "SCRAPE_REQUEST" },
              { frameId: frame.frameId },
              (response) => {
                void chrome.runtime.lastError;
                pending--;
                const hasData =
                  response?.data &&
                  (response.data.symbol !== "UNKNOWN" ||
                    Object.keys(response.data.indicators ?? {}).length > 0);

                if (hasData && !responded) {
                  responded = true;
                  saveChartData(response.data).catch(console.error);
                  sendResponse(response);
                } else if (pending === 0 && !responded) {
                  loadChartData().then((cached) => {
                    sendResponse({ success: false, data: cached });
                  });
                }
              }
            );
          }
        });
      });
      return true;
    }

    case "DEBUG_SCRAPE": {
      findTradingTab((tabId) => {
        if (!tabId) {
          sendResponse([{ error: "No supported trading tab found" }]);
          return;
        }

        chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
          const allFrames = frames ?? [];
          if (!allFrames.length) {
            sendResponse([{ error: "No frames found", tabId }]);
            return;
          }

          const reports: unknown[] = [];
          let pending = allFrames.length;

          for (const frame of allFrames) {
            chrome.tabs.sendMessage(
              tabId,
              { type: "DEBUG_SCRAPE" },
              { frameId: frame.frameId },
              (response) => {
                void chrome.runtime.lastError;
                reports.push({
                  frameId: frame.frameId,
                  frameUrl: frame.url,
                  ...(response ?? {
                    error: "No response (content script not injected in this frame)",
                  }),
                });
                pending--;
                if (pending === 0) sendResponse(reports);
              }
            );
          }
        });
      });
      return true;
    }

    case "TEST_CONNECTION": {
      const { apiKey } = message as unknown as { type: string; apiKey: string };
      handleTestConnection(apiKey).then(sendResponse);
      return true;
    }

    case "PING":
      sendResponse({ pong: true });
      return false;

    default:
      return false;
  }
});
