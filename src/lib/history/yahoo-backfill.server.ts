// Fast historical OHLCV backfill via Yahoo Finance chart API.
//
// The Bhavcopy walker can only fetch one session per request, so deep history
// (EMA 200, record volume, 52-week levels) takes ages. Yahoo returns years of
// daily bars for a symbol in a single call, so we use it to seed history and
// let the nightly Bhavcopy job keep the tail exact.
//
// Existing rows are never overwritten (ignoreDuplicates) — Bhavcopy data,
// which carries real turnover, always wins.

import { trackedSymbols } from "./backfill.server";

const norm = (s: string) => s.replace(/\.NS$/i, "").trim().toUpperCase();

export interface YahooBackfillResult {
  requested: number;
  processed: number;
  rows: number;
  failed: { symbol: string; reason: string }[];
  next_offset: number | null;
  total: number;
}

async function fetchYahooDaily(symbol: string, years: number) {
  const range = `${Math.min(Math.max(years, 1), 10)}y`;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS` +
    `?interval=1d&range=${range}&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NSE-MultiView/1.0; +https://lovable.dev)",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const json = (await res.json()) as any;
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(json?.chart?.error?.description || "no data");

  const ts: number[] = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const out: any[] = [];
  let prevClose: number | null = null;
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i],
      h = q.high?.[i],
      l = q.low?.[i],
      c = q.close?.[i],
      v = q.volume?.[i];
    if (c == null) continue;
    // Yahoo stamps NSE bars at 03:45 UTC; shift into IST before slicing the date.
    const date = new Date((ts[i] + 19800) * 1000).toISOString().slice(0, 10);
    out.push({
      symbol: norm(symbol),
      trade_date: date,
      open: o ?? null,
      high: h ?? null,
      low: l ?? null,
      close: c,
      prev_close: prevClose,
      volume: v == null ? null : Math.round(v),
      turnover: v == null ? null : Math.round(v * c),
    });
    prevClose = c;
  }
  return out;
}

/**
 * Seeds `daily_prices` from Yahoo for a slice of symbols.
 * Call repeatedly with the returned `next_offset` until it is null.
 */
export async function backfillViaYahoo(
  admin: any,
  opts: { symbols?: string[]; scope?: "tracked" | "universe"; years?: number; limit?: number; offset?: number } = {},
): Promise<YahooBackfillResult> {
  const years = Math.min(Math.max(Number(opts.years) || 3, 1), 10);
  const limit = Math.min(Math.max(Number(opts.limit) || 60, 1), 120);
  const offset = Math.max(Number(opts.offset) || 0, 0);

  let all: string[];
  if (opts.symbols?.length) {
    all = Array.from(new Set(opts.symbols.map(norm).filter(Boolean)));
  } else {
    const set = new Set<string>(await trackedSymbols(admin));
    if (opts.scope === "universe") {
      const { data } = await admin.from("nifty500_constituents").select("symbol").limit(1000);
      for (const r of data ?? []) set.add(norm(String(r.symbol)));
    }
    all = Array.from(set).sort();
  }

  const slice = all.slice(offset, offset + limit);
  const failed: { symbol: string; reason: string }[] = [];
  let rows = 0;
  let processed = 0;

  // Small concurrency keeps us well under the Worker subrequest budget while
  // still being an order of magnitude faster than the day-by-day walker.
  const CONC = 4;
  for (let i = 0; i < slice.length; i += CONC) {
    await Promise.all(
      slice.slice(i, i + CONC).map(async (sym) => {
        try {
          const bars = await fetchYahooDaily(sym, years);
          if (bars.length === 0) throw new Error("empty series");
          const now = new Date().toISOString();
          for (let k = 0; k < bars.length; k += 500) {
            const { error } = await admin.from("daily_prices").upsert(
              bars.slice(k, k + 500).map((b) => ({ ...b, updated_at: now })),
              { onConflict: "symbol,trade_date", ignoreDuplicates: true },
            );
            if (error) throw new Error(error.message);
          }
          rows += bars.length;
          processed++;
        } catch (e) {
          failed.push({ symbol: sym, reason: e instanceof Error ? e.message : String(e) });
        }
      }),
    );
  }

  const nextOffset = offset + slice.length;
  return {
    requested: slice.length,
    processed,
    rows,
    failed,
    next_offset: nextOffset < all.length ? nextOffset : null,
    total: all.length,
  };
}
