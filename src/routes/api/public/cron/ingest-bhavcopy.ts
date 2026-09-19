// Daily NSE Bhavcopy ingestion + market-breadth computation.
//
// Downloads the full daily securities file from the NSE archives, stores it in
// `daily_prices`, then asks the database to compute that session's breadth row.
// Idempotent: re-running a date simply upserts the same keys.
//
// Body (all optional):
//   { "date": "2026-08-07", "days": 5, "min_turnover": 10000000, "refresh_universe": true }

import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized, isScheduledJobAuthorized } from "./-_auth";
import {
  assertBhavcopyForDate,
  fetchNseCsv,
  parseBhavcopy,
  parseIndexList,
  parseNifty50Close,
  ddmmyyyy,
  istToday,
} from "@/lib/breadth/bhavcopy.server";

const ARCHIVE = "https://nsearchives.nseindia.com";

async function refreshUniverse(admin: any): Promise<number> {
  const text = await fetchNseCsv(`${ARCHIVE}/content/indices/ind_nifty500list.csv`);
  const rows = parseIndexList(text);
  if (rows.length < 100) throw new Error(`Nifty 500 list parsed only ${rows.length} rows`);
  const now = new Date().toISOString();
  const payload = rows.map((r) => ({ ...r, updated_at: now }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await admin
      .from("nifty500_constituents")
      .upsert(payload.slice(i, i + 500), { onConflict: "symbol" });
    if (error) throw new Error(error.message);
  }
  // Drop names that left the index
  const { error: delErr } = await admin
    .from("nifty500_constituents")
    .delete()
    .lt("updated_at", now);
  if (delErr) throw new Error(delErr.message);
  return rows.length;
}

async function ingestDay(admin: any, date: string, minTurnover: number) {
  const stamp = ddmmyyyy(date);
  const text = await fetchNseCsv(`${ARCHIVE}/products/content/sec_bhavdata_full_${stamp}.csv`);
  // The archive serves an older file (HTTP 200) for dates with no session, so
  // this must run before anything is written under `date`.
  assertBhavcopyForDate(text, date);
  const rows = parseBhavcopy(text, date);
  if (rows.length < 500) throw new Error(`Bhavcopy for ${date} parsed only ${rows.length} rows`);

  // Broad market universe: every EQ-series security in the Bhavcopy. Breadth is
  // a whole-market measure — the liquidity gate inside compute_market_breadth
  // (`_min_turnover`) does the filtering, not an index membership list.
  const scoped = rows;


  const now = new Date().toISOString();
  for (let i = 0; i < scoped.length; i += 500) {
    const { error } = await admin
      .from("daily_prices")
      .upsert(
        scoped.slice(i, i + 500).map((r) => ({ ...r, updated_at: now })),
        { onConflict: "symbol,trade_date" },
      );
    if (error) throw new Error(error.message);
  }

  // Nifty 50 close for the breadth-vs-index overlay (non-fatal if missing).
  let niftyClose: number | null = null;
  try {
    niftyClose = parseNifty50Close(
      await fetchNseCsv(`${ARCHIVE}/content/indices/ind_close_all_${stamp}.csv`),
    );
  } catch {
    niftyClose = null;
  }

  const { data: breadth, error: rpcErr } = await admin.rpc("compute_market_breadth", {
    _date: date,
    _min_turnover: minTurnover,
    _nifty_close: niftyClose,
  });
  if (rpcErr) throw new Error(rpcErr.message);

  return { date, ingested: scoped.length, nifty_close: niftyClose, breadth };
}

export const Route = createFileRoute("/api/public/cron/ingest-bhavcopy")({
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
          const body = await request.json().catch(() => ({} as any));
          const minTurnover = Number(body?.min_turnover) > 0 ? Number(body.min_turnover) : 10_000_000;
          const days = Math.min(Math.max(Number(body?.days) || 1, 1), 10);
          const endDate = typeof body?.date === "string" ? body.date : istToday();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          let universeSize = 0;
          const { count } = await supabaseAdmin
            .from("nifty500_constituents")
            .select("symbol", { count: "exact", head: true });
          if (body?.refresh_universe || !count) {
            universeSize = await refreshUniverse(supabaseAdmin);
          } else {
            universeSize = count ?? 0;
          }

          const results: any[] = [];
          const skipped: { date: string; reason: string }[] = [];
          for (let i = 0; i < days; i++) {
            const d = new Date(`${endDate}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() - i);
            const iso = d.toISOString().slice(0, 10);
            const dow = d.getUTCDay();
            if (dow === 0 || dow === 6) continue; // weekend — never a session
            // Holidays are deliberately NOT skipped on the calendar's word: the
            // exchange file's own date decides (assertBhavcopyForDate inside
            // ingestDay), so a stale entry in NSE_HOLIDAYS can neither create a
            // phantom nor hide a real session.
            try {
              results.push(await ingestDay(supabaseAdmin, iso, minTurnover));
            } catch (e) {
              // A missing day, or a stale/echoed file, is expected — never fatal.
              skipped.push({ date: iso, reason: e instanceof Error ? e.message : String(e) });
            }
          }

          return Response.json({ ok: results.length > 0, universe: universeSize, results, skipped });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("ingest-bhavcopy failed:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
