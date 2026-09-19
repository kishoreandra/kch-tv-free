// Admin-only page to manage built-in scanner presets: edit filters via a
// structured (non-JSON) editor, assign a group, mark as unlocked, hide, or
// set as the default landing preset. Groups can also be created/renamed
// and reordered here — the screeners page reads them via applyOverrides.
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ProfileMenu } from "@/components/ProfileMenu";

import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, ArrowDown, EyeOff, GripVertical, History, Plus, RotateCcw, Save, Star, Trash2, Unlock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FIELD_DEFS,
  FIELD_BY_ID,
  PRESETS,
  COLUMN_META,
  defaultGroupFor,
  type Filter,
  type Operator,
  type ColKey,
} from "@/lib/screener/filters";
import {
  listPresetOverrides,
  savePresetOverride,
  resetPresetOverride,
  setPresetsHidden,
  listPresetGroups,
  savePresetGroup,
  deletePresetGroup,
  getCommonSettings,
  saveCommonSettings,
  applyOverrides,
  type PresetOverrideRow,
  type ApplyScope,
} from "@/lib/admin/preset-overrides.functions";
import { installSnapshotCronJobs } from "@/lib/admin/install-cron.functions";
import { backfillIndexHistory } from "@/lib/admin/index-backfill.functions";
import { supabase } from "@/integrations/supabase/client";

import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Settings2 } from "lucide-react";

export const Route = createFileRoute("/admin/scanners")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Scanner Admin — NSE MultiView" },
      { name: "description", content: "Manage scanner visibility, ordering and preset overrides for the NSE screener library." },
      { property: "og:title", content: "Scanner Admin — NSE MultiView" },
      { property: "og:description", content: "Admin controls for NSE screener presets and scanner visibility." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    if (typeof window === "undefined") throw redirect({ to: "/" });
  },
  component: AdminScannersPage,
});

// ── Operator metadata ────────────────────────────────────────────────────
const OP_LABELS: Record<Operator, string> = {
  gt: "greater than",
  gte: "≥ (greater or equal)",
  lt: "less than",
  lte: "≤ (less or equal)",
  between: "between",
  eq: "equals",
  not_eq: "does not equal",
  in: "is one of",
  not_in: "is not one of",
  cmp_field: "compared to another field",
  above_by: "% above another field (range)",
  below_by: "% below another field (range)",
};

function opsForField(fieldId: string): Operator[] {
  const def = FIELD_BY_ID[fieldId];
  if (!def) return ["gt", "gte", "lt", "lte", "between"];
  if (def.type === "enum") return ["eq", "not_eq", "in", "not_in"];
  return ["gt", "gte", "lt", "lte", "between", "cmp_field", "above_by", "below_by"];
}

// ── Filter row editor ────────────────────────────────────────────────────
function FilterRow({
  filter,
  onChange,
  onRemove,
}: {
  filter: Filter;
  onChange: (f: Filter) => void;
  onRemove: () => void;
}) {
  const def = FIELD_BY_ID[filter.field];
  const ops = opsForField(filter.field);
  const isNum = def?.type !== "enum";

  const setField = (id: string) => {
    const nextDef = FIELD_BY_ID[id];
    const nextOp = nextDef?.type === "enum" ? "eq" : ops.includes(filter.op) ? filter.op : "gte";
    onChange({ ...filter, field: id, op: nextOp as Operator });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
      <Select value={filter.field} onValueChange={setField}>
        <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder="Field" /></SelectTrigger>
        <SelectContent>
          {["Price", "Volume", "Market", "Performance", "Technicals", "Fundamentals"].map((cat) => (
            <SelectGroup key={cat}>
              <SelectLabel className="text-xs">{cat}</SelectLabel>
              {FIELD_DEFS.filter((f) => f.category === cat).map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <Select value={filter.op} onValueChange={(v) => onChange({ ...filter, op: v as Operator })}>
        <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ops.map((o) => (<SelectItem key={o} value={o}>{OP_LABELS[o]}</SelectItem>))}
        </SelectContent>
      </Select>

      {isNum && ["gt", "gte", "lt", "lte"].includes(filter.op) && (
        <Input
          type="number"
          className="h-8 w-[130px] text-xs"
          value={filter.value ?? ""}
          onChange={(e) => onChange({ ...filter, value: e.target.value === "" ? undefined : Number(e.target.value) })}
          placeholder="value"
        />
      )}

      {isNum && filter.op === "between" && (
        <>
          <Input
            type="number"
            className="h-8 w-[110px] text-xs"
            value={filter.value ?? ""}
            onChange={(e) => onChange({ ...filter, value: e.target.value === "" ? undefined : Number(e.target.value) })}
            placeholder="min"
          />
          <span className="text-xs text-muted-foreground">and</span>
          <Input
            type="number"
            className="h-8 w-[110px] text-xs"
            value={filter.value2 ?? ""}
            onChange={(e) => onChange({ ...filter, value2: e.target.value === "" ? undefined : Number(e.target.value) })}
            placeholder="max"
          />
        </>
      )}

      {filter.op === "eq" && def?.type === "enum" && (
        def.options ? (
          <Select
            value={filter.enumValue ?? ""}
            onValueChange={(v) => onChange({ ...filter, enumValue: v })}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="value" /></SelectTrigger>
            <SelectContent>
              {def.options.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            className="h-8 w-[160px] text-xs"
            value={filter.enumValue ?? ""}
            onChange={(e) => onChange({ ...filter, enumValue: e.target.value })}
            placeholder="value"
          />
        )
      )}

      {(filter.op === "in" || filter.op === "not_in") && def?.type === "enum" && def.options && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-border/60 px-2 py-1.5">
          {def.options.map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-1.5 text-xs">
              <Checkbox
                checked={(filter.enumValues ?? []).includes(option)}
                onCheckedChange={(checked) => {
                  const current = filter.enumValues ?? [];
                  onChange({
                    ...filter,
                    enumValues: checked
                      ? Array.from(new Set([...current, option]))
                      : current.filter((value) => value !== option),
                  });
                }}
              />
              {option}%
            </label>
          ))}
        </div>
      )}

      {(filter.op === "cmp_field" || filter.op === "above_by" || filter.op === "below_by") && (
        <>
          <span className="text-xs text-muted-foreground">
            {filter.op === "cmp_field" ? "compared to" : "vs"}
          </span>
          <Select
            value={filter.refField ?? ""}
            onValueChange={(v) => onChange({ ...filter, refField: v })}
          >
            <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue placeholder="other field" /></SelectTrigger>
            <SelectContent>
              {FIELD_DEFS.filter((f) => f.type !== "enum").map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {filter.op === "cmp_field" && (
        <Select
          value={filter.cmpOp ?? "gt"}
          onValueChange={(v) => onChange({ ...filter, cmpOp: v as any })}
        >
          <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="gt">&gt;</SelectItem>
            <SelectItem value="gte">≥</SelectItem>
            <SelectItem value="lt">&lt;</SelectItem>
            <SelectItem value="lte">≤</SelectItem>
          </SelectContent>
        </Select>
      )}

      {(filter.op === "above_by" || filter.op === "below_by") && (
        <>
          <span className="text-xs text-muted-foreground">by</span>
          <Input
            type="number"
            className="h-8 w-[80px] text-xs"
            value={filter.value ?? ""}
            onChange={(e) => onChange({ ...filter, value: e.target.value === "" ? undefined : Number(e.target.value) })}
            placeholder="min %"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="number"
            className="h-8 w-[80px] text-xs"
            value={filter.value2 ?? ""}
            onChange={(e) => onChange({ ...filter, value2: e.target.value === "" ? undefined : Number(e.target.value) })}
            placeholder="max %"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </>
      )}

      <Button variant="ghost" size="sm" onClick={onRemove} className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
function AdminScannersPage() {
  const { user, isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listPresetOverrides);
  const saveFn = useServerFn(savePresetOverride);
  const resetFn = useServerFn(resetPresetOverride);
  const listGroupsFn = useServerFn(listPresetGroups);
  const saveGroupFn = useServerFn(savePresetGroup);
  const delGroupFn = useServerFn(deletePresetGroup);
  const hideFn = useServerFn(setPresetsHidden);

  const overridesQuery = useQuery({
    queryKey: ["preset-overrides"],
    queryFn: () => listFn(),
    enabled: !!user && isAdmin,
  });
  const groupsQuery = useQuery({
    queryKey: ["preset-groups"],
    queryFn: () => listGroupsFn(),
    enabled: !!user && isAdmin,
  });

  const [selectedId, setSelectedId] = useState<string>("");
  const [defaultInitApplied, setDefaultInitApplied] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [hidden, setHidden] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [groupName, setGroupName] = useState<string>("");
  const [columns, setColumns] = useState<ColKey[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [newGroup, setNewGroup] = useState("");

  const overridesById = useMemo(() => {
    const m = new Map<string, PresetOverrideRow>();
    for (const o of overridesQuery.data?.overrides ?? []) m.set(o.preset_id, o);
    return m;
  }, [overridesQuery.data]);

  const selectedPreset = PRESETS.find((p) => p.id === selectedId);

  // Sidebar list grouped by (overridden) group name so visibility can be
  // toggled per scanner or for a whole group at once.
  const groupedPresets = useMemo(() => {
    const map = new Map<string, typeof PRESETS>();
    for (const p of PRESETS) {
      const g = overridesById.get(p.id)?.group_name ?? defaultGroupFor(p.id);
      const arr = map.get(g) ?? [];
      arr.push(p);
      map.set(g, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [overridesById]);

  const hiddenCount = useMemo(
    () => PRESETS.filter((p) => overridesById.get(p.id)?.hidden).length,
    [overridesById],
  );

  const currentOverride = selectedPreset ? overridesById.get(selectedPreset.id) : undefined;

  useEffect(() => {
    if (defaultInitApplied || !overridesQuery.data) return;
    const defaultOv = (overridesQuery.data.overrides ?? []).find((o) => o.is_default);
    const target = defaultOv?.preset_id ?? PRESETS[0]?.id ?? "";
    if (target) setSelectedId(target);
    setDefaultInitApplied(true);
  }, [overridesQuery.data, defaultInitApplied]);

  useEffect(() => {
    if (!selectedPreset) return;
    setFilters(currentOverride?.filters ?? selectedPreset.filters);
    setHidden(Boolean(currentOverride?.hidden));
    setIsDefault(Boolean(currentOverride?.is_default));
    setUnlocked(Boolean(currentOverride?.unlocked));
    setGroupName(currentOverride?.group_name ?? defaultGroupFor(selectedPreset.id));
    setColumns(currentOverride?.columns ?? null);
    setDirty(false);
  }, [selectedId, currentOverride]);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => saveFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preset-overrides"] });
      toast.success("Saved");
      setDirty(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const resetMutation = useMutation({
    mutationFn: async (preset_id: string) => resetFn({ data: { preset_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preset-overrides"] });
      toast.success("Reset to built-in");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reset failed"),
  });

  const saveGroupMutation = useMutation({
    mutationFn: async (name: string) => saveGroupFn({ data: { name, sort_order: 100 } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preset-groups"] });
      toast.success("Group created");
      setNewGroup("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Group create failed"),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (name: string) => delGroupFn({ data: { name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preset-groups"] });
      qc.invalidateQueries({ queryKey: ["preset-overrides"] });
      toast.success("Group deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Group delete failed"),
  });

  // Bulk / inline visibility toggle from the sidebar checkboxes.
  const visibilityMutation = useMutation({
    mutationFn: async (v: { preset_ids: string[]; hidden: boolean }) => hideFn({ data: v }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["preset-overrides"] });
      toast.success(v.hidden ? "Hidden from screener" : "Visible in screener");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });


  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!user || !isAdmin) return <div className="p-6 text-sm text-destructive">Admin only.</div>;

  const handleSave = () => {
    if (!selectedPreset) return;
    saveMutation.mutate({
      preset_id: selectedPreset.id,
      filters,
      hidden,
      is_default: isDefault,
      unlocked,
      group_name: groupName || null,
      columns: columns && columns.length > 0 ? columns : null,
    });
  };

  const { presets: merged, defaultId } = applyOverrides(
    PRESETS,
    overridesQuery.data?.overrides ?? [],
  );

  const allGroupNames = Array.from(
    new Set<string>([
      ...(groupsQuery.data?.groups ?? []).map((g) => g.name),
      ...PRESETS.map((p) => defaultGroupFor(p.id)),
    ]),
  ).sort();

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <Link to="/">
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back</Button>
          </Link>
          <h1 className="text-sm font-semibold">Scanner editor</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            Default: <span className="font-medium text-foreground">{defaultId ?? "—"}</span> · Visible: {merged.length}/{PRESETS.length}
          </div>
          <CommonSettingsButton allPresets={PRESETS} />
          <IndexHistoryButton />
          <ReinstallCronButton />

          <ProfileMenu />

        </div>
      </header>


      <div className="grid grid-cols-1 gap-0 md:grid-cols-[260px_1fr]" style={{ height: "calc(100vh - 41px)" }}>
        <aside className="overflow-y-auto border-r border-border/60">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[10px] uppercase text-muted-foreground">
            <span>Show in screener</span>
            <span>{PRESETS.length - hiddenCount}/{PRESETS.length}</span>
          </div>
          {groupedPresets.map(([groupLabel, items]) => {
            const ids = items.map((p) => p.id);
            const visibleCount = items.filter((p) => !overridesById.get(p.id)?.hidden).length;
            const allVisible = visibleCount === items.length;
            return (
              <div key={groupLabel}>
                <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5">
                  <Checkbox
                    checked={allVisible}
                    disabled={visibilityMutation.isPending}
                    onCheckedChange={(v) =>
                      visibilityMutation.mutate({ preset_ids: ids, hidden: !v })
                    }
                    aria-label={`Toggle all scanners in ${groupLabel}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase text-muted-foreground">
                    {groupLabel}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{visibleCount}/{items.length}</span>
                </div>
                <ul className="divide-y divide-border/40">
                  {items.map((p) => {
                    const ov = overridesById.get(p.id);
                    const active = p.id === selectedId;
                    const isHidden = Boolean(ov?.hidden);
                    return (
                      <li
                        key={p.id}
                        className={`flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted ${active ? "bg-muted" : ""}`}
                      >
                        <Checkbox
                          checked={!isHidden}
                          disabled={visibilityMutation.isPending}
                          onCheckedChange={(v) =>
                            visibilityMutation.mutate({ preset_ids: [p.id], hidden: !v })
                          }
                          aria-label={`Show ${p.name} in screener`}
                        />
                        <button
                          onClick={() => setSelectedId(p.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className={`min-w-0 flex-1 truncate ${isHidden ? "text-muted-foreground line-through" : ""}`}>
                            {p.name}
                          </span>
                          {ov?.is_default && <Star className="h-3 w-3 shrink-0 fill-yellow-500 text-yellow-500" />}
                          {ov?.unlocked && <Unlock className="h-3 w-3 shrink-0 text-emerald-500" />}
                          {isHidden && <EyeOff className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          {ov?.filters && !isHidden && <span className="shrink-0 text-[10px] text-amber-500">edited</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}


          {/* Group manager */}
          <div className="border-t border-border/60 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">Groups</div>
            <ul className="mb-2 space-y-1">
              {allGroupNames.map((g) => {
                const editable = (groupsQuery.data?.groups ?? []).some((x) => x.name === g);
                return (
                  <li key={g} className="flex items-center justify-between rounded px-1 py-0.5 text-xs">
                    <span className="truncate">{g}</span>
                    {editable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete group "${g}"? Presets in this group will fall back to their default group.`)) {
                            deleteGroupMutation.mutate(g);
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-1">
              <Input
                className="h-7 text-xs"
                placeholder="New group name"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={() => newGroup.trim() && saveGroupMutation.mutate(newGroup.trim())}
                disabled={!newGroup.trim() || saveGroupMutation.isPending}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </aside>

        <main className="flex flex-col overflow-hidden">
          {selectedPreset ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{selectedPreset.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">{selectedPreset.description}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">id: {selectedPreset.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs">
                    <span>Group</span>
                    <Select value={groupName} onValueChange={(v) => { setGroupName(v); setDirty(true); }}>
                      <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {allGroupNames.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={unlocked} onCheckedChange={(v) => { setUnlocked(v); setDirty(true); }} />
                    <span>Unlocked</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={hidden} onCheckedChange={(v) => { setHidden(v); setDirty(true); }} />
                    <span>Hidden</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={isDefault} onCheckedChange={(v) => { setIsDefault(v); setDirty(true); }} />
                    <span>Default</span>
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resetMutation.mutate(selectedPreset.id)}
                    disabled={!currentOverride || resetMutation.isPending}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                    <Save className="mr-1 h-3.5 w-3.5" />
                    {saveMutation.isPending ? "Saving…" : dirty ? "Save*" : "Save"}
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                <div className="mb-3 flex items-center justify-between">
                  <Label className="text-xs">Filters ({filters.length})</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFilters((arr) => [...arr, { field: "price", op: "gte", value: 0 } as Filter]);
                      setDirty(true);
                    }}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add filter
                  </Button>
                </div>
                <div className="space-y-2">
                  {filters.map((f, i) => (
                    <FilterRow
                      key={i}
                      filter={f}
                      onChange={(nf) => { setFilters((arr) => arr.map((x, idx) => (idx === i ? nf : x))); setDirty(true); }}
                      onRemove={() => { setFilters((arr) => arr.filter((_, idx) => idx !== i)); setDirty(true); }}
                    />
                  ))}
                  {filters.length === 0 && (
                    <div className="rounded border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                      No filters — this scanner returns every symbol. Add at least one filter.
                    </div>
                  )}
                </div>

                {/* Per-scanner columns override */}
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="text-xs">
                      Columns override {columns ? `(${columns.length})` : "(inherit)"}
                    </Label>
                    {columns && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setColumns(null); setDirty(true); }}>
                        Reset to inherit
                      </Button>
                    )}
                  </div>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    When set, these columns override both the user's saved columns and the Common settings for this scanner.
                  </p>
                  {columns && columns.length > 0 && (
                    <ColumnOrderList
                      value={columns}
                      onChange={(next) => { setDirty(true); setColumns(next); }}
                    />
                  )}
                  <div className="grid grid-cols-2 gap-1 rounded border border-border/60 p-2 md:grid-cols-3">
                    {COLUMN_META.map((c) => {
                      const active = columns?.includes(c.key) ?? false;
                      return (
                        <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted">
                          <Checkbox
                            checked={active}
                            onCheckedChange={(v) => {
                              setDirty(true);
                              setColumns((prev) => {
                                const set = new Set(prev ?? []);
                                if (v) set.add(c.key); else set.delete(c.key);
                                return Array.from(set);
                              });
                            }}
                          />
                          <span>{c.label}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground">{c.group}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">Pick a scanner from the left.</div>
          )}
        </main>
      </div>
    </div>
  );
}

// Reorder the selected columns; the saved array order is the display order
// users see in the screener results table.
const COL_LABEL = new Map(COLUMN_META.map((c) => [c.key, c.label]));
function ColumnOrderList({ value, onChange }: { value: ColKey[]; onChange: (next: ColKey[]) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const drop = (to: number) => {
    if (drag == null || drag === to) return;
    const next = [...value];
    const [item] = next.splice(drag, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };
  return (
    <div className="mb-2 space-y-1 rounded border border-border/60 p-2">
      <div className="mb-1 text-[11px] text-muted-foreground">Column order (left → right) — drag to rearrange</div>
      {value.map((k, i) => (
        <div
          key={k}
          draggable
          onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(e) => { e.preventDefault(); if (over !== i) setOver(i); }}
          onDragLeave={() => setOver((o) => (o === i ? null : o))}
          onDrop={(e) => { e.preventDefault(); drop(i); setDrag(null); setOver(null); }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          className={`flex cursor-grab items-center gap-1 rounded px-1 text-xs active:cursor-grabbing ${over === i && drag !== i ? "bg-primary/10 ring-1 ring-primary/40" : ""} ${drag === i ? "opacity-50" : ""}`}
        >
          <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="w-5 shrink-0 text-muted-foreground">{i + 1}.</span>
          <span className="flex-1 truncate">{COL_LABEL.get(k) ?? k}</span>
          <button
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            disabled={i === 0}
            onClick={() => move(i, -1)}
            aria-label="Move up"
          ><ArrowUp className="h-3 w-3" /></button>
          <button
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            disabled={i === value.length - 1}
            onClick={() => move(i, 1)}
            aria-label="Move down"
          ><ArrowDown className="h-3 w-3" /></button>
        </div>
      ))}
    </div>
  );
}


// ── Common settings dialog ──────────────────────────────────────────────
function CommonSettingsButton({ allPresets }: { allPresets: typeof PRESETS }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCommonSettings);
  const saveFn = useServerFn(saveCommonSettings);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["admin-common-settings"],
    queryFn: () => getFn(),
    enabled: open,
  });

  const [filters, setFilters] = useState<Filter[]>([]);
  const [applyScope, setApplyScope] = useState<ApplyScope>("all");
  const [applyIds, setApplyIds] = useState<string[]>([]);
  const [cols, setCols] = useState<ColKey[]>([]);
  const [colsScope, setColsScope] = useState<ApplyScope>("all");
  const [colsIds, setColsIds] = useState<string[]>([]);
  const [hidePerSector, setHidePerSector] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    const s = q.data.settings;
    setFilters(Array.isArray(s.common_filters) ? s.common_filters : []);
    setApplyScope(s.apply_scope ?? "all");
    setApplyIds(Array.isArray(s.apply_ids) ? s.apply_ids : []);
    setCols(Array.isArray(s.common_columns) ? s.common_columns : []);
    setColsScope(s.columns_scope ?? "all");
    setColsIds(Array.isArray(s.columns_ids) ? s.columns_ids : []);
    setHidePerSector(s.hide_per_sector_save === true);
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: async () =>
      saveFn({
        data: {
          common_filters: filters,
          common_columns: cols.length > 0 ? cols : null,
          apply_scope: applyScope,
          apply_ids: applyIds,
          columns_scope: colsScope,
          columns_ids: colsIds,
          hide_per_sector_save: hidePerSector,
        },
      }),
    onSuccess: () => {
      toast.success("Common settings saved");
      qc.invalidateQueries({ queryKey: ["admin-common-settings"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const togglePresetIn = (list: string[], id: string, set: (v: string[]) => void) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-1 h-3.5 w-3.5" /> Common settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Common filters & columns</DialogTitle>
          <DialogDescription>
            These apply on top of individual scanner filters/columns based on the scope you pick. Per-scanner column overrides win over these.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-2 rounded-md border border-border p-2 text-xs">
          <Checkbox
            checked={hidePerSector}
            onCheckedChange={(v) => setHidePerSector(v === true)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Hide "Per sector" save option</span>
            <span className="block text-[11px] text-muted-foreground">
              Removes the bulk "Per sector (multiple lists)" action from the screener's Save to watchlist menu for everyone.
            </span>
          </span>
        </label>

        <div className="grid max-h-[70vh] grid-cols-1 gap-6 overflow-auto pr-1 md:grid-cols-2">
          {/* Common filters */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs font-semibold">Common filters ({filters.length})</Label>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  setFilters((arr) => [...arr, { field: "price", op: "gte", value: 0 } as Filter])
                }
              >
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {filters.map((f, i) => (
                <FilterRow
                  key={i}
                  filter={f}
                  onChange={(nf) => setFilters((arr) => arr.map((x, idx) => (idx === i ? nf : x)))}
                  onRemove={() => setFilters((arr) => arr.filter((_, idx) => idx !== i))}
                />
              ))}
              {filters.length === 0 && (
                <div className="rounded border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                  No common filters.
                </div>
              )}
            </div>
            <div className="mt-3">
              <Label className="text-xs">Apply to</Label>
              <Select value={applyScope} onValueChange={(v) => setApplyScope(v as ApplyScope)}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scanners</SelectItem>
                  <SelectItem value="selected">Only selected scanners</SelectItem>
                  <SelectItem value="excluded">All except excluded</SelectItem>
                </SelectContent>
              </Select>
              {applyScope !== "all" && (
                <div className="mt-2 max-h-40 overflow-auto rounded border border-border/60 p-2">
                  {allPresets.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 px-1 py-0.5 text-xs hover:bg-muted">
                      <Checkbox
                        checked={applyIds.includes(p.id)}
                        onCheckedChange={() => togglePresetIn(applyIds, p.id, setApplyIds)}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Common columns */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs font-semibold">Common columns ({cols.length})</Label>
              {cols.length > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCols([])}>
                  Clear
                </Button>
              )}
            </div>
            {cols.length > 0 && <ColumnOrderList value={cols} onChange={setCols} />}
            <div className="grid grid-cols-2 gap-1 rounded border border-border/60 p-2">
              {COLUMN_META.map((c) => {
                const active = cols.includes(c.key);
                return (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted">
                    <Checkbox
                      checked={active}
                      onCheckedChange={(v) =>
                        setCols((prev) => (v ? Array.from(new Set([...prev, c.key])) : prev.filter((k) => k !== c.key)))
                      }
                    />
                    <span>{c.label}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-3">
              <Label className="text-xs">Apply to</Label>
              <Select value={colsScope} onValueChange={(v) => setColsScope(v as ApplyScope)}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scanners</SelectItem>
                  <SelectItem value="selected">Only selected scanners</SelectItem>
                  <SelectItem value="excluded">All except excluded</SelectItem>
                </SelectContent>
              </Select>
              {colsScope !== "all" && (
                <div className="mt-2 max-h-40 overflow-auto rounded border border-border/60 p-2">
                  {allPresets.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 px-1 py-0.5 text-xs hover:bg-muted">
                      <Checkbox
                        checked={colsIds.includes(p.id)}
                        onCheckedChange={() => togglePresetIn(colsIds, p.id, setColsIds)}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Save className="mr-1 h-3.5 w-3.5" /> {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-installs the three snapshot cron jobs with the current CRON_SECRET.
// Needed after rotating the secret — otherwise pg_cron keeps calling the
// endpoints with the old header and every run silently 401s.
function ReinstallCronButton() {
  const install = useServerFn(installSnapshotCronJobs);
  const mut = useMutation({
    mutationFn: async () => install(),
    onSuccess: (r: any) => toast.success(r?.message ?? "Cron jobs installed"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Install failed"),
  });
  return (
    <Button size="sm" variant="outline" onClick={() => mut.mutate()} disabled={mut.isPending}>
      {mut.isPending ? "Installing…" : "Reinstall cron"}
    </Button>
  );
}

// Fills `index_prices` from NSE's daily index-close archive. Needed once, and
// again whenever an archive-backed index is added to the markets catalog —
// Yahoo carries none of them, so those tiles have no candles until this runs.
// The server fn spends its own time budget per call, so this loops until the
// walk reaches `from` or the admin stops it.
function IndexHistoryButton() {
  const backfill = useServerFn(backfillIndexHistory);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("2017-01-01");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    sessions: number;
    batches: number;
    failures: number;
    stoppedAt: string | null;
    done: boolean;
  } | null>(null);
  const stopRef = useRef(false);

  // Existing coverage, so it's obvious whether a backfill is even needed.
  const coverage = useQuery({
    queryKey: ["index-price-coverage"],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      const [count, earliest] = await Promise.all([
        supabase.from("index_prices").select("*", { count: "exact", head: true }),
        supabase
          .from("index_prices")
          .select("trade_date")
          .order("trade_date", { ascending: true })
          .limit(1),
      ]);
      // RLS hides the table from non-approved users; surface that rather than
      // showing a misleading "0 rows".
      if (count.error || earliest.error) {
        return { rows: null as number | null, earliest: null as string | null };
      }
      return {
        rows: count.count ?? 0,
        earliest: (earliest.data?.[0]?.trade_date as string | undefined) ?? null,
      };
    },
  });

  const run = async () => {
    setRunning(true);
    setError(null);
    stopRef.current = false;
    const totals = {
      sessions: 0,
      batches: 0,
      failures: 0,
      stoppedAt: null as string | null,
      done: false,
    };
    setProgress({ ...totals });
    try {
      // Hard cap so a mis-set `from` can't loop forever.
      for (let pass = 0; pass < 100; pass += 1) {
        const r = await backfill({ data: { from } });
        totals.sessions += r.sessions;
        totals.batches += r.batches;
        totals.failures += r.failures;
        totals.stoppedAt = r.stoppedAt;
        totals.done = r.done;
        setProgress({ ...totals });
        if (r.done || stopRef.current) break;
      }
      qc.invalidateQueries({ queryKey: ["ohlc"] });
      qc.invalidateQueries({ queryKey: ["index-price-coverage"] });
      if (totals.done) {
        toast.success(`Index history complete: ${totals.sessions} sessions.`);
      } else {
        toast.warning(
          `Stopped at ${totals.stoppedAt ?? "—"} — ${totals.sessions} sessions written so far.`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Backfill failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!running) setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <History className="mr-1 h-3.5 w-3.5" /> Index history
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>NSE index history</DialogTitle>
          <DialogDescription>
            Builds <code>index_prices</code> from NSE&apos;s daily index-close archive. The
            archive-backed indices on /markets — Equal Weight, Smallcap 100, Microcap 250,
            Healthcare, Oil &amp; Gas — have no Yahoo data and render empty until this runs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border p-2 text-[11px] text-muted-foreground">
            {coverage.isPending ? (
              "Checking existing coverage…"
            ) : coverage.data?.rows == null ? (
              "Coverage unavailable (not readable with your account)."
            ) : coverage.data.rows === 0 ? (
              "No index history stored yet."
            ) : (
              <>
                {coverage.data.rows.toLocaleString()} rows stored · earliest{" "}
                {coverage.data.earliest ?? "—"}
              </>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="idx-from" className="text-xs">
              Backfill from
            </Label>
            <Input
              id="idx-from"
              type="date"
              value={from}
              disabled={running}
              onChange={(e) => setFrom(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              NSE&apos;s archive is reliable back to 2017-01-01.
            </p>
          </div>

          {progress && (
            <div className="rounded-md border border-border p-2 text-[11px] text-muted-foreground">
              <div>
                {progress.sessions.toLocaleString()} sessions · {progress.batches} batches
                {progress.failures > 0 ? ` · ${progress.failures} gaps skipped` : ""}
              </div>
              <div>Reached back to {progress.stoppedAt ?? "—"}</div>
              {progress.done && <div className="text-foreground">Complete.</div>}
            </div>
          )}

          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {running ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                stopRef.current = true;
              }}
            >
              Stop after this pass
            </Button>
          ) : (
            <Button size="sm" onClick={run}>
              Run backfill
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



