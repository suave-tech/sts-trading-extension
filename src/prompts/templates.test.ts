import { describe, expect, it } from "vitest";
import type { ChartData } from "../types";
import {
  buildFollowUpContext,
  buildUserPrompt,
  formatIndicators,
  SYSTEM_PROMPT,
} from "./templates";

const MOCK_CHART_DATA: ChartData = {
  symbol: "BTCUSDT",
  timeframe: "1H",
  price: "68000",
  indicators: {
    rsi: 58.2,
    macd: "0.15",
    macdSignal: "0.10",
    macdHistogram: "0.05",
    ma50: 67500,
    ma200: 62000,
    volume: "1.2B",
  },
  scrapedAt: 1000000,
};

describe("formatIndicators", () => {
  it("formats all known indicators into a readable string", () => {
    const result = formatIndicators(MOCK_CHART_DATA.indicators);
    expect(result).toContain("RSI: 58.2");
    expect(result).toContain("MACD: 0.15");
    expect(result).toContain("MA50: 67500");
    expect(result).toContain("MA200: 62000");
    expect(result).toContain("Volume: 1.2B");
  });

  it("returns a fallback message when indicators object is empty", () => {
    const result = formatIndicators({});
    expect(result).toBe("No indicators available");
  });

  it("includes MACD signal and histogram when present", () => {
    const result = formatIndicators({ macd: "-0.5", macdSignal: "-0.3", macdHistogram: "-0.2" });
    expect(result).toContain("Signal: -0.3");
    expect(result).toContain("Histogram: -0.2");
  });

  it("handles unknown custom indicator keys", () => {
    const result = formatIndicators({ customIndicator: "42" });
    expect(result).toContain("customIndicator: 42");
  });

  it("skips undefined indicator values", () => {
    const result = formatIndicators({ rsi: undefined, ma50: 100 });
    expect(result).not.toContain("RSI");
    expect(result).toContain("MA50: 100");
  });
});

describe("buildUserPrompt", () => {
  it("includes symbol, timeframe, and price in the prompt", () => {
    const prompt = buildUserPrompt(MOCK_CHART_DATA, "swing", "moderate");
    expect(prompt).toContain("BTCUSDT");
    expect(prompt).toContain("1H");
    expect(prompt).toContain("68000");
  });

  it("uses the correct style description for scalp", () => {
    const prompt = buildUserPrompt(MOCK_CHART_DATA, "scalp", "moderate");
    expect(prompt).toContain("scalp trade");
    expect(prompt).toContain("momentum");
  });

  it("uses the correct style description for swing", () => {
    const prompt = buildUserPrompt(MOCK_CHART_DATA, "swing", "moderate");
    expect(prompt).toContain("swing trade");
    expect(prompt).toContain("trend continuation");
  });

  it("uses the correct style description for position", () => {
    const prompt = buildUserPrompt(MOCK_CHART_DATA, "position", "conservative");
    expect(prompt).toContain("position trade");
    expect(prompt).toContain("macro trend");
  });

  it("appends conservative risk modifier", () => {
    const prompt = buildUserPrompt(MOCK_CHART_DATA, "swing", "conservative");
    expect(prompt).toContain("capital preservation");
    expect(prompt).toContain("high-confidence");
  });

  it("appends moderate risk modifier", () => {
    const prompt = buildUserPrompt(MOCK_CHART_DATA, "swing", "moderate");
    expect(prompt).toContain("Balance risk and reward");
  });

  it("appends aggressive risk modifier", () => {
    const prompt = buildUserPrompt(MOCK_CHART_DATA, "swing", "aggressive");
    expect(prompt).toContain("higher-risk setups");
  });

  it("includes formatted indicator values", () => {
    const prompt = buildUserPrompt(MOCK_CHART_DATA, "swing", "moderate");
    expect(prompt).toContain("RSI: 58.2");
    expect(prompt).toContain("Volume: 1.2B");
  });
});

describe("buildFollowUpContext", () => {
  it("returns empty string when chartData is null", () => {
    expect(buildFollowUpContext(null)).toBe("");
  });

  it("includes symbol and timeframe", () => {
    const context = buildFollowUpContext(MOCK_CHART_DATA);
    expect(context).toContain("BTCUSDT");
    expect(context).toContain("1H");
  });

  it("includes price when available", () => {
    const context = buildFollowUpContext(MOCK_CHART_DATA);
    expect(context).toContain("68000");
  });

  it("handles missing price gracefully", () => {
    const dataWithoutPrice: ChartData = { ...MOCK_CHART_DATA, price: undefined };
    const context = buildFollowUpContext(dataWithoutPrice);
    expect(context).toContain("BTCUSDT");
    expect(context).not.toContain("at undefined");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("mentions all required analysis sections", () => {
    expect(SYSTEM_PROMPT).toContain("Trend assessment");
    expect(SYSTEM_PROMPT).toContain("support and resistance");
    expect(SYSTEM_PROMPT).toContain("Indicator signals");
    expect(SYSTEM_PROMPT).toContain("Trade setup");
    expect(SYSTEM_PROMPT).toContain("Risk notes");
    expect(SYSTEM_PROMPT).toContain("confidence level");
  });

  it("includes the financial advice disclaimer", () => {
    expect(SYSTEM_PROMPT).toContain("not financial advice");
  });
});
