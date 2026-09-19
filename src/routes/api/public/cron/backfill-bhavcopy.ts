// One-time (manual) historical backfill of NSE end-of-day prices, plus a
// breadth recompute pass.
//
// Why this exists: the daily job only ingests the latest session, so trailing
// stats (52-week highs/lows, 25%-in-1M/1Q, % above 50DMA) had no baseline and
// silently reported 0. This endpoint walks a date range of the official NSE
// archive Bhavcopy (`sec_bhavdata_full_DDMMYYYY.csv` on nsearchives — the
// static archive host, never the live www API) and fills `daily_prices`.
//
// Body (all optional):
//   { "end": "2026-08-24", "days": 30, "mode": "ingest" | "compute" | "both" }
//
// Fail-safe: a failed download or a short/partial file never deletes or
// overwrites good history — the day is skipped and reported back.
//
// KNOWN EDGE CASE (accepted, not handled): corporate actions (splits, bonus,
// dividends) distort close-vs-prev_close around ex-dates. Not adjusted here.

import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized, isScheduledJobAuthorized } from "./-_auth";
import {
  assertBhavcopyForDate,
  fetchNseCsv,
  parseBhavcopy,
  ddmmyyyy,
  istToday,
} from "@/lib/breadth/bhavcopy.server";

const ARCHIVE = "https://nsearchives.nseindia.com";
const MIN_ROWS = 500; // a real NSE session has thousands of EQ rows

async function ingestDay(admin: any, date: string) {
  const text = await fetchNseCsv(`${ARCHIVE}/products/content/sec_bhavdata_full_${ddmmyyyy(date)}.csv`);
  // For a date with no session the archive often answers 200 with the previous
  // session's file, which would otherwise be stored as a phantom duplicate.
  assertBhavcopyForDate(text, date);
  const rows = parseBhavcopy(text, date);
  if (rows.length < MIN_ROWS) throw new Error(`only ${rows.length} rows parsed`);
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("daily_prices")
      .upsert(rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now })), {
        onConflict: "symbol,trade_date",
      });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}


export const Route = createFileRoute("/api/public/cron/backfill-bhavcopy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isCronAuthorized(request) && !isScheduledJobAuthorized(request)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const body = await request.json().catch(() => ({}) as any);
          const mode: "ingest" | "compute" | "both" = ["compute", "both"].includes(body?.mode)
            ? body.mode
            : "ingest";
          const days = Math.min(Math.max(Number(body?.days) || 20, 1), 60);
          const end = typeof body?.end === "string" ? body.end : istToday();
          const minTurnover = Number(body?.min_turnover) > 0 ? Number(body.min_turnover) : 10_000_000;

          const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");




          const dates: string[] = [];
          for (let i = 0; dates.length < days && i < days * 2; i++) {
            const d = new Date(`${end}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() - i);
            const dow = d.getUTCDay();
            // Weekends only — a holiday is decided by the file's own date, so a
            // wrong calendar entry can never cause a real session to be skipped.
            if (dow === 0 || dow === 6) continue; // weekends have no session
            dates.push(d.toISOString().slice(0, 10));
          }

          const ingested: { date: string; rows: number }[] = [];
          const skipped: { date: string; reason: string }[] = [];

          if (mode !== "compute") {
            // Small concurrency keeps us well inside the request budget while
            // not hammering the archive host.
            const queue = [...dates];
            const worker = async () => {
              for (;;) {
                const date = queue.shift();
                if (!date) return;
                try {
                  ingested.push({ date, rows: await ingestDay(admin, date) });
                } catch (e) {
                  // Missing days and stale/echoed files are expected, never fatal.
                  skipped.push({ date, reason: e instanceof Error ? e.message : String(e) });
                }
              }
            };
            await Promise.all([worker(), worker(), worker(), worker()]);
          }

          const computed: string[] = [];
          if (mode !== "ingest") {
            // Only compute for sessions that actually have a full universe of
            // rows — a partial day would poison the breadth history.
            // Exact per-date row counts. A single `.in(...)` select is capped
            // by the API's max row limit and silently under-counts, which used
            // to make almost every session look "partial" and get skipped.
            const perDay = new Map<string, number>();
            await Promise.all(
              dates.map(async (date) => {
                const { count } = await admin
                  .from("daily_prices")
                  .select("symbol", { count: "exact", head: true })
                  .eq("trade_date", date);
                if (count) perDay.set(date, count);
              }),
            );
            const best = Math.max(0, ...perDay.values());

            for (const date of [...dates].sort()) {
              const n = perDay.get(date) ?? 0;
              if (n === 0) continue;
              if (best > 0 && n < best * 0.6) {
                skipped.push({ date, reason: `partial data (${n} of ~${best} symbols)` });
                continue;
              }
              const { error } = await (admin as any).rpc("compute_market_breadth", {
                _date: date,
                _min_turnover: minTurnover,
              });
              if (error) skipped.push({ date, reason: error.message });
              else computed.push(date);
            }
          }

          return Response.json({
            ok: true,
            mode,
            range: { from: dates[dates.length - 1], to: dates[0] },
            ingested: ingested.length,
            computed: computed.length,
            rows: ingested.reduce((a, b) => a + b.rows, 0),
            skipped,
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("backfill-bhavcopy failed:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
