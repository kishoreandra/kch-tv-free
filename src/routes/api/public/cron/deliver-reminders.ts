// Sends due custom reminders to Telegram. Called by pg_cron with x-cron-secret.
import { createFileRoute } from "@tanstack/react-router";
import { isCronAuthorized } from "./-_auth";

export const Route = createFileRoute("/api/public/cron/deliver-reminders")({
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
          const { deliverDueReminders } = await import("@/lib/alerts/reminders.server");
          const result = await deliverDueReminders();
          return Response.json({ ok: true, ...result });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("deliver-reminders failed:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
