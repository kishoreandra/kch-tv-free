import { SymbolLink, TradingViewLink } from "@/components/SymbolLink";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BellRing,
  Plus,
  Play,
  Trash2,
  Pencil,
  Check,
  X,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReminderForm, ReminderList } from "@/components/RemindersPanel";
import { ApprovalGate } from "@/components/ApprovalGate";
import { AuthButton } from "@/components/AuthButton";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SymbolCombobox } from "@/components/SymbolCombobox";
import { useAuth } from "@/hooks/use-auth";
import {
  listPriceAlerts,
  listAlertTargets,
  createPriceAlert,
  updatePriceAlert,
  deletePriceAlert,
  bulkSymbolAlerts,
  runPriceAlertsNow,
  historyCoverage,
  backfillHistoryYahoo,
  type PriceAlertRow,
} from "@/lib/alerts/price-alerts.functions";
import { dailyDataStatus, refreshDailyDataNow } from "@/lib/history/ingest-status.functions";
import { ALERT_KINDS, KIND_MAP, defaultParams, describeKind } from "@/lib/alerts/alert-kinds";
import { describeAlertCondition } from "@/lib/alerts/price-alert-meta";

export const Route = createFileRoute("/price-alerts")({
  component: PriceAlertsPage,
  validateSearch: (search: Record<string, unknown>): { symbol?: string; note?: string } => {
    const out: { symbol?: string; note?: string } = {};
    if (typeof search.symbol === "string" && search.symbol) out.symbol = search.symbol;
    if (typeof search.note === "string" && search.note) out.note = search.note;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Technical Price & Volume Alerts · NSE Telegram Alerts" },
      {
        name: "description",
        content:
          "EMA crosses, pullbacks, volume dry-ups, pocket pivots and record-volume alerts on NSE stocks — daily and weekly, delivered to Telegram after market hours.",
      },
      { property: "og:title", content: "Technical Price & Volume Alerts · NSE Telegram Alerts" },
      {
        property: "og:description",
        content: "Daily and weekly price/volume alerts on NSE stocks, pushed to your Telegram bot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function describeRow(a: PriceAlertRow): string {
  if ((a.kind ?? "legacy") === "legacy") return describeAlertCondition(a);
  return describeKind(a.kind, a.timeframe, (a.params ?? {}) as Record<string, unknown>);
}

function PriceAlertsPage() {
  const { user, isAdmin } = useAuth();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const listFn = useServerFn(listPriceAlerts);
  const targetsFn = useServerFn(listAlertTargets);
  const coverageFn = useServerFn(historyCoverage);
  const createFn = useServerFn(createPriceAlert);
  const updateFn = useServerFn(updatePriceAlert);
  const deleteFn = useServerFn(deletePriceAlert);
  const bulkFn = useServerFn(bulkSymbolAlerts);
  const runFn = useServerFn(runPriceAlertsNow);
  const yahooFn = useServerFn(backfillHistoryYahoo);
  const statusFn = useServerFn(dailyDataStatus);
  const refreshDataFn = useServerFn(refreshDailyDataNow);
  const [seeding, setSeeding] = useState<string | null>(null);

  // Freshness of the EOD pipeline — surfaces stale/missing latest candles.
  const freshness = useQuery({
    queryKey: ["daily-data-status"],
    queryFn: () => statusFn({}),
    staleTime: 60_000,
  });

  const refreshMut = useMutation({
    mutationFn: () => refreshDataFn({ data: {} }),
    onSuccess: (r: any) => {
      if (r.status === "ok") toast.success(r.message);
      else if (r.status === "partial") toast.warning(r.message);
      else toast.error(r.message);
      freshness.refetch();
      qc.invalidateQueries({ queryKey: ["price-history-coverage"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Refresh failed"),
  });


  // Seeds deep history from Yahoo in batches until every tracked symbol is done.
  const seedHistory = async () => {
    setSeeding("Starting…");
    try {
      let offset = 0;
      let symbols = 0;
      let rows = 0;
      for (let i = 0; i < 40; i++) {
        const r = await yahooFn({ data: { scope: "tracked", years: 3, limit: 60, offset } });
        symbols += r.processed;
        rows += r.rows;
        setSeeding(`${symbols} / ${r.total} symbols · ${rows.toLocaleString()} bars`);
        if (r.next_offset == null) break;
        offset = r.next_offset;
      }
      toast.success(`Backfilled ${symbols} symbols (${rows.toLocaleString()} bars)`);
      qc.invalidateQueries({ queryKey: ["price-history-coverage"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setSeeding(null);
    }
  };

  const [tab, setTab] = useState<"alerts" | "reminders">("alerts");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "paused" | "triggered">("all");
  const [firedSince, setFiredSince] = useState("");
  const [symbol, setSymbol] = useState(() => (search.symbol ?? "").toUpperCase());
  const [kind, setKind] = useState<string>("price_level");
  const [timeframe, setTimeframe] = useState<"D" | "W">("D");
  const [params, setParams] = useState<Record<string, string | number>>(() => defaultParams("price_level") as Record<string, string | number>);
  const [note, setNote] = useState(search.note ?? "");
  const [repeatAlert, setRepeatAlert] = useState(false);
  const [applyTo, setApplyTo] = useState<"symbol" | "positions" | "watchlist" | "both" | "lists">("symbol");
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [editingNote, setEditingNote] = useState<{ id: string; value: string } | null>(null);
  const [groupMode, setGroupMode] = useState<"flat" | "symbol" | "rule" | "day">("flat");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  // Bulk-select is opt-in: checkboxes stay hidden until "Select" is pressed,
  // then whole rows become click-to-toggle. Keeps the table clean by default.
  const [selectMode, setSelectMode] = useState(false);


  const spec = KIND_MAP[kind];

  const alertsQuery = useQuery({
    queryKey: ["price-alerts"],
    queryFn: () => listFn(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const targetsQuery = useQuery({
    queryKey: ["price-alert-targets"],
    queryFn: () => targetsFn(),
    enabled: !!user,
    staleTime: 300_000,
  });
  const coverageQuery = useQuery({
    queryKey: ["price-history-coverage"],
    queryFn: () => coverageFn(),
    enabled: !!user,
    staleTime: 600_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: { symbol, kind, timeframe, params, note: note || null, repeat_alert: repeatAlert, apply_to: applyTo, list_names: selectedLists },
      }),
    onSuccess: (r) => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["price-alerts"] });
      toast.success(`${r.created} alert(s) created`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create alert"),
  });

  const updateMut = useMutation({
    mutationFn: (v: { id: string; enabled?: boolean; note?: string | null }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-alerts"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-alerts"] }),
  });
  const runMut = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["price-alerts"] });
      if (r.fired === 0) toast.info(`Checked ${r.alerts} alerts — nothing triggered`);
      else if (r.sent) toast.success(`${r.fired} alert(s) sent to Telegram`);
      else toast.error(r.reason ?? "Alerts triggered but Telegram delivery failed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed"),
  });

  const bulkMut = useMutation({
    mutationFn: (v: { symbol: string; action: "enable" | "disable" | "delete" }) => bulkFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-alerts"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk action failed"),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const since = firedSince ? new Date(`${firedSince}T00:00:00`).getTime() : null;
    return (alertsQuery.data ?? []).filter((a) => {
      if (needle) {
        const hay = `${a.symbol} ${a.note ?? ""} ${describeRow(a)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (status === "active" && !a.enabled) return false;
      if (status === "paused" && a.enabled) return false;
      if (status === "triggered" && !a.last_triggered_at) return false;
      if (since != null) {
        if (!a.last_triggered_at) return false;
        if (new Date(a.last_triggered_at).getTime() < since) return false;
      }
      return true;
    });
  }, [alertsQuery.data, q, status, firedSince]);

  const grouped = useMemo(() => {
    const map = new Map<string, PriceAlertRow[]>();
    for (const a of filtered) {
      const arr = map.get(a.symbol) ?? [];
      arr.push(a);
      map.set(a.symbol, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // Identical rule text + timeframe collapse into a single auditable row.
  const groupedByRule = useMemo(() => {
    const map = new Map<string, PriceAlertRow[]>();
    for (const a of filtered) {
      const key = `${a.timeframe}|${describeRow(a)}`;
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((x, y) => x.symbol.localeCompare(y.symbol));
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  // Grouped by the day the alert last fired (newest day first).
  const groupedByDay = useMemo(() => {
    const map = new Map<string, PriceAlertRow[]>();
    for (const a of filtered) {
      const key = a.last_triggered_at ? a.last_triggered_at.slice(0, 10) : "";
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    for (const arr of map.values())
      arr.sort(
        (x, y) =>
          new Date(y.last_triggered_at ?? 0).getTime() - new Date(x.last_triggered_at ?? 0).getTime(),
      );
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  }, [filtered]);




  const targets = targetsQuery.data;

  // Default the watchlist picker to Holdings + Buyable when lists first load.
  useEffect(() => {
    if (!targets?.lists?.length || selectedLists.length) return;
    const names = targets.lists.map((l) => l.name);
    const preferred = names.filter((n) => ["holdings", "buyable"].includes(n.toLowerCase()));
    if (preferred.length) setSelectedLists(preferred);
  }, [targets, selectedLists.length]);

  const listSymbolCount = useMemo(() => {
    const set = new Set<string>();
    for (const l of targets?.lists ?? []) {
      if (selectedLists.includes(l.name)) l.symbols.forEach((s) => set.add(s));
    }
    return set.size;
  }, [targets, selectedLists]);

  const applyCount =
    applyTo === "watchlist"
      ? (targets?.watchlist.length ?? 0)
      : applyTo === "positions"
        ? (targets?.positions.length ?? 0)
        : applyTo === "both"
          ? new Set([...(targets?.watchlist ?? []), ...(targets?.positions ?? [])]).size
          : applyTo === "lists"
            ? listSymbolCount
            : 1;

  // ------------------------------------------------------- selection helpers
  const toggleOne = (id: string, on: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleMany = (ids: string[], on: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) (on ? next.add(id) : next.delete(id));
      return next;
    });
  const setEnabledMany = async (ids: string[], enabled: boolean) => {
    await Promise.all(ids.map((id) => updateFn({ data: { id, enabled } })));
    qc.invalidateQueries({ queryKey: ["price-alerts"] });
  };
  const deleteMany = async (ids: string[]) => {
    await Promise.all(ids.map((id) => deleteFn({ data: { id } })));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    qc.invalidateQueries({ queryKey: ["price-alerts"] });
    toast.success(`Deleted ${ids.length} alert${ids.length > 1 ? "s" : ""}`);
  };
  const bulkSelected = (enabled: boolean) => setEnabledMany(Array.from(selectedIds), enabled);
  const deleteSelected = () => deleteMany(Array.from(selectedIds));

  // One dense row, shared by both grouping modes.
  const renderAlert = (a: PriceAlertRow, showSymbol: boolean) => (
    <li
      key={a.id}
      className={`rounded border px-2 py-1.5 text-sm ${
        selectMode
          ? `cursor-pointer ${selectedIds.has(a.id) ? "border-primary/60 bg-primary/5" : "border-border hover:bg-muted/40"}`
          : "border-border"
      }`}
      onClick={selectMode ? () => toggleOne(a.id, !selectedIds.has(a.id)) : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        {selectMode && (
          <input
            type="checkbox"
            className="pointer-events-none h-3.5 w-3.5 accent-primary"
            checked={selectedIds.has(a.id)}
            readOnly
          />
        )}
        {showSymbol ? (
          <>
            <SymbolLink symbol={a.symbol} className="text-sm font-semibold" />
            <TradingViewLink symbol={a.symbol} />
          </>
        ) : (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            {a.timeframe === "W" ? "Weekly" : "Daily"}
          </Badge>
        )}
        {!showSymbol && <span className="text-muted-foreground">{describeRow(a)}</span>}
        <span
          className={`rounded px-1 py-0.5 text-[10px] ${
            a.last_triggered_at
              ? "bg-emerald-500/10 text-emerald-500"
              : "bg-muted text-muted-foreground"
          }`}
          title={a.last_triggered_at ? new Date(a.last_triggered_at).toLocaleString("en-IN") : undefined}
        >
          {(a.times_triggered ?? 0) > 0
            ? `Triggered ${a.times_triggered}×${a.last_triggered_at ? ` · last ${new Date(a.last_triggered_at).toLocaleDateString("en-IN")}` : ""}`
            : "Never triggered"}
        </span>
        <div className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={a.enabled}
            title={a.enabled ? "Turn off" : "Turn on"}
            onCheckedChange={(v) => updateMut.mutate({ id: a.id, enabled: v })}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title="Edit note"
            onClick={() => setEditingNote({ id: a.id, value: a.note ?? "" })}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <ConfirmDelete
            label="Delete this alert?"
            onConfirm={() => deleteMut.mutate(a.id)}
            trigger={
              <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-500" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            }
          />
        </div>
      </div>
      {editingNote?.id === a.id ? (
        <div className="mt-1.5 flex items-center gap-1">
          <Input
            autoFocus
            value={editingNote.value}
            placeholder="Note"
            className="h-7 text-xs"
            onChange={(e) => setEditingNote({ id: a.id, value: e.target.value })}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => {
              updateMut.mutate({ id: a.id, note: editingNote.value || null });
              setEditingNote(null);
            }}
          >
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingNote(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        a.note && <p className="mt-1 text-xs text-muted-foreground">📝 {a.note}</p>
      )}
    </li>
  );


  return (
    <ApprovalGate
      signedOut={
        <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-center">
          <h1 className="text-2xl font-semibold">Technical price alerts</h1>
          <p className="text-sm text-muted-foreground">Please sign in to manage your alerts.</p>
          <AuthButton />
        </div>
      }
    >
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-1 h-4 w-4" /> Charts
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <BellRing className="h-4 w-4 text-amber-500" /> Price &amp; volume alerts
          </h1>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {freshness.data && (
              <span
                className={`rounded border px-2 py-1 text-[11px] ${
                  freshness.data.stale
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-600"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                }`}
                title={freshness.data.message ?? undefined}
              >
                {freshness.data.stale ? "⚠ Data as of " : "Data as of "}
                {freshness.data.latest_date ?? "—"}
                {freshness.data.stale ? ` (expected ${freshness.data.expected_date})` : ""}
                {freshness.data.missing_count
                  ? ` · ${freshness.data.missing_count} gap${freshness.data.missing_count > 1 ? "s" : ""}`
                  : ""}
              </span>
            )}
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refreshMut.mutate()}
                    disabled={refreshMut.isPending}
                  >
                    <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshMut.isPending ? "animate-spin" : ""}`} /> Refresh data
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">
                  Re-fetches the latest end-of-day prices from NSE into the database. Does not evaluate any
                  alerts.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
                    <Play className="mr-1 h-3.5 w-3.5" /> Check now
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">
                  Re-evaluates all your enabled alerts against the data already stored, and pushes any matches
                  to Telegram. Does not fetch new prices.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <ProfileMenu />
          </div>
        </header>


        <div className="shrink-0 px-3 pt-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="h-8">
              <TabsTrigger value="alerts" className="text-xs">Price &amp; volume alerts</TabsTrigger>
              <TabsTrigger value="reminders" className="text-xs">Custom reminders</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-3 lg:grid-cols-[380px_1fr]">
          <section className="h-full overflow-y-auto rounded-lg border border-border p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {tab === "alerts" ? "New alert" : "New reminder"}
            </h2>
            {tab === "reminders" && <ReminderForm />}
            <div className={`space-y-2 ${tab === "alerts" ? "" : "hidden"}`}>
              <SymbolCombobox value={symbol} onChange={setSymbol} />

              <Select value={kind} onValueChange={(k) => { setKind(k); setParams(defaultParams(k) as Record<string, string | number>); }}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-72">
                  {["Price & Trend", "Volume & Character", "Volume Records"].map((g) => (
                    <SelectGroup key={g}>
                      <SelectLabel>{g}</SelectLabel>
                      {ALERT_KINDS.filter((k) => k.group === g).map((k) => (
                        <SelectItem key={k.kind} value={k.kind}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {spec && <p className="text-[11px] leading-snug text-muted-foreground">{spec.hint}</p>}

              <div className="flex gap-2">
                {(["D", "W"] as const).map((tf) => (
                  <Button
                    key={tf}
                    size="sm"
                    variant={timeframe === tf ? "default" : "outline"}
                    className="h-7 flex-1 text-xs"
                    onClick={() => setTimeframe(tf)}
                  >
                    {tf === "D" ? "Daily" : "Weekly"}
                  </Button>
                ))}
              </div>

              {(spec?.params ?? []).map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-xs text-muted-foreground">{p.label}</span>
                  {p.type === "select" ? (
                    <Select
                      value={String(params[p.key] ?? p.default)}
                      onValueChange={(v) =>
                        setParams((prev) => ({ ...prev, [p.key]: Number.isNaN(Number(v)) ? v : Number(v) }))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {(p.options ?? []).map((o) => (
                          <SelectItem key={String(o.value)} value={String(o.value)}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex flex-1 items-center gap-1">
                      <Input
                        inputMode="decimal"
                        className="h-8 text-sm"
                        value={String(params[p.key] ?? p.default)}
                        onChange={(e) =>
                          setParams((prev) => ({ ...prev, [p.key]: e.target.value as unknown as number }))
                        }
                      />
                      {p.suffix && <span className="text-xs text-muted-foreground">{p.suffix}</span>}
                    </div>
                  )}
                </div>
              ))}

              <Select value={applyTo} onValueChange={(v) => setApplyTo(v as typeof applyTo)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="symbol">This symbol only</SelectItem>
                  <SelectItem value="positions">All open positions ({targets?.positions.length ?? 0})</SelectItem>
                  <SelectItem value="watchlist">All watchlist symbols ({targets?.watchlist.length ?? 0})</SelectItem>
                  <SelectItem value="both">Positions + watchlist</SelectItem>
                  <SelectItem value="lists">My watchlists (pick below)</SelectItem>
                </SelectContent>
              </Select>

              {applyTo === "lists" && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-border p-2">
                  {(targets?.lists ?? []).length === 0 && (
                    <p className="text-[11px] text-muted-foreground">No saved watchlists found.</p>
                  )}
                  {(targets?.lists ?? []).map((l) => (
                    <label key={l.name} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        checked={selectedLists.includes(l.name)}
                        onChange={(e) =>
                          setSelectedLists((prev) =>
                            e.target.checked ? [...prev, l.name] : prev.filter((n) => n !== l.name),
                          )
                        }
                      />
                      <span className="truncate">{l.name}</span>
                      <span className="ml-auto shrink-0 text-muted-foreground">{l.symbols.length}</span>
                    </label>
                  ))}
                </div>
              )}


              <Input
                placeholder="Note (shown in the list and in Telegram)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-8 text-sm"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={repeatAlert} onCheckedChange={setRepeatAlert} />
                Repeat on every check while true (default: only on the flip)
              </label>
              <Button
                size="sm"
                className="w-full"
                disabled={(applyTo === "symbol" && !symbol) || applyCount === 0 || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add alert{applyCount > 1 ? ` × ${applyCount}` : ""}
              </Button>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Alerts evaluate on end-of-day data and deliver to your Telegram bot. History available:{" "}
                {coverageQuery.data?.from ?? "—"} → {coverageQuery.data?.to ?? "—"}. Long-lookback alerts
                (EMA 200, record volume) are only as deep as this history.
              </p>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={!!seeding}
                  onClick={seedHistory}
                >
                  {seeding ? seeding : "Fast backfill history (Yahoo, 3y)"}
                </Button>
              )}
            </div>
          </section>

          <section className="flex min-h-0 min-w-0 flex-col rounded-lg border border-border p-3">
            {tab === "reminders" ? (
              <ReminderList enabled={!!user} />
            ) : (
              <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-xs font-semibold uppercase text-muted-foreground">
                Your alerts ({filtered.length}/{alertsQuery.data?.length ?? 0})
              </h2>
              <div className="flex items-center rounded border border-border p-0.5">
                {(["flat", "symbol", "rule", "day"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setGroupMode(m)}
                    className={`rounded px-2 py-0.5 text-[11px] ${
                      groupMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {m === "flat" ? "List" : m === "symbol" ? "By symbol" : m === "rule" ? "By rule" : "By day"}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant={selectMode ? "default" : "outline"}
                className="h-6 px-2 text-[11px]"
                title="Bulk-select alerts: click rows to pick them"
                onClick={() => {
                  if (selectMode) setSelectedIds(new Set());
                  setSelectMode(!selectMode);
                }}
              >
                {selectMode ? "Done" : "Select"}
              </Button>
              <div className="relative ml-auto">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-7 w-44 pl-7 text-xs"
                  placeholder="Search symbol or note"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger className="h-7 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="triggered">Triggered</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                className="h-7 w-36 text-xs"
                title="Only alerts triggered on/after this date"
                value={firedSince}
                onChange={(e) => setFiredSince(e.target.value)}
              />
              {(q || status !== "all" || firedSince) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setQ(""); setStatus("all"); setFiredSince(""); }}
                >
                  Clear
                </Button>
              )}
            </div>

            {selectMode && (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-primary/40 bg-primary/5 px-2 py-1">
                <span className="text-[11px] font-medium">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Click rows to select"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => toggleMany(filtered.map((r) => r.id), true)}
                >
                  Select all
                </Button>
                {selectedIds.size > 0 && (
                  <>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => bulkSelected(true)}>
                      Enable
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => bulkSelected(false)}>
                      Disable
                    </Button>
                    <ConfirmDelete
                      label={`Delete ${selectedIds.size} selected alert${selectedIds.size > 1 ? "s" : ""}?`}
                      onConfirm={deleteSelected}
                      trigger={
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-rose-500">
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                        </Button>
                      }
                    />
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 px-2 text-[11px]"
                  onClick={() => { setSelectedIds(new Set()); setSelectMode(false); }}
                >
                  Done
                </Button>
              </div>
            )}

            {alertsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!alertsQuery.isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {alertsQuery.data?.length ? "No alerts match these filters." : "No alerts yet. Create one on the left."}
              </p>
            )}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {groupMode === "flat" && filtered.length > 0 && (
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b border-border text-[11px] uppercase text-muted-foreground">
                      {selectMode && (
                        <th className="w-7 py-1.5 pl-1 text-left">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-primary"
                            title="Select all"
                            checked={filtered.every((r) => selectedIds.has(r.id))}
                            onChange={(e) => toggleMany(filtered.map((r) => r.id), e.target.checked)}
                          />
                        </th>
                      )}
                      <th className="py-1.5 text-left font-medium">Name</th>
                      <th className="w-24 py-1.5 text-left font-medium">Status</th>
                      <th className="w-32 py-1.5 text-left font-medium">Triggered</th>
                      <th className="w-28 py-1.5 text-left font-medium">Created on</th>
                      <th className="w-24 py-1.5 pr-1 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr
                        key={a.id}
                        className={`border-b border-border/60 align-top ${
                          selectMode
                            ? `cursor-pointer ${selectedIds.has(a.id) ? "bg-primary/5" : "hover:bg-muted/40"}`
                            : "hover:bg-muted/40"
                        }`}
                        onClick={selectMode ? () => toggleOne(a.id, !selectedIds.has(a.id)) : undefined}
                      >
                        {selectMode && (
                          <td className="py-1.5 pl-1">
                            <input
                              type="checkbox"
                              className="pointer-events-none h-3.5 w-3.5 accent-primary"
                              checked={selectedIds.has(a.id)}
                              readOnly
                            />
                          </td>
                        )}
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-2">
                            <SymbolLink symbol={a.symbol} className="text-sm font-semibold" />
                            <TradingViewLink symbol={a.symbol} />
                            {a.note && <span className="truncate text-xs">{a.note}</span>}
                            <Badge variant="outline" className="h-4 px-1 text-[10px]">
                              {a.timeframe === "W" ? "W" : "D"}
                            </Badge>
                          </div>
                          {editingNote?.id === a.id ? (
                            <div className="mt-1 flex items-center gap-1">
                              <Input
                                autoFocus
                                value={editingNote.value}
                                placeholder="Note"
                                className="h-6 text-xs"
                                onChange={(e) => setEditingNote({ id: a.id, value: e.target.value })}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => {
                                  updateMut.mutate({ id: a.id, note: editingNote.value || null });
                                  setEditingNote(null);
                                }}
                              >
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingNote(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">{describeRow(a)}</p>
                          )}
                        </td>
                        <td className="py-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                              a.enabled
                                ? "bg-emerald-500/10 text-emerald-500"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {a.enabled ? "Enabled" : "Paused"}
                          </span>
                        </td>
                        <td className="py-1.5 text-xs text-muted-foreground">
                          {(a.times_triggered ?? 0) > 0 ? (
                            <span
                              title={
                                a.last_triggered_at
                                  ? `Last: ${new Date(a.last_triggered_at).toLocaleString("en-IN")}`
                                  : undefined
                              }
                            >
                              <span className="font-semibold text-foreground">{a.times_triggered}×</span>
                              {a.last_triggered_at &&
                                ` · ${new Date(a.last_triggered_at).toLocaleDateString("en-IN")}`}
                            </span>
                          ) : (
                            "N/A"
                          )}
                        </td>
                        <td className="py-1.5 text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleDateString("en-IN")}
                        </td>
                        <td className="py-1.5 pr-1">
                          <div className="flex items-center justify-end gap-1.5">
                            <Switch
                              checked={a.enabled}
                              title={a.enabled ? "Turn off" : "Turn on"}
                              onCheckedChange={(v) => updateMut.mutate({ id: a.id, enabled: v })}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              title="Edit note"
                              onClick={() => setEditingNote({ id: a.id, value: a.note ?? "" })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <ConfirmDelete
                              label="Delete this alert?"
                              onConfirm={() => deleteMut.mutate(a.id)}
                              trigger={
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-500" title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {groupMode === "symbol" &&
                grouped.map(([sym, rows]) => (
                  <div key={sym}>
                    <div className="mb-1 flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        title="Select every alert for this symbol"
                        checked={rows.every((r) => selectedIds.has(r.id))}
                        onChange={(e) => toggleMany(rows.map((r) => r.id), e.target.checked)}
                      />
                      <SymbolLink symbol={sym} className="text-sm font-semibold" />
                      <TradingViewLink symbol={sym} />
                      <span className="text-[11px] text-muted-foreground">
                        {rows.length} {rows.length === 1 ? "alert" : "alerts"}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        {rows.length > 1 && (
                          <>
                            <span className="text-[11px] text-muted-foreground">all</span>
                            <Switch
                              checked={rows.every((r) => r.enabled)}
                              onCheckedChange={(v) =>
                                bulkMut.mutate({ symbol: sym, action: v ? "enable" : "disable" })
                              }
                            />
                          </>
                        )}
                        <ConfirmDelete
                          label={`Delete all ${rows.length} alert${rows.length > 1 ? "s" : ""} for ${sym}?`}
                          onConfirm={() => bulkMut.mutate({ symbol: sym, action: "delete" })}
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[11px] text-rose-500"
                              title="Delete every alert for this symbol"
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete all
                            </Button>
                          }
                        />
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {rows.map((a) => renderAlert(a, false))}
                    </ul>
                  </div>
                ))}

              {groupMode === "day" &&
                groupedByDay.map(([day, rows]) => (
                  <div key={day || "never"}>
                    <div className="mb-1 flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        title="Select every alert in this day"
                        checked={rows.every((r) => selectedIds.has(r.id))}
                        onChange={(e) => toggleMany(rows.map((r) => r.id), e.target.checked)}
                      />
                      <span className="text-sm font-semibold">
                        {day
                          ? new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", {
                              weekday: "short",
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "Not triggered yet"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {rows.length} {rows.length === 1 ? "alert" : "alerts"}
                      </span>
                    </div>
                    <ul className="space-y-1">{rows.map((a) => renderAlert(a, false))}</ul>
                  </div>
                ))}


              {groupMode === "rule" &&
                groupedByRule.map(([ruleKey, rows]) => {
                  const open = expandedRules.has(ruleKey);
                  return (
                    <div key={ruleKey}>
                      <div className="mb-1 flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-primary"
                          title="Select every alert with this rule"
                          checked={rows.every((r) => selectedIds.has(r.id))}
                          onChange={(e) => toggleMany(rows.map((r) => r.id), e.target.checked)}
                        />
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() =>
                            setExpandedRules((prev) => {
                              const next = new Set(prev);
                              if (next.has(ruleKey)) next.delete(ruleKey);
                              else next.add(ruleKey);
                              return next;
                            })
                          }
                        >
                          {open ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
                            {rows[0].timeframe === "W" ? "Weekly" : "Daily"}
                          </Badge>
                          <span className="truncate text-sm font-semibold">{describeRow(rows[0])}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            — {rows.length} {rows.length === 1 ? "symbol" : "symbols"}
                          </span>
                        </button>
                        <div className="ml-auto flex shrink-0 items-center gap-2">
                          {rows.length > 1 && (
                            <>
                              <span className="text-[11px] text-muted-foreground">all</span>
                              <Switch
                                checked={rows.every((r) => r.enabled)}
                                onCheckedChange={(v) => setEnabledMany(rows.map((r) => r.id), v)}
                              />
                            </>
                          )}
                          <ConfirmDelete
                            label={`Delete this rule on all ${rows.length} symbol${rows.length > 1 ? "s" : ""}?`}
                            onConfirm={() => deleteMany(rows.map((r) => r.id))}
                            trigger={
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] text-rose-500">
                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete all
                              </Button>
                            }
                          />
                        </div>
                      </div>
                      {open && <ul className="space-y-1">{rows.map((a) => renderAlert(a, true))}</ul>}
                    </div>
                  );
                })}
            </div>

              </>
            )}
          </section>
        </main>
      </div>
    </ApprovalGate>
  );
}

/** Small confirm popover so deletes always need a second, deliberate click. */
function ConfirmDelete({
  label,
  onConfirm,
  trigger,
}: {
  label: string;
  onConfirm: () => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
        <p className="mb-2 text-xs">{label}</p>
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-6 px-2 text-[11px]"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Delete
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
