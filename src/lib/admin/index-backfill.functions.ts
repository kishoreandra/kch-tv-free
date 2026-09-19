import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/lib/auth/approved-middleware";

// Fills `index_prices` from NSE's index-close archive so charts for indices
// Yahoo never carried (Nifty Healthcare, Nifty Oil & Gas, NIFTY50 Equal Weight,
// Smallcap 100, Microcap 250 …) have real history.
//
// The archive goes back to at least 2017. Each batch walks `batchDays` calendar
// days backwards from the last unwritten session; this handler keeps issuing
// batches until it reaches `from` or runs out of time budget, then reports
// where it stopped so it can simply be called again.
export const backfillIndexHistory = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { from?: string; batchDays?: number; budgetMs?: number }) => data ?? {})
  .handler(async ({ data }) => {
    const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
    if (!apiKey) throw new Error("Backend publishable key is not configured");

    const from = data.from ?? "2017-01-01";
    const batchDays = Math.min(200, Math.max(1, data.batchDays ?? 60));
    const budgetMs = Math.min(120_000, Math.max(5_000, data.budgetMs ?? 45_000));
    const base = process.env.APP_URL ?? "";
    if (!base) throw new Error("APP_URL is not configured on the server");
    const url = `${base}/api/public/cron/backfill-index-close`;
    const startedAt = Date.now();

    let sessions = 0;
    let failures = 0;
    let batches = 0;
    let end: string | undefined;
    let next: string | null = null;

    while (Date.now() - startedAt < budgetMs) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(end ? { end, days: batchDays } : { days: batchDays }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Index backfill failed (${res.status}): ${text.slice(0, 200)}`);
      }
      let parsed: { sessionsIngested?: number; next?: string; failures?: unknown[] };
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`Index backfill returned non-JSON: ${text.slice(0, 200)}`);
      }
      sessions += parsed.sessionsIngested ?? 0;
      failures += parsed.failures?.length ?? 0;
      batches += 1;
      next = parsed.next ?? null;
      if (!next || next < from) break;
      end = next;
    }

    const done = !next || next < from;
    return {
      sessions,
      batches,
      failures,
      stoppedAt: next,
      done,
      message: done
        ? `Index history complete: ${sessions} sessions across ${batches} batches.`
        : `Index history: ${sessions} sessions so far (${batches} batches), stopped at ${next}. Call again to continue.`,
    };
  });
