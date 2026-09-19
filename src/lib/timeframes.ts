// Client-safe range helpers. Mirrors the server validation in ohlc.functions.ts.

export const ALL_RANGES = [
  { id: "1d", label: "1 day" },
  { id: "5d", label: "5 days" },
  { id: "1mo", label: "1 month" },
  { id: "3mo", label: "3 months" },
  { id: "6mo", label: "6 months" },
  { id: "1y", label: "1 year" },
  { id: "2y", label: "2 years" },
  { id: "5y", label: "5 years" },
  { id: "10y", label: "10 years" },
  { id: "max", label: "Max" },
] as const;

export type RangeId = (typeof ALL_RANGES)[number]["id"];

// Yahoo restricts intraday history to ~60 days.
export const RANGES_FOR_INTERVAL: Record<string, RangeId[]> = {
  "5": ["1d", "5d", "1mo"],
  "15": ["1d", "5d", "1mo"],
  "30": ["1d", "5d", "1mo"],
  "60": ["5d", "1mo", "3mo", "6mo", "1y", "2y"],
  D: ["1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"],
  W: ["1y", "2y", "5y", "10y", "max"],
  M: ["5y", "10y", "max"],
};

export const DEFAULT_RANGE_FOR_INTERVAL: Record<string, RangeId> = {
  "5": "5d",
  "15": "1mo",
  "30": "1mo",
  "60": "3mo",
  D: "1y",
  W: "5y",
  M: "max",
};

export function defaultRangeFor(interval: string): RangeId {
  return DEFAULT_RANGE_FOR_INTERVAL[interval] ?? "1y";
}

export function rangesFor(interval: string): RangeId[] {
  return RANGES_FOR_INTERVAL[interval] ?? ["1y"];
}

export function rangeLabel(id: string): string {
  return ALL_RANGES.find((r) => r.id === id)?.label ?? id;
}
