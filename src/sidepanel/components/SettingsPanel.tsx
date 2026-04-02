import { useCallback, useEffect, useState } from "react";
import type { RiskTolerance, StorageData, TradingStyle } from "../../types";

interface SettingsPanelProps {
  tradingStyle: TradingStyle;
  riskTolerance: RiskTolerance;
  autoRefresh: boolean;
  onTradingStyleChange: (style: TradingStyle) => void;
  onRiskToleranceChange: (risk: RiskTolerance) => void;
  onAutoRefreshChange: (enabled: boolean) => void;
}

type ConnectionStatus = "idle" | "testing" | "success" | "error";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "11px",
        fontWeight: 600,
        color: "#94a3b8",
        marginBottom: "5px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </div>
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      style={{
        width: "100%",
        padding: "7px 10px",
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: "6px",
        color: "#e2e8f0",
        fontSize: "13px",
        cursor: "pointer",
        outline: "none",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SettingsPanel({
  tradingStyle,
  riskTolerance,
  autoRefresh,
  onTradingStyleChange,
  onRiskToleranceChange,
  onAutoRefreshChange,
}: SettingsPanelProps) {
  const [apiKey, setApiKey] = useState("");
  const [apiKeyMasked, setApiKeyMasked] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [saved, setSaved] = useState(false);

  // Load saved API key indicator
  useEffect(() => {
    chrome.storage.local.get(["apiKey"] as (keyof StorageData)[], (result) => {
      const data = result as StorageData;
      if (data.apiKey) {
        setApiKey(data.apiKey);
      }
    });
  }, []);

  const handleSaveApiKey = useCallback(() => {
    chrome.storage.local.set({ apiKey }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }, [apiKey]);

  const handleTestConnection = useCallback(() => {
    if (!apiKey.trim()) {
      setConnectionStatus("error");
      setConnectionMessage("Enter an API key first.");
      return;
    }
    setConnectionStatus("testing");
    setConnectionMessage("");

    // Ping first to ensure the service worker is awake, then test the key.
    chrome.runtime.sendMessage({ type: "PING" }, () => {
      // Ignore lastError from ping — worker may not respond if just waking up.
      void chrome.runtime.lastError;

      chrome.runtime.sendMessage(
        { type: "TEST_CONNECTION", apiKey },
        (response: { success: boolean; error?: string }) => {
          if (chrome.runtime.lastError || !response) {
            setConnectionStatus("error");
            setConnectionMessage("Could not reach background service. Try again.");
            return;
          }
          if (response.success) {
            setConnectionStatus("success");
            setConnectionMessage("API key is valid ✓");
          } else {
            setConnectionStatus("error");
            setConnectionMessage(response.error ?? "Connection failed.");
          }
        }
      );
    });
  }, [apiKey]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      {/* API Key */}
      <div>
        <Label>Anthropic API Key</Label>
        <div style={{ display: "flex", gap: "6px" }}>
          <input
            type={apiKeyMasked ? "password" : "text"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-…"
            style={{
              flex: 1,
              padding: "7px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#e2e8f0",
              fontSize: "13px",
              outline: "none",
              fontFamily: "monospace",
            }}
          />
          <button
            type="button"
            onClick={() => setApiKeyMasked((v) => !v)}
            style={{
              padding: "7px 9px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "12px",
              flexShrink: 0,
            }}
            title={apiKeyMasked ? "Show key" : "Hide key"}
          >
            {apiKeyMasked ? "👁" : "🙈"}
          </button>
        </div>
        <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
          <button
            type="button"
            onClick={handleSaveApiKey}
            style={{
              flex: 1,
              padding: "6px",
              background: saved ? "#166534" : "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: saved ? "#4ade80" : "#94a3b8",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            {saved ? "Saved ✓" : "Save Key"}
          </button>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={connectionStatus === "testing"}
            style={{
              flex: 1,
              padding: "6px",
              background:
                connectionStatus === "success"
                  ? "#166534"
                  : connectionStatus === "error"
                    ? "#7f1d1d"
                    : "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color:
                connectionStatus === "success"
                  ? "#4ade80"
                  : connectionStatus === "error"
                    ? "#f87171"
                    : "#94a3b8",
              cursor: connectionStatus === "testing" ? "not-allowed" : "pointer",
              fontSize: "12px",
            }}
          >
            {connectionStatus === "testing" ? "Testing…" : "Test Connection"}
          </button>
        </div>
        {connectionMessage && (
          <div
            style={{
              marginTop: "5px",
              fontSize: "11px",
              color: connectionStatus === "success" ? "#4ade80" : "#f87171",
            }}
          >
            {connectionMessage}
          </div>
        )}
      </div>

      {/* Trading Style */}
      <div>
        <Label>Trading Style</Label>
        <Select<TradingStyle>
          value={tradingStyle}
          onChange={onTradingStyleChange}
          options={[
            { value: "scalp", label: "Scalp (< 1 hour)" },
            { value: "swing", label: "Swing (hours to days)" },
            { value: "position", label: "Position (days to weeks)" },
          ]}
        />
      </div>

      {/* Risk Tolerance */}
      <div>
        <Label>Risk Tolerance</Label>
        <Select<RiskTolerance>
          value={riskTolerance}
          onChange={onRiskToleranceChange}
          options={[
            { value: "conservative", label: "Conservative — high confidence only" },
            { value: "moderate", label: "Moderate — balanced risk/reward" },
            { value: "aggressive", label: "Aggressive — include speculative plays" },
          ]}
        />
      </div>

      {/* Auto-refresh */}
      <div>
        <Label>Auto-Refresh</Label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 10px",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "6px",
          }}
        >
          <div>
            <div style={{ fontSize: "13px", color: "#e2e8f0" }}>Re-analyze on chart change</div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
              Automatically runs a new analysis when you change symbol or timeframe
            </div>
          </div>
          <button
            type="button"
            onClick={() => onAutoRefreshChange(!autoRefresh)}
            style={{
              width: "42px",
              height: "24px",
              borderRadius: "9999px",
              border: "none",
              background: autoRefresh ? "#3b82f6" : "#374151",
              cursor: "pointer",
              position: "relative",
              flexShrink: 0,
              transition: "background 0.2s",
            }}
            aria-label="Toggle auto-refresh"
          >
            <div
              style={{
                position: "absolute",
                top: "3px",
                left: autoRefresh ? "21px" : "3px",
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: "white",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>
      </div>

      {/* Info footer */}
      <div
        style={{
          padding: "10px",
          background: "#1a1f2e",
          borderRadius: "6px",
          fontSize: "11px",
          color: "#475569",
          lineHeight: "1.5",
        }}
      >
        Your API key is stored locally in <code>chrome.storage.local</code> and is never sent
        anywhere except <code>api.anthropic.com</code>.
      </div>
    </div>
  );
}
