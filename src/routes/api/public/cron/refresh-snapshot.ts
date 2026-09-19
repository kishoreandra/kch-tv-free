// Public cron endpoint that refreshes a slice of the stock_snapshot table.
// Called by pg_cron with an `apikey` header (Supabase anon key). The
// /api/public/* prefix is served without the app's session auth gate, and
// authentication is handled inside the handler by checking the apikey.
//
// Body: { offset?: number, limit?: number }

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { refreshSnapshotSlice } from "@/lib/screener/snapshot.server";
import { isCronAuthorized } from "./-_auth";

const BodySchema = z.object({
  offset: z.number().int().min(0).max(10_000).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const Route = createFileRoute("/api/public/cron/refresh-snapshot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isCronAuthorized(request)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const offset = parsed.data.offset ?? 0;
        const limit = parsed.data.limit ?? 250;

        try {
          const result = await refreshSnapshotSlice(offset, limit);
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("refresh-snapshot failed:", e);
          return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
