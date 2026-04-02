/**
 * Coinglass Liquidation Map data fetcher.
 *
 * Coinglass exposes a public REST API used by their liquidation map page.
 * We fetch the BTC (or specified symbol) liquidation heatmap data and
 * summarise the key levels for Claude's prompt context.
 *
 * API endpoint discovered from the liquidation map page's network requests:
 *   https://open-api.coinglass.com/public/v2/liquidation_map
 *
 * NOTE: This is a best-effort fetch. If the API changes or rate-limits, we
 * gracefully return null so analysis still proceeds.
 */

const CG_API = "https://open-api.coinglass.com/public/v2/liquidation_map";

interface LiqPoint {
  price: number;
  longLiquidationUsd: number;
  shortLiquidationUsd: number;
}

interface LiquidationSummary {
  symbol: string;
  currentPrice: number;
  // Nearest walls above/below current price
  biggestLongWallAbove: LiqPoint | null; // short squeeze target
  biggestShortWallBelow: LiqPoint | null; // long cascade target
  // Top 3 walls each side for context
  topLongWallsAbove: LiqPoint[];
  topShortWallsBelow: LiqPoint[];
  rawText: string; // pre-formatted for the prompt
}

export async function fetchLiquidationMap(
  symbol: string,
  currentPrice: number
): Promise<LiquidationSummary | null> {
  try {
    const coin = symbol.replace("USDT", "").replace("USD", "").toUpperCase();
    const url = `${CG_API}?symbol=${coin}USDT&range=1`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        // Coinglass public API doesn't require auth for basic endpoints
      },
    });

    if (!res.ok) {
      console.warn(`[CG] Liquidation map fetch failed: ${res.status}`);
      return null;
    }

    const json = (await res.json()) as {
      code?: string;
      data?: {
        y?: number[];
        liquidationLevels?: Array<{
          price: number;
          longLiquidationUsd: number;
          shortLiquidationUsd: number;
        }>;
      };
    };

    if (json.code !== "0" || !json.data?.liquidationLevels?.length) {
      console.warn("[CG] Unexpected liquidation map response:", JSON.stringify(json).slice(0, 200));
      return null;
    }

    const levels = json.data.liquidationLevels;

    // Split into above and below current price
    const above = levels.filter((l) => l.price > currentPrice);
    const below = levels.filter((l) => l.price < currentPrice);

    // Sort above by long liquidation (longs liquidate when price drops — confusing naming;
    // "longLiquidationUsd" here means USD value of long positions that get liquidated at that price).
    // Longs below current price get liquidated if price falls → look at below for long walls.
    // Shorts above current price get liquidated if price rises → look at above for short walls.

    const topShortWallsAbove = above
      .sort((a, b) => b.shortLiquidationUsd - a.shortLiquidationUsd)
      .slice(0, 3);

    const topLongWallsBelow = below
      .sort((a, b) => b.longLiquidationUsd - a.longLiquidationUsd)
      .slice(0, 3);

    const biggestLongWallAbove = topShortWallsAbove[0] ?? null;
    const biggestShortWallBelow = topLongWallsBelow[0] ?? null;

    const fmt = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    const fmtUsd = (n: number) => {
      if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
      return `$${(n / 1_000).toFixed(0)}K`;
    };

    const shortWallLines = topShortWallsAbove.map(
      (l) => `  ${fmt(l.price)} → ${fmtUsd(l.shortLiquidationUsd)} shorts`
    );
    const longWallLines = topLongWallsBelow.map(
      (l) => `  ${fmt(l.price)} → ${fmtUsd(l.longLiquidationUsd)} longs`
    );

    const rawText = [
      `Liquidation Map (${coin}, current: ${fmt(currentPrice)}):`,
      "Short squeeze levels above (price → shorts at risk):",
      ...shortWallLines,
      "Long cascade levels below (price → longs at risk):",
      ...longWallLines,
    ].join("\n");

    return {
      symbol: coin,
      currentPrice,
      biggestLongWallAbove,
      biggestShortWallBelow: biggestShortWallBelow,
      topLongWallsAbove: topShortWallsAbove,
      topShortWallsBelow: topLongWallsBelow,
      rawText,
    };
  } catch (err) {
    console.warn("[CG] Liquidation map fetch error:", err);
    return null;
  }
}
