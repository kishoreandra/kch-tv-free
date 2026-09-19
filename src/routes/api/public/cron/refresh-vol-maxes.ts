// Public cron endpoint that refreshes a slice of historical-volume maxes.
// Auth via Supabase anon key in `apikey` header (matches refresh-snapshot).
// Body: { offset?: number, limit?: number }

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { refreshVolumeMaxesSlice } from "@/lib/screener/snapshot.server";
import { isCronAuthorized } from "./-_auth";

const BodySchema = z.object({
  offset: z.number().int().min(0).max(20_000).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const Route = createFileRoute("/api/public/cron/refresh-vol-maxes")({
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
        try { body = await request.json(); } catch { body = {}; }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.message }), {
            status: 400, headers: { "Content-Type": "application/json" },
          });
        }
        const offset = parsed.data.offset ?? 0;
        const limit = parsed.data.limit ?? 200;
        try {
          const result = await refreshVolumeMaxesSlice(offset, limit);
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("refresh-vol-maxes failed:", e);
          return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
