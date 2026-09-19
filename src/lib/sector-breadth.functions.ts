// Sector-level breadth & leaders for a swing trader. Computed on-demand from
// the latest stock_snapshot — no schema changes, no extra cron.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

export type SectorTimeframe = "1d" | "1w" | "1m" | "3m";

const PERF_COL: Record<SectorTimeframe, "perf_1d" | "perf_1w" | "perf_1m" | "perf_3m"> = {
  "1d": "perf_1d",
  "1w": "perf_1w",
  "1m": "perf_1m",
  "3m": "perf_3m",
};

export interface SectorLeader {
  ticker: string;
  name: string;
  yahoo: string;
  perf: number;
  price: number | null;
  rel_vol: number | null;
  rs_rating_n500: number | null;
}

export interface SectorRow {
  sector: string;
  count: number;
  avg: number;        // mean % perf
  median: number;     // median % perf
  pctUp: number;      // % of names with perf > 0
  advancers: number;
  decliners: number;
  leaders: SectorLeader[];   // top movers (up)
  laggards: SectorLeader[];  // worst movers (down)
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const getSectorBreadth = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .inputValidator((d) =>
    z
      .object({
        timeframe: z.enum(["1d", "1w", "1m", "3m"]).optional(),
        leadersPerSector: z.number().int().min(1).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tf: SectorTimeframe = data.timeframe ?? "1d";
    const perfCol = PERF_COL[tf];
    const leadersN = data.leadersPerSector ?? 5;

    // Page through liquid NSE universe.
    const pageSize = 1000;
    let from = 0;
    let rows: any[] = [];
    for (let i = 0; i < 20; i++) {
      const { data: page, error } = await context.supabase
        .from("stock_snapshot")
        .select(
          `symbol,ticker,name,sector,price,rel_vol,rs_rating_n500,perf_1d,perf_1w,perf_1m,perf_3m,exchange,liquidity,adr_20`,
        )
        .eq("exchange", "NSE")
        .gte("liquidity", 45_000_000)
        .gt("adr_20", 1)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!page || page.length === 0) break;
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    const bySector = new Map<string, any[]>();
    for (const r of rows) {
      const s = (r.sector ?? "").trim();
      if (!s) continue;
      const p = r[perfCol];
      if (typeof p !== "number" || !Number.isFinite(p)) continue;
      if (!bySector.has(s)) bySector.set(s, []);
      bySector.get(s)!.push(r);
    }

    const out: SectorRow[] = [];
    for (const [sector, list] of bySector) {
      if (list.length < 3) continue; // ignore tiny buckets
      const perfs = list.map((r) => r[perfCol] as number);
      const avg = perfs.reduce((a, b) => a + b, 0) / perfs.length;
      const med = median(perfs);
      const advancers = perfs.filter((p) => p > 0).length;
      const decliners = perfs.filter((p) => p < 0).length;
      const pctUp = (advancers * 100) / perfs.length;

      const sorted = [...list].sort(
        (a, b) => (b[perfCol] as number) - (a[perfCol] as number),
      );
      const toLeader = (r: any): SectorLeader => ({
        ticker: String(r.ticker ?? r.symbol),
        name: String(r.name ?? r.ticker ?? r.symbol),
        yahoo: String(r.symbol),
        perf: r[perfCol] as number,
        price: typeof r.price === "number" ? r.price : null,
        rel_vol: typeof r.rel_vol === "number" ? r.rel_vol : null,
        rs_rating_n500:
          typeof r.rs_rating_n500 === "number" ? r.rs_rating_n500 : null,
      });
      const leaders = sorted.slice(0, leadersN).map(toLeader);
      const laggards = sorted.slice(-leadersN).reverse().map(toLeader);

      out.push({
        sector,
        count: list.length,
        avg,
        median: med,
        pctUp,
        advancers,
        decliners,
        leaders,
        laggards,
      });
    }

    out.sort((a, b) => b.avg - a.avg);
    return { timeframe: tf, sectors: out };
  });
