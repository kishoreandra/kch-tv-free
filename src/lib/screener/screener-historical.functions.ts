// Historical screener: recomputes snapshot metrics from Yahoo daily OHLC
// for a chosen past date (or date range) and runs the same filter evaluator.
//
// Trade-off vs live: only price-derived fields are reconstructed. Fundamentals
// (market_cap, PE, dividend), RS ratings, and vol-history buckets are NOT
// backfilled — filters on those fields are dropped for historical runs.

import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";
import { evaluateFilters, type Filter, type SnapshotRow } from "./filters";

// Fields we can NOT reconstruct historically from OHLC. Filters on these are
// dropped when a historical run is requested (with a warning surfaced in UI).
export const HISTORICAL_UNSUPPORTED_FIELDS = new Set<string>([
  "market_cap", "pe_ratio", "dividend_yield", "net_profit_qoq", "sales_qoq", "net_profit_yoy", "sales_yoy", "earnings_release_date", "days_since_earnings", "move_since_earnings_pct",
  "rs_rating", "rs_rating_n50", "rs_rating_n100", "rs_rating_n200", "rs_rating_n500",
  "max_vol_all", "max_vol_252d", "max_vol_63d", "max_vol_all_age_days",
  "ipo_age_days",
]);

// Cap the universe to keep Yahoo happy and interactive latency reasonable.
const HISTORICAL_UNIVERSE_CAP = 800;

interface UniverseSymbol {
  symbol: string;
  ticker: string;
  name: string | null;
  sector: string | null;
  exchange: string;
  first_trade_date: string | null;
}

// Module-level cache: symbol → { fetchedAt, candles } for 30 min. Keeps
// repeat scans (adjusting date, switching filters) near-instant.
const CANDLE_CACHE_MS = 30 * 60_000;
const candleCache = new Map<string, { at: number; candles: HistCandle[] }>();

interface HistCandle {
  time: number; // unix seconds
  date: string; // YYYY-MM-DD (IST session)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const IST_OFFSET_SECONDS = 5.5 * 60 * 60;
function istDateKey(seconds: number): string {
  const d = new Date((seconds + IST_OFFSET_SECONDS) * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchDailyHistory(symbol: string): Promise<HistCandle[]> {
  const cached = candleCache.get(symbol);
  if (cached && Date.now() - cached.at < CANDLE_CACHE_MS) return cached.candles;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&includePrePost=false`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NSE-MultiView/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const ts: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const opens: (number | null)[] = q.open ?? [];
    const highs: (number | null)[] = q.high ?? [];
    const lows: (number | null)[] = q.low ?? [];
    const closes: (number | null)[] = q.close ?? [];
    const vols: (number | null)[] = q.volume ?? [];
    const candles: HistCandle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({
        time: ts[i],
        date: istDateKey(ts[i]),
        open: o,
        high: h,
        low: l,
        close: c,
        volume: vols[i] ?? 0,
      });
    }
    candleCache.set(symbol, { at: Date.now(), candles });
    return candles;
  } catch {
    return [];
  }
}

// EMA helper — computes value at the final index of the slice.
function emaAt(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

// Wilder-smoothed RSI(14) at the final index.
function rsiAt(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

function findIndexOnOrBefore(candles: HistCandle[], targetDate: string): number {
  // candles are chronological. binary-search would be marginal; linear is fine.
  let idx = -1;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].date <= targetDate) idx = i; else break;
  }
  return idx;
}

function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function reconstructRow(
  meta: UniverseSymbol,
  candles: HistCandle[],
  targetDate: string,
): SnapshotRow | null {
  const idx = findIndexOnOrBefore(candles, targetDate);
  if (idx < 1) return null; // need prev close
  const cur = candles[idx];
  const prev = candles[idx - 1];
  const curWeek = weekKey(cur.date);
  let weekStartIdx = idx;
  while (weekStartIdx > 0 && weekKey(candles[weekStartIdx - 1].date) === curWeek) weekStartIdx -= 1;
  const weekOpen = candles[weekStartIdx]?.open ?? null;
  const weekLows = candles.slice(weekStartIdx, idx + 1).map((c) => c.low);
  const weekLow = weekLows.length ? Math.min(...weekLows) : null;
  const prevWeekClose = weekStartIdx > 0 ? candles[weekStartIdx - 1].close : null;
  const weekGapPct = weekOpen != null && prevWeekClose != null && prevWeekClose > 0
    ? ((weekOpen - prevWeekClose) / prevWeekClose) * 100
    : null;
  const closes = candles.slice(0, idx + 1).map((c) => c.close);
  const highs = candles.slice(Math.max(0, idx - 251), idx + 1).map((c) => c.high);
  const lows = candles.slice(Math.max(0, idx - 251), idx + 1).map((c) => c.low);
  const high_52w = highs.length ? Math.max(...highs) : null;
  const low_52w = lows.length ? Math.min(...lows) : null;
  const ath = candles.slice(0, idx + 1).reduce((m, c) => Math.max(m, c.high), 0) || null;
  const change_pct = prev.close > 0 ? ((cur.close - prev.close) / prev.close) * 100 : null;

  const vol10 = candles.slice(Math.max(0, idx - 9), idx + 1).map((c) => c.volume);
  const vol30 = candles.slice(Math.max(0, idx - 29), idx + 1).map((c) => c.volume);
  const avg_vol_10d = vol10.length ? vol10.reduce((a, b) => a + b, 0) / vol10.length : null;
  const avg_vol_30d = vol30.length ? vol30.reduce((a, b) => a + b, 0) / vol30.length : null;
  const rel_vol = avg_vol_10d && avg_vol_10d > 0 ? cur.volume / avg_vol_10d : null;
  const liquidity = avg_vol_10d ? avg_vol_10d * cur.close : null;
  const sessions30 = candles.slice(Math.max(0, idx - 29), idx + 1);
  const avg_price_30d = sessions30.length
    ? sessions30.reduce((sum, candle) => sum + candle.close, 0) / sessions30.length
    : null;
  const avg_turnover_30d = avg_price_30d != null && avg_vol_30d != null
    ? avg_price_30d * avg_vol_30d
    : null;

  const adrRanges = candles.slice(Math.max(0, idx - 19), idx + 1)
    .filter((c) => c.close > 0)
    .map((c) => ((c.high - c.low) / c.close) * 100);
  const adr_20 = adrRanges.length >= 10 ? adrRanges.reduce((a, b) => a + b, 0) / adrRanges.length : null;

  const perfFrom = (offset: number): number | null => {
    if (idx - offset < 0) return null;
    const past = candles[idx - offset].close;
    return past > 0 ? ((cur.close - past) / past) * 100 : null;
  };

  const yearStart = `${cur.date.slice(0, 4)}-01-01`;
  const ytdIdx = candles.findIndex((c) => c.date >= yearStart);
  const perf_ytd = ytdIdx >= 0 && candles[ytdIdx].close > 0
    ? ((cur.close - candles[ytdIdx].close) / candles[ytdIdx].close) * 100
    : null;

  return {
    symbol: meta.symbol,
    ticker: meta.ticker,
    name: meta.name,
    sector: meta.sector,
    exchange: meta.exchange,
    price: cur.close,
    prev_close: prev.close,
    change_pct,
    volume: cur.volume,
    avg_vol_10d,
    avg_vol_30d,
    rel_vol,
    liquidity,
    avg_price_30d,
    avg_turnover_30d,
    market_cap: null,
    pe_ratio: null,
    dividend_yield: null,
    ema10: emaAt(closes, 10),
    ema20: emaAt(closes, 20),
    ema50: emaAt(closes, 50),
    ema100: emaAt(closes, 100),
    ema200: emaAt(closes, 200),
    rsi14: rsiAt(closes, 14),
    adr_20,
    perf_1d: change_pct,
    perf_1w: perfFrom(5),
    perf_1m: perfFrom(21),
    perf_3m: perfFrom(63),
    perf_6m: perfFrom(126),
    perf_1y: perfFrom(252),
    perf_ytd,
    high_52w,
    low_52w,
    ath,
    pct_from_52w_high: high_52w && high_52w > 0 ? Math.max(0, ((high_52w - cur.close) / high_52w) * 100) : null,
    pct_from_52w_low: low_52w && low_52w > 0 ? Math.max(0, ((cur.close - low_52w) / low_52w) * 100) : null,
    day_low: cur.low,
    week_open: weekOpen,
    prev_week_close: prevWeekClose,
    week_gap_pct: weekGapPct,
    week_low: weekLow,
    net_profit_qoq: null,
    sales_qoq: null,
    net_profit_yoy: null,
    sales_yoy: null,
    earnings_release_date: null,
    earnings_release_price: null,
    max_vol_all: null,
    max_vol_252d: null,
    max_vol_63d: null,
    rs_rating: null,
    rs_rating_n50: null,
    rs_rating_n100: null,
    rs_rating_n200: null,
    rs_rating_n500: null,
    max_vol_all_age_days: null,
    open: cur.open,
    first_trade_date: meta.first_trade_date,
    updated_at: `${targetDate}T00:00:00Z`,
  };
}

async function runInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const results = await Promise.all(chunk.map(fn));
    out.push(...results);
  }
  return out;
}

export interface HistoricalScreenerInput {
  filters: Filter[];
  mode: "single" | "range";
  date?: string;     // YYYY-MM-DD, required for single
  startDate?: string; // YYYY-MM-DD, required for range
  endDate?: string;   // YYYY-MM-DD, required for range
  universeCap?: number;
  limit?: number;
}

export interface HistoricalScreenerRow extends SnapshotRow {
  matched_days?: number;
  last_matched_date?: string;
}

export const runScreenerHistorical = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: HistoricalScreenerInput) => {
    if (!data || !Array.isArray(data.filters)) throw new Error("filters[] required");
    if (data.mode !== "single" && data.mode !== "range") throw new Error("mode must be 'single' or 'range'");
    if (data.mode === "single" && !data.date) throw new Error("date required for single mode");
    if (data.mode === "range" && (!data.startDate || !data.endDate)) throw new Error("startDate + endDate required for range mode");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Build universe from current snapshot, sorted by liquidity desc.
    const { data: universe, error: uErr } = await supabase
      .from("stock_snapshot")
      .select("symbol,ticker,name,sector,exchange,first_trade_date,liquidity")
      .order("liquidity", { ascending: false, nullsFirst: false })
      .limit(Math.min(data.universeCap ?? HISTORICAL_UNIVERSE_CAP, HISTORICAL_UNIVERSE_CAP));
    if (uErr) throw new Error(uErr.message);
    const symbols: UniverseSymbol[] = (universe ?? []).map((r: any) => ({
      symbol: String(r.symbol),
      ticker: String(r.ticker ?? r.symbol),
      name: r.name ?? null,
      sector: r.sector ?? null,
      exchange: String(r.exchange ?? "NSE"),
      first_trade_date: r.first_trade_date ?? null,
    }));

    // Skip filters we can't reconstruct.
    const usableFilters = data.filters.filter((f) => !HISTORICAL_UNSUPPORTED_FIELDS.has(f.field));
    const droppedFilters = data.filters.filter((f) => HISTORICAL_UNSUPPORTED_FIELDS.has(f.field)).map((f) => f.field);

    // Fetch all candles in parallel batches.
    type Fetched = { meta: UniverseSymbol; candles: HistCandle[] };
    const fetched = await runInBatches<UniverseSymbol, Fetched>(symbols, 25, async (meta) => {
      const candles = await fetchDailyHistory(meta.symbol);
      return { meta, candles };
    });

    if (data.mode === "single") {
      const target = data.date!;
      const rows: SnapshotRow[] = [];
      for (const { meta, candles } of fetched) {
        if (candles.length === 0) continue;
        const row = reconstructRow(meta, candles, target);
        if (row) rows.push(row);
      }
      const matched = evaluateFilters(rows, usableFilters);
      const limit = Math.min(data.limit ?? 3000, 3000);
      return {
        total: rows.length,
        matchCount: matched.length,
        rows: matched.slice(0, limit),
        droppedFilters,
        historicalMode: "single" as const,
        effectiveDate: target,
      };
    }

    // Range mode: iterate every trading day; aggregate.
    const start = data.startDate!;
    const end = data.endDate!;
    const perSymbol = new Map<string, { row: SnapshotRow; matchedDays: number; lastMatchedDate: string }>();
    for (const { meta, candles } of fetched) {
      if (candles.length === 0) continue;
      const daysInRange = candles.filter((c) => c.date >= start && c.date <= end).map((c) => c.date);
      for (const day of daysInRange) {
        const row = reconstructRow(meta, candles, day);
        if (!row) continue;
        const [matched] = evaluateFilters([row], usableFilters);
        if (!matched) continue;
        const existing = perSymbol.get(meta.symbol);
        if (!existing) {
          perSymbol.set(meta.symbol, { row, matchedDays: 1, lastMatchedDate: day });
        } else {
          existing.matchedDays += 1;
          existing.lastMatchedDate = day;
          existing.row = row; // latest matching day's snapshot
        }
      }
    }
    const rows: HistoricalScreenerRow[] = [...perSymbol.values()].map(({ row, matchedDays, lastMatchedDate }) => ({
      ...row,
      matched_days: matchedDays,
      last_matched_date: lastMatchedDate,
    }));
    rows.sort((a, b) => (b.matched_days ?? 0) - (a.matched_days ?? 0));
    const limit = Math.min(data.limit ?? 3000, 3000);
    return {
      total: symbols.length,
      matchCount: rows.length,
      rows: rows.slice(0, limit),
      droppedFilters,
      historicalMode: "range" as const,
      effectiveDate: `${start} → ${end}`,
    };
  });
