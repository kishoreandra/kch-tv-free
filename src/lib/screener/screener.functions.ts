// Screener server functions: list custom screens, save, delete, and run.
// runScreener reads stock_snapshot in one query (~2k rows, light) and
// applies filters in-memory using the shared evaluator.

import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";
import { evaluateFilters, snapshotFieldValue, type Filter, type SnapshotRow } from "./filters";
import { enrichEarningsMoves } from "./earnings-move.server";

export const runScreener = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: { filters: Filter[]; limit?: number }) => ({
    filters: Array.isArray(data?.filters) ? (data.filters as Filter[]).slice(0, 30) : [],
    limit: typeof data?.limit === "number" ? Math.min(3000, Math.max(1, data.limit)) : 3000,
  }))
  .handler(async ({ data, context }) => {
    
    const { supabase } = context;

    // Computed/virtual fields aren't real columns; let the in-memory evaluator handle them.
    const VIRTUAL_FIELDS = new Set([
      "gap_pct",
      "liquidity_30d",
      "ipo_age_days",
      "days_since_earnings",
      "move_since_earnings_pct",
      "pct_from_ath",
      "band_pct",
      "pct_to_upper_circuit",
      "pct_to_lower_circuit",
    ]);
    const dbFilters = data.filters.filter((f) => {
      if (VIRTUAL_FIELDS.has(f.field)) return false;
      if (f.op === "eq") return Boolean(f.enumValue);
      if (f.op === "between") return typeof f.value === "number" && typeof f.value2 === "number";
      return ["gt", "gte", "lt", "lte"].includes(f.op) && typeof f.value === "number";
    });

    const buildQuery = () => {
      let query: any = supabase.from("stock_snapshot").select("*", { count: "exact", head: false });
      for (const f of dbFilters) {
        if (f.op === "eq") query = query.eq(f.field, f.enumValue);
        else if (f.op === "between") query = query.gte(f.field, f.value).lte(f.field, f.value2);
        else query = query[f.op](f.field, f.value);
      }
      return query.order("symbol", { ascending: true });
    };

    // Push ordinary numeric/enum filters into the database first. This makes
    // RS and highest-volume presets return immediately instead of loading the
    // full snapshot before applying the remaining field-to-field checks.
    const all: SnapshotRow[] = [];
    const seenSymbols = new Set<string>();
    const PAGE = 1000;
    let scannedTotal = 0;
    let from = 0;
    for (let i = 0; i < 40; i++) {
      const { data: page, error, count } = await buildQuery().range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (i === 0) scannedTotal = count ?? 0;
      if (!page || page.length === 0) break;
      // Defensive dedupe: paginated PostgREST reads can very occasionally
      // return the same row twice at page boundaries when concurrent upserts
      // shift ordering. Keying by symbol guarantees each NSE name appears
      // exactly once — no missing, no duplicates in scanner results.
      for (const row of page as SnapshotRow[]) {
        const key = String((row as any).symbol ?? (row as any).ticker ?? "").toUpperCase();
        if (!key || seenSymbols.has(key)) continue;
        seenSymbols.add(key);
        all.push(row);
      }
      if (page.length < PAGE) break;
      from += PAGE;
    }
    const { count: snapshotTotal, error: totalError } = await supabase
      .from("stock_snapshot")
      .select("symbol", { count: "exact", head: true });
    if (totalError) throw new Error(totalError.message);

    // Merge price bands (NSE circuit limits) as an optional per-row field.
    // PostgREST caps a response at 1,000 rows. Price-band coverage is ~3,000
    // NSE names, so a single select silently omitted symbols after the first
    // page (including valid 2%/5% names). Read every page before filtering.
    const bandsData: Array<{ symbol: string; band_pct: number | string | null; band: string | null }> = [];
    const BAND_PAGE = 1000;
    for (let bandFrom = 0; bandFrom < 10_000; bandFrom += BAND_PAGE) {
      const { data: bandPage, error: bandError } = await supabase
        .from("price_bands")
        .select("symbol,band_pct,band")
        .order("symbol", { ascending: true })
        .range(bandFrom, bandFrom + BAND_PAGE - 1);
      if (bandError) throw new Error(bandError.message);
      if (!bandPage?.length) break;
      bandsData.push(...(bandPage as Array<{ symbol: string; band_pct: number | string | null; band: string | null }>));
      if (bandPage.length < BAND_PAGE) break;
    }
    if (bandsData.length) {
      const bandMap = new Map<string, number>();
      const bandLabelMap = new Map<string, string>();
      for (const b of bandsData) {
        const n = typeof b.band_pct === "number" ? b.band_pct : parseFloat(String(b.band_pct));
        if (Number.isFinite(n)) {
          const key = String(b.symbol).toUpperCase();
          bandMap.set(key, n);
          bandMap.set(key.replace(/\.(NS|BO)$/i, ""), n);
        }
        if (b.band) {
          const key = String(b.symbol).toUpperCase();
          bandLabelMap.set(key, b.band);
          bandLabelMap.set(key.replace(/\.(NS|BO)$/i, ""), b.band);
        }
      }
      for (const row of all) {
        const key = String(row.symbol ?? row.ticker ?? "").toUpperCase();
        const tickerKey = String(row.ticker ?? "").toUpperCase();
        const strippedKey = key.replace(/\.(NS|BO)$/i, "");
        const band = bandMap.get(key) ?? bandMap.get(tickerKey) ?? bandMap.get(strippedKey);
        if (band != null) row.band_pct = band;
        row.band_label = bandLabelMap.get(key) ?? bandLabelMap.get(tickerKey) ?? bandLabelMap.get(strippedKey) ?? null;
      }
    }

    const matched = evaluateFilters(all, data.filters);
    await enrichEarningsMoves(matched);
    const rows = matched.slice(0, data.limit).map((row) => ({
      ...row,
      pct_from_52w_high: snapshotFieldValue(row, "pct_from_52w_high") as number | null,
      pct_from_52w_low: snapshotFieldValue(row, "pct_from_52w_low") as number | null,
      pct_from_ath: snapshotFieldValue(row, "pct_from_ath") as number | null,
      move_since_earnings_pct: snapshotFieldValue(row, "move_since_earnings_pct") as number | null,
    }));
    return {
      total: snapshotTotal ?? (scannedTotal || all.length),
      matchCount: matched.length,
      rows,
    };
  });

export const listCustomScreens = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("user_screens")
      .select("id,name,filters,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { screens: data ?? [] };
  });

export const saveCustomScreen = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: { id?: string; name: string; filters: Filter[] }) => {
    if (!data?.name || typeof data.name !== "string") throw new Error("name required");
    if (!Array.isArray(data?.filters)) throw new Error("filters[] required");
    return {
      id: data.id,
      name: data.name.trim().slice(0, 80),
      filters: data.filters.slice(0, 30) as Filter[],
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const filtersJson = data.filters as unknown as any;
    if (data.id) {
      const { data: row, error } = await supabase
        .from("user_screens")
        .update({ name: data.name, filters: filtersJson })
        .eq("id", data.id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { screen: row };
    }
    const { data: row, error } = await supabase
      .from("user_screens")
      .insert({ user_id: userId, name: data.name, filters: filtersJson })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { screen: row };
  });

export const deleteCustomScreen = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id required");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_screens")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
