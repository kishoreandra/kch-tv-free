// Server functions for reading the daily NSE breadth history. Auth-gated so
// only signed-in users can hit the endpoint.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

export interface BreadthRow {
  day: string;
  total: number;
  up_4pct: number;
  down_4pct: number;
  up_25pct_1m: number;
  down_25pct_1m: number;
  up_25pct_1q: number;
  down_25pct_1q: number;
  above_ema50: number;
  above_ema200: number;
  new_highs_52w: number;
  new_lows_52w: number;
  t2108: number | null;
}

export const getBreadthHistory = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(720).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const days = data.days ?? 90;
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("breadth_daily")
      .select(
        "day,total,up_4pct,down_4pct,up_25pct_1m,down_25pct_1m,up_25pct_1q,down_25pct_1q,above_ema50,above_ema200,new_highs_52w,new_lows_52w,t2108",
      )
      .gte("day", since)
      .order("day", { ascending: true });
    if (error) throw error;
    return { rows: (rows ?? []) as BreadthRow[] };
  });

// Triggers a snapshot for "today" on demand (used to seed an empty
// breadth_daily table or refresh after a stock_snapshot refresh). Any signed-
// in user can fire it — the cron handler is idempotent (upsert on `day`).
export const snapshotBreadthNow = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .handler(async () => {
    const apikey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
    // The cron route runs the same logic; call it server-to-server.
    const base = process.env.APP_URL || "";
    if (!base) {
      // Fallback: do the work inline by importing supabaseAdmin.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const pageSize = 1000;
      let from = 0;
      let rows: any[] = [];
      for (let i = 0; i < 20; i++) {
        const { data, error } = await supabaseAdmin
          .from("stock_snapshot")
          .select(
            "price,perf_1d,perf_1m,perf_3m,rel_vol,ema50,ema200,pct_from_52w_high,pct_from_52w_low,liquidity,exchange,adr_20",
          )
          .eq("exchange", "NSE")
          .gte("liquidity", 45_000_000)
          .gt("adr_20", 1)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      const n = (v: any) => (typeof v === "number" ? v : null);
      let total = 0,
        up_4pct = 0,
        down_4pct = 0,
        up_25pct_1m = 0,
        down_25pct_1m = 0,
        up_25pct_1q = 0,
        down_25pct_1q = 0,
        above_ema50 = 0,
        above_ema200 = 0,
        new_highs_52w = 0,
        new_lows_52w = 0;
      for (const r of rows) {
        const price = n(r.price);
        if (price == null) continue;
        total++;
        const p1d = n(r.perf_1d),
          rv = n(r.rel_vol);
        if (p1d != null && rv != null) {
          if (p1d >= 4 && rv >= 2) up_4pct++;
          else if (p1d <= -4 && rv >= 2) down_4pct++;
        }
        const p1m = n(r.perf_1m);
        if (p1m != null) {
          if (p1m >= 25) up_25pct_1m++;
          else if (p1m <= -25) down_25pct_1m++;
        }
        const p3m = n(r.perf_3m);
        if (p3m != null) {
          if (p3m >= 25) up_25pct_1q++;
          else if (p3m <= -25) down_25pct_1q++;
        }
        const e50 = n(r.ema50);
        if (e50 != null && price > e50) above_ema50++;
        const e200 = n(r.ema200);
        if (e200 != null && price > e200) above_ema200++;
        const fh = n(r.pct_from_52w_high);
        if (fh != null && fh <= 0.5) new_highs_52w++;
        const fl = n(r.pct_from_52w_low);
        if (fl != null && fl <= 0.5) new_lows_52w++;
      }
      const t2108 = total > 0 ? (above_ema50 * 100) / total : null;
      const day = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
      // Never record a row for a non-session — the snapshot would just be the
      // previous session again, the same phantom-day bug as the charts. Asked of
      // the exchange rather than the local holiday list: the archive's file date
      // is proof, a hand-maintained calendar is only a hint.
      const { hasNseSession } = await import("@/lib/breadth/bhavcopy.server");
      if (!(await hasNseSession(day))) return { ok: true, skipped: true, day, total: 0 };
      const { error: upErr } = await supabaseAdmin.from("breadth_daily").upsert(
        {
          day,
          total,
          up_4pct,
          down_4pct,
          up_25pct_1m,
          down_25pct_1m,
          up_25pct_1q,
          down_25pct_1q,
          above_ema50,
          above_ema200,
          new_highs_52w,
          new_lows_52w,
          t2108,
          ts: new Date().toISOString(),
        },
        { onConflict: "day" },
      );
      if (upErr) throw upErr;
      return { ok: true, day, total };
    }
    const res = await fetch(`${base}/api/public/cron/snapshot-breadth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: "{}",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json;
  });
