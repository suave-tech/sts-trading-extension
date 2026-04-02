import { buildFollowUpContext, buildUserPrompt, SYSTEM_PROMPT } from "../prompts/templates";
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
  RiskTolerance,
  SendChatMessageMessage,
  StorageData,
  TradingStyle,
} from "../types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 1024;
const ANTHROPIC_VERSION = "2023-06-01";

// ─── State ────────────────────────────────────────────────────────────────────
// Service workers don't persist in-memory state across events.
// Conversation history is stored in chrome.storage.local.

let cachedChartData: ChartData | null = null;

// ─── Storage Helpers ──────────────────────────────────────────────────────────

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
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();

      if (!response.ok) {
        lastError = parseApiError(response.status, text);
        // Don't retry on 4xx client errors
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
  // Broadcast to all extension views (the side panel will pick this up)
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may not be open — that's fine
  });
}

async function handleRequestAnalysis(msg: RequestAnalysisMessage): Promise<void> {
  const { chartData, tradingStyle, riskTolerance } = msg.payload;
  const { apiKey } = await getStorageData();

  if (!apiKey) {
    sendToSidePanel({
      type: "ANALYSIS_ERROR",
      payload: { error: "No API key configured. Please add your Anthropic API key in Settings." },
    });
    return;
  }

  await clearHistory();

  const userPrompt = buildUserPrompt(chartData, tradingStyle, riskTolerance);
  const messages: AnthropicMessage[] = [{ role: "user", content: userPrompt }];

  try {
    const responseText = await callAnthropicAPI(apiKey, messages);

    // Persist conversation
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

  // Build messages array: convert stored history into Anthropic format
  const messages: AnthropicMessage[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Append chart context + user message
  const contextualMessage =
    userMessage + buildFollowUpContext(chartData);
  messages.push({ role: "user", content: contextualMessage });

  // Also include trading style in follow-up context if no history yet
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

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// ─── Main Message Router ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case "CHART_DATA_UPDATE": {
        const m = message as ChartDataUpdateMessage;
        cachedChartData = m.payload;
        break;
      }

      case "REQUEST_ANALYSIS": {
        handleRequestAnalysis(message as RequestAnalysisMessage);
        break;
      }

      case "SEND_CHAT_MESSAGE": {
        handleSendChatMessage(message as SendChatMessageMessage);
        break;
      }

      case "CLEAR_CONVERSATION": {
        clearHistory().catch(console.error);
        break;
      }

      case "GET_CHART_DATA": {
        sendResponse({ success: true, data: cachedChartData });
        break;
      }

      case "SCRAPE_REQUEST": {
        // Forward to content script on active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs[0]?.id;
          if (!tabId) return;
          chrome.tabs.sendMessage(tabId, { type: "SCRAPE_REQUEST" }, (response) => {
            if (response?.data) cachedChartData = response.data;
            sendResponse(response);
          });
        });
        return true; // async response
      }

      default:
        break;
    }

    // Handle test connection separately (sent from settings panel)
    if ((message as { type: string; apiKey?: string }).type === "TEST_CONNECTION") {
      const apiKey = (message as { type: string; apiKey: string }).apiKey;
      handleTestConnection(apiKey).then(sendResponse);
      return true;
    }

    return false;
  }
);
