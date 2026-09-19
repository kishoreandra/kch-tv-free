// Data-freshness status + manual "refresh now" for the daily EOD pipeline.
import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

export const dailyDataStatus = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dailyDataFreshness } = await import("./daily-ingest.server");
    return await dailyDataFreshness(supabaseAdmin);
  });

export const refreshDailyDataNow = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: { date?: string } | undefined) => data ?? {})
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ingestExpectedDay } = await import("./daily-ingest.server");
    // Manual runs ignore the retry cutoff and always re-fetch.
    return await ingestExpectedDay(supabaseAdmin, {
      date: data?.date,
      force: true,
      respectCutoff: false,
    });
  });
