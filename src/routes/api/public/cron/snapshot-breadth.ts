// Public cron endpoint that computes NSE market-breadth counts from the
// latest stock_snapshot and upserts one row into breadth_daily per trading
// day. Called by pg_cron with the Supabase anon key in the `apikey` header.

import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized } from "./-_auth";
import { hasNseSession } from "@/lib/breadth/bhavcopy.server";

export const Route = createFileRoute("/api/public/cron/snapshot-breadth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isCronAuthorized(request)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }


        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          // Pull the liquidity-gated NSE universe. We page through to avoid
          // the default 1000-row PostgREST cap.
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
          let total = 0;
          let up_4pct = 0,
            down_4pct = 0;
          let up_25pct_1m = 0,
            down_25pct_1m = 0;
          let up_25pct_1q = 0,
            down_25pct_1q = 0;
          let above_ema50 = 0,
            above_ema200 = 0;
          let new_highs_52w = 0,
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

            const fromHigh = n(r.pct_from_52w_high);
            if (fromHigh != null && fromHigh <= 0.5) new_highs_52w++;
            const fromLow = n(r.pct_from_52w_low);
            if (fromLow != null && fromLow <= 0.5) new_lows_52w++;
          }

          const t2108 = total > 0 ? (above_ema50 * 100) / total : null;

          // IST-aware "today" — NSE trading day in Asia/Kolkata
          const day = new Date(Date.now() + 5.5 * 3600 * 1000)
            .toISOString()
            .slice(0, 10);

          // A date with no NSE session has nothing to record: the snapshot would
          // just be the previous session again, which is the same phantom-day bug
          // as the price candles (a flat bar duplicating the day before). Verified
          // against the exchange's own file rather than the local holiday list —
          // for a holiday the archive echoes an older file, which is rejected here.
          if (!(await hasNseSession(day))) {
            return Response.json({
              ok: true,
              skipped: true,
              day,
              reason: "no NSE session for today (holiday, or the file is not out yet)",
            });
          }

          const { error: upErr } = await supabaseAdmin
            .from("breadth_daily")
            .upsert(
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

          return Response.json({
            ok: true,
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
          });
        } catch (e: any) {
          console.error("snapshot-breadth failed:", e);
          return new Response(
            JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
