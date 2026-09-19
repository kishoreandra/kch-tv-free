// Daily NSE bulk + block deal ingestion, used to annotate volume-record alerts.
import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized, isScheduledJobAuthorized } from "./-_auth";

export const Route = createFileRoute("/api/public/cron/ingest-deals")({
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
          const { ingestBulkBlockDeals } = await import("@/lib/history/backfill.server");
          const counts = await ingestBulkBlockDeals(supabaseAdmin);
          return Response.json({ ok: true, ...counts });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("ingest-deals failed:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
