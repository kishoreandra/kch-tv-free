// Validated daily EOD ingestion, run repeatedly on a backoff schedule
// (every 20 minutes between ~17:30 and 21:00 IST). Each run is a no-op once
// the expected session has been ingested and verified.
import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized, isScheduledJobAuthorized } from "./-_auth";

export const Route = createFileRoute("/api/public/cron/ingest-daily")({
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
          const { ingestExpectedDay } = await import("@/lib/history/daily-ingest.server");
          const report = await ingestExpectedDay(supabaseAdmin, {
            date: typeof body?.date === "string" ? body.date : undefined,
            force: !!body?.force,
            // Forced/manual runs (and explicit back-dated ones) ignore the
            // evening cutoff; only the unattended retry cron respects it.
            respectCutoff: !body?.force && typeof body?.date !== "string",
          });
          return Response.json({ ok: report.status === "ok" || report.status === "skipped", ...report });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("ingest-daily failed:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
