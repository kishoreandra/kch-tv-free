// Admin preset overrides: allow admin to hide, edit, group, unlock or mark
// a built-in scanner preset as the default landing preset. All approved
// users can read overrides (needed to render the tuned filters); only
// admins can write. Also exposes CRUD for named preset groups.
import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth, requireAdminAuth } from "@/lib/auth/approved-middleware";
import { defaultGroupFor, type Filter, type Preset, type ColKey } from "@/lib/screener/filters";

export interface PresetOverrideRow {
  preset_id: string;
  filters: Filter[] | null;
  columns: ColKey[] | null;
  hidden: boolean;
  is_default: boolean;
  group_name: string | null;
  unlocked: boolean;
  updated_at: string;
}


export interface PresetGroupRow {
  name: string;
  sort_order: number;
}

// ── Overrides ────────────────────────────────────────────────────────────
export const listPresetOverrides = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("admin_preset_overrides")
      .select("preset_id,filters,columns,hidden,is_default,group_name,unlocked,updated_at");
    if (error) throw new Error(error.message);
    return { overrides: (data ?? []) as PresetOverrideRow[] };
  });

export const savePresetOverride = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((d: {
    preset_id: string;
    filters?: Filter[] | null;
    columns?: ColKey[] | null;
    hidden?: boolean;
    is_default?: boolean;
    group_name?: string | null;
    unlocked?: boolean;
  }) => {
    if (!d?.preset_id || typeof d.preset_id !== "string") throw new Error("preset_id required");
    return {
      preset_id: d.preset_id.slice(0, 80),
      filters: Array.isArray(d.filters) ? (d.filters.slice(0, 40) as Filter[]) : d.filters === null ? null : undefined,
      columns: Array.isArray(d.columns) ? (d.columns.slice(0, 60) as ColKey[]) : d.columns === null ? null : undefined,
      hidden: typeof d.hidden === "boolean" ? d.hidden : undefined,
      is_default: typeof d.is_default === "boolean" ? d.is_default : undefined,
      group_name: d.group_name === null ? null : typeof d.group_name === "string" ? d.group_name.slice(0, 60) : undefined,
      unlocked: typeof d.unlocked === "boolean" ? d.unlocked : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.is_default === true) {
      const { error: clr } = await supabase
        .from("admin_preset_overrides")
        .update({ is_default: false })
        .neq("preset_id", data.preset_id);
      if (clr) throw new Error(clr.message);
    }
    const payload: any = { preset_id: data.preset_id, updated_by: userId };
    if (data.filters !== undefined) payload.filters = data.filters;
    if (data.columns !== undefined) payload.columns = data.columns;
    if (data.hidden !== undefined) payload.hidden = data.hidden;
    if (data.is_default !== undefined) payload.is_default = data.is_default;
    if (data.group_name !== undefined) payload.group_name = data.group_name;
    if (data.unlocked !== undefined) payload.unlocked = data.unlocked;
    const { data: row, error } = await supabase
      .from("admin_preset_overrides")
      .upsert(payload, { onConflict: "preset_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { override: row };
  });


// Bulk visibility toggle. Unlike savePresetOverride this NEVER touches the
// other override columns: existing rows are patched, missing rows inserted
// with just the hidden flag, so filters/columns/group stay intact.
export const setPresetsHidden = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((d: { preset_ids: string[]; hidden: boolean }) => {
    const ids = Array.isArray(d?.preset_ids)
      ? d.preset_ids.map((s) => String(s).slice(0, 80)).filter(Boolean).slice(0, 500)
      : [];
    if (ids.length === 0) throw new Error("preset_ids required");
    return { preset_ids: ids, hidden: Boolean(d?.hidden) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: exErr } = await supabase
      .from("admin_preset_overrides")
      .select("preset_id")
      .in("preset_id", data.preset_ids);
    if (exErr) throw new Error(exErr.message);
    const have = new Set((existing ?? []).map((r: any) => r.preset_id as string));
    const toUpdate = data.preset_ids.filter((id) => have.has(id));
    const toInsert = data.preset_ids.filter((id) => !have.has(id));

    if (toUpdate.length) {
      const { error } = await supabase
        .from("admin_preset_overrides")
        .update({ hidden: data.hidden, updated_by: userId, updated_at: new Date().toISOString() })
        .in("preset_id", toUpdate);
      if (error) throw new Error(error.message);
    }
    if (toInsert.length) {
      const { error } = await supabase.from("admin_preset_overrides").insert(
        toInsert.map((preset_id) => ({ preset_id, hidden: data.hidden, updated_by: userId })),
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.preset_ids.length };
  });

export const resetPresetOverride = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((d: { preset_id: string }) => {
    if (!d?.preset_id) throw new Error("preset_id required");
    return { preset_id: d.preset_id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("admin_preset_overrides")
      .delete()
      .eq("preset_id", data.preset_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Groups ───────────────────────────────────────────────────────────────
export const listPresetGroups = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("preset_groups")
      .select("name,sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { groups: (data ?? []) as PresetGroupRow[] };
  });

export const savePresetGroup = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((d: { name: string; sort_order?: number }) => {
    const name = String(d?.name ?? "").trim().slice(0, 60);
    if (!name) throw new Error("group name required");
    const sort_order = Number.isFinite(d?.sort_order) ? Number(d.sort_order) : 100;
    return { name, sort_order };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("preset_groups")
      .upsert({ name: data.name, sort_order: data.sort_order }, { onConflict: "name" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { group: row };
  });

export const deletePresetGroup = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((d: { name: string }) => {
    if (!d?.name) throw new Error("name required");
    return { name: d.name };
  })
  .handler(async ({ data, context }) => {
    // Detach any override still pointing at this group.
    await context.supabase
      .from("admin_preset_overrides")
      .update({ group_name: null })
      .eq("group_name", data.name);
    const { error } = await context.supabase
      .from("preset_groups")
      .delete()
      .eq("name", data.name);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Common settings (cross-scanner filters + columns) ───────────────────
export type ApplyScope = "all" | "selected" | "excluded";

export interface CommonSettingsRow {
  common_filters: Filter[];
  common_columns: ColKey[] | null;
  apply_scope: ApplyScope;
  apply_ids: string[];
  columns_scope: ApplyScope;
  columns_ids: string[];
  hide_per_sector_save: boolean;
}

export const getCommonSettings = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("admin_common_settings")
      .select("common_filters,common_columns,apply_scope,apply_ids,columns_scope,columns_ids,hide_per_sector_save")
      .eq("id", "singleton")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = (data ?? {
      common_filters: [],
      common_columns: null,
      apply_scope: "all",
      apply_ids: [],
      columns_scope: "all",
      columns_ids: [],
      hide_per_sector_save: false,
    }) as unknown as CommonSettingsRow;

    return { settings: row };
  });

export const saveCommonSettings = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((d: Partial<CommonSettingsRow>) => {
    const okScope = (s: any): ApplyScope =>
      s === "selected" || s === "excluded" ? s : "all";
    return {
      common_filters: Array.isArray(d?.common_filters) ? d.common_filters.slice(0, 40) : [],
      common_columns: Array.isArray(d?.common_columns) ? (d.common_columns.slice(0, 60) as ColKey[]) : null,
      apply_scope: okScope(d?.apply_scope),
      apply_ids: Array.isArray(d?.apply_ids) ? d.apply_ids.map(String).slice(0, 200) : [],
      columns_scope: okScope(d?.columns_scope),
      columns_ids: Array.isArray(d?.columns_ids) ? d.columns_ids.map(String).slice(0, 200) : [],
      hide_per_sector_save: d?.hide_per_sector_save === true,
    };
  })
  .handler(async ({ data, context }) => {
    const payload: any = { id: "singleton", ...data, updated_by: context.userId, updated_at: new Date().toISOString() };
    const { data: row, error } = await context.supabase
      .from("admin_common_settings")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { settings: row as unknown as CommonSettingsRow };
  });


export function scopeApplies(
  scope: ApplyScope,
  ids: string[],
  presetId: string,
): boolean {
  if (scope === "all") return true;
  const inList = ids.includes(presetId);
  return scope === "selected" ? inList : !inList;
}

// ── Merge helper ─────────────────────────────────────────────────────────
export interface MergedPreset extends Preset {
  group: string;
  unlocked: boolean;
  columns?: ColKey[];
}

export function applyOverrides(
  presets: Preset[],
  overrides: PresetOverrideRow[],
): { presets: MergedPreset[]; defaultId: string | null } {
  const byId = new Map(overrides.map((o) => [o.preset_id, o]));
  const out: MergedPreset[] = [];
  let defaultId: string | null = null;
  for (const p of presets) {
    const ov = byId.get(p.id);
    if (ov?.hidden) continue;
    const merged: MergedPreset = {
      ...p,
      filters: ov?.filters ?? p.filters,
      group: ov?.group_name || defaultGroupFor(p.id),
      unlocked: Boolean(ov?.unlocked),
      columns: ov?.columns ?? p.columns,
    };
    if (ov?.is_default) defaultId = p.id;
    out.push(merged);
  }
  return { presets: out, defaultId };
}

// Merge preset filters with common filters (dedupe by field+op).
// Common filters win only when the preset doesn't already touch that field.
export function mergeWithCommonFilters(
  presetFilters: Filter[],
  common: Filter[],
): Filter[] {
  const seen = new Set(presetFilters.map((f) => f.field));
  const extra = common.filter((f) => !seen.has(f.field));
  return [...presetFilters, ...extra];
}

