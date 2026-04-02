import { useCallback, useEffect, useRef, useState } from "react";
import type { RiskTolerance, StorageData, TradingStyle } from "../types";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { ChatThread } from "./components/ChatThread";
import { Disclaimer } from "./components/Disclaimer";
import { MessageInput } from "./components/MessageInput";
import { SettingsPanel } from "./components/SettingsPanel";
import { useAnalysis } from "./hooks/useAnalysis";
import { useChartData } from "./hooks/useChartData";

type Tab = "analysis" | "chat" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "analysis", label: "Analysis" },
  { id: "chat", label: "Chat" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("analysis");
  const [tradingStyle, setTradingStyle] = useState<TradingStyle>("swing");
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>("moderate");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { chartData, refreshChartData } = useChartData();
  const {
    messages,
    latestAnalysis,
    isLoading,
    error,
    requestAnalysis,
    sendChatMessage,
    clearConversation,
  } = useAnalysis();

  // Load persisted preferences
  useEffect(() => {
    chrome.storage.local.get(
      ["tradingStyle", "riskTolerance", "autoRefresh"] as (keyof StorageData)[],
      (result) => {
        const data = result as StorageData;
        if (data.tradingStyle) setTradingStyle(data.tradingStyle);
        if (data.riskTolerance) setRiskTolerance(data.riskTolerance);
        if (data.autoRefresh !== undefined) setAutoRefresh(data.autoRefresh);
      }
    );
  }, []);

  // Persist preference changes
  const handleTradingStyleChange = useCallback((style: TradingStyle) => {
    setTradingStyle(style);
    chrome.storage.local.set({ tradingStyle: style });
  }, []);

  const handleRiskToleranceChange = useCallback((risk: RiskTolerance) => {
    setRiskTolerance(risk);
    chrome.storage.local.set({ riskTolerance: risk });
  }, []);

  const handleAutoRefreshChange = useCallback((enabled: boolean) => {
    setAutoRefresh(enabled);
    chrome.storage.local.set({ autoRefresh: enabled });
  }, []);

  // Keep a ref to the latest preferences so the auto-refresh effect can read
  // current values without needing to list them as dependencies (which would
  // cause a re-analysis every time the user changes a setting, not just when
  // the chart updates).
  const autoRefreshRef = useRef(autoRefresh);
  const tradingStyleRef = useRef(tradingStyle);
  const riskToleranceRef = useRef(riskTolerance);
  const requestAnalysisRef = useRef(requestAnalysis);
  useEffect(() => { autoRefreshRef.current = autoRefresh; }, [autoRefresh]);
  useEffect(() => { tradingStyleRef.current = tradingStyle; }, [tradingStyle]);
  useEffect(() => { riskToleranceRef.current = riskTolerance; }, [riskTolerance]);
  useEffect(() => { requestAnalysisRef.current = requestAnalysis; }, [requestAnalysis]);

  // Auto-refresh: trigger analysis only when chartData itself changes
  useEffect(() => {
    if (!chartData) return;
    if (autoRefreshRef.current) {
      requestAnalysisRef.current(chartData, tradingStyleRef.current, riskToleranceRef.current);
    }
  }, [chartData]);

  const handleRequestAnalysis = useCallback(() => {
    if (!chartData) return;
    requestAnalysis(chartData, tradingStyle, riskTolerance);
    setActiveTab("analysis");
  }, [chartData, tradingStyle, riskTolerance, requestAnalysis]);

  const handleSendChat = useCallback(
    (message: string) => {
      sendChatMessage(message, chartData, tradingStyle, riskTolerance);
    },
    [chartData, tradingStyle, riskTolerance, sendChatMessage]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0f1117",
        color: "#e2e8f0",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px 0",
          background: "#0f1117",
          borderBottom: "1px solid #1e293b",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <span style={{ fontSize: "18px" }}>📈</span>
          <span style={{ fontWeight: 700, fontSize: "14px", color: "#f8fafc" }}>TV AI Analyst</span>
          {isLoading && (
            <span style={{ marginLeft: "auto", fontSize: "11px", color: "#3b82f6" }}>
              ⟳ Analyzing…
            </span>
          )}
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: "2px" }}>
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: "6px",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent",
                color: activeTab === tab.id ? "#f8fafc" : "#64748b",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: activeTab === tab.id ? 600 : 400,
                transition: "color 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeTab === "analysis" && (
          <AnalysisPanel
            latestAnalysis={latestAnalysis}
            chartData={chartData}
            isLoading={isLoading}
            error={error}
            tradingStyle={tradingStyle}
            riskTolerance={riskTolerance}
            onRequestAnalysis={handleRequestAnalysis}
            onRefreshChart={refreshChartData}
          />
        )}

        {activeTab === "chat" && (
          <>
            <ChatThread messages={messages} isLoading={isLoading} onClear={clearConversation} />
            <MessageInput onSend={handleSendChat} disabled={isLoading} />
          </>
        )}

        {activeTab === "settings" && (
          <SettingsPanel
            tradingStyle={tradingStyle}
            riskTolerance={riskTolerance}
            autoRefresh={autoRefresh}
            onTradingStyleChange={handleTradingStyleChange}
            onRiskToleranceChange={handleRiskToleranceChange}
            onAutoRefreshChange={handleAutoRefreshChange}
          />
        )}
      </div>

      <Disclaimer />
    </div>
  );
}
