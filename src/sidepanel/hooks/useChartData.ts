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

  // Listen for live chart updates pushed from the content script → background → here
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
    chrome.runtime.sendMessage({ type: "SCRAPE_REQUEST" }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.data) setChartData(response.data as ChartData);
    });
  }, []);

  return { chartData, refreshChartData };
}
