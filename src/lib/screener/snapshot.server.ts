// Server-only helpers for refreshing the stock_snapshot table.
// Fetches Yahoo Finance daily candles and computes technical + price metrics.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { NSE_SYMBOLS } from "@/data/nse-symbols";
import { EQ_TICKERS, isEqSymbol } from "@/lib/eq-universe.server";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SnapshotRow {
  symbol: string;          // Yahoo symbol (PK)
  ticker: string;          // Display ticker
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
  liquidity: number | null;        // price * avg_vol_10d
  avg_price_30d: number | null;    // 30-day simple moving average of close
  avg_turnover_30d: number | null; // avg close 30d × avg volume 30d
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
  open: number | null;
  rs_rating: number | null;

  rs_score_raw?: number | null;
  rs_rating_n50?: number | null;
  rs_rating_n100?: number | null;
  rs_rating_n200?: number | null;
  rs_rating_n500?: number | null;
  first_trade_date?: string | null;
  updated_at: string;
}

// ---------- Indicator math ----------

function emaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length === 0) return out;
  const k = 2 / (period + 1);

  // Short history (recent IPOs / new listings): there aren't `period` bars yet,
  // but charting platforms still plot a value by running the EMA over all the
  // bars available. Without this, new listings get a NULL EMA and silently drop
  // out of every "price above 200 EMA" scan.
  if (closes.length < period) {
    if (closes.length < 5) return out;
    let ema = closes[0];
    out[0] = ema;
    for (let i = 1; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
      out[i] = ema;
    }
    return out;
  }

  // seed with SMA of first `period` values
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  let ema = sum / period;
  out[period - 1] = ema;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}


function rsi14(closes: number[]): number | null {
  const period = 14;
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) avgGain += ch; else avgLoss -= ch;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function perfPct(closes: number[], lookback: number): number | null {
  if (closes.length < lookback + 1) return null;
  const last = closes[closes.length - 1];
  const ref = closes[closes.length - 1 - lookback];
  if (!ref) return null;
  return ((last - ref) / ref) * 100;
}

// ---------- Yahoo fetchers ----------

interface ChartPayload {
  closes: number[];
  volumes: number[];
  timestamps: number[];
  meta: any;
}

async function fetchChart(yahoo: string): Promise<ChartPayload | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}` +
    `?interval=1d&range=1y&includePrePost=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const r = json?.chart?.result?.[0];
    if (!r) return null;
    const closesRaw: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
    const volsRaw: (number | null)[] = r.indicators?.quote?.[0]?.volume ?? [];
    const tsRaw: number[] = r.timestamp ?? [];
    const closes: number[] = [];
    const volumes: number[] = [];
    const timestamps: number[] = [];
    for (let i = 0; i < closesRaw.length; i++) {
      const c = closesRaw[i];
      if (typeof c !== "number") continue;
      closes.push(c);
      volumes.push(typeof volsRaw[i] === "number" ? (volsRaw[i] as number) : 0);
      timestamps.push(tsRaw[i] ?? 0);
    }
    return { closes, volumes, timestamps, meta: r.meta ?? {} };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface QuoteSummary {
  marketCap: number | null;
  trailingPE: number | null;
  dividendYield: number | null;
  sector: string | null;
}

const TV_COLUMNS = [
  "name",
  "description",
  "exchange",
  "close",
  "change",
  "volume",
  "average_volume_10d_calc",
  "average_volume_30d_calc",
  "relative_volume_10d_calc",
  "market_cap_basic",
  "price_earnings_ttm",
  "dividends_yield_current",
  "EMA20",
  "EMA50",
  "EMA200",
  "RSI",
  "Perf.1M",
  "Perf.3M",
  "Perf.6M",
  "Perf.Y",
  "Perf.YTD",
  "price_52_week_high",
  "price_52_week_low",
  "sector",
  // Extras
  "EMA10",
  "EMA100",
  "Perf.W",
  "High.All",
  "ADR",
  "open",
  "low",
  "net_income_qoq_growth_fq",
  "total_revenue_qoq_growth_fq",
  "net_income_yoy_growth_fq",
  "total_revenue_yoy_growth_fq",
  "earnings_release_date",
  "open|1W",
  "low|1W",
  "SMA30",
] as const;


const asNum = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
const asInt = (v: unknown): number | null => {
  const n = asNum(v);
  return n == null ? null : Math.round(n);
};

async function fetchTradingViewSlice(offset: number, limit: number): Promise<{ rows: SnapshotRow[]; total: number } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch("https://scanner.tradingview.com/india/scan", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        filter: [{ left: "exchange", operation: "in_range", right: ["NSE", "BSE"] }],
        options: { lang: "en" },
        markets: ["india"],
        symbols: { query: { types: ["stock"] }, tickers: [] },
        columns: TV_COLUMNS,
        sort: { sortBy: "market_cap_basic", sortOrder: "desc" },
        range: [offset, offset + limit],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const rows: SnapshotRow[] = (json?.data ?? []).map((item: any) => {
      const d = item?.d ?? [];
      const price = asNum(d[3]);
      const avg10 = asInt(d[6]);
      const high52 = asNum(d[21]);
      const low52 = asNum(d[22]);
      const perfW = asNum(d[26]);
      const weekOpen = asNum(d[36]);
      const prevWeekClose = price != null && perfW != null ? price / (1 + perfW / 100) : null;
      const ticker = String(d[0] ?? item?.s?.replace(/^(NSE|BSE):/, "") ?? "");
      const exch = typeof d[2] === "string" ? d[2] : (String(item?.s ?? "").startsWith("BSE:") ? "BSE" : "NSE");
      return {
        symbol: `${ticker}.${exch === "BSE" ? "BO" : "NS"}`,
        ticker,
        name: typeof d[1] === "string" ? d[1] : ticker,
        sector: typeof d[23] === "string" ? d[23] : null,
        exchange: exch,
        price,
        prev_close: price != null && asNum(d[4]) != null ? price / (1 + (asNum(d[4]) ?? 0) / 100) : null,
        change_pct: asNum(d[4]),
        volume: asInt(d[5]),
        avg_vol_10d: avg10,
        avg_vol_30d: asInt(d[7]),
        rel_vol: asNum(d[8]),
        liquidity: price != null && avg10 != null ? price * avg10 : null,
        avg_price_30d: asNum(d[38]),
        avg_turnover_30d: (() => {
          const sma30 = asNum(d[38]);
          const v30 = asInt(d[7]);
          if (v30 == null) return null;
          // Average daily traded value over 30 sessions: avg price x avg volume.
          return (sma30 ?? price ?? 0) * v30 || null;
        })(),
        market_cap: asNum(d[9]),
        pe_ratio: asNum(d[10]),
        dividend_yield: asNum(d[11]),
        ema20: asNum(d[12]),
        ema50: asNum(d[13]),
        ema200: asNum(d[14]),
        rsi14: asNum(d[15]),
        perf_1m: asNum(d[16]),
        perf_3m: asNum(d[17]),
        perf_6m: asNum(d[18]),
        perf_1y: asNum(d[19]),
        perf_ytd: asNum(d[20]),
        high_52w: high52,
        low_52w: low52,
        pct_from_52w_high: price != null && high52 ? Math.max(0, ((high52 - price) / high52) * 100) : null,
        pct_from_52w_low: price != null && low52 ? Math.max(0, ((price - low52) / low52) * 100) : null,
        ema10: asNum(d[24]),
        ema100: asNum(d[25]),
        perf_1w: perfW,
        ath: asNum(d[27]),
        // TradingView "ADR" is absolute average daily range. Convert to %.
        adr_20: (() => {
          const a = asNum(d[28]);
          return a != null && price != null && price > 0 ? (a / price) * 100 : null;
        })(),
        perf_1d: asNum(d[4]),
        open: asNum(d[29]),
        day_low: asNum(d[30]),
        week_open: weekOpen,
        prev_week_close: prevWeekClose,
        week_gap_pct: weekOpen != null && prevWeekClose != null && prevWeekClose > 0 ? ((weekOpen - prevWeekClose) / prevWeekClose) * 100 : null,
        week_low: asNum(d[37]),
        net_profit_qoq: asNum(d[31]),
        sales_qoq: asNum(d[32]),
        net_profit_yoy: asNum(d[33]),
        sales_yoy: asNum(d[34]),
        earnings_release_date: (() => {
          const t = asNum(d[35]);
          return t != null ? new Date(t * 1000).toISOString() : null;
        })(),
        earnings_release_price: null,
        rs_rating: null,

        rs_score_raw: null,
        rs_rating_n50: null,
        rs_rating_n100: null,
        rs_rating_n200: null,
        rs_rating_n500: null,
        updated_at: new Date().toISOString(),
      };
    }).filter((row: SnapshotRow) => row.ticker && row.price != null);
    return { rows, total: Number(json?.totalCount ?? rows.length) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}


async function fetchQuoteSummary(yahoo: string): Promise<QuoteSummary> {
  const url =
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahoo)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return { marketCap: null, trailingPE: null, dividendYield: null, sector: null };
    const json = (await res.json()) as any;
    const r = json?.quoteResponse?.result?.[0] ?? {};
    return {
      marketCap: typeof r.marketCap === "number" ? r.marketCap : null,
      trailingPE: typeof r.trailingPE === "number" ? r.trailingPE : null,
      dividendYield: typeof r.trailingAnnualDividendYield === "number" ? r.trailingAnnualDividendYield * 100 : null,
      sector: null, // v7 quote doesn't expose sector; populated from our catalog instead
    };
  } catch {
    return { marketCap: null, trailingPE: null, dividendYield: null, sector: null };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Per-symbol build ----------

async function buildRow(sym: { ticker: string; name: string; yahoo: string; sector?: string; isIndex?: boolean }): Promise<SnapshotRow | null> {
  if (sym.isIndex) return null;
  const chart = await fetchChart(sym.yahoo);
  if (!chart || chart.closes.length < 30) return null;
  const { closes, volumes, timestamps } = chart;
  const n = closes.length;
  const last = closes[n - 1];
  const prev = closes[n - 2] ?? null;
  const ema20arr = emaSeries(closes, 20);
  const ema50arr = emaSeries(closes, 50);
  const ema200arr = emaSeries(closes, 200);

  const lastVol = volumes[n - 1] ?? null;
  const last10 = volumes.slice(Math.max(0, n - 11), n - 1);
  const last30 = volumes.slice(Math.max(0, n - 31), n - 1);
  const avg10 = last10.length ? Math.round(last10.reduce((a, b) => a + b, 0) / last10.length) : null;
  const avg30 = last30.length ? Math.round(last30.reduce((a, b) => a + b, 0) / last30.length) : null;
  // ChartsMaze-compatible 30D turnover: average close × average volume.
  const closes30 = closes.slice(Math.max(0, n - 31), n - 1);
  const avgPrice30 = closes30.length
    ? closes30.reduce((a, b) => a + b, 0) / closes30.length
    : null;
  const turnover30 = avgPrice30 != null && avg30 != null ? avgPrice30 * avg30 : null;

  const high52 = Math.max(...closes);
  const low52 = Math.min(...closes);

  // YTD: first close on or after Jan 1 of current calendar year
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
  let ytdRef: number | null = null;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i] >= yearStart) { ytdRef = closes[i]; break; }
  }

  const qs = await fetchQuoteSummary(sym.yahoo);

  const row: SnapshotRow = {
    symbol: sym.yahoo,
    ticker: sym.ticker,
    name: sym.name,
    sector: sym.sector ?? null,
    exchange: "NSE",
    price: last,
    prev_close: prev,
    change_pct: prev ? ((last - prev) / prev) * 100 : null,
    volume: lastVol,
    avg_vol_10d: avg10,
    avg_vol_30d: avg30,
    rel_vol: avg10 && lastVol ? lastVol / avg10 : null,
    liquidity: avg10 ? last * avg10 : null,
    avg_price_30d: avgPrice30,
    avg_turnover_30d: turnover30,
    market_cap: qs.marketCap,
    pe_ratio: qs.trailingPE,
    dividend_yield: qs.dividendYield,
    ema10: null,
    ema20: ema20arr[n - 1] ?? null,
    ema50: ema50arr[n - 1] ?? null,
    ema100: null,
    ema200: ema200arr[n - 1] ?? null,
    rsi14: rsi14(closes),
    adr_20: null,
    perf_1d: prev ? ((last - prev) / prev) * 100 : null,
    perf_1w: perfPct(closes, 5),

    perf_1m: perfPct(closes, 21),
    perf_3m: perfPct(closes, 63),
    perf_6m: perfPct(closes, 126),
    perf_1y: perfPct(closes, 251),
    perf_ytd: ytdRef ? ((last - ytdRef) / ytdRef) * 100 : null,
    high_52w: high52,
    low_52w: low52,
    ath: high52,
    pct_from_52w_high: Math.max(0, ((high52 - last) / high52) * 100),
    pct_from_52w_low: Math.max(0, ((last - low52) / low52) * 100),
    day_low: null,
    week_open: null,
    prev_week_close: null,
    week_gap_pct: null,
    week_low: null,
    net_profit_qoq: null,
    sales_qoq: null,
    net_profit_yoy: null,
    sales_yoy: null,
    earnings_release_date: null,
    earnings_release_price: null,
    rs_rating: null,
    open: null,
    updated_at: new Date().toISOString(),

  };
  return row;
}

// ---------- Batch driver ----------

async function upsertChunks(rows: SnapshotRow[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabaseAdmin
      .from("stock_snapshot")
      .upsert(chunk, { onConflict: "symbol" });
    if (error) throw new Error(error.message);
  }
}

// ---------- Out-of-universe prune ----------

// Removes any snapshot row that is not an NSE EQ symbol — BSE listings
// (".BO"), SME/trade-for-trade/BZ series names, trusts, and stocks NSE has
// moved out of the EQ series since the catalog was generated. The site is
// NSE-EQ only, so nothing else may sit in a table the UI reads.
//
// The decision is made against `EQ_TICKERS` (the catalog) rather than against
// today's feed: a truncated TradingView response must never be able to delete
// valid NSE rows.
//
// The first version of this prune listed every EQ symbol in ONE
// `symbol=not.in.(…)` filter. With ~2,300 symbols that is a 30 KB query
// string, which the Data API rejects with HTTP 400 before Postgres ever sees
// it (measured against this project: ~9 KB → 401, 19-39 KB → 400, 49 KB+ →
// 414). supabase-js reports HTTP failures as `{ error }` rather than throwing,
// so the surrounding try/catch never fired and the rejection stayed invisible
// — which is how STLTECH.NS (NSE moved it to the BE series, so it left the
// catalog) sat in the scanner with an empty band.
//
// Instead: read what is stored and delete the offenders in small batches.
// Normally that is a handful of rows; a catalog regeneration is a few dozen
// requests.
const PRUNE_BATCH = 150; // keeps every DELETE URI far below the 19 KB limit

async function pruneNonEqSnapshot(): Promise<{ pruned: string[]; error?: string }> {
  if (EQ_TICKERS.size === 0) {
    return { pruned: [], error: "skipped — the EQ catalog is empty" };
  }

  const existing: string[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("stock_snapshot")
      .select("symbol")
      .order("symbol", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { pruned: [], error: `read failed: ${error.message}` };
    const batch = (data ?? []) as Array<{ symbol: string }>;
    for (const row of batch) existing.push(String(row.symbol));
    if (batch.length < PAGE) break;
  }

  const stale = existing.filter((s) => !isEqSymbol(s));
  const pruned: string[] = [];
  for (let i = 0; i < stale.length; i += PRUNE_BATCH) {
    const chunk = stale.slice(i, i + PRUNE_BATCH);
    const { error } = await supabaseAdmin.from("stock_snapshot").delete().in("symbol", chunk);
    if (error) {
      return { pruned, error: `delete failed after ${pruned.length} of ${stale.length}: ${error.message}` };
    }
    pruned.push(...chunk);
  }
  return { pruned };
}

export async function refreshSnapshotSlice(offset: number, limit: number): Promise<{ processed: number; written: number; offset: number; limit: number; total: number; pruned?: number; pruneError?: string }> {
  // Preferred path: TradingView scanner. When offset === 0 we request the
  // full sorted universe in one stable call so paging cannot skip symbols.
  if (offset === 0) {
    const full = await fetchTradingViewSlice(0, 10_000);
    const collected: SnapshotRow[] = [];
    const seen = new Set<string>();
    let total = full?.total ?? 0;
    if (full?.rows.length) {
      let added = 0;
      for (const r of full.rows) {
        if (!isEqSymbol(r.symbol)) continue;
        if (seen.has(r.symbol)) continue;
        seen.add(r.symbol);
        collected.push(r);
        added++;
      }
      if (added === 0) total = 0;
    }
    if (collected.length > 0) {
      // Compute IBD-style RS rating: blended weighted return percentile across
      // the just-fetched universe. Weights mirror the 40/20/20/20 IBD recipe
      // using 3M/6M/9M/12M when available, falling back to perf_1y.
      const blended = collected.map((r) => {
        const p3 = r.perf_3m;
        const p6 = r.perf_6m;
        const p1y = r.perf_1y;
        const parts: number[] = [];
        const weights: number[] = [];
        if (typeof p3 === "number") { parts.push(p3); weights.push(0.4); }
        if (typeof p6 === "number") { parts.push(p6); weights.push(0.2); }
        if (typeof p1y === "number") { parts.push(p1y); weights.push(0.4); }
        const wsum = weights.reduce((a, b) => a + b, 0);
        const score = wsum > 0 ? parts.reduce((a, b, i) => a + b * weights[i], 0) / wsum : null;
        return { sym: r.symbol, score };
      });
      const ranked = blended.filter((b) => typeof b.score === "number").sort((a, b) => (a.score! - b.score!));
      const rankBySym = new Map<string, number>();
      ranked.forEach((b, i) => {
        // Percentile 1..99
        const pct = ranked.length > 1 ? Math.round(1 + (i / (ranked.length - 1)) * 98) : 50;
        rankBySym.set(b.sym, pct);
      });
      const scoreBySym = new Map<string, number>();
      for (const b of blended) {
        if (typeof b.score === "number") scoreBySym.set(b.sym, b.score);
      }
      for (const r of collected) {
        r.rs_rating = rankBySym.get(r.symbol) ?? null;
        r.rs_score_raw = scoreBySym.get(r.symbol) ?? null;
      }
      // Per-benchmark RS: percentile within Nifty 50/100/200/500 constituents.
      const NIFTY_CSV: Record<"n50" | "n100" | "n200" | "n500", string> = {
        n50: "ind_nifty50list.csv",
        n100: "ind_nifty100list.csv",
        n200: "ind_nifty200list.csv",
        n500: "ind_nifty500list.csv",
      };
      const fetchConstituents = async (file: string): Promise<Set<string> | null> => {
        for (const url of [
          `https://niftyindices.com/IndexConstituent/${file}`,
          `https://archives.nseindia.com/content/indices/${file}`,
        ]) {
          try {
            const res = await fetch(url, {
              headers: { "User-Agent": UA, Accept: "text/csv,*/*", Referer: "https://www.niftyindices.com/" },
            });
            if (!res.ok) continue;
            const text = await res.text();
            const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
            if (lines.length < 2) continue;
            const out = new Set<string>();
            for (let i = 1; i < lines.length; i++) {
              const cols: string[] = [];
              let cur = "", inQ = false;
              for (const ch of lines[i]) {
                if (ch === '"') { inQ = !inQ; continue; }
                if (ch === "," && !inQ) { cols.push(cur); cur = ""; continue; }
                cur += ch;
              }
              cols.push(cur);
              const sym = cols[2]?.trim();
              if (sym) out.add(`${sym}.NS`);
            }
            return out;
          } catch {/* try next */}
        }
        return null;
      };
      const benches = await Promise.all(
        (Object.entries(NIFTY_CSV) as [keyof typeof NIFTY_CSV, string][])
          .map(async ([key, file]) => [key, await fetchConstituents(file)] as const),
      );
      const benchRankBySym: Record<string, Map<string, number>> = {};
      for (const [key, set] of benches) {
        if (!set) continue;
        const subset = blended
          .filter((b) => typeof b.score === "number" && set.has(b.sym))
          .sort((a, b) => (a.score! - b.score!));
        const m = new Map<string, number>();
        subset.forEach((b, i) => {
          const pct = subset.length > 1 ? Math.round(1 + (i / (subset.length - 1)) * 98) : 50;
          m.set(b.sym, pct);
        });
        benchRankBySym[key] = m;
      }
      for (const r of collected) {
        r.rs_rating_n50 = benchRankBySym.n50?.get(r.symbol) ?? null;
        r.rs_rating_n100 = benchRankBySym.n100?.get(r.symbol) ?? null;
        r.rs_rating_n200 = benchRankBySym.n200?.get(r.symbol) ?? null;
        r.rs_rating_n500 = benchRankBySym.n500?.get(r.symbol) ?? null;
      }
      await upsertChunks(collected);
      // Drop every row that is not NSE EQ, so the scanner can only ever show a
      // symbol the site actually tracks. Failures are reported, never hidden.
      const prune = await pruneNonEqSnapshot();
      if (prune.error) {
        console.error("prune non-EQ snapshot failed:", prune.error);
      } else if (prune.pruned.length > 0) {
        console.log(`pruned ${prune.pruned.length} non-NSE-EQ snapshot row(s)`);
      }
      return {
        processed: collected.length,
        written: collected.length,
        offset,
        limit,
        total: total || collected.length,
        pruned: prune.pruned.length,
        pruneError: prune.error,
      };
    }
    // fall through to legacy path
  } else {
    const tv = await fetchTradingViewSlice(offset, limit);
    if (tv) {
      const eqRows = tv.rows.filter((r) => isEqSymbol(r.symbol));
      if (eqRows.length > 0) await upsertChunks(eqRows);
      return { processed: tv.rows.length, written: eqRows.length, offset, limit, total: tv.total };
    }
  }

  // Legacy Yahoo fallback (per-symbol). Only triggered if TV is unreachable.
  const universe = NSE_SYMBOLS.filter((s) => !s.isIndex);
  const total = universe.length;
  const slice = universe.slice(offset, offset + limit);
  const rows: SnapshotRow[] = [];

  const CONCURRENCY = 6;
  let idx = 0;
  async function worker() {
    while (idx < slice.length) {
      const my = idx++;
      const sym = slice[my];
      try {
        const r = await buildRow(sym);
        if (r) rows.push(r);
      } catch (e) {
        console.error("buildRow failed for", sym.yahoo, e);
      }
      await sleep(50 + Math.random() * 100);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slice.length) }, worker));

  if (rows.length > 0) await upsertChunks(rows);
  return { processed: slice.length, written: rows.length, offset, limit, total };
}

// ---------- Historical volume max refresher ----------
// Populates max_vol_all / max_vol_252d / max_vol_63d for a slice of symbols
// using Yahoo daily history. These columns are independent of the main TV
// refresh (which doesn't carry historical volume) and are written via a
// separate UPDATE so the main upsert payload never clears them.

async function fetchVolumeHistory(yahoo: string): Promise<{ vols: number[]; firstTradeDate: number | null } | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}` +
    `?interval=1d&range=10y&includePrePost=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const r = json?.chart?.result?.[0];
    if (!r) return null;
    const vols: (number | null)[] = r.indicators?.quote?.[0]?.volume ?? [];
    const meta = r.meta ?? {};
    const ftd = typeof meta.firstTradeDate === "number" && isFinite(meta.firstTradeDate)
      ? meta.firstTradeDate
      : null;
    return {
      vols: vols.map((v) => (typeof v === "number" && isFinite(v) ? v : 0)),
      firstTradeDate: ftd,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}


export async function refreshVolumeMaxesSlice(
  offset: number,
  limit: number,
): Promise<{ processed: number; updated: number; offset: number; limit: number; total: number }> {
  // Pull the same NSE/tradable universe used by the built-in highest-volume
  // presets. This keeps the backfill small enough to finish reliably and
  // avoids spending most of the job on BSE/illiquid rows the presets ignore.
  const { data: rows, error } = await supabaseAdmin
    .from("stock_snapshot")
    .select("symbol")
    .eq("exchange", "NSE")
    .gte("price", 20)
    .gt("liquidity", 45_000_000)
    .gt("adr_20", 1)
    .order("symbol", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const { count } = await supabaseAdmin
    .from("stock_snapshot")
    .select("symbol", { count: "exact", head: true })
    .eq("exchange", "NSE")
    .gte("price", 20)
    .gt("liquidity", 45_000_000)
    .gt("adr_20", 1);
  const total = count ?? 0;

  let updated = 0;
  const CONCURRENCY = 6;
  let idx = 0;
  const slice = rows ?? [];

  async function worker() {
    while (idx < slice.length) {
      const my = idx++;
      const sym = slice[my].symbol;
      try {
        const hist = await fetchVolumeHistory(sym);
        if (!hist || hist.vols.length < 2) continue;
        // Consider the FULL series (including today's bar) so a brand-new
        // all-time-high volume that occurred today still counts as age=0.
        const full = hist.vols;
        const tail252 = full.slice(Math.max(0, full.length - 252));
        const tail63 = full.slice(Math.max(0, full.length - 63));
        const maxAll = full.length ? Math.max(...full) : null;
        const max252 = tail252.length ? Math.max(...tail252) : null;
        const max63 = tail63.length ? Math.max(...tail63) : null;
        // Index of the LAST occurrence of the all-time max (handles ties).
        let idxAll = -1;
        if (maxAll != null) {
          for (let k = full.length - 1; k >= 0; k--) {
            if (full[k] === maxAll) { idxAll = k; break; }
          }
        }
        const ageAll = idxAll >= 0 ? full.length - 1 - idxAll : null;
        const firstTradeIso = hist.firstTradeDate
          ? new Date(hist.firstTradeDate * 1000).toISOString()
          : null;
        const { error: uErr } = await supabaseAdmin
          .from("stock_snapshot")
          .update({
            max_vol_all: maxAll,
            max_vol_252d: max252,
            max_vol_63d: max63,
            max_vol_all_age_days: ageAll,
            ...(firstTradeIso ? { first_trade_date: firstTradeIso } : {}),
          })
          .eq("symbol", sym);
        if (!uErr) updated++;
      } catch (e) {
        console.error("volume max failed for", sym, e);
      }
      await sleep(40 + Math.random() * 80);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slice.length) }, worker));
  return { processed: slice.length, updated, offset, limit, total };
}
