// Adaptive moving averages: interpret indicator periods as *trading days*
// and convert them per timeframe so that "50" means 50 daily bars on D,
// 10 weekly bars on W, ~325 hourly bars on 1H, etc.
//
// Overrides (per timeframe) win over auto-adaption when provided.

import type { IndicatorConfig } from "@/components/LightweightChart";

// Bars per trading day for each supported chart interval.
// Only higher timeframes (weekly / monthly) auto-convert from trading days.
// Intraday timeframes keep periods as *literal bars*, matching TradingView —
// a "50 EMA" on 1H means 50 hourly bars, not 50 trading days of hourly bars.
const BARS_PER_TRADING_DAY: Record<string, number> = {
  D: 1,
  W: 1 / 5,
  M: 1 / 21,
};

export type OverrideTf = "60" | "D" | "W" | "M";
export const OVERRIDE_TFS: OverrideTf[] = ["60", "D", "W", "M"];
export const OVERRIDE_TF_LABEL: Record<OverrideTf, string> = {
  "60": "1H",
  D: "1D",
  W: "1W",
  M: "1M",
};

export interface AdaptOverrides {
  ema?: number[];
  sma?: number[];
}

export interface IndicatorConfigExt extends IndicatorConfig {
  overrides?: Partial<Record<OverrideTf, AdaptOverrides>>;
}

export function convertPeriod(basePeriodTradingDays: number, interval: string): number {
  const bpd = BARS_PER_TRADING_DAY[interval] ?? 1;
  const raw = Math.round(basePeriodTradingDays * bpd);
  return Math.max(2, raw);
}

function tfSuffix(interval: string): string {
  if (interval === "W") return "W";
  if (interval === "M") return "M";
  if (interval === "D") return "D";
  if (interval === "60") return "H";
  return interval + "m";
}

export interface ResolvedLine {
  kind: "ema" | "sma";
  /** Period (in bars) to actually compute on. */
  effectivePeriod: number;
  /** Original period from config (trading days when auto-adapted, or literal bars when override). */
  basePeriod: number;
  /** Chart legend label, e.g. "EMA 10W (≈50D)" or "EMA 50" on daily. */
  label: string;
  /** Style key — always keyed by base period so user-picked colors persist. */
  styleKey: string;
  /** True when this came from a per-timeframe override (base == effective). */
  fromOverride: boolean;
}

export function resolveEffectiveIndicators(
  cfg: IndicatorConfig,
  interval: string,
): { lines: ResolvedLine[]; primaryMa: ResolvedLine | null } {
  const ext = cfg as IndicatorConfigExt;
  const tf = interval as OverrideTf;
  const override = ext.overrides?.[tf];
  // Override is active whenever the user has ticked the Override checkbox for
  // this timeframe (i.e. an entry exists), even if the period lists are empty
  // — an empty list means "no MAs on this timeframe" and should be honored.
  const usingOverride = Boolean(override);

  const lines: ResolvedLine[] = [];
  const suffix = tfSuffix(interval);
  // No auto-conversion for daily or intraday — periods are literal bars.
  const isLiteral = interval !== "W" && interval !== "M";

  const emas = usingOverride ? override!.ema ?? [] : cfg.ema;
  const smas = usingOverride ? override!.sma ?? [] : cfg.sma;

  for (const p of emas) {
    const eff = usingOverride || isLiteral ? p : convertPeriod(p, interval);
    const label = usingOverride
      ? `EMA ${p}${suffix}`
      : isLiteral
      ? `EMA ${p}`
      : `EMA ${eff}${suffix} (≈${p}D)`;
    // Overrides use a per-timeframe style key so users can pick distinct
    // colors without touching the base (non-override) list styles.
    const styleKey = usingOverride ? `ema:${tf}:${p}` : `ema:${p}`;
    lines.push({
      kind: "ema",
      effectivePeriod: eff,
      basePeriod: p,
      label,
      styleKey,
      fromOverride: usingOverride,
    });
  }
  for (const p of smas) {
    const eff = usingOverride || isLiteral ? p : convertPeriod(p, interval);
    const label = usingOverride
      ? `SMA ${p}${suffix}`
      : isLiteral
      ? `SMA ${p}`
      : `SMA ${eff}${suffix} (≈${p}D)`;
    const styleKey = usingOverride ? `sma:${tf}:${p}` : `sma:${p}`;
    lines.push({
      kind: "sma",
      effectivePeriod: eff,
      basePeriod: p,
      label,
      styleKey,
      fromOverride: usingOverride,
    });
  }

  const primaryMa = lines[0] ?? null;
  return { lines, primaryMa };
}
