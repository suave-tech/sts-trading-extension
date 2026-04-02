import { useCallback, useEffect, useState } from "react";
import type { ChartData, ExtensionMessage } from "../../types";

export function useChartData() {
  const [chartData, setChartData] = useState<ChartData | null>(null);

  // On mount, ask the background for whatever it last cached
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_CHART_DATA" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.data) setChartData(response.data as ChartData);
    });
  }, []);

  // Listen for live chart updates pushed from content script → background → here
  // This fires both for DOM scrapes AND for enriched API data
  useEffect(() => {
    function handleMessage(message: ExtensionMessage) {
      if (message.type === "CHART_DATA_UPDATE") {
        setChartData((message as { type: string; payload: ChartData }).payload);
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const refreshChartData = useCallback(() => {
    if (!chartData) {
      chrome.runtime.sendMessage({ type: "SCRAPE_REQUEST" }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.data) setChartData(response.data as ChartData);
      });
      return;
    }

    // If we have a symbol but no indicators, this is a platform that doesn't
    // support DOM scraping (e.g. Hyperliquid). Go straight to the API.
    const hasIndicators = Object.keys(chartData.indicators ?? {}).length > 0;
    if (!hasIndicators && chartData.symbol !== "UNKNOWN") {
      chrome.runtime.sendMessage(
        {
          type: "FETCH_API_CHART_DATA",
          symbol: chartData.symbol,
          timeframe: chartData.timeframe,
        },
        (response) => {
          if (chrome.runtime.lastError) return;
          if (response?.data) setChartData(response.data as ChartData);
        }
      );
      return;
    }

    // Standard DOM scrape for native TV and other platforms
    chrome.runtime.sendMessage({ type: "SCRAPE_REQUEST" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.data) setChartData(response.data as ChartData);
    });
  }, [chartData]);

  return { chartData, refreshChartData };
}
