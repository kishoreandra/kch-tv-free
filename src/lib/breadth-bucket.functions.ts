// Return the current constituents of a market-breadth bucket so the user
// can save them as a watchlist directly from the Breadth page. Uses the
// same filter conventions as src/routes/api/public/cron/snapshot-breadth.ts
// (NSE-only, liquidity ≥ 45M, adr_20 > 1) so the counts on the KPI strip
// match the symbols returned here.
import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

export type BreadthBucket =
  | "up_4pct"
  | "down_4pct"
  | "new_highs_52w"
  | "new_lows_52w"
  | "up_25pct_1m"
  | "down_25pct_1m"
  | "up_25pct_1q"
  | "down_25pct_1q"
  | "above_ema50"
  | "above_ema200";

const BUCKET_LABEL: Record<BreadthBucket, string> = {
  up_4pct: "4% Up (rvol ≥ 2)",
  down_4pct: "4% Down (rvol ≥ 2)",
  new_highs_52w: "New 52W Highs",
  new_lows_52w: "New 52W Lows",
  up_25pct_1m: "25% Up in 1M",
  down_25pct_1m: "25% Down in 1M",
  up_25pct_1q: "25% Up in 1Q",
  down_25pct_1q: "25% Down in 1Q",
  above_ema50: "Above 50 EMA",
  above_ema200: "Above 200 EMA",
};

const VALID: BreadthBucket[] = Object.keys(BUCKET_LABEL) as BreadthBucket[];

export const getBreadthBucketSymbols = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: { bucket: BreadthBucket }) => {
    if (!data?.bucket || !VALID.includes(data.bucket)) {
      throw new Error("Invalid bucket");
    }
    return { bucket: data.bucket };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const pageSize = 1000;
    let from = 0;
    let rows: any[] = [];
    for (let i = 0; i < 20; i++) {
      const { data: page, error } = await supabase
        .from("stock_snapshot")
        .select(
          "symbol,ticker,name,sector,price,perf_1d,perf_1m,perf_3m,rel_vol,ema50,ema200,pct_from_52w_high,pct_from_52w_low",
        )
        .eq("exchange", "NSE")
        .gte("liquidity", 45_000_000)
        .gt("adr_20", 1)
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    const n = (v: any) => (typeof v === "number" ? v : null);
    const matches = rows.filter((r) => {
      const price = n(r.price);
      if (price == null) return false;
      switch (data.bucket) {
        case "up_4pct": {
          const p = n(r.perf_1d), rv = n(r.rel_vol);
          return p != null && rv != null && p >= 4 && rv >= 2;
        }
        case "down_4pct": {
          const p = n(r.perf_1d), rv = n(r.rel_vol);
          return p != null && rv != null && p <= -4 && rv >= 2;
        }
        case "up_25pct_1m": {
          const p = n(r.perf_1m); return p != null && p >= 25;
        }
        case "down_25pct_1m": {
          const p = n(r.perf_1m); return p != null && p <= -25;
        }
        case "up_25pct_1q": {
          const p = n(r.perf_3m); return p != null && p >= 25;
        }
        case "down_25pct_1q": {
          const p = n(r.perf_3m); return p != null && p <= -25;
        }
        case "above_ema50": {
          const e = n(r.ema50); return e != null && price > e;
        }
        case "above_ema200": {
          const e = n(r.ema200); return e != null && price > e;
        }
        case "new_highs_52w": {
          const d = n(r.pct_from_52w_high); return d != null && d <= 0.5;
        }
        case "new_lows_52w": {
          const d = n(r.pct_from_52w_low); return d != null && d <= 0.5;
        }
      }
    });

    // Rank by |perf_1d| desc so the most active names surface first.
    matches.sort((a, b) => Math.abs(n(b.perf_1d) ?? 0) - Math.abs(n(a.perf_1d) ?? 0));

    const symbols = matches.map((r) => ({
      ticker: String(r.ticker ?? r.symbol),
      name: String(r.name ?? r.ticker ?? r.symbol),
      yahoo: String(r.symbol),
      sector: r.sector ? String(r.sector) : undefined,
    }));

    return {
      bucket: data.bucket,
      label: BUCKET_LABEL[data.bucket],
      count: symbols.length,
      symbols,
    };
  });
