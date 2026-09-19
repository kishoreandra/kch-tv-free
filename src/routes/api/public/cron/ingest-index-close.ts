// Daily ingest of NSE's index-close file — one file covers every index NSE
// calculates (~165 today, ~74 in 2017), including indices Yahoo never had:
// Nifty Healthcare, Nifty Oil & Gas, NIFTY50 Equal Weight, and the small/micro
// cap indices.
//
// The file is published after the close, so the handler resolves the newest
// session that actually exists rather than assuming today.

import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized, isScheduledJobAuthorized } from "./-_auth";

export const Route = createFileRoute("/api/public/cron/ingest-index-close")({
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
          const { latestPublishedIndexDate, ingestIndexCloseDay } = await import(
            "@/lib/markets/index-close.server"
          );
          const date = await latestPublishedIndexDate();
          if (!date) {
            return Response.json(
              { ok: false, error: "no index-close file published in the last 10 days" },
              { status: 502 },
            );
          }
          const rows = await ingestIndexCloseDay(supabaseAdmin, date);
          return Response.json({ ok: true, date, rows });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("ingest-index-close failed:", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
