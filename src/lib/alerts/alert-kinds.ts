// Client-safe catalog of price/volume alert types (Daily + Weekly only).
// Used by the alerts UI and by the server evaluator so labels never drift.

export type Timeframe = "D" | "W";

export interface ParamSpec {
  key: string;
  label: string;
  type: "number" | "select";
  default: number | string;
  options?: { value: string | number; label: string }[];
  suffix?: string;
}

export interface AlertKindSpec {
  kind: string;
  group: "Price & Trend" | "Volume & Character" | "Volume Records";
  label: string;
  hint: string;
  params: ParamSpec[];
}

const EMA_OPTIONS = [10, 21, 50, 200].map((n) => ({ value: n, label: `EMA ${n}` }));
const DIR_OPTIONS = [
  { value: "above", label: "crosses above" },
  { value: "below", label: "crosses below" },
];

export const ALERT_KINDS: AlertKindSpec[] = [
  {
    kind: "price_level",
    group: "Price & Trend",
    label: "Price closes above/below a level",
    hint: "Plain price target — not relative to any EMA. Evaluated on the close.",
    params: [
      { key: "target", label: "Target price", type: "number", default: 100, suffix: "₹" },
      {
        key: "dir",
        label: "Direction",
        type: "select",
        default: "above",
        options: [
          { value: "above", label: "closes above" },
          { value: "below", label: "closes below" },
        ],
      },
    ],
  },
  {
    kind: "ema_cross",
    group: "Price & Trend",
    label: "Price crosses EMA",
    hint: "Close crosses above/below a chosen EMA.",
    params: [
      { key: "ema", label: "EMA", type: "select", default: 50, options: EMA_OPTIONS },
      { key: "dir", label: "Direction", type: "select", default: "above", options: DIR_OPTIONS },
    ],
  },
  {
    kind: "ema_touch",
    group: "Price & Trend",
    label: "Price touches a key EMA",
    hint: "The bar's range reaches a key EMA (10 / 21 / 50 / 200) — simple support test.",
    params: [
      { key: "ema", label: "EMA", type: "select", default: 10, options: EMA_OPTIONS },
      { key: "tolerance", label: "Within", type: "number", default: 0.5, suffix: "%" },
    ],
  },
  {
    kind: "ema_ema_cross",
    group: "Price & Trend",
    label: "EMA crosses EMA",
    hint: "Golden / death cross style signal (e.g. 50 over 200).",
    params: [
      { key: "fast", label: "Fast EMA", type: "select", default: 50, options: EMA_OPTIONS },
      { key: "slow", label: "Slow EMA", type: "select", default: 200, options: EMA_OPTIONS },
      { key: "dir", label: "Direction", type: "select", default: "above", options: DIR_OPTIONS },
    ],
  },
  {
    kind: "near_high",
    group: "Price & Trend",
    label: "Within X% of high",
    hint: "Price closes within a tolerance of the all-time or 52-week high.",
    params: [
      {
        key: "ref",
        label: "Reference",
        type: "select",
        default: "52w",
        options: [
          { value: "52w", label: "52-week high" },
          { value: "ath", label: "All-time high (available history)" },
        ],
      },
      { key: "pct", label: "Within", type: "number", default: 3, suffix: "%" },
    ],
  },
  {
    kind: "fresh_high",
    group: "Price & Trend",
    label: "Fresh high made",
    hint: "A new high printed in the latest closed bar.",
    params: [
      {
        key: "ref",
        label: "Reference",
        type: "select",
        default: "52w",
        options: [
          { value: "52w", label: "52-week high" },
          { value: "ath", label: "All-time high (available history)" },
        ],
      },
    ],
  },
  {
    kind: "pullback_ema",
    group: "Price & Trend",
    label: "Pullback to EMA",
    hint: "Was extended above the EMA recently and has now come back to test it.",
    params: [
      { key: "ema", label: "EMA", type: "select", default: 21, options: EMA_OPTIONS },
      { key: "extended_pct", label: "Was extended by", type: "number", default: 10, suffix: "%" },
      { key: "lookback", label: "Within last", type: "number", default: 20, suffix: "bars" },
      { key: "touch_pct", label: "Now within", type: "number", default: 2, suffix: "%" },
    ],
  },
  {
    kind: "extension",
    group: "Price & Trend",
    label: "Extension warning",
    hint: "Price is stretched far above a chosen EMA.",
    params: [
      { key: "ema", label: "EMA", type: "select", default: 21, options: EMA_OPTIONS },
      { key: "pct", label: "More than", type: "number", default: 20, suffix: "% above" },
    ],
  },
  {
    kind: "trend_break",
    group: "Price & Trend",
    label: "Trend break (close below EMA 200)",
    hint: "Most important risk alert — apply to every open position.",
    params: [],
  },
  {
    kind: "volume_surge",
    group: "Volume & Character",
    label: "Volume surge",
    hint: "Volume well above its recent average, with a turnover floor.",
    params: [
      { key: "mult", label: "Volume vs avg", type: "number", default: 2, suffix: "x" },
      { key: "avg_len", label: "Average length", type: "number", default: 20, suffix: "bars" },
      { key: "min_turnover_cr", label: "Min turnover", type: "number", default: 5, suffix: "Cr" },
    ],
  },
  {
    kind: "volume_dryup",
    group: "Volume & Character",
    label: "Volume dry-up (VDU)",
    hint: "Volume contracts below average for several bars — tightening before a move.",
    params: [
      { key: "mult", label: "Volume below", type: "number", default: 0.6, suffix: "x avg" },
      { key: "days", label: "For at least", type: "number", default: 3, suffix: "bars" },
      { key: "avg_len", label: "Average length", type: "number", default: 20, suffix: "bars" },
    ],
  },
  {
    kind: "pocket_pivot",
    group: "Volume & Character",
    label: "Pocket pivot",
    hint: "Up bar whose volume tops the biggest down-bar volume of the last N bars, still under the 50 MA.",
    params: [{ key: "lookback", label: "Down-bar lookback", type: "number", default: 10, suffix: "bars" }],
  },
  {
    kind: "dist_acc",
    group: "Volume & Character",
    label: "Distribution / accumulation count",
    hint: "Rolling count of down-days on rising volume vs up-days on rising volume.",
    params: [
      {
        key: "side",
        label: "Count",
        type: "select",
        default: "distribution",
        options: [
          { value: "distribution", label: "Distribution days" },
          { value: "accumulation", label: "Accumulation days" },
        ],
      },
      { key: "window", label: "Window", type: "number", default: 25, suffix: "bars" },
      { key: "threshold", label: "Alert at", type: "number", default: 5, suffix: "or more" },
    ],
  },
  {
    kind: "gap_reversal",
    group: "Volume & Character",
    label: "Trend reversal via gap",
    hint: "Downtrending name gaps up sharply and closes back above a key EMA.",
    params: [
      { key: "gap_pct", label: "Gap up at least", type: "number", default: 5, suffix: "%" },
      { key: "ema", label: "Reclaims", type: "select", default: 50, options: EMA_OPTIONS },
    ],
  },
  {
    kind: "adr_contraction",
    group: "Volume & Character",
    label: "Range contraction (ADR% low)",
    hint: "20-bar ADR% hits its lowest level in N weeks — the VCP tell.",
    params: [{ key: "weeks", label: "Lowest in", type: "number", default: 10, suffix: "weeks" }],
  },
  {
    kind: "tight_range",
    group: "Volume & Character",
    label: "N-bar tight range",
    hint: "Closes stay inside a narrow band (3 weeks tight).",
    params: [
      { key: "days", label: "Bars", type: "number", default: 15, suffix: "bars" },
      { key: "pct", label: "Range within", type: "number", default: 10, suffix: "%" },
    ],
  },
  {
    kind: "volume_record",
    group: "Volume Records",
    label: "Record volume",
    hint: "Highest volume in the available history, or in the trailing year. Cross-checked against bulk/block deals.",
    params: [
      {
        key: "scope",
        label: "Scope",
        type: "select",
        default: "1y",
        options: [
          { value: "1y", label: "Highest in trailing year" },
          { value: "all", label: "Highest in available history" },
        ],
      },
    ],
  },
];

export const KIND_MAP: Record<string, AlertKindSpec> = Object.fromEntries(
  ALERT_KINDS.map((k) => [k.kind, k]),
);

export function defaultParams(kind: string): Record<string, unknown> {
  const spec = KIND_MAP[kind];
  if (!spec) return {};
  return Object.fromEntries(spec.params.map((p) => [p.key, p.default]));
}

export function describeKind(kind: string, timeframe: string, params: Record<string, unknown>): string {
  const p = params ?? {};
  const tf = timeframe === "W" ? "weekly" : "daily";
  const n = (k: string, d?: number) => Number(p[k] ?? d);
  const s = (k: string, d?: string) => String(p[k] ?? d ?? "");
  switch (kind) {
    case "price_level":
      return `Price closes ${s("dir", "above")} ₹${n("target", 0)} (${tf} close)`;
    case "ema_cross":
      return `Price crosses ${s("dir", "above")} EMA ${n("ema", 50)} (${tf} close)`;
    case "ema_touch":
      return `Price touches EMA ${n("ema", 10)} within ${n("tolerance", 0.5)}% (${tf})`;
    case "ema_ema_cross":
      return `EMA ${n("fast", 50)} crosses ${s("dir", "above")} EMA ${n("slow", 200)} (${tf})`;
    case "near_high":
      return `Within ${n("pct", 3)}% of ${s("ref", "52w") === "ath" ? "all-time high" : "52-week high"} (${tf})`;
    case "fresh_high":
      return `New ${s("ref", "52w") === "ath" ? "all-time" : "52-week"} high (${tf})`;
    case "pullback_ema":
      return `Pullback to EMA ${n("ema", 21)} after being ${n("extended_pct", 10)}% extended (${tf})`;
    case "extension":
      return `More than ${n("pct", 20)}% above EMA ${n("ema", 21)} (${tf})`;
    case "trend_break":
      return `${tf === "weekly" ? "Weekly" : "Daily"} close below EMA 200`;
    case "volume_surge":
      return `Volume ≥ ${n("mult", 2)}x ${n("avg_len", 20)}-bar average (${tf})`;
    case "volume_dryup":
      return `Volume below ${n("mult", 0.6)}x average for ${n("days", 3)} bars (${tf})`;
    case "pocket_pivot":
      return `Pocket pivot vs last ${n("lookback", 10)} bars (${tf})`;
    case "dist_acc":
      return `${s("side", "distribution") === "accumulation" ? "Accumulation" : "Distribution"} days ≥ ${n("threshold", 5)} in ${n("window", 25)} bars`;
    case "gap_reversal":
      return `Gap up ≥ ${n("gap_pct", 5)}% closing above EMA ${n("ema", 50)} (${tf})`;
    case "adr_contraction":
      return `ADR% lowest in ${n("weeks", 10)} weeks (${tf})`;
    case "tight_range":
      return `${n("days", 15)} bars inside a ${n("pct", 10)}% range (${tf})`;
    case "volume_record":
      return `Record ${tf} volume (${s("scope", "1y") === "all" ? "available history" : "trailing year"})`;
    default:
      return kind;
  }
}
