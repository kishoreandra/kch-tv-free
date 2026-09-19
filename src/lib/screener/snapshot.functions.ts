// Server functions for the screener snapshot table.

import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth, requireAdminAuth } from "@/lib/auth/approved-middleware";
import { refreshSnapshotSlice, refreshVolumeMaxesSlice } from "./snapshot.server";

export const getSnapshotStatus = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("stock_snapshot")
      .select("updated_at", { count: "exact", head: false })
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const { count, error: cErr } = await supabase
      .from("stock_snapshot")
      .select("symbol", { count: "exact", head: true });
    if (cErr) throw new Error(cErr.message);
    return {
      count: count ?? 0,
      lastUpdated: data?.[0]?.updated_at ?? null,
    };
  });

// Manual refresh trigger (signed-in users only). Process a slice on demand.
export const refreshSnapshotManually = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { offset?: number; limit?: number }) => ({
    offset: typeof data?.offset === "number" ? data.offset : 0,
    limit: typeof data?.limit === "number" ? Math.min(500, data.limit) : 250,
  }))
  .handler(async ({ data }) => {
    return refreshSnapshotSlice(data.offset, data.limit);
  });

// Manual refresh for historical-volume maxes (slow Yahoo per-symbol pass).
// Paged so the UI can drive it slice-by-slice.
export const refreshVolumeMaxesManually = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { offset?: number; limit?: number }) => ({
    offset: typeof data?.offset === "number" ? data.offset : 0,
    limit: typeof data?.limit === "number" ? Math.min(500, data.limit) : 300,
  }))
  .handler(async ({ data }) => {
    return refreshVolumeMaxesSlice(data.offset, data.limit);
  });
