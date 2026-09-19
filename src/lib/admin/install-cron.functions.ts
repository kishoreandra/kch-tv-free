// Admin-only helper that reinstalls snapshot and official NSE band jobs. The database RPC is only
// executable by the trusted server role, so requireAdminAuth verifies the
// signed-in user first and the handler then invokes the RPC server-side.
import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/lib/auth/approved-middleware";

// PostgREST reports a missing SQL function as a "schema cache" miss, which is
// almost always an unapplied migration rather than a real deployment problem.
// Spell that out so the admin sees something actionable instead of a bare
// PGRST202.
function explainRpcError(rpc: string, message: string): string {
  if (/schema cache|does not exist/i.test(message)) {
    return `${rpc} is not in this database — apply the migration that defines it`;
  }
  return message;
}

export const installSnapshotCronJobs = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .handler(async () => {
    const secret = process.env.CRON_SECRET ?? "";
    if (secret.length < 16) {
      throw new Error("CRON_SECRET is not configured on the server");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    // The three installers are independent — snapshot (bands/snapshot),
    // breadth (13:45 UTC) and index-close (13:40 UTC). Run all of them and
    // report per-job, so one missing migration cannot make a partially
    // successful reinstall look like a total failure.
    const jobs = [
      { label: "snapshot", rpc: "install_snapshot_cron_jobs" },
      { label: "breadth", rpc: "install_breadth_cron_jobs" },
      { label: "index-close", rpc: "install_index_cron_jobs" },
    ];

    const installed: string[] = [];
    const failed: string[] = [];

    for (const job of jobs) {
      const { data, error } = await admin.rpc(job.rpc, { _secret: secret });
      if (error) failed.push(`${job.label}: ${explainRpcError(job.rpc, error.message)}`);
      else installed.push(String(data ?? `${job.label} installed`));
    }

    if (failed.length) {
      const prefix = installed.length ? `Installed (${installed.join(" · ")}). ` : "";
      throw new Error(`${prefix}Not installed — ${failed.join("; ")}`);
    }

    return { message: installed.join(" · ") };
  });

