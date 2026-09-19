// Read-side server functions for the Situational Awareness (market breadth) page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireApprovedAuth, requireAdminAuth } from "@/lib/auth/approved-middleware";

export interface BreadthDay {
  trade_date: string;
  universe_count: number;
  liquidity_excluded: number;
  circuit_excluded: number;
  up4pct_count: number;
  down4pct_count: number;
  up4pct_ratio_5day: number | null;
  up4pct_ratio_10day: number | null;
  pct_above_50dma: number | null;
  new_52w_highs: number;
  new_52w_lows: number;
  up25pct_month_count: number;
  down25pct_month_count: number;
  up25pct_quarter_count: number;
  down25pct_quarter_count: number;
  up50pct_month_count: number;
  up50pct_quarter_count: number;
  momentum_burst_5day_count: number;
  nifty_close: number | null;
  history_days: number;
  computed_at: string;
}

export interface MoverRow {
  symbol: string;
  trade_date: string;
  close: number | null;
  change_pct: number | null;
  volume: number | null;
  turnover: number | null;
  rel_volume: number | null;
  gain_5day: number | null;
}

export const getBreadthHistorySA = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(5).max(1000).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const days = data.days ?? 250;
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const { data: rows, error } = await (context.supabase as any)
      .from("market_breadth_daily")
      .select("*")
      .gte("trade_date", since)
      .order("trade_date", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as BreadthDay[] };
  });

export const getBreadthForDates = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((d: unknown) =>
    z.object({ dates: z.array(z.string().min(10).max(10)).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.dates.length === 0) return { rows: [] as BreadthDay[] };
    const { data: rows, error } = await (context.supabase as any)
      .from("market_breadth_daily")
      .select("*")
      .in("trade_date", Array.from(new Set(data.dates)));
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as BreadthDay[] };
  });

export const getTodaysMovers = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .inputValidator((d: unknown) =>
    z.object({ date: z.string().min(10).max(10).optional(), limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any).rpc("get_todays_movers", {
      _date: data.date ?? null,
      _limit: data.limit ?? 50,
    });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as MoverRow[] };
  });

// Admin-only manual trigger: runs the Bhavcopy ingestion + breadth computation
// for the latest session (or a backfill window) without waiting for cron.
export const runBhavcopyIngestion = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(10).optional(), date: z.string().min(10).max(10).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const secret = process.env.CRON_SECRET ?? "";
    if (secret.length < 16) throw new Error("CRON_SECRET is not configured on the server");
    const base = process.env.APP_URL ?? "";
    if (!base) throw new Error("APP_URL is not configured on the server");
    const res = await fetch(`${base}/api/public/cron/ingest-bhavcopy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ days: data.days ?? 1, ...(data.date ? { date: data.date } : {}) }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Bhavcopy ingestion failed (${res.status}): ${text.slice(0, 300)}`);
    try {
      const j = JSON.parse(text);
      const done = (j.results ?? []).map((r: any) => r.date).join(", ");
      return { message: done ? `Ingested ${done}` : `No sessions ingested (${(j.skipped ?? []).length} skipped)` };
    } catch {
      return { message: text.slice(0, 200) };
    }
  });
