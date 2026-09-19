// Historical backfill of `index_prices` from NSE's index-close archive.
//
// The daily job only stores the latest session, so chart history for
// archive-backed indices (Nifty Healthcare, Nifty Oil & Gas, NIFTY50 Equal
// Weight, Smallcap 100, Microcap 250 …) has to be walked in.
//
// Body (all optional):
//   { "end": "2026-09-14", "days": 120 }
//
// Walks calendar days backwards from `end` (default: today IST) for `days`
// days, ingesting every session the archive actually has. Weekends and market
// holidays have no file — that is normal and never fails the run.
//
// `next` is the day before this window, so a caller can page further back:
// call again with { "end": next } until `next` is older than you need (the
// archive goes back to at least 2017).

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isCronAuthorized, isScheduledJobAuthorized } from "./-_auth";
import { istToday } from "@/lib/breadth/bhavcopy.server";

const MAX_DAYS = 200;

const BodySchema = z.object({
  end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  days: z.number().int().min(1).max(MAX_DAYS).optional(),
});

function addDays(iso: string, delta: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + delta)).toISOString().slice(0, 10);
}

/** A missing or partial archive file is expected (holidays, late publishes). */
function isExpectedGap(message: string): boolean {
  return /returned \d{3}|parsed only/.test(message);
}

export const Route = createFileRoute("/api/public/cron/backfill-index-close")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isCronAuthorized(request) && !isScheduledJobAuthorized(request)) {
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
          return Response.json({ ok: false, error: parsed.error.message }, { status: 400 });
        }

        const days = parsed.data.days ?? 120;
        const end = parsed.data.end ?? istToday();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { ingestIndexCloseDay } = await import("@/lib/markets/index-close.server");

          const sessions: string[] = [];
          const gaps: string[] = [];
          const failures: Array<{ date: string; error: string }> = [];
          let cursor = end;

          for (let i = 0; i < days; i++) {
            const date = cursor;
            const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
            if (dow === 0 || dow === 6) {
              gaps.push(date);
            } else {
              try {
                await ingestIndexCloseDay(supabaseAdmin, date);
                sessions.push(date);
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                if (isExpectedGap(msg)) gaps.push(date);
                else failures.push({ date, error: msg.slice(0, 200) });
              }
            }
            cursor = addDays(date, -1);
          }

          return Response.json({
            ok: true,
            requested: { end, days },
            sessionsIngested: sessions.length,
            firstSession: sessions.at(-1) ?? null,
            lastSession: sessions[0] ?? null,
            gaps: gaps.length,
            failures,
            next: cursor,
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("backfill-index-close failed:", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
