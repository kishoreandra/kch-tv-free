// Weekly housekeeping: keep only circuit-band alert history for the latest
// 5 trading days and drop everything older, so the band alerts stay clean.

import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized, isScheduledJobAuthorized } from "./-_auth";

export const Route = createFileRoute("/api/public/cron/cleanup-band-changes")({
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
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 5 most recent trading sessions we have prices for.
          const { data: dates, error: dErr } = await supabaseAdmin
            .from("daily_prices")
            .select("trade_date")
            .order("trade_date", { ascending: false })
            .limit(4000);
          if (dErr) throw dErr;

          const distinct = Array.from(
            new Set((dates ?? []).map((r: any) => r.trade_date as string)),
          ).sort((a, b) => (a < b ? 1 : -1));

          if (distinct.length < 5) {
            return Response.json({ ok: true, skipped: "not enough sessions" });
          }
          const cutoff = distinct[4]; // keep this day and newer

          const { count: changesDeleted, error: cErr } = await supabaseAdmin
            .from("circuit_band_changes")
            .delete({ count: "exact" })
            .lt("detected_at", `${cutoff}T00:00:00+05:30`);
          if (cErr) throw cErr;

          const { count: histDeleted, error: hErr } = await supabaseAdmin
            .from("circuit_bands_history")
            .delete({ count: "exact" })
            .lt("snapshot_date", cutoff);
          if (hErr) throw hErr;

          return Response.json({
            ok: true,
            cutoff,
            changesDeleted: changesDeleted ?? 0,
            historyDeleted: histDeleted ?? 0,
          });
        } catch (e: any) {
          console.error("cleanup-band-changes failed:", e);
          return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
