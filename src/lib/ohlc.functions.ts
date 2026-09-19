import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";
import { isTradingDay } from "@/lib/history/nse-calendar";
import { isIndexSymbol, loadIndexCandles } from "@/lib/markets/index-close.server";
import { BSE_INDEX_YAHOOS } from "@/data/markets-catalog";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adr20?: number | null;
  atr14?: number | null;
}

export interface OhlcResponse {
  symbol: string;
  interval: string;
  range: string;
  candles: Candle[];
  currency?: string;
  exchangeName?: string;
}

// Map our interval codes -> Yahoo interval string + default range
const INTERVAL_MAP: Record<string, { interval: string; defaultRange: string }> = {
  "5": { interval: "5m", defaultRange: "5d" },
  "15": { interval: "15m", defaultRange: "1mo" },
  "30": { interval: "30m", defaultRange: "1mo" },
  "60": { interval: "60m", defaultRange: "3mo" },
  D: { interval: "1d", defaultRange: "1y" },
  W: { interval: "1wk", defaultRange: "5y" },
  M: { interval: "1mo", defaultRange: "max" },
};

const VALID_RANGES = new Set([
  "1d",
  "5d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "10y",
  "ytd",
  "max",
]);

// Per-minute cache buster — Yahoo's edge caches identical URLs, which is why
// users see "previous day" bars long after market close. Changing the URL
// every 60s forces a fresh upstream fetch without spamming Yahoo.
function cacheBuster(): string {
  return String(Math.floor(Date.now() / 60_000));
}

const IST_OFFSET_SECONDS = 5.5 * 60 * 60;
const NSE_OPEN_MINUTE = 9 * 60 + 15;
const NSE_CLOSE_MINUTE = 15 * 60 + 30;
const INTRADAY_INTERVAL_MINUTES: Record<string, number> = {
  "5": 5,
  "15": 15,
  "30": 30,
  "60": 60,
};

function istPartsFromUnix(seconds: number) {
  const d = new Date((seconds + IST_OFFSET_SECONDS) * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

function istDateKeyFromUnix(seconds: number): string {
  const p = istPartsFromUnix(seconds);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function unixFromIstDateTime(year: number, month: number, day: number, hour: number, minute: number): number {
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute) / 1000 - IST_OFFSET_SECONDS);
}

function nseSessionOpenFor(seconds: number): number {
  const p = istPartsFromUnix(seconds);
  return unixFromIstDateTime(p.year, p.month, p.day, 9, 15);
}

function nseSessionCloseFor(seconds: number): number {
  const p = istPartsFromUnix(seconds);
  return unixFromIstDateTime(p.year, p.month, p.day, 15, 30);
}

function normalizedIntradayTime(openTime: number, intervalMinutes: number): number {
  // Yahoo stamps intraday NSE bars at bar-open. Traders usually read the final
  // candle by bar-close, so 15:15 on 15m/30m/60m should show as 15:30.
  return Math.min(openTime + intervalMinutes * 60, nseSessionCloseFor(openTime));
}

// Yahoo rejects symbols with underscores and some punctuation. Our source
// catalog occasionally has entries like `NAM_INDIS.NS` when NSE lists them
// as `NAM-INDIA.NS`, or symbols with stray dots. Build a small set of
// variants and try each one until Yahoo returns data.
function yahooSymbolVariants(symbol: string): string[] {
  const dotIdx = symbol.lastIndexOf(".");
  const hasSuffix = dotIdx > 0 && /^[A-Z]{1,4}$/.test(symbol.slice(dotIdx + 1));
  const stem = hasSuffix ? symbol.slice(0, dotIdx) : symbol;
  const suffix = hasSuffix ? symbol.slice(dotIdx) : "";
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    const full = s + suffix;
    if (!seen.has(full)) { seen.add(full); out.push(full); }
  };
  push(stem);
  if (stem.includes("_")) push(stem.replace(/_/g, "-"));
  // The universe is NSE EQ only, so no REIT (RR) / InvIT (IV) / SME (SM)
  // series suffixes are generated any more — those instruments are not listed.
  if (/[_.,&\s]/.test(stem)) push(stem.replace(/[_.,&\s]+/g, ""));
  const KNOWN: Record<string, string> = {
    NAM_INDIS: "NAM-INDIA",
    NAMINDIS: "NAM-INDIA",
    SML_MAHINDRA: "MMFL",
  };
  if (KNOWN[stem]) push(KNOWN[stem]);
  return out;
}

// Last-resort resolver: ask Yahoo's own search endpoint which listed symbol
// matches this ticker. Cached per worker instance so we only pay once.
const searchCache = new Map<string, string | null>();
async function resolveViaYahooSearch(symbol: string): Promise<string | null> {
  const stem = symbol.replace(/\.(NS|BO)$/i, "").replace(/[.\-_](RR|IV|SM)$/i, "");
  if (searchCache.has(stem)) return searchCache.get(stem) ?? null;
  let resolved: string | null = null;
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(stem)}&quotesCount=8&newsCount=0`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json()) as any;
      const quotes: any[] = json?.quotes ?? [];
      const match = quotes.find(
        (q) =>
          typeof q?.symbol === "string" &&
          /\.NS$/i.test(q.symbol) &&
          q.symbol.replace(/\.NS$/i, "").replace(/-(RR|IV|SM)$/i, "").toUpperCase() === stem.toUpperCase(),
      );
      resolved = match?.symbol ?? null;
    }
  } catch {
    resolved = null;
  }
  searchCache.set(stem, resolved);
  return resolved;
}

async function fetchYahooChart(candidate: string, yInterval: string, range: string): Promise<any> {
  const encoded = encodeURIComponent(candidate);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=${yInterval}&range=${range}&includePrePost=false&_=${cacheBuster()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NSE-MultiView/1.0; +https://lovable.dev)",
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo Finance request failed for ${candidate}: ${res.status}`);
  const json = (await res.json()) as any;
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description || `No data for ${candidate}`);
  return result;
}

// Minimum number of bars we consider a "healthy" response for a given range.
// Yahoo's NSE feed silently returns a handful of bars for some listings
// (DECNGOLD, KPL, FERMENTA, SEIL ...). The BSE mirror of those names used to
// patch the gap; that is gone, because the site carries NSE prices only — the
// rest of the history comes from our own NSE bhavcopy rows via
// `mergeOfficialDailyCandles`.
function expectedMinBars(range: string): number {
  if (/^(1y|2y|5y|10y|max)$/i.test(range)) return 60;
  if (/^6mo$/i.test(range)) return 40;
  if (/^3mo$/i.test(range)) return 20;
  return 0;
}

async function fetchYahooResult(symbol: string, yInterval: string, range: string): Promise<any> {
  const variants = yahooSymbolVariants(symbol);
  const minBars = expectedMinBars(range);
  let lastErr: unknown = null;
  let best: any = null;
  let bestBars = -1;

  const tryOne = async (candidate: string): Promise<any | null> => {
    try {
      const res = await fetchYahooChart(candidate, yInterval, range);
      const bars = (res?.timestamp ?? []).length as number;
      if (bars > bestBars) {
        best = res;
        bestBars = bars;
      }
      return bars >= minBars ? res : null;
    } catch (e) {
      lastErr = e;
      return null;
    }
  };

  for (const candidate of variants) {
    const ok = await tryOne(candidate);
    if (ok) return ok;
  }
  const resolved = await resolveViaYahooSearch(symbol);
  if (resolved && !variants.includes(resolved)) {
    const ok = await tryOne(resolved);
    if (ok) return ok;
  }
  if (best) return best;
  throw lastErr instanceof Error ? lastErr : new Error(`No Yahoo data for ${symbol}`);
}



function parseYahooCandles(result: any, intervalCode: string): Candle[] {
  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens: (number | null)[] = quote.open ?? [];
  const highs: (number | null)[] = quote.high ?? [];
  const lows: (number | null)[] = quote.low ?? [];
  const closes: (number | null)[] = quote.close ?? [];
  const volumes: (number | null)[] = quote.volume ?? [];
  const intervalMinutes = INTRADAY_INTERVAL_MINUTES[intervalCode];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i],
      h = highs[i],
      l = lows[i],
      c = closes[i];
    if (o == null || h == null || l == null || c == null) continue;

    const time = intervalMinutes ? normalizedIntradayTime(timestamps[i], intervalMinutes) : timestamps[i];
    const candle: Candle = {
      time,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: volumes[i] ?? 0,
    };

    const prev = candles[candles.length - 1];
    if (prev?.time === candle.time) {
      prev.high = Math.max(prev.high, candle.high);
      prev.low = Math.min(prev.low, candle.low);
      prev.close = candle.close;
      prev.volume += candle.volume;
    } else {
      candles.push(candle);
    }
  }
  return candles;
}

/** True when two stored rows describe the identical bar. */
function isSameBar(a: any, b: any): boolean {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return (
    n(a.open) === n(b.open) &&
    n(a.high) === n(b.high) &&
    n(a.low) === n(b.low) &&
    n(a.close) === n(b.close) &&
    n(a.volume) === n(b.volume)
  );
}

async function mergeOfficialDailyCandles(supabase: any, symbol: string, candles: Candle[]): Promise<Candle[]> {
  // Only patch the most recent sessions. Yahoo history is split/bonus adjusted
  // while the official NSE file is raw, so merging deep history would create
  // artificial gaps on the chart. The recent tail is what can be stale.
  const ticker = symbol.replace(/\.(NS|BO)$/i, "").trim().toUpperCase();
  const { data, error } = await supabase
    .from("daily_prices")
    .select("trade_date,open,high,low,close,volume")
    .eq("symbol", ticker)
    .order("trade_date", { ascending: false })
    .limit(5);
  if (error || !data?.length || !candles.length) return candles;

  // Guard against unadjusted-vs-adjusted mismatches: if the official close is
  // wildly different from the Yahoo close for the same day, keep Yahoo.
  const byDate = new Map(candles.map((c) => [istDateKeyFromUnix(c.time), c]));
  const merged = new Map(byDate);
  const oldestYahooKey = istDateKeyFromUnix(candles[0].time);

  const stored = [...data].reverse();
  for (let i = 0; i < stored.length; i++) {
    const row = stored[i];
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    if (![open, high, low, close].every(Number.isFinite) || close <= 0) continue;
    const key = String(row.trade_date);
    if (key < oldestYahooKey) continue;
    // A row stamped with a date NSE never traded is a phantom: the archive answers
    // a holiday with the previous session's file, and an earlier build of the
    // ingest stamped that copy with the holiday's own date. Require the row to
    // really be a copy of the previous session before hiding it, so a stale entry
    // in NSE_HOLIDAYS can never hide a genuine candle either.
    if (!isTradingDay(key) && i > 0 && isSameBar(stored[i - 1], row)) continue;
    const [year, month, day] = key.split("-").map(Number);
    if (!year || !month || !day) continue;
    const existing = byDate.get(key);
    if (existing && Math.abs(existing.close - close) / close > 0.2) continue;
    merged.set(key, {
      time: unixFromIstDateTime(year, month, day, 9, 15),
      open,
      high,
      low,
      close,
      volume: Number(row.volume) || existing?.volume || 0,
    });
  }
  return [...merged.values()].sort((a, b) => a.time - b.time);
}


async function fetchLatestCompleteIntradayDaily(symbol: string): Promise<Candle | null> {
  try {
    const result = await fetchYahooResult(symbol, "5m", "5d");
    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens: (number | null)[] = quote.open ?? [];
    const highs: (number | null)[] = quote.high ?? [];
    const lows: (number | null)[] = quote.low ?? [];
    const closes: (number | null)[] = quote.close ?? [];
    const volumes: (number | null)[] = quote.volume ?? [];
    const sessions = new Map<string, Candle & { maxMinuteOfDay: number }>();

    for (let i = 0; i < timestamps.length; i++) {
      const o = opens[i],
        h = highs[i],
        l = lows[i],
        c = closes[i];
      if (o == null || h == null || l == null || c == null) continue;
      const p = istPartsFromUnix(timestamps[i]);
      if (p.minuteOfDay < NSE_OPEN_MINUTE || p.minuteOfDay > NSE_CLOSE_MINUTE) continue;
      const key = istDateKeyFromUnix(timestamps[i]);
      const existing = sessions.get(key);
      if (!existing) {
        sessions.set(key, {
          time: nseSessionOpenFor(timestamps[i]),
          open: o,
          high: h,
          low: l,
          close: c,
          volume: volumes[i] ?? 0,
          maxMinuteOfDay: p.minuteOfDay,
        });
      } else {
        existing.high = Math.max(existing.high, h);
        existing.low = Math.min(existing.low, l);
        existing.close = c;
        existing.volume += volumes[i] ?? 0;
        existing.maxMinuteOfDay = Math.max(existing.maxMinuteOfDay, p.minuteOfDay);
      }
    }

    const latest = [...sessions.entries()]
      .filter(([, candle]) => candle.maxMinuteOfDay >= NSE_CLOSE_MINUTE - 5)
      .sort(([a], [b]) => a.localeCompare(b))
      .at(-1)?.[1];

    if (!latest) return null;
    const { maxMinuteOfDay: _maxMinuteOfDay, ...candle } = latest;
    return candle;
  } catch {
    return null;
  }
}

async function refreshDailyWithIntradayClose(symbol: string, candles: Candle[]): Promise<Candle[]> {
  const intradayDaily = await fetchLatestCompleteIntradayDaily(symbol);
  if (!intradayDaily) return candles;

  const next = [...candles];
  const latestDaily = next[next.length - 1];
  if (!latestDaily) return [intradayDaily];

  const latestDailyKey = istDateKeyFromUnix(latestDaily.time);
  const intradayKey = istDateKeyFromUnix(intradayDaily.time);
  const cmp = intradayKey.localeCompare(latestDailyKey);
  if (cmp > 0) next.push(intradayDaily);
  if (cmp === 0) next[next.length - 1] = intradayDaily;
  return next;
}

async function fetchLatestAdr20(symbol: string): Promise<number | null> {
  try {
    const result = await fetchYahooResult(symbol, "1d", "1mo");
    const quote = result.indicators?.quote?.[0] ?? {};
    const highs: (number | null)[] = quote.high ?? [];
    const lows: (number | null)[] = quote.low ?? [];
    const closes: (number | null)[] = quote.close ?? [];
    const ranges: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      const h = highs[i], l = lows[i], c = closes[i];
      if (h == null || l == null || c == null || c <= 0) continue;
      ranges.push(((h - l) / c) * 100);
    }
    const last20 = ranges.slice(-20);
    return last20.length ? last20.reduce((sum, v) => sum + v, 0) / last20.length : null;
  } catch {
    return null;
  }
}

/** Wilder's 14-period ATR on the returned series (same timeframe as the candles). */
function applyAtr14(candles: Candle[], period = 14): void {
  let prevClose: number | null = null;
  let atr: number | null = null;
  const seed: number[] = [];
  for (const c of candles) {
    const tr =
      prevClose == null
        ? c.high - c.low
        : Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    prevClose = c.close;
    if (atr == null) {
      seed.push(tr);
      if (seed.length === period) atr = seed.reduce((a, b) => a + b, 0) / period;
    } else {
      atr = (atr * (period - 1) + tr) / period;
    }
    c.atr14 = atr;
  }
}

export const getOhlc = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: { symbol: string; interval: string; range?: string }) => {
    if (!data?.symbol || typeof data.symbol !== "string") {
      throw new Error("symbol is required");
    }
    // NSE-only: refuse a BSE-listed stock outright. Only the curated BSE indices
    // (BSE 100/500) may carry a ".BO" id, so no caller — chart URL, watchlist,
    // mini chart, screener view — can render BSE exchange prices.
    const requested = data.symbol.trim().toUpperCase();
    if (requested.endsWith(".BO") && !BSE_INDEX_YAHOOS.has(requested)) {
      throw new Error(`${requested} is a BSE listing — this site carries NSE equities only`);
    }
    if (!data?.interval || !INTERVAL_MAP[data.interval]) {
      throw new Error(`unsupported interval: ${data.interval}`);
    }
    if (data.range && !VALID_RANGES.has(data.range)) {
      throw new Error(`unsupported range: ${data.range}`);
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<OhlcResponse> => {
    const map = INTERVAL_MAP[data.interval];
    const yInterval = map.interval;
    const range = data.range ?? map.defaultRange;

    // NSE indices Yahoo does not carry (Nifty Healthcare, Nifty Oil & Gas,
    // NIFTY50 Equal Weight, Smallcap 100, Microcap 250 …) are served from
    // `index_prices`, which is filled from NSE's daily index-close archive.
    // Anything stored wins; Yahoo is the fallback for indices it does have.
    let candles: Candle[] = [];
    let fromArchive = false;
    if (
      isIndexSymbol(data.symbol) &&
      (data.interval === "D" || data.interval === "W" || data.interval === "M")
    ) {
      const stored = await loadIndexCandles(context.supabase, data.symbol, range, data.interval);
      if (stored.length >= 5) {
        candles = stored;
        fromArchive = true;
      }
    }

    let result: any = null;
    if (!fromArchive) {
      result = await fetchYahooResult(data.symbol, yInterval, range);
      candles = parseYahooCandles(result, data.interval);

      if (data.interval === "D") {
        candles = await refreshDailyWithIntradayClose(data.symbol, candles);
        candles = await mergeOfficialDailyCandles(context.supabase, data.symbol, candles);
      }
    }

    const dailyRanges = yInterval === "1d"
      ? candles.filter((c) => c.close > 0).map((c) => ((c.high - c.low) / c.close) * 100).slice(-20)
      : [];
    const latestAdr20 = dailyRanges.length >= 20
      ? dailyRanges.reduce((sum, v) => sum + v, 0) / dailyRanges.length
      : fromArchive
        ? null
        : await fetchLatestAdr20(data.symbol);
    for (const candle of candles) candle.adr20 = latestAdr20;
    applyAtr14(candles);

    return {
      symbol: data.symbol,
      interval: data.interval,
      range,
      candles,
      currency: result?.meta?.currency ?? (fromArchive ? "INR" : undefined),
      exchangeName: result?.meta?.exchangeName ?? (fromArchive ? "NSE" : undefined),
    };
  });
