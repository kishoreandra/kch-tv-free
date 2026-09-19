// Historical Bhavcopy backfill for `daily_prices` (alert history foundation).
// Body: { "end": "2026-08-07", "days": 15, "scope": "tracked" | "all" }
import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized, isScheduledJobAuthorized } from "./-_auth";

export const Route = createFileRoute("/api/public/cron/backfill-prices")({
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
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { backfillDailyPrices } = await import("@/lib/history/backfill.server");
          const result = await backfillDailyPrices(supabaseAdmin, {
            end: typeof body?.end === "string" ? body.end : undefined,
            days: Number(body?.days) || 15,
            scope: body?.scope === "all" ? "all" : "tracked",
          });
          return Response.json({ ok: true, ...result });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("backfill-prices failed:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
