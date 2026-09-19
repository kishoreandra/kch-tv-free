// Filter definitions, operators, default presets, and an in-memory evaluator
// for the screener. Both client and server import this module.

export type FieldType = "currency" | "number" | "percent" | "bigInt" | "enum";

export interface FieldDef {
  id: string; // matches a column on stock_snapshot
  label: string;
  category: "Price" | "Volume" | "Market" | "Performance" | "Technicals" | "Fundamentals";
  type: FieldType;
  unit?: string;
  options?: string[];
}

export const FIELD_DEFS: FieldDef[] = [
  // Price
  { id: "price", label: "Price", category: "Price", type: "currency", unit: "INR" },
  { id: "open", label: "Open", category: "Price", type: "currency", unit: "INR" },
  { id: "day_low", label: "Low of day", category: "Price", type: "currency", unit: "INR" },
  { id: "gap_pct", label: "Gap % (open vs prev close)", category: "Price", type: "percent" },
  { id: "week_open", label: "Week open", category: "Price", type: "currency", unit: "INR" },
  { id: "prev_week_close", label: "Prev week close", category: "Price", type: "currency", unit: "INR" },
  { id: "week_gap_pct", label: "Weekly gap %", category: "Price", type: "percent" },
  { id: "week_low", label: "Low of week", category: "Price", type: "currency", unit: "INR" },

  { id: "change_pct", label: "Change %", category: "Price", type: "percent" },
  { id: "pct_from_52w_high", label: "% from 52w high", category: "Price", type: "percent" },
  { id: "pct_from_52w_low", label: "% from 52w low", category: "Price", type: "percent" },
  { id: "high_52w", label: "52w high", category: "Price", type: "currency", unit: "INR" },
  { id: "low_52w", label: "52w low", category: "Price", type: "currency", unit: "INR" },
  { id: "ath", label: "All-time high", category: "Price", type: "currency", unit: "INR" },
  { id: "pct_from_ath", label: "% from all-time high", category: "Price", type: "percent" },

  // Market
  // NSE-only site: every snapshot row is NSE, so BSE is not offered.
  { id: "exchange", label: "Exchange", category: "Market", type: "enum", options: ["NSE"] },
  { id: "market_cap", label: "Mkt cap", category: "Market", type: "bigInt", unit: "INR" },
  { id: "sector", label: "Sector", category: "Market", type: "enum" },

  // Volume / liquidity
  { id: "volume", label: "Volume", category: "Volume", type: "bigInt" },
  { id: "avg_vol_10d", label: "Avg Vol 10D", category: "Volume", type: "bigInt" },
  { id: "avg_vol_30d", label: "Avg Vol 30D", category: "Volume", type: "bigInt" },
  { id: "rel_vol", label: "Rel Vol", category: "Volume", type: "number" },
  { id: "liquidity_30d", label: "Avg Price × Avg Vol 30D (turnover)", category: "Volume", type: "bigInt", unit: "INR" },
  { id: "max_vol_all", label: "Max Vol (all-time)", category: "Volume", type: "bigInt" },
  { id: "max_vol_252d", label: "Max Vol (1Y)", category: "Volume", type: "bigInt" },
  { id: "max_vol_63d", label: "Max Vol (1Q)", category: "Volume", type: "bigInt" },
  { id: "max_vol_all_age_days", label: "Days since all-time max vol", category: "Volume", type: "number" },

  // Price bands (NSE circuit limits)
  { id: "band_pct", label: "Price band %", category: "Price", type: "enum", options: ["2", "5", "10", "20"] },
  { id: "pct_to_upper_circuit", label: "% to upper circuit", category: "Price", type: "percent" },
  { id: "pct_to_lower_circuit", label: "% to lower circuit", category: "Price", type: "percent" },




  // Performance
  { id: "perf_1d", label: "Perf 1D", category: "Performance", type: "percent" },
  { id: "perf_1w", label: "Perf 1W", category: "Performance", type: "percent" },
  { id: "perf_1m", label: "Perf 1M", category: "Performance", type: "percent" },
  { id: "perf_3m", label: "Perf 3M", category: "Performance", type: "percent" },
  { id: "perf_6m", label: "Perf 6M", category: "Performance", type: "percent" },
  { id: "perf_1y", label: "Perf 1Y", category: "Performance", type: "percent" },
  { id: "perf_ytd", label: "Perf YTD", category: "Performance", type: "percent" },

  // Technicals
  { id: "ema10", label: "EMA (10)", category: "Technicals", type: "currency", unit: "INR" },
  { id: "ema20", label: "EMA (20)", category: "Technicals", type: "currency", unit: "INR" },
  { id: "ema50", label: "EMA (50)", category: "Technicals", type: "currency", unit: "INR" },
  { id: "ema100", label: "EMA (100)", category: "Technicals", type: "currency", unit: "INR" },
  { id: "ema200", label: "EMA (200)", category: "Technicals", type: "currency", unit: "INR" },
  { id: "rsi14", label: "RSI (14)", category: "Technicals", type: "number" },
  { id: "adr_20", label: "ADR % (20)", category: "Technicals", type: "percent" },
  { id: "rs_rating", label: "RS Rating — All NSE (1–99)", category: "Technicals", type: "number" },
  { id: "rs_rating_n50", label: "RS Rating — NIFTY 50 (1–99)", category: "Technicals", type: "number" },
  { id: "rs_rating_n100", label: "RS Rating — NIFTY 100 (1–99)", category: "Technicals", type: "number" },
  { id: "rs_rating_n200", label: "RS Rating — NIFTY 200 (1–99)", category: "Technicals", type: "number" },
  { id: "rs_rating_n500", label: "RS Rating — NIFTY 500 (1–99)", category: "Technicals", type: "number" },

  // Fundamentals
  { id: "pe_ratio", label: "P/E", category: "Fundamentals", type: "number" },
  { id: "dividend_yield", label: "Dividend Yield", category: "Fundamentals", type: "percent" },
  { id: "net_profit_qoq", label: "Net profit QoQ growth (latest quarter)", category: "Fundamentals", type: "percent" },
  { id: "sales_qoq", label: "Sales QoQ growth (latest quarter)", category: "Fundamentals", type: "percent" },
  { id: "net_profit_yoy", label: "Net profit YoY growth (latest quarter)", category: "Fundamentals", type: "percent" },
  { id: "sales_yoy", label: "Sales YoY growth (latest quarter)", category: "Fundamentals", type: "percent" },
  { id: "days_since_earnings", label: "Days since last earnings release", category: "Fundamentals", type: "number" },
  { id: "move_since_earnings_pct", label: "% move since latest earnings", category: "Fundamentals", type: "percent" },
  { id: "ipo_age_days", label: "Days since IPO listing", category: "Fundamentals", type: "number" },
];

export type Operator = "gt" | "gte" | "lt" | "lte" | "between" | "eq" | "not_eq" | "in" | "not_in" | "below_by" | "above_by" | "cmp_field";

export interface Filter {
  field: string;
  op: Operator;
  value?: number;
  value2?: number;
  enumValue?: string;
  /** Multi-select values for the "in" operator on enum fields. */
  enumValues?: string[];
  refField?: string;
  cmpOp?: "gt" | "gte" | "lt" | "lte";
  unit?: string;
  scale?: 1 | 1_000 | 1_000_000 | 1_000_000_000 | 10_000_000;
}

export interface SnapshotRow {
  symbol: string;
  ticker: string;
  name: string | null;
  sector: string | null;
  exchange: string;
  price: number | null;
  prev_close: number | null;
  change_pct: number | null;
  volume: number | null;
  avg_vol_10d: number | null;
  avg_vol_30d: number | null;
  rel_vol: number | null;
  liquidity: number | null;
  avg_price_30d?: number | null;
  avg_turnover_30d?: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  dividend_yield: number | null;
  ema10: number | null;
  ema20: number | null;
  ema50: number | null;
  ema100: number | null;
  ema200: number | null;
  rsi14: number | null;
  adr_20: number | null;
  perf_1d: number | null;
  perf_1w: number | null;
  perf_1m: number | null;
  perf_3m: number | null;
  perf_6m: number | null;
  perf_1y: number | null;
  perf_ytd: number | null;
  high_52w: number | null;
  low_52w: number | null;
  ath: number | null;
  pct_from_52w_high: number | null;
  pct_from_52w_low: number | null;
  day_low: number | null;
  week_open: number | null;
  prev_week_close: number | null;
  week_gap_pct: number | null;
  week_low: number | null;
  net_profit_qoq: number | null;
  sales_qoq: number | null;
  net_profit_yoy: number | null;
  sales_yoy: number | null;
  earnings_release_date: string | null;
  earnings_release_price: number | null;
  max_vol_all: number | null;
  max_vol_252d: number | null;
  max_vol_63d: number | null;
  rs_rating: number | null;
  rs_rating_n50: number | null;
  rs_rating_n100: number | null;
  rs_rating_n200: number | null;
  rs_rating_n500: number | null;
  max_vol_all_age_days: number | null;
  open: number | null;
  first_trade_date: string | null;
  updated_at: string;
  // Optional, joined from price_bands table (not a real column on stock_snapshot)
  band_pct?: number | null;
  band_label?: string | null;
}

export function snapshotFieldValue(row: SnapshotRow, key: string): number | string | null {
  if (key === "gap_pct") {
    if (typeof row.open === "number" && typeof row.prev_close === "number" && row.prev_close > 0) {
      return ((row.open - row.prev_close) / row.prev_close) * 100;
    }
    return null;
  }

  if (key === "ipo_age_days") {
    if (row.first_trade_date) {
      const t = new Date(row.first_trade_date).getTime();
      if (isFinite(t)) return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
    }
    return null;
  }

  if (key === "week_gap_pct") {
    if (typeof row.week_gap_pct === "number") return row.week_gap_pct;
    if (typeof row.week_open === "number" && typeof row.prev_week_close === "number" && row.prev_week_close > 0) {
      return ((row.week_open - row.prev_week_close) / row.prev_week_close) * 100;
    }
    return null;
  }

  if (key === "days_since_earnings") {
    if (row.earnings_release_date) {
      const t = new Date(row.earnings_release_date).getTime();
      if (isFinite(t)) return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
    }
    return null;
  }

  if (key === "move_since_earnings_pct") {
    if (typeof row.price === "number" && typeof row.earnings_release_price === "number" && row.earnings_release_price > 0) {
      return ((row.price - row.earnings_release_price) / row.earnings_release_price) * 100;
    }
    return null;
  }

  if (key === "off_high_pct_from_52w_high" || key === "off_ath_pct") {
    // handled by pct_from_52w_high — kept as no-op for legacy
  }


  if (key === "pct_from_ath") {
    if (typeof row.price === "number" && typeof row.ath === "number" && row.ath > 0) {
      return Math.max(0, ((row.ath - row.price) / row.ath) * 100);
    }
    return null;
  }

  if (
    key === "pct_from_52w_high" &&
    typeof row.price === "number" &&
    typeof row.high_52w === "number" &&
    row.high_52w > 0
  ) {
    return Math.max(0, ((row.high_52w - row.price) / row.high_52w) * 100);
  }
  if (
    key === "pct_from_52w_low" &&
    typeof row.price === "number" &&
    typeof row.low_52w === "number" &&
    row.low_52w > 0
  ) {
    return Math.max(0, ((row.price - row.low_52w) / row.low_52w) * 100);
  }

  if (key === "liquidity_30d") {
    // Preferred: 30-session average close × 30-session average volume,
    // matching the reference screener's stated formula.
    if (typeof row.avg_turnover_30d === "number") return row.avg_turnover_30d;
    // Fallbacks for names without 30 sessions of history: use the best price
    // and volume averages available so new listings aren't silently dropped.
    const px =
      typeof row.avg_price_30d === "number" ? row.avg_price_30d : typeof row.price === "number" ? row.price : null;
    const vol =
      typeof row.avg_vol_30d === "number"
        ? row.avg_vol_30d
        : typeof row.avg_vol_10d === "number"
          ? row.avg_vol_10d
          : typeof row.volume === "number"
            ? row.volume
            : null;
    if (px != null && vol != null) return px * vol;
    return null;
  }


  // Price band / circuit fields (joined from price_bands table)
  if (key === "band_pct") {
    return typeof row.band_pct === "number" ? String(row.band_pct) : null;
  }
  if (key === "pct_to_upper_circuit" || key === "pct_to_lower_circuit") {
    const band = row.band_pct;
    const prev = row.prev_close;
    const px = row.price;
    if (typeof band !== "number" || typeof prev !== "number" || typeof px !== "number" || prev <= 0 || px <= 0) {
      return null;
    }
    if (key === "pct_to_upper_circuit") {
      const upper = prev * (1 + band / 100);
      return ((upper - px) / px) * 100;
    }
    const lower = prev * (1 - band / 100);
    return ((px - lower) / px) * 100;
  }

  return (row as any)[key] ?? null;
}

export function matches(row: SnapshotRow, f: Filter): boolean {
  const left = snapshotFieldValue(row, f.field);
  switch (f.op) {
    case "gt":
      return typeof left === "number" && typeof f.value === "number" && left > f.value;
    case "gte":
      return typeof left === "number" && typeof f.value === "number" && left >= f.value;
    case "lt":
      return typeof left === "number" && typeof f.value === "number" && left < f.value;
    case "lte":
      return typeof left === "number" && typeof f.value === "number" && left <= f.value;
    case "between":
      return (
        typeof left === "number" &&
        typeof f.value === "number" &&
        typeof f.value2 === "number" &&
        left >= f.value &&
        left <= f.value2
      );
    case "eq":
      return typeof left === "string" && left === f.enumValue;
    case "not_eq":
      // Unknown value passes an exclusion filter: band coverage is partial,
      // and dropping unknown-band names would silently hide valid matches.
      if (left == null) return true;
      return typeof left === "string" && left !== f.enumValue;
    case "in":
      return typeof left === "string" && Array.isArray(f.enumValues) && f.enumValues.includes(left);
    case "not_in":
      if (!Array.isArray(f.enumValues) || f.enumValues.length === 0) return true;
      if (left == null) return true;
      return typeof left === "string" && !f.enumValues.includes(left);
    case "below_by": {
      const ref = f.refField ? snapshotFieldValue(row, f.refField) : null;
      if (typeof left !== "number" || typeof ref !== "number" || ref === 0) return false;
      const pct = ((ref - left) / ref) * 100;
      const lo = f.value ?? 0;
      const hi = f.value2 ?? lo;
      return pct >= lo && pct <= hi;
    }
    case "above_by": {
      const ref = f.refField ? snapshotFieldValue(row, f.refField) : null;
      if (typeof left !== "number" || typeof ref !== "number" || ref === 0) return false;
      const pct = ((left - ref) / ref) * 100;
      const lo = f.value ?? 0;
      const hi = f.value2 ?? lo;
      return pct >= lo && pct <= hi;
    }
    case "cmp_field": {
      const right = f.refField ? snapshotFieldValue(row, f.refField) : null;
      if (typeof left !== "number" || typeof right !== "number") return false;
      switch (f.cmpOp) {
        case "gt":
          return left > right;
        case "gte":
          return left >= right;
        case "lt":
          return left < right;
        case "lte":
          return left <= right;
        default:
          return false;
      }
    }
    default:
      return false;
  }
}

export function evaluateFilters(rows: SnapshotRow[], filters: Filter[]): SnapshotRow[] {
  if (filters.length === 0) return rows;
  return rows.filter((r) => filters.every((f) => matches(r, f)));
}

export interface Preset {
  id: string;
  name: string;
  filters: Filter[];
  description?: string;
  defaultSort?: { field: keyof SnapshotRow; dir: "asc" | "desc" };
  columns?: ColKey[];
}

// Heuristic to exclude 2% / 5% circuit-band stocks (they physically cannot
// move beyond ±2% or ±5% intraday, so their 20-day Average Daily Range %
// stays well under ~1). Adding this to every preset ensures scans never
// surface untradeable price-band names.
const EXCLUDE_CIRCUIT: Filter = { field: "adr_20", op: "gt", value: 1 };
// Explicitly drop 2% and 5% NSE circuit-band names — they physically can't
// clear the tighter breakouts most scanners look for. Uses `not_in` so rows
// with no known band still pass through.
// Standard liquidity gate used by every built-in scanner: 30-session average
// traded value above ₹4.5 Cr.
const MIN_LIQUIDITY: Filter = { field: "liquidity_30d", op: "gte", value: 45_000_000 };

export const PRESETS: Preset[] = [
  {
    id: "basic-universe",
    name: "Basic Scan (tradeable NSE universe)",
    description:
      "ChartsMaze-compatible base scan: 30D average turnover ≥ ₹4.5 Cr, market cap ≥ ₹1,000 Cr, price ₹0–₹3,500, excluding known 2% / 5% circuit-band names",
    defaultSort: { field: "rs_rating", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "liquidity_30d", op: "gte", value: 45_000_000 },
      { field: "market_cap", op: "gte", value: 10_000_000_000 },
      { field: "price", op: "between", value: 0, value2: 3500 },
      { field: "band_pct", op: "not_in", enumValues: ["2", "5"] },
    ],
  },
  {
    id: "leaders-near-50ema",
    name: "Leaders Near 50 EMA",
    description: "Trending stocks pulling back near their 50 EMA",
    defaultSort: { field: "perf_1y", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 50 },
      { field: "price", op: "lt", value: 3000 },
      // Lowered floor to match TradingView's "Leaders Near 50 EMA" — TV doesn't
      // apply a 2000cr cap; liquidity gate alone keeps untradeable names out.
      { field: "market_cap", op: "gte", value: 5_000_000_000 },
      { field: "perf_1y", op: "gt", value: 30 },
      { field: "ema50", op: "below_by", refField: "price", value: 0, value2: 5 },
      { field: "ema50", op: "cmp_field", cmpOp: "gt", refField: "ema200" },
      { field: "rel_vol", op: "lt", value: 1 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "near-key-emas",
    name: "Price Near Key EMAs",
    description: "Price hugging EMA 10/20/50 in a stacked uptrend",
    defaultSort: { field: "perf_3m", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 50 },
      { field: "price", op: "lt", value: 3000 },
      { field: "market_cap", op: "gte", value: 5_000_000_000 },
      { field: "ema20", op: "below_by", refField: "price", value: 0, value2: 4 },
      { field: "ema10", op: "cmp_field", cmpOp: "gt", refField: "ema20" },
      { field: "ema20", op: "cmp_field", cmpOp: "gt", refField: "ema50" },
      { field: "ema50", op: "cmp_field", cmpOp: "gt", refField: "ema200" },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "perf-6m",
    name: "6 Months Performers",
    defaultSort: { field: "perf_6m", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "perf_6m", op: "gt", value: 30 },
      { field: "price", op: "between", value: 50, value2: 3000 },
      MIN_LIQUIDITY,
      { field: "volume", op: "gt", value: 100_000 },
      { field: "market_cap", op: "gte", value: 5_000_000_000 },
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "perf-3m",
    name: "3 Months Performers",
    defaultSort: { field: "perf_3m", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "perf_3m", op: "gt", value: 30 },
      { field: "price", op: "between", value: 50, value2: 3000 },
      MIN_LIQUIDITY,
      { field: "volume", op: "gt", value: 100_000 },
      { field: "market_cap", op: "gte", value: 5_000_000_000 },
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "perf-1m",
    name: "1 Month Performers",
    defaultSort: { field: "perf_1m", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "perf_1m", op: "gt", value: 30 },
      { field: "price", op: "between", value: 50, value2: 3000 },
      MIN_LIQUIDITY,
      { field: "volume", op: "gt", value: 100_000 },
      { field: "market_cap", op: "gte", value: 5_000_000_000 },
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "highest-vol-month",
    name: "Highest Volume — Past Month",
    description: "All-time highest daily volume occurred within the last ~20 trading days",
    defaultSort: { field: "max_vol_all_age_days", dir: "asc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 20 },
      { field: "max_vol_all_age_days", op: "lte", value: 20 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "highest-vol-5w",
    name: "Highest Volume — Past 5 Weeks",
    description: "All-time highest daily volume occurred within the last ~25 trading days",
    defaultSort: { field: "max_vol_all_age_days", dir: "asc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 20 },
      { field: "max_vol_all_age_days", op: "lte", value: 25 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "highest-vol-today",
    name: "Highest Volume — Today",
    description: "Today set or tied a new all-time daily volume high",
    defaultSort: { field: "rel_vol", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 20 },
      { field: "max_vol_all_age_days", op: "lte", value: 0 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "relative-strength",
    name: "Relative Strength (>70)",
    description: "IBD-style RS rating (1–99 percentile of blended 3M/6M/1Y return) vs benchmark. Default benchmark: NIFTY 500. Use the benchmark selector above to switch.",
    defaultSort: { field: "rs_rating_n500", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "rs_rating_n500", op: "gt", value: 70 },
      { field: "price", op: "gte", value: 50 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "top-daily",
    name: "Top Daily Movers",
    description: "Liquid stocks up sharply today",
    defaultSort: { field: "perf_1d", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "perf_1d", op: "gt", value: 5 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "bottom-daily",
    name: "Bottom Daily Movers",
    description: "Liquid stocks down sharply today",
    defaultSort: { field: "perf_1d", dir: "asc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "perf_1d", op: "lt", value: -5 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "catalyst-gap",
    name: "Catalyst — Gap & Volume Surge",
    description: "Big up move on heavy volume — likely news/earnings catalyst",
    defaultSort: { field: "perf_1d", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "perf_1d", op: "gt", value: 5 },
      { field: "rel_vol", op: "gt", value: 2 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "catalyst-breakout",
    name: "Catalyst — Breakout to New High",
    description: "Within 2% of 52w high on above-average volume",
    defaultSort: { field: "rel_vol", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "pct_from_52w_high", op: "lt", value: 2 },
      { field: "rel_vol", op: "gt", value: 1.5 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },

  // ── Swing-trader playbooks ──────────────────────────────────────────────
  {
    id: "minervini-trend-template",
    name: "Minervini — Trend Template",
    description: "Stacked EMAs, within 25% of 52w high, 25%+ off 52w low, RS > 70 vs NIFTY 500",
    defaultSort: { field: "rs_rating_n500", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "ema50", op: "cmp_field", cmpOp: "lt", refField: "price" },
      { field: "ema100", op: "cmp_field", cmpOp: "lt", refField: "price" },
      { field: "ema200", op: "cmp_field", cmpOp: "lt", refField: "price" },
      { field: "ema50", op: "cmp_field", cmpOp: "gt", refField: "ema100" },
      { field: "ema100", op: "cmp_field", cmpOp: "gt", refField: "ema200" },
      { field: "pct_from_52w_low", op: "gte", value: 25 },
      { field: "pct_from_52w_high", op: "lte", value: 25 },
      { field: "rs_rating_n500", op: "gte", value: 70 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "minervini-vcp",
    name: "Minervini — VCP (approx)",
    description: "Trend-template gates + volatility contraction near pivot (ADR ≤ 4%, vol dry-up, sideways month)",
    defaultSort: { field: "adr_20", dir: "asc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "ema50", op: "cmp_field", cmpOp: "lt", refField: "price" },
      { field: "ema50", op: "cmp_field", cmpOp: "gt", refField: "ema200" },
      { field: "pct_from_52w_high", op: "lte", value: 15 },
      { field: "adr_20", op: "lte", value: 4 },
      { field: "rel_vol", op: "lte", value: 0.9 },
      { field: "perf_1m", op: "between", value: -10, value2: 15 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "qullamaggie-episodic-pivot",
    name: "Qullamaggie — Episodic Pivot (today)",
    description: "Big up day on heavy volume in a stock with elite RS — the pivot bar",
    defaultSort: { field: "perf_1d", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 20 },
      { field: "perf_1d", op: "gte", value: 8 },
      { field: "rel_vol", op: "gte", value: 3 },
      { field: "rs_rating_n500", op: "gte", value: 90 },
      { field: "ema20", op: "cmp_field", cmpOp: "lt", refField: "price" },
      { field: "ema20", op: "cmp_field", cmpOp: "gt", refField: "ema50" },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "qullamaggie-setup",
    name: "Qullamaggie — Setup (post-pivot tightening)",
    description: "Already ran 50%+ in 3M, now tightening near highs on dry volume — ready to break out",
    defaultSort: { field: "perf_3m", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 20 },
      { field: "perf_3m", op: "gte", value: 50 },
      { field: "adr_20", op: "between", value: 3, value2: 8 },
      { field: "pct_from_52w_high", op: "lte", value: 10 },
      { field: "rel_vol", op: "lte", value: 1 },
      { field: "ema10", op: "cmp_field", cmpOp: "lt", refField: "price" },
      { field: "ema10", op: "cmp_field", cmpOp: "gt", refField: "ema20" },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "stockbee-4pct",
    name: "Stockbee — 4% Breakout",
    description: "Pradeep Bonde's daily momentum scan: up 4%+ on 2x relative volume",
    defaultSort: { field: "rel_vol", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "volume", op: "gte", value: 100_000 },
      { field: "perf_1d", op: "gte", value: 4 },
      { field: "rel_vol", op: "gte", value: 2 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "stockbee-20cr-volume",
    name: "Stockbee — ₹20 Cr Dollar-Volume Breakout",
    description: "Up 4%+ on >1.5x volume with at least ₹20 Cr traded value — the liquid actionable subset",
    defaultSort: { field: "avg_turnover_30d", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "perf_1d", op: "gte", value: 4 },
      { field: "rel_vol", op: "gte", value: 1.5 },
      { field: "liquidity_30d", op: "gte", value: 200_000_000 },
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "stockbee-anticipation",
    name: "Stockbee — Anticipation (tight coil near highs)",
    description: "Low-volatility coil within 8% of 52w high — pre-breakout setup",
    defaultSort: { field: "adr_20", dir: "asc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "adr_20", op: "lte", value: 3.5 },
      { field: "pct_from_52w_high", op: "lte", value: 8 },
      { field: "rel_vol", op: "lte", value: 0.9 },
      { field: "ema20", op: "cmp_field", cmpOp: "lt", refField: "price" },
      { field: "ema20", op: "cmp_field", cmpOp: "gt", refField: "ema50" },
      { field: "ema50", op: "cmp_field", cmpOp: "gt", refField: "ema200" },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "gap-up",
    name: "Gap Up — Daily",
    description: "Inclusive daily gap watch: NSE stocks opening at least 2% above previous close, without market-cap/liquidity gates that can hide fresh reversals.",
    defaultSort: { field: "gap_pct" as any, dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 20 },
      { field: "gap_pct", op: "gte", value: 2 },
      { field: "volume", op: "gte", value: 50_000 },
    ],
    columns: ["ticker", "rs_rating", "price", "change_pct", "gap_pct", "day_low", "volume", "rel_vol", "perf_1w", "perf_1m", "sector"],
  },

  // ── New scanners ────────────────────────────────────────────────────────
  {
    id: "rs-before-price",
    name: "RS Before Price High",
    description: "Elite RS (≥90 vs NIFTY 500) while price is still 5–20% off its 52w high — leaders setting up before the breakout.",
    defaultSort: { field: "rs_rating_n500", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "market_cap", op: "gte", value: 5_000_000_000 },
      { field: "rs_rating_n500", op: "gte", value: 90 },
      { field: "pct_from_52w_high", op: "between", value: 5, value2: 20 },
      { field: "ema50", op: "cmp_field", cmpOp: "gt", refField: "ema200" },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "momentum-burst",
    name: "Momentum Burst",
    description: "Short-term thrust: ≥4% today AND ≥8% this week on ≥2x relative volume with high RS — early momentum ignition.",
    defaultSort: { field: "perf_1w", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "perf_1d", op: "gte", value: 4 },
      { field: "perf_1w", op: "gte", value: 8 },
      { field: "rel_vol", op: "gte", value: 2 },
      { field: "rs_rating_n500", op: "gte", value: 80 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "ipo-recent",
    name: "Recent IPOs (≤ 15 months)",
    description: "NSE listings within the last ~15 months (roughly last year). Requires the volume-max refresh to have populated listing dates.",
    defaultSort: { field: "ipo_age_days" as any, dir: "asc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "ipo_age_days", op: "lte", value: 450 },
      { field: "price", op: "gte", value: 20 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "stockbee-ep",
    name: "Stockbee — Episodic Pivot (EP)",
    description: "Pradeep Bonde's EP: opens ≥4% above prev close, holds the gap by close on ≥3× relative volume, above 50 EMA — the news/catalyst pivot bar.",
    defaultSort: { field: "gap_pct" as any, dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "gap_pct", op: "gte", value: 4 },
      { field: "perf_1d", op: "gte", value: 4 },
      { field: "rel_vol", op: "gte", value: 3 },
      { field: "adr_20", op: "lte", value: 6 },
      { field: "ema50", op: "cmp_field", cmpOp: "lt", refField: "price" },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },

  // ── Weekly counterparts ─────────────────────────────────────────────────
  // Same shape as the daily scanners but keyed off perf_1w so users can
  // slice the market on a weekly cadence. Placed under the "Weekly" group.
  {
    id: "top-weekly",
    name: "Top Weekly Movers",
    description: "Liquid NSE names up sharply this week",
    defaultSort: { field: "perf_1w", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "perf_1w", op: "gt", value: 10 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "bottom-weekly",
    name: "Bottom Weekly Movers",
    description: "Liquid NSE names down sharply this week",
    defaultSort: { field: "perf_1w", dir: "asc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "perf_1w", op: "lt", value: -10 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "catalyst-gap-weekly",
    name: "Catalyst — Weekly Surge & Volume",
    description: "Big weekly move on above-average volume — likely a catalyst-driven week",
    defaultSort: { field: "perf_1w", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "perf_1w", op: "gt", value: 10 },
      { field: "rel_vol", op: "gt", value: 2 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "stockbee-4pct-weekly",
    name: "Stockbee — 10% Weekly Breakout",
    description: "Weekly analogue of the 4% breakout: up 10%+ this week on 1.5x+ relative volume",
    defaultSort: { field: "perf_1w", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "perf_1w", op: "gte", value: 10 },
      { field: "rel_vol", op: "gte", value: 1.5 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "gap-up-weekly",
    name: "Gap Up — Weekly",
    description: "True weekly gap watch: current week opened at least 2% above previous week close, with the stock still holding above the weekly gap-open area.",
    defaultSort: { field: "week_gap_pct" as any, dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 20 },
      { field: "week_gap_pct", op: "gte", value: 2 },
      { field: "price", op: "cmp_field", cmpOp: "gte", refField: "week_low" },
      { field: "volume", op: "gte", value: 50_000 },
    ],
    columns: ["ticker", "rs_rating", "price", "change_pct", "week_gap_pct", "week_open", "week_low", "volume", "rel_vol", "perf_1w", "sector"],
  },

  // ── Advanced playbooks (batch 2) ────────────────────────────────────────
  {
    id: "high-tight-flag",
    name: "High Tight Flag",
    description: "Up 90–120% in the last ~2 months, now consolidating within 25% of the peak — classic HTF setup",
    defaultSort: { field: "perf_3m", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "perf_3m", op: "between", value: 90, value2: 200 },
      { field: "pct_from_52w_high", op: "lte", value: 25 },
      { field: "adr_20", op: "lte", value: 8 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "ema-shakeout-recover",
    name: "EMA Shakeout & Recover",
    description: "Small-body reclaim above 21/50 EMA on above-average volume after a soft dip — failed breakdown proxy",
    defaultSort: { field: "rel_vol", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "perf_1d", op: "between", value: -1, value2: 3 },
      { field: "ema20", op: "cmp_field", cmpOp: "lt", refField: "price" },
      { field: "ema50", op: "cmp_field", cmpOp: "lt", refField: "price" },
      { field: "rel_vol", op: "gte", value: 1.3 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "oversold",
    name: "Oversold (RSI < 30)",
    description: "RSI(14) below 30 — classic oversold read, no bounce required",
    defaultSort: { field: "rsi14", dir: "asc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "rsi14", op: "lt", value: 30 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "oversold-bounce",
    name: "Oversold Bounce (RSI reclaim)",
    description: "RSI(14) below 35 recently, price now reclaiming short-term MA on volume",
    defaultSort: { field: "perf_1d", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "rsi14", op: "between", value: 30, value2: 45 },
      { field: "perf_1d", op: "gte", value: 2 },
      { field: "ema10", op: "cmp_field", cmpOp: "lt", refField: "price" },
      { field: "rel_vol", op: "gte", value: 1.2 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "overbought-parabolic",
    name: "Overbought / Parabolic",
    description: "RSI(14) > 80 and price extended >15% above the 21-EMA — exhaustion watch",
    defaultSort: { field: "rsi14", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "rsi14", op: "gte", value: 80 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "inside-day-vol",
    name: "Inside Day on High Volume (approx)",
    description: "Small-range day (|Perf 1D| ≤ 1%) on ≥ 1.5× relative volume — coiled spring proxy",
    defaultSort: { field: "rel_vol", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "perf_1d", op: "between", value: -1, value2: 1 },
      { field: "rel_vol", op: "gte", value: 1.5 },
      { field: "adr_20", op: "lte", value: 4 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "power-earnings-gap",
    name: "Power Earnings Gap",
    description: "Gap ≥ 5%, closes in top 25% of day's range on ≥ 4× relative volume — likely earnings/news pivot",
    defaultSort: { field: "rel_vol", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "gap_pct", op: "gte", value: 5 },
      { field: "perf_1d", op: "gte", value: 4 },
      { field: "rel_vol", op: "gte", value: 4 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
    columns: ["ticker", "rs_rating", "price", "change_pct", "earnings_release_date", "move_since_earnings_pct", "gap_pct", "day_low", "volume", "rel_vol", "net_profit_qoq", "sales_qoq", "market_cap", "sector"],
  },
  {
    id: "earnings-qoq-growth",
    name: "Earnings — QoQ Growth",
    description: "Net profit up 20%+ QoQ with positive sales growth; thresholds are editable like any filter.",
    defaultSort: { field: "net_profit_qoq", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "net_profit_qoq", op: "gte", value: 20 },
      { field: "sales_qoq", op: "gt", value: 0 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
    columns: ["ticker", "rs_rating", "price", "change_pct", "earnings_release_date", "move_since_earnings_pct", "net_profit_qoq", "sales_qoq", "market_cap", "volume", "rel_vol", "sector"],
  },
  {
    id: "earnings-gap-defended",
    name: "Earnings — Gap Defended",
    description: "Earnings growth plus gap-up ≥5%, volume surge ≥100% above average, and price still above the gap-day low.",
    defaultSort: { field: "rel_vol", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "net_profit_qoq", op: "gte", value: 20 },
      { field: "sales_qoq", op: "gt", value: 0 },
      { field: "gap_pct", op: "gte", value: 5 },
      { field: "rel_vol", op: "gte", value: 2 },
      { field: "price", op: "cmp_field", cmpOp: "gt", refField: "day_low" },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
    columns: ["ticker", "rs_rating", "price", "change_pct", "earnings_release_date", "move_since_earnings_pct", "gap_pct", "day_low", "volume", "rel_vol", "net_profit_qoq", "sales_qoq", "market_cap", "sector"],
  } as Preset,
  {
    id: "earnings-positive-reaction",
    name: "Earnings — Positive Reaction",
    description: "QoQ earnings growth with a positive price reaction and above-average volume; adjust profit, sales, price and volume filters freely.",
    defaultSort: { field: "perf_1d", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "net_profit_qoq", op: "gte", value: 20 },
      { field: "sales_qoq", op: "gt", value: 0 },
      { field: "perf_1d", op: "gt", value: 0 },
      { field: "rel_vol", op: "gte", value: 1.5 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
    columns: ["ticker", "rs_rating", "price", "change_pct", "earnings_release_date", "move_since_earnings_pct", "volume", "rel_vol", "net_profit_qoq", "sales_qoq", "net_profit_yoy", "sales_yoy", "market_cap", "sector"],
  },
  {
    id: "earnings-yoy-growth",
    name: "Earnings — YoY Growth (latest quarter)",
    description: "Latest quarter's net profit up 20%+ vs same quarter last year with positive YoY sales growth. All thresholds are editable.",
    defaultSort: { field: "net_profit_yoy", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "net_profit_yoy", op: "gte", value: 20 },
      { field: "sales_yoy", op: "gt", value: 0 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
    columns: ["ticker", "rs_rating", "price", "change_pct", "earnings_release_date", "move_since_earnings_pct", "net_profit_yoy", "sales_yoy", "net_profit_qoq", "sales_qoq", "market_cap", "volume", "rel_vol", "sector"],
  },
  {
    id: "pocket-pivot",
    name: "Pocket Pivot",
    description: "Up-day on stronger volume than any down-day in prior 10 sessions, above 10/50 EMA",
    defaultSort: { field: "rel_vol", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "perf_1d", op: "gte", value: 1 },
      { field: "rel_vol", op: "gte", value: 1.5 },
      { field: "ema10", op: "cmp_field", cmpOp: "lt", refField: "price" },
      { field: "ema50", op: "cmp_field", cmpOp: "lt", refField: "price" },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "three-weeks-tight",
    name: "3 Weeks Tight",
    description: "Weekly closes within a tight range near 52w highs — quiet consolidation before continuation",
    defaultSort: { field: "adr_20", dir: "asc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "pct_from_52w_high", op: "lte", value: 8 },
      { field: "adr_20", op: "lte", value: 3 },
      { field: "perf_1w", op: "between", value: -3, value2: 3 },
      { field: "perf_1m", op: "between", value: -5, value2: 8 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
  {
    id: "pullback-3m-uptrend",
    name: "Pullback (3M leader, 1W dip)",
    description: "Advanced +50% in the last 3 months and pulled back more than 5% in the last week",
    defaultSort: { field: "perf_3m", dir: "desc" },
    filters: [
      { field: "exchange", op: "eq", enumValue: "NSE" },
      { field: "price", op: "gte", value: 30 },
      { field: "perf_3m", op: "gte", value: 50 },
      { field: "perf_1w", op: "lte", value: -5 },
      MIN_LIQUIDITY,
      EXCLUDE_CIRCUIT,
    ],
  },
];

// Default group assignment for built-in presets. Admins can override the
// group per-preset via `admin_preset_overrides.group_name`.
const DEFAULT_GROUP_MAP: Record<string, string> = {
  // Daily
  "top-daily": "Daily",
  "bottom-daily": "Daily",
  "perf-1d": "Daily",
  "catalyst-gap": "Legacy",
  "gap-up": "Daily",
  "momentum-burst": "Legacy",
  // Weekly
  "perf-1w": "Weekly",
  "top-weekly": "Weekly",
  "bottom-weekly": "Weekly",
  "catalyst-gap-weekly": "Legacy",
  "stockbee-4pct-weekly": "Weekly",
  "gap-up-weekly": "Weekly",
  // Volume
  "highest-vol-today": "Volume",
  "highest-vol-month": "Volume",
  "highest-vol-5w": "Volume",
  // Playbooks
  "leaders-near-50ema": "Playbooks",
  "near-key-emas": "Playbooks",
  "minervini-trend-template": "Playbooks",
  "minervini-vcp": "Playbooks",
  "qullamaggie-setup": "Legacy",
  "stockbee-anticipation": "Playbooks",
  "rs-before-price": "Playbooks",
  "catalyst-breakout": "Legacy",
  "high-tight-flag": "Playbooks",
  "ema-shakeout-recover": "Playbooks",
  "oversold": "Playbooks",
  "oversold-bounce": "Playbooks",
  "overbought-parabolic": "Playbooks",
  "inside-day-vol": "Playbooks",
  "pocket-pivot": "Playbooks",
  "three-weeks-tight": "Playbooks",
  // Earnings
  "power-earnings-gap": "Earnings",
  "earnings-qoq-growth": "Earnings",
  "earnings-gap-defended": "Earnings",
  "earnings-positive-reaction": "Earnings",
  "earnings-yoy-growth": "Earnings",
  // Legacy (redundant with newer custom / Playbook scanners; kept for reference)
  "stockbee-4pct": "Legacy",
  "stockbee-20cr-volume": "Legacy",
  "stockbee-ep": "Legacy",
  "qullamaggie-episodic-pivot": "Legacy",
};

export function defaultGroupFor(presetId: string): string {
  return DEFAULT_GROUP_MAP[presetId] ?? "General";
}

export const FIELD_BY_ID: Record<string, FieldDef> = Object.fromEntries(FIELD_DEFS.map((f) => [f.id, f]));

export function formatBigInr(v: number): string {
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e7) return `${(v / 1e7).toFixed(abs >= 1e9 ? 0 : 2)} Cr`;
  if (abs >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  return v.toLocaleString("en-IN");
}

export function formatBigCount(v: number): string {
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

// Column metadata — shared between the screener table and the admin editor
// so admins can pick which columns to show per scanner (or as a common set).
export type ColKey =
  | "ticker" | "exchange" | "rs_rating" | "price" | "change_pct" | "gap_pct" | "day_low" | "week_open" | "prev_week_close" | "week_gap_pct" | "week_low" | "market_cap" | "volume" | "liquidity" | "rel_vol"
  | "perf_1d" | "perf_1w" | "perf_1m" | "perf_3m" | "perf_6m" | "perf_1y"
  | "ema10" | "ema20" | "ema50" | "ema100" | "ema200" | "rsi14" | "adr_20"
  | "pe_ratio" | "dividend_yield" | "net_profit_qoq" | "sales_qoq" | "net_profit_yoy" | "sales_yoy" | "earnings_release_date" | "days_since_earnings" | "move_since_earnings_pct"
  | "high_52w" | "low_52w" | "ath" | "pct_from_52w_high" | "pct_from_ath" | "band_pct" | "sector";

export const COLUMN_META: { key: ColKey; label: string; group: string }[] = [
  { key: "ticker", label: "Symbol", group: "Identity" },
  { key: "exchange", label: "Exchange", group: "Identity" },
  { key: "sector", label: "Sector", group: "Identity" },
  { key: "rs_rating", label: "RS Rating", group: "Rank" },
  { key: "price", label: "Price", group: "Price" },
  { key: "change_pct", label: "Change %", group: "Price" },
  { key: "gap_pct", label: "Gap %", group: "Price" },
  { key: "day_low", label: "Low of Day", group: "Price" },
  { key: "week_open", label: "Week Open", group: "Price" },
  { key: "prev_week_close", label: "Prev Week Close", group: "Price" },
  { key: "week_gap_pct", label: "Weekly Gap %", group: "Price" },
  { key: "week_low", label: "Low of Week", group: "Price" },
  { key: "market_cap", label: "Market Cap", group: "Market" },
  { key: "volume", label: "Volume", group: "Volume" },
  { key: "liquidity", label: "Price × Vol", group: "Volume" },
  { key: "rel_vol", label: "Rel Vol", group: "Volume" },
  { key: "perf_1d", label: "Perf 1D", group: "Performance" },
  { key: "perf_1w", label: "Perf 1W", group: "Performance" },
  { key: "perf_1m", label: "Perf 1M", group: "Performance" },
  { key: "perf_3m", label: "Perf 3M", group: "Performance" },
  { key: "perf_6m", label: "Perf 6M", group: "Performance" },
  { key: "perf_1y", label: "Perf 1Y", group: "Performance" },
  { key: "ema10", label: "EMA 10", group: "Technicals" },
  { key: "ema20", label: "EMA 20", group: "Technicals" },
  { key: "ema50", label: "EMA 50", group: "Technicals" },
  { key: "ema100", label: "EMA 100", group: "Technicals" },
  { key: "ema200", label: "EMA 200", group: "Technicals" },
  { key: "rsi14", label: "RSI 14", group: "Technicals" },
  { key: "adr_20", label: "ADR % 20", group: "Technicals" },
  { key: "pe_ratio", label: "P/E", group: "Fundamentals" },
  { key: "dividend_yield", label: "Div Yield", group: "Fundamentals" },
  { key: "net_profit_qoq", label: "Net Profit QoQ", group: "Fundamentals" },
  { key: "sales_qoq", label: "Sales QoQ", group: "Fundamentals" },
  { key: "net_profit_yoy", label: "Net Profit YoY", group: "Fundamentals" },
  { key: "sales_yoy", label: "Sales YoY", group: "Fundamentals" },
  { key: "earnings_release_date", label: "Last Earnings", group: "Fundamentals" },
  { key: "days_since_earnings", label: "Days Since Earnings", group: "Fundamentals" },
  { key: "move_since_earnings_pct", label: "% Move Since Earnings", group: "Fundamentals" },
  { key: "high_52w", label: "52W High", group: "52W" },
  { key: "low_52w", label: "52W Low", group: "52W" },
  { key: "ath", label: "All-Time High", group: "52W" },
  { key: "pct_from_52w_high", label: "% from 52W H", group: "52W" },
  { key: "pct_from_ath", label: "% from ATH", group: "52W" },
  { key: "band_pct", label: "Price Band %", group: "Market" },
];

