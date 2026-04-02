import { useCallback, useEffect, useState } from "react";
import type {
  AnalysisErrorMessage,
  AnalysisResultMessage,
  ChatMessage,
  ChartData,
  ExtensionMessage,
  RiskTolerance,
  TradingStyle,
} from "../../types";

interface UseAnalysisReturn {
  messages: ChatMessage[];
  latestAnalysis: string | null;
  isLoading: boolean;
  error: string | null;
  requestAnalysis: (
    chartData: ChartData,
    tradingStyle: TradingStyle,
    riskTolerance: RiskTolerance
  ) => void;
  sendChatMessage: (
    userMessage: string,
    chartData: ChartData | null,
    tradingStyle: TradingStyle,
    riskTolerance: RiskTolerance
  ) => void;
  clearConversation: () => void;
}

export function useAnalysis(): UseAnalysisReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [latestAnalysis, setLatestAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load persisted conversation history on mount
  useEffect(() => {
    chrome.storage.local.get(["conversationHistory"], (result) => {
      const history = result.conversationHistory as ChatMessage[] | undefined;
      if (history?.length) {
        setMessages(history);
        // Surface the last assistant message as latest analysis
        const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
        if (lastAssistant) setLatestAnalysis(lastAssistant.content);
      }
    });
  }, []);

  // Listen for analysis results and errors from the background
  useEffect(() => {
    function handleMessage(message: ExtensionMessage) {
      if (message.type === "ANALYSIS_RESULT") {
        const m = message as AnalysisResultMessage;
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: m.payload.content,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        if (!m.payload.isFollowUp) {
          setLatestAnalysis(m.payload.content);
        }
        setIsLoading(false);
        setError(null);
      }

      if (message.type === "ANALYSIS_ERROR") {
        const m = message as AnalysisErrorMessage;
        setError(m.payload.error);
        setIsLoading(false);
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const requestAnalysis = useCallback(
    (chartData: ChartData, tradingStyle: TradingStyle, riskTolerance: RiskTolerance) => {
      setIsLoading(true);
      setError(null);
      chrome.runtime.sendMessage({
        type: "REQUEST_ANALYSIS",
        payload: { chartData, tradingStyle, riskTolerance },
      });
    },
    []
  );

  const sendChatMessage = useCallback(
    (
      userMessage: string,
      chartData: ChartData | null,
      tradingStyle: TradingStyle,
      riskTolerance: RiskTolerance
    ) => {
      const userMsg: ChatMessage = {
        role: "user",
        content: userMessage,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setError(null);
      chrome.runtime.sendMessage({
        type: "SEND_CHAT_MESSAGE",
        payload: { userMessage, chartData, tradingStyle, riskTolerance },
      });
    },
    []
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    setLatestAnalysis(null);
    setError(null);
    setIsLoading(false);
    chrome.runtime.sendMessage({ type: "CLEAR_CONVERSATION" });
  }, []);

  return {
    messages,
    latestAnalysis,
    isLoading,
    error,
    requestAnalysis,
    sendChatMessage,
    clearConversation,
  };
}
