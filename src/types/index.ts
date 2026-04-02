// ─── Trading Style & Risk ─────────────────────────────────────────────────────

export type TradingStyle = "scalp" | "swing" | "position";

export type RiskTolerance = "conservative" | "moderate" | "aggressive";

// ─── Chart Data ───────────────────────────────────────────────────────────────

export interface IndicatorValues {
  rsi?: number;
  macd?: string;
  macdSignal?: string;
  macdHistogram?: string;
  ma20?: number;
  ma50?: number;
  ma200?: number;
  volume?: string;
  candleSummary?: string; // OHLCV table for price action context (API-sourced)
  [key: string]: string | number | undefined;
}

export interface ChartData {
  symbol: string;
  timeframe: string;
  price?: string;
  indicators: IndicatorValues;
  scrapedAt: number;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp: number;
}

export type ExtensionMessageType =
  | "CHART_DATA_UPDATE"
  | "REQUEST_ANALYSIS"
  | "SEND_CHAT_MESSAGE"
  | "ANALYSIS_RESULT"
  | "ANALYSIS_ERROR"
  | "CLEAR_CONVERSATION"
  | "GET_CHART_DATA"
  | "SCRAPE_REQUEST"
  | "FETCH_API_CHART_DATA";

export interface ExtensionMessage {
  type: ExtensionMessageType;
  payload?: unknown;
}

export interface ChartDataUpdateMessage extends ExtensionMessage {
  type: "CHART_DATA_UPDATE";
  payload: ChartData;
}

export interface RequestAnalysisMessage extends ExtensionMessage {
  type: "REQUEST_ANALYSIS";
  payload: {
    chartData: ChartData;
    tradingStyle: TradingStyle;
    riskTolerance: RiskTolerance;
  };
}

export interface SendChatMessageMessage extends ExtensionMessage {
  type: "SEND_CHAT_MESSAGE";
  payload: {
    userMessage: string;
    chartData: ChartData | null;
    tradingStyle: TradingStyle;
    riskTolerance: RiskTolerance;
  };
}

export interface AnalysisResultMessage extends ExtensionMessage {
  type: "ANALYSIS_RESULT";
  payload: {
    content: string;
    isFollowUp: boolean;
  };
}

export interface AnalysisErrorMessage extends ExtensionMessage {
  type: "ANALYSIS_ERROR";
  payload: {
    error: string;
    code?: number;
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export interface StorageData {
  apiKey?: string;
  tradingStyle?: TradingStyle;
  riskTolerance?: RiskTolerance;
  autoRefresh?: boolean;
  conversationHistory?: ChatMessage[];
}

// ─── Anthropic API ────────────────────────────────────────────────────────────

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: AnthropicMessage[];
}

export interface AnthropicResponse {
  id: string;
  type: string;
  role: "assistant";
  content: Array<{ type: "text"; text: string }>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AnthropicErrorResponse {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}
