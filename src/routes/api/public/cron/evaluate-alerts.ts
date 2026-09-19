// Evaluates user technical alerts against the latest snapshot and pushes
// matches to Telegram. Called by pg_cron with the private x-cron-secret.
import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized } from "./-_auth";

export const Route = createFileRoute("/api/public/cron/evaluate-alerts")({
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
          const { evaluatePriceAlerts } = await import("@/lib/alerts/price-alerts.server");
          const result = await evaluatePriceAlerts();
          return Response.json({ ok: true, ...result });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("evaluate-alerts failed:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
