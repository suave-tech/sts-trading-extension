import type { ChartData, RiskTolerance, TradingStyle } from "../../types";
import { Markdown } from "./Markdown";

interface AnalysisPanelProps {
  latestAnalysis: string | null;
  chartData: ChartData | null;
  isLoading: boolean;
  error: string | null;
  tradingStyle: TradingStyle;
  riskTolerance: RiskTolerance;
  onRequestAnalysis: () => void;
  onRefreshChart: () => void;
}

function AnalysisContent({ content }: { content: string }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
      <Markdown content={content} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: "16px", flex: 1 }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            height: "14px",
            background: "#1e293b",
            borderRadius: "4px",
            marginBottom: "10px",
            width: i === 4 ? "60%" : "100%",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
      <style>{"@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }"}</style>
    </div>
  );
}

export function AnalysisPanel({
  latestAnalysis,
  chartData,
  isLoading,
  error,
  tradingStyle,
  riskTolerance,
  onRequestAnalysis,
  onRefreshChart,
}: AnalysisPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Chart context bar */}
      <div
        style={{
          padding: "8px 12px",
          background: "#1a1f2e",
          borderBottom: "1px solid #2d3748",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: "12px", color: "#94a3b8" }}>
          {chartData ? (
            <>
              <span style={{ color: "#f8fafc", fontWeight: 600 }}>{chartData.symbol}</span>
              <span style={{ margin: "0 6px", color: "#475569" }}>·</span>
              <span>{chartData.timeframe}</span>
              {chartData.price && (
                <>
                  <span style={{ margin: "0 6px", color: "#475569" }}>·</span>
                  <span style={{ color: "#38bdf8" }}>{chartData.price}</span>
                </>
              )}
            </>
          ) : (
            <span style={{ color: "#475569" }}>No chart data — open a TradingView chart</span>
          )}
        </div>
        <button
          type="button"
          onClick={onRefreshChart}
          title="Re-scrape chart"
          style={{
            background: "none",
            border: "1px solid #374151",
            borderRadius: "4px",
            color: "#94a3b8",
            cursor: "pointer",
            fontSize: "11px",
            padding: "2px 7px",
          }}
        >
          ↺ Refresh
        </button>
      </div>

      {/* Main content area */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div
          style={{
            flex: 1,
            padding: "16px",
            color: "#f87171",
            fontSize: "13px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ fontWeight: 600 }}>Error</div>
          <div>{error}</div>
        </div>
      ) : latestAnalysis ? (
        <AnalysisContent content={latestAnalysis} />
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            padding: "24px",
            color: "#64748b",
          }}
        >
          <div style={{ fontSize: "32px" }}>📊</div>
          <div style={{ fontSize: "13px", textAlign: "center" }}>
            Ready to analyze{" "}
            {chartData ? (
              <strong style={{ color: "#94a3b8" }}>
                {chartData.symbol} ({chartData.timeframe})
              </strong>
            ) : (
              "your chart"
            )}
          </div>
          <div style={{ fontSize: "11px", color: "#475569", textAlign: "center" }}>
            Style: <strong>{tradingStyle}</strong> · Risk: <strong>{riskTolerance}</strong>
          </div>
        </div>
      )}

      {/* Analyze button */}
      <div style={{ padding: "10px 12px", borderTop: "1px solid #2d3748", flexShrink: 0 }}>
        <button
          type="button"
          onClick={onRequestAnalysis}
          disabled={isLoading || !chartData}
          style={{
            width: "100%",
            padding: "9px",
            background: isLoading || !chartData ? "#1e293b" : "#3b82f6",
            color: isLoading || !chartData ? "#475569" : "white",
            border: "none",
            borderRadius: "6px",
            cursor: isLoading || !chartData ? "not-allowed" : "pointer",
            fontSize: "13px",
            fontWeight: 600,
            transition: "background 0.15s",
          }}
        >
          {isLoading ? "Analyzing…" : "Analyze Chart"}
        </button>
      </div>
    </div>
  );
}
