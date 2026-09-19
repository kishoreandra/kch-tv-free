// Grid tile chart: reuses the same LightweightChart, indicators and
// chart-config that the home page uses. Each tile remembers its own
// timeframe override per symbol.

import { useEffect, useMemo, useState } from "react";
import {
  LightweightChart,
  DEFAULT_CHART_CONFIG,
  type ChartConfig,
  type IndicatorConfig,
} from "@/components/LightweightChart";
import { defaultRangeFor } from "@/lib/timeframes";

export type TvInterval = "60" | "D" | "W" | "M";

export const TV_INTERVALS: { id: TvInterval; label: string }[] = [
  { id: "60", label: "1H" },
  { id: "D", label: "1D" },
  { id: "W", label: "1W" },
  { id: "M", label: "1M" },
];

const INDICATORS_KEY = "nse-mv:indicators";
const CHART_KEY = "nse-mv:chart";
const TILE_INTERVAL_PREFIX = "nse-mv:tile-interval:";

const DEFAULT_INDICATORS: IndicatorConfig = {
  ema: [21, 50, 200],
  sma: [],
  vwap: false,
  anchoredVwaps: [],
};

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface Props {
  symbol: string; // yahoo symbol
  interval: TvInterval; // default from grid
  height?: number;
}

export function TVChart({ symbol, interval, height = 400 }: Props) {
  // Per-symbol override
  const tileKey = TILE_INTERVAL_PREFIX + symbol;
  const [override, setOverride] = useState<TvInterval | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(tileKey);
    return v && ["60", "D", "W", "M"].includes(v) ? (v as TvInterval) : null;
  });
  const effective: TvInterval = override ?? interval;

  // Shared global config from home page
  const [chartCfg, setChartCfg] = useState<ChartConfig>(DEFAULT_CHART_CONFIG);
  const [indicators, setIndicators] = useState<IndicatorConfig>(DEFAULT_INDICATORS);

  useEffect(() => {
    setChartCfg(loadJson<ChartConfig>(CHART_KEY, DEFAULT_CHART_CONFIG));
    setIndicators(loadJson<IndicatorConfig>(INDICATORS_KEY, DEFAULT_INDICATORS));
    const onStorage = (e: StorageEvent) => {
      if (e.key === CHART_KEY) setChartCfg(loadJson(CHART_KEY, DEFAULT_CHART_CONFIG));
      if (e.key === INDICATORS_KEY) setIndicators(loadJson(INDICATORS_KEY, DEFAULT_INDICATORS));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const range = useMemo(() => defaultRangeFor(effective), [effective]);

  function pick(tf: TvInterval) {
    if (tf === interval) {
      setOverride(null);
      try { localStorage.removeItem(tileKey); } catch { /* ignore */ }
    } else {
      setOverride(tf);
      try { localStorage.setItem(tileKey, tf); } catch { /* ignore */ }
    }
  }

  return (
    <div className="flex h-full w-full flex-col" style={{ minHeight: height }}>
      <div className="flex items-center gap-0.5 border-b bg-background/60 px-1 py-0.5 shrink-0">
        {TV_INTERVALS.map((t) => (
          <button
            key={t.id}
            onClick={() => pick(t.id)}
            className={`h-5 rounded px-1.5 text-[10px] ${
              effective === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={`Switch to ${t.label}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        <LightweightChart
          symbol={symbol}
          interval={effective}
          range={range}
          indicators={indicators}
          chartConfig={chartCfg}
        />
      </div>
    </div>
  );
}

// Kept for backwards compat with any existing imports / link generation.
export function yahooToTvSymbol(yahoo: string): string {
  return yahoo;
}
