import { SymbolLink, TradingViewLink } from "@/components/SymbolLink";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, Play, RefreshCw, Save, X, Plus, Loader2, ArrowUp, ArrowDown, Columns3, Trash2, Lock, FilePlus, Layers, ChevronDown, ChevronRight, MoreHorizontal, Download, CalendarClock, BellRing, PieChart as PieChartIcon } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, LabelList } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  PRESETS,
  FIELD_DEFS,
  FIELD_BY_ID,
  formatBigInr,
  formatBigCount,
  type Filter,
  type ColKey,
  type SnapshotRow,
} from "@/lib/screener/filters";
import { runScreener } from "@/lib/screener/screener.functions";
import { listCustomScreens, saveCustomScreen, deleteCustomScreen } from "@/lib/screener/screener.functions";
import { runScreenerHistorical, HISTORICAL_UNSUPPORTED_FIELDS } from "@/lib/screener/screener-historical.functions";
import { getSnapshotStatus, refreshSnapshotManually, refreshVolumeMaxesManually } from "@/lib/screener/snapshot.functions";
import { saveResultsAsWatchlist, mergeResultsIntoWatchlist, listUserWatchlists } from "@/lib/screener/save-watchlist.functions";
import { getScannerBundle } from "@/lib/screener/bundle.functions";
import { listPresetOverrides, applyOverrides, getCommonSettings, mergeWithCommonFilters, scopeApplies } from "@/lib/admin/preset-overrides.functions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { chartUrlForSymbol } from "@/lib/chart-links";
import { ProfileMenu } from "@/components/ProfileMenu";


const CUSTOM_PREFIX = "custom:";

export const Route = createFileRoute("/screeners")({
  head: () => ({
    meta: [
      { title: "Screeners — NSE MultiView" },
      { name: "description", content: "Stock screeners for NSE with technical and price filters: EMA, RSI, performance, market cap, volume." },
    ],
  }),
  component: ScreenersPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Screener failed to load: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

interface ColDef {
  key: ColKey;
  label: string;
  align: "left" | "right";
  sortField: keyof SnapshotRow;
  render: (r: SnapshotRow) => React.ReactNode;
}

const pct = (v: number | null | undefined, d = 1) => v == null ? "—" : `${v.toFixed(d)}%`;
const num = (v: number | null | undefined, d = 2) => v == null ? "—" : v.toFixed(d);

// Deterministic color per screener name so the same screener always saves
// watchlists with the same color across sessions.
const WL_COLORS = [
  "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#a855f7", "#ec4899",
  "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4", "#eab308",
];
function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return WL_COLORS[h % WL_COLORS.length];
}


const RS_FIELDS = ["rs_rating", "rs_rating_n50", "rs_rating_n100", "rs_rating_n200", "rs_rating_n500"] as const;
type RsField = typeof RS_FIELDS[number];
const RS_BENCHMARK_KEY = "screener.rsBenchmark.v1";

function rsCellRender(field: RsField) {
  return (r: SnapshotRow) => {
    const v = (r as any)[field] as number | null;
    if (v == null) return <span className="text-muted-foreground">—</span>;
    const cls = v >= 70 ? "text-green-500 font-medium" : v <= 30 ? "text-red-500" : "";
    return <span className={cls}>{Math.round(v)}</span>;
  };
}

const ALL_COLS: ColDef[] = [
  { key: "ticker", label: "Symbol", align: "left", sortField: "ticker", render: (r) => (
    <span className="inline-flex items-center gap-1">
      <SymbolLink symbol={r.symbol} label={r.ticker} title={r.name ?? r.ticker} className="font-medium" />
      <TradingViewLink symbol={r.symbol} />
    </span>
  ) },
  { key: "exchange", label: "Exch", align: "left", sortField: "exchange", render: (r) => <span className="text-xs text-muted-foreground">{r.exchange}</span> },
  { key: "rs_rating", label: "RS", align: "right", sortField: "rs_rating_n500" as any, render: rsCellRender("rs_rating_n500") },
  { key: "price", label: "Price", align: "right", sortField: "price", render: (r) => num(r.price) },
  { key: "change_pct", label: "Chg %", align: "right", sortField: "change_pct", render: (r) => (
    <span className={(r.change_pct ?? 0) >= 0 ? "text-green-500" : "text-red-500"}>{pct(r.change_pct, 2)}</span>
  ) },
  { key: "day_low", label: "LoD", align: "right", sortField: "day_low", render: (r) => num((r as any).day_low) },
  { key: "gap_pct", label: "Gap %", align: "right", sortField: "gap_pct" as any, render: (r) => {
    const o = (r as any).open as number | null;
    const pc = r.prev_close;
    if (o == null || pc == null || pc <= 0) return "—";
    const v = ((o - pc) / pc) * 100;
    return <span className={v >= 0 ? "text-green-500" : "text-red-500"}>{v.toFixed(2)}%</span>;
  } },
  { key: "week_gap_pct", label: "W Gap %", align: "right", sortField: "week_gap_pct", render: (r) => <span className={(r.week_gap_pct ?? 0) >= 0 ? "text-green-500" : "text-red-500"}>{pct(r.week_gap_pct, 2)}</span> },
  { key: "week_open", label: "W Open", align: "right", sortField: "week_open", render: (r) => num(r.week_open) },
  { key: "prev_week_close", label: "Prev W Close", align: "right", sortField: "prev_week_close", render: (r) => num(r.prev_week_close) },
  { key: "week_low", label: "W Low", align: "right", sortField: "week_low", render: (r) => num(r.week_low) },
  { key: "market_cap", label: "Mkt Cap", align: "right", sortField: "market_cap", render: (r) => r.market_cap == null ? "—" : formatBigInr(r.market_cap) },
  { key: "volume", label: "Vol", align: "right", sortField: "volume", render: (r) => r.volume == null ? "—" : formatBigCount(r.volume) },
  { key: "liquidity", label: "Price × Vol", align: "right", sortField: "liquidity", render: (r) => r.liquidity == null ? "—" : formatBigInr(r.liquidity) },
  { key: "rel_vol", label: "Rel Vol", align: "right", sortField: "rel_vol", render: (r) => num(r.rel_vol) },
  { key: "perf_1d", label: "Perf 1D", align: "right", sortField: "perf_1d", render: (r) => pct(r.perf_1d) },
  { key: "perf_1w", label: "Perf 1W", align: "right", sortField: "perf_1w", render: (r) => pct(r.perf_1w) },
  { key: "perf_1m", label: "Perf 1M", align: "right", sortField: "perf_1m", render: (r) => pct(r.perf_1m) },
  { key: "perf_3m", label: "Perf 3M", align: "right", sortField: "perf_3m", render: (r) => pct(r.perf_3m) },
  { key: "perf_6m", label: "Perf 6M", align: "right", sortField: "perf_6m", render: (r) => pct(r.perf_6m) },
  { key: "perf_1y", label: "Perf 1Y", align: "right", sortField: "perf_1y", render: (r) => pct(r.perf_1y) },
  { key: "ema10", label: "EMA 10", align: "right", sortField: "ema10", render: (r) => num(r.ema10) },
  { key: "ema20", label: "EMA 20", align: "right", sortField: "ema20", render: (r) => num(r.ema20) },
  { key: "ema50", label: "EMA 50", align: "right", sortField: "ema50", render: (r) => num(r.ema50) },
  { key: "ema100", label: "EMA 100", align: "right", sortField: "ema100", render: (r) => num(r.ema100) },
  { key: "ema200", label: "EMA 200", align: "right", sortField: "ema200", render: (r) => num(r.ema200) },
  { key: "rsi14", label: "RSI 14", align: "right", sortField: "rsi14", render: (r) => r.rsi14 == null ? "—" : r.rsi14.toFixed(0) },
  { key: "adr_20", label: "ADR % 20", align: "right", sortField: "adr_20", render: (r) => pct(r.adr_20, 2) },
  { key: "pe_ratio", label: "P/E", align: "right", sortField: "pe_ratio", render: (r) => num(r.pe_ratio, 1) },
  { key: "dividend_yield", label: "Div Yld", align: "right", sortField: "dividend_yield", render: (r) => pct(r.dividend_yield, 2) },
  { key: "net_profit_qoq", label: "NP QoQ", align: "right", sortField: "net_profit_qoq" as any, render: (r) => pct((r as any).net_profit_qoq, 1) },
  { key: "sales_qoq", label: "Sales QoQ", align: "right", sortField: "sales_qoq" as any, render: (r) => pct((r as any).sales_qoq, 1) },
  { key: "net_profit_yoy", label: "NP YoY", align: "right", sortField: "net_profit_yoy" as any, render: (r) => pct((r as any).net_profit_yoy, 1) },
  { key: "sales_yoy", label: "Sales YoY", align: "right", sortField: "sales_yoy" as any, render: (r) => pct((r as any).sales_yoy, 1) },
  { key: "earnings_release_date", label: "Last Earnings", align: "right", sortField: "earnings_release_date" as any, render: (r) => {
    const d = (r as any).earnings_release_date as string | null;
    if (!d) return <span className="text-muted-foreground">—</span>;
    const t = new Date(d);
    if (!isFinite(t.getTime())) return "—";
    return <span className="text-xs">{t.toISOString().slice(0, 10)}</span>;
  } },
  { key: "days_since_earnings", label: "Days Since Earn.", align: "right", sortField: "earnings_release_date" as any, render: (r) => {
    const d = (r as any).earnings_release_date as string | null;
    if (!d) return <span className="text-muted-foreground">—</span>;
    const t = new Date(d).getTime();
    if (!isFinite(t)) return "—";
    return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  } },
  { key: "move_since_earnings_pct", label: "% Since Earn.", align: "right", sortField: "move_since_earnings_pct" as any, render: (r) => {
    const v = (r as SnapshotRow & { move_since_earnings_pct?: number | null }).move_since_earnings_pct;
    return <span className={(v ?? 0) >= 0 ? "text-green-500" : "text-red-500"}>{pct(v, 2)}</span>;
  } },
  { key: "high_52w", label: "52W High", align: "right", sortField: "high_52w", render: (r) => num(r.high_52w) },
  { key: "low_52w", label: "52W Low", align: "right", sortField: "low_52w", render: (r) => num(r.low_52w) },
  { key: "ath", label: "All-Time H", align: "right", sortField: "ath", render: (r) => num(r.ath) },
  { key: "pct_from_52w_high", label: "% from 52W H", align: "right", sortField: "pct_from_52w_high", render: (r) => pct(r.pct_from_52w_high) },
  { key: "pct_from_ath", label: "% from ATH", align: "right", sortField: "pct_from_ath" as any, render: (r) => {
    const v = (r as any).pct_from_ath as number | null;
    if (v == null) {
      if (typeof r.price === "number" && typeof r.ath === "number" && r.ath > 0) {
        return pct(Math.max(0, ((r.ath - r.price) / r.ath) * 100));
      }
      return "—";
    }
    return pct(v);
  } },
  { key: "band_pct", label: "Band %", align: "right", sortField: "band_pct" as any, render: (r) => {
    const v = (r as any).band_pct as number | null | undefined;
    const label = (r as SnapshotRow).band_label;
    if (v == null) return <span className="text-muted-foreground">{label ?? "—"}</span>;
    const cls = v <= 5 ? "text-amber-500" : "";
    return <span className={cls}>{label && label !== String(v) ? label : `${v}%`}</span>;
  } },
  { key: "sector", label: "Sector", align: "left", sortField: "sector", render: (r) => <span className="text-xs text-muted-foreground">{r.sector ?? "—"}</span> },
];

const DEFAULT_VISIBLE: ColKey[] = ["ticker", "exchange", "rs_rating", "price", "change_pct", "market_cap", "volume", "liquidity", "rel_vol", "perf_1d", "perf_1w", "perf_1m", "perf_3m", "perf_6m", "perf_1y", "ema50", "rsi14", "adr_20", "sector"];
const COL_STORAGE_KEY = "screener.visibleCols.v5";
// Per-scanner column order, saved locally for this user: { [scannerId]: ColKey[] }
const COL_ORDER_KEY = "screener.colOrder.v1";



function describeFilter(f: Filter): string {
  const def = FIELD_BY_ID[f.field];
  if (!def) return f.field;
  const fmt = (v: number | undefined) => {
    if (v == null) return "";
    if (def.type === "bigInt") return formatBigInr(v);
    if (def.type === "percent") return `${v}%`;
    if (def.type === "currency") return `${v}${def.unit ? " " + def.unit : ""}`;
    return String(v);
  };
  switch (f.op) {
    case "gt": return `${def.label} > ${fmt(f.value)}`;
    case "gte": return `${def.label} ≥ ${fmt(f.value)}`;
    case "lt": return `${def.label} < ${fmt(f.value)}`;
    case "lte": return `${def.label} ≤ ${fmt(f.value)}`;
    case "between": return `${def.label} ${fmt(f.value)} – ${fmt(f.value2)}`;
    case "eq": return `${def.label} = ${f.enumValue ?? ""}`;
    case "not_eq": return `${def.label} ≠ ${f.enumValue ?? ""}`;
    case "in": return `${def.label} ∈ {${(f.enumValues ?? []).join(", ")}}`;
    case "not_in": return `${def.label} ∉ {${(f.enumValues ?? []).join(", ")}}`;
    case "below_by": return `${def.label} below ${FIELD_BY_ID[f.refField ?? ""]?.label ?? f.refField} by ${f.value}% to ${f.value2}%`;
    case "above_by": return `${def.label} above ${FIELD_BY_ID[f.refField ?? ""]?.label ?? f.refField} by ${f.value}% to ${f.value2}%`;
    case "cmp_field": {
      const opSym = { gt: ">", gte: "≥", lt: "<", lte: "≤" }[f.cmpOp ?? "gt"];
      return `${def.label} ${opSym} ${FIELD_BY_ID[f.refField ?? ""]?.label ?? f.refField}`;
    }
    default: return def.label;
  }
}

const SECTOR_COLORS = [
  "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#a855f7", "#ec4899",
  "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#eab308", "#06b6d4",
];

// Sector composition of the current scanner result set — quick read on
// which sectors are carrying the scan.
function SectorPie({ rows }: { rows: SnapshotRow[] }) {
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = (r.sector ?? "Unknown") || "Unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  if (data.length === 0) return null;
  const total = rows.length;

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center">
      <div className="h-56 w-full md:w-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={40}
              outerRadius={80}
              paddingAngle={1}
            >
              {data.map((d, i) => (
                <Cell key={d.name} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
              ))}
              <LabelList
                dataKey="value"
                position="inside"
                stroke="none"
                fill="#fff"
                fontSize={10}
                formatter={(v: any) => `${v} (${(((v as number) / total) * 100).toFixed(0)}%)`}
              />
            </Pie>
            <ReTooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
              formatter={(v: any, n: any) => [`${v} stocks (${((Number(v) / total) * 100).toFixed(1)}%)`, n]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid max-h-56 flex-1 grid-cols-2 gap-x-4 gap-y-1 overflow-auto text-xs lg:grid-cols-3">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
            />
            <span className="flex-1 truncate text-muted-foreground">{d.name}</span>
            <span className="font-medium">{d.value}</span>
            <span className="w-10 text-right text-muted-foreground">{((d.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenersPage() {
  const { user, loading, approved, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [presetId, setPresetId] = useState<string>("");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [rsBenchmark, setRsBenchmark] = useState<RsField>(() => {
    if (typeof window === "undefined") return "rs_rating";
    try {
      const raw = localStorage.getItem(RS_BENCHMARK_KEY);
      if (raw && (RS_FIELDS as readonly string[]).includes(raw)) return raw as RsField;
    } catch {}
    return "rs_rating";

  });
  const [sort, setSort] = useState<{ field: keyof SnapshotRow; dir: "asc" | "desc" }>(
    { field: rsBenchmark as keyof SnapshotRow, dir: "desc" }
  );
  useEffect(() => { try { localStorage.setItem(RS_BENCHMARK_KEY, rsBenchmark); } catch {} }, [rsBenchmark]);

  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    if (typeof window === "undefined") return new Set(DEFAULT_VISIBLE);
    try {
      const raw = localStorage.getItem(COL_STORAGE_KEY);
      if (raw) {
        const set = new Set(JSON.parse(raw) as ColKey[]);
        set.add("rs_rating");
        return set;
      }
    } catch {}
    return new Set(DEFAULT_VISIBLE);
  });
  // Column order per scanner (user-local). Falls back to the admin-defined
  // order for the active preset, then to the natural COLUMN_META order.
  const [colOrders, setColOrders] = useState<Record<string, ColKey[]>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(COL_ORDER_KEY);
      if (raw) return JSON.parse(raw) as Record<string, ColKey[]>;
    } catch {}
    return {};
  });
  const [presetColOrder, setPresetColOrder] = useState<ColKey[] | null>(null);
  const [dragCol, setDragCol] = useState<ColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null);
  useEffect(() => {
    try { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(colOrders)); } catch {}
  }, [colOrders]);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null);
  const [groupBySector, setGroupBySector] = useState(false);
  const [showSectorPie, setShowSectorPie] = useState(false);
  const [collapsedSectors, setCollapsedSectors] = useState<Set<string>>(new Set());

  // Historical mode: recompute scanner from Yahoo daily OHLC for a chosen
  // past date or date range. 'live' = current stock_snapshot (default).
  type HistMode = "live" | "single" | "range";
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const daysAgoStr = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const [histMode, setHistMode] = useState<HistMode>("live");
  const [histDate, setHistDate] = useState<string>(() => daysAgoStr(1));
  const [histStart, setHistStart] = useState<string>(() => daysAgoStr(7));
  const [histEnd, setHistEnd] = useState<string>(() => todayStr());
  const [histApplied, setHistApplied] = useState<{ mode: HistMode; date?: string; startDate?: string; endDate?: string }>(
    { mode: "live" },
  );

  useEffect(() => {
    try { localStorage.setItem(COL_STORAGE_KEY, JSON.stringify([...visibleCols])); } catch {}
  }, [visibleCols]);

  const qc = useQueryClient();
  const run = useServerFn(runScreener);
  const runHist = useServerFn(runScreenerHistorical);
  const status = useServerFn(getSnapshotStatus);
  const refresh = useServerFn(refreshSnapshotManually);
  const refreshVolMaxes = useServerFn(refreshVolumeMaxesManually);
  const saveAsWl = useServerFn(saveResultsAsWatchlist);
  const mergeIntoWl = useServerFn(mergeResultsIntoWatchlist);
  const listWls = useServerFn(listUserWatchlists);
  const listScreens = useServerFn(listCustomScreens);
  const saveScreen = useServerFn(saveCustomScreen);
  const deleteScreen = useServerFn(deleteCustomScreen);
  const bundleFn = useServerFn(getScannerBundle);

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>("__new__");
  const [mergeNewName, setMergeNewName] = useState("");
  const [mergeMode, setMergeMode] = useState<"override" | "append">("override");
  // Optional limits applied before saving/merging to a watchlist.
  const [saveLimitTopN, setSaveLimitTopN] = useState<string>("");
  const [saveLimitMinRs, setSaveLimitMinRs] = useState<string>("");
  const [saveLimitFrom, setSaveLimitFrom] = useState<string>("");
  const [saveLimitTo, setSaveLimitTo] = useState<string>("");

  // Pre-load watchlists so the merge dialog can pick "Scanning Process"
  // as the default target immediately — otherwise the dropdown visibly
  // flips from "Create new" to "Scanning Process" after the fetch.
  const wlListQuery = useQuery({
    queryKey: ["user-watchlists"],
    queryFn: () => listWls(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const openMergeDialog = () => {
    const lists = wlListQuery.data?.lists ?? [];
    const scan = lists.find((l) => /scanning\s*process/i.test(l.name));
    setMergeTargetId(scan ? scan.id : "__new__");
    setMergeOpen(true);
  };



  const screensQuery = useQuery({
    queryKey: ["custom-screens"],
    queryFn: () => listScreens(),
    enabled: !!user,
  });
  const customScreens = screensQuery.data?.screens ?? [];

  const overridesFn = useServerFn(listPresetOverrides);
  const overridesQuery = useQuery({
    queryKey: ["preset-overrides"],
    queryFn: () => overridesFn(),
    enabled: !!user && approved,
    staleTime: 60_000,
  });
  const commonFn = useServerFn(getCommonSettings);
  const commonQuery = useQuery({
    queryKey: ["admin-common-settings"],
    queryFn: () => commonFn(),
    enabled: !!user && approved,
    staleTime: 60_000,
  });
  const { presets: EFFECTIVE_PRESETS, defaultId: effectiveDefaultId } = useMemo(
    () => applyOverrides(PRESETS, overridesQuery.data?.overrides ?? []),
    [overridesQuery.data],
  );
  const EFFECTIVE_BY_ID = useMemo(
    () => new Map(EFFECTIVE_PRESETS.map((p) => [p.id, p])),
    [EFFECTIVE_PRESETS],
  );

  // Resolve preset filters merged with admin-defined common filters,
  // when the current preset falls within the common-settings scope.
  const resolveFiltersForPreset = (id: string, baseFilters: Filter[]): Filter[] => {
    const s = commonQuery.data?.settings;
    if (!s || !Array.isArray(s.common_filters) || s.common_filters.length === 0) return baseFilters;
    if (!scopeApplies(s.apply_scope, s.apply_ids, id)) return baseFilters;
    return mergeWithCommonFilters(baseFilters, s.common_filters);
  };

  // Once BOTH overrides and common settings have loaded, apply the admin
  // default preset (if any) and merge admin common filters into whichever
  // preset is currently active. Waiting for both queries avoids a race
  // where the first render used raw PRESETS[0].filters and no admin
  // override or common filter was ever applied to the initial view.
  const [initialApplied, setInitialApplied] = useState(false);
  useEffect(() => {
    if (initialApplied) return;
    if (!overridesQuery.data || !commonQuery.data) return;
    // URL ?scanner=<id> takes precedence so a refresh keeps the active scanner.
    let urlScanner: string | null = null;
    try { urlScanner = new URL(window.location.href).searchParams.get("scanner"); } catch {}
    const urlValid = !!urlScanner && (EFFECTIVE_BY_ID.has(urlScanner) || urlScanner.startsWith(CUSTOM_PREFIX));
    const targetId = urlValid ? urlScanner! : (effectiveDefaultId || presetId || PRESETS[0].id);
    if (targetId.startsWith(CUSTOM_PREFIX)) {
      // Wait for the saved screens list before restoring, otherwise the
      // scanner is selected with an empty filter set after a page refresh.
      if (!screensQuery.data) return;
      const cs = customScreens.find((s: any) => s.id === targetId.slice(CUSTOM_PREFIX.length));
      setPresetId(targetId);
      if (cs) setFilters(resolveFiltersForPreset(targetId, (cs.filters as unknown as Filter[]) ?? []));
      setInitialApplied(true);
      return;
    }
    const p = EFFECTIVE_BY_ID.get(targetId);
    if (!p) { setInitialApplied(true); return; }
    if (targetId !== presetId) setPresetId(targetId);
    setFilters(resolveFiltersForPreset(targetId, p.filters));
    // Apply column visibility from per-preset or common settings.
    const perPreset = (p as any).columns as ColKey[] | null | undefined;
    const s = commonQuery.data?.settings;
    if (perPreset && perPreset.length > 0) {
      setVisibleCols(new Set(perPreset));
      setPresetColOrder(perPreset);
    } else if (s && Array.isArray(s.common_columns) && s.common_columns.length > 0 && scopeApplies(s.columns_scope, s.columns_ids, targetId)) {
      setVisibleCols(new Set(s.common_columns));
      setPresetColOrder(s.common_columns);
    } else {
      setPresetColOrder(null);
    }
    setInitialApplied(true);
  }, [overridesQuery.data, commonQuery.data, screensQuery.data, initialApplied, effectiveDefaultId, presetId, EFFECTIVE_BY_ID]);

  // Reflect the active scanner in the URL so a refresh restores it.
  useEffect(() => {
    if (!initialApplied || !presetId) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("scanner") !== presetId) {
        url.searchParams.set("scanner", presetId);
        window.history.replaceState(null, "", url.toString());
      }
    } catch {}
  }, [presetId, initialApplied]);



  const statusQuery = useQuery({ queryKey: ["snapshot-status"], queryFn: () => status(), enabled: !!user });
  const bandFreshnessQuery = useQuery({
    queryKey: ["price-band-freshness"],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.from("price_band_fetch_log").select("last_successful_fetch,row_count,last_attempt_status").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const screenerQuery = useQuery({
    queryKey: ["screener", filters, histApplied],
    queryFn: async () => {
      if (histApplied.mode === "live") {
        return run({ data: { filters, limit: 3000 } });
      }
      const r = await runHist({
        data: {
          filters,
          mode: histApplied.mode,
          date: histApplied.date,
          startDate: histApplied.startDate,
          endDate: histApplied.endDate,
          limit: 3000,
        },
      });
      return r;
    },
    enabled: !!user && initialApplied,
    // Snapshot data only changes a few times a day — don't re-run the scan
    // just because the tab regained focus or the page was revisited.
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const refreshMut = useMutation({
    mutationFn: async () => {
      let offset = 0;
      let totalWritten = 0;
      let totalPruned = 0;
      const pruneNotes: string[] = [];
      setRefreshProgress({ done: 0, total: 0 });
      for (let i = 0; i < 10; i++) {
        const r = await refresh({ data: { offset, limit: 500 } });
        totalWritten += r.written;
        // Out-of-universe rows (delisted, or moved off the EQ series by NSE)
        // are dropped on the first slice; surface it instead of hiding it.
        totalPruned += r.pruned ?? 0;
        if (r.pruneError) pruneNotes.push(r.pruneError);
        offset += r.processed;
        setRefreshProgress({ done: offset, total: r.total });
        if (r.processed === 0 || offset >= r.total) break;
      }
      return { totalWritten, totalPruned, pruneNotes };
    },
    onSuccess: ({ totalWritten, totalPruned, pruneNotes }) => {
      toast.success(
        `Refreshed ${totalWritten} symbols${totalPruned ? `, removed ${totalPruned} out-of-universe row${totalPruned === 1 ? "" : "s"}` : ""}`,
      );
      if (pruneNotes.length) toast.warning(`Snapshot prune skipped: ${pruneNotes[0]}`);
      statusQuery.refetch();
      screenerQuery.refetch();
    },
    onError: (e: any) => toast.error(`Refresh failed: ${e?.message ?? e}`),
    onSettled: () => setRefreshProgress(null),
  });

  const volMaxMut = useMutation({
    mutationFn: async () => {
      let offset = 0;
      let totalUpdated = 0;
      setRefreshProgress({ done: 0, total: 0 });
      for (let i = 0; i < 200; i++) {
        const r = await refreshVolMaxes({ data: { offset, limit: 300 } });
        totalUpdated += r.updated;
        offset += r.processed;
        setRefreshProgress({ done: offset, total: r.total });
        if (r.processed === 0 || offset >= r.total) break;
      }
      return totalUpdated;
    },
    onSuccess: (n) => { toast.success(`Updated historical volume for ${n} symbols`); statusQuery.refetch(); screenerQuery.refetch(); },
    onError: (e: any) => toast.error(`Volume refresh failed: ${e?.message ?? e}`),
    onSettled: () => setRefreshProgress(null),
  });

  // Apply optional row-range, Top-N, and Min-RS limits selected in the Save popover.
  // Top-N respects the current sort. Min-RS uses the active benchmark column.
  const applySaveLimits = (rows: SnapshotRow[]) => {
    const fromRaw = saveLimitFrom.trim();
    const toRaw = saveLimitTo.trim();
    const from = fromRaw === "" ? null : Math.floor(Number(fromRaw));
    const to = toRaw === "" ? null : Math.floor(Number(toRaw));

    let start = 0;
    let end = rows.length;
    if (from != null && Number.isFinite(from) && from > 0) start = Math.min(from - 1, rows.length);
    if (to != null && Number.isFinite(to) && to > 0) end = Math.min(to, rows.length);
    if (start > end) return [] as SnapshotRow[];

    let out = rows.slice(start, end);
    const minRs = saveLimitMinRs.trim() === "" ? null : Number(saveLimitMinRs);
    if (minRs != null && Number.isFinite(minRs)) {
      out = out.filter((r) => {
        const v = (r as any)[rsBenchmark];
        return typeof v === "number" && v >= minRs;
      });
    }
    const topN = saveLimitTopN.trim() === "" ? null : Math.floor(Number(saveLimitTopN));
    if (topN != null && Number.isFinite(topN) && topN > 0) {
      out = out.slice(0, topN);
    }
    return out;
  };

  const hidePerSectorSave = commonQuery.data?.settings?.hide_per_sector_save === true;
  const saveMut = useMutation({
    mutationFn: async (mode: "combined" | "per-sector") => {
      const rows = applySaveLimits(sortedRows);
      if (rows.length === 0) throw new Error("No results to save");
      const preset = currentScreenName;
      const color = colorForName(preset);
      if (mode === "combined") {
        const r = await saveAsWl({
          data: {
            name: preset,
            color,
            symbols: rows.map((r) => ({ ticker: r.ticker, name: r.name ?? r.ticker, yahoo: r.symbol, sector: r.sector ?? undefined })),
          },
        });
        return { created: 1, totalSymbols: r.count, label: r.name };
      }
      // per-sector: one watchlist per sector group
      const bySector = new Map<string, typeof rows>();
      for (const r of rows) {
        const key = r.sector ?? "Unknown";
        const arr = bySector.get(key) ?? [];
        arr.push(r);
        bySector.set(key, arr);
      }
      let total = 0;
      for (const [sector, srows] of bySector) {
        const name = `${preset} — ${sector}`;
        await saveAsWl({
          data: {
            name,
            color: colorForName(name),
            symbols: srows.map((r) => ({ ticker: r.ticker, name: r.name ?? r.ticker, yahoo: r.symbol, sector: r.sector ?? undefined })),
          },
        });
        total += srows.length;

      }
      return { created: bySector.size, totalSymbols: total, label: `${bySector.size} sector lists` };
    },
    onSuccess: (r) => toast.success(`Saved ${r.label} (${r.totalSymbols} symbols). Open Charts to see it in watchlists.`),
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const mergeMut = useMutation({
    mutationFn: async () => {
      const rows = applySaveLimits(sortedRows);
      if (rows.length === 0) throw new Error("No results to merge");
      const isNew = mergeTargetId === "__new__";
      const newName = mergeNewName.trim();
      if (isNew && !newName) throw new Error("Please name the new watchlist");
      return mergeIntoWl({
        data: {
          targetListId: isNew ? null : mergeTargetId,
          newListName: isNew ? newName : null,
          mode: isNew ? "append" : mergeMode,
          scanName: currentScreenName,
          color: colorForName(isNew ? newName : currentScreenName),
          symbols: rows.map((r) => ({
            ticker: r.ticker, name: r.name ?? r.ticker, yahoo: r.symbol, sector: r.sector ?? undefined,
          })),
        },
      });
    },
    onSuccess: (r: any) => {
      toast.success(
        r.mode === "override"
          ? `"${r.name}" replaced — ${r.removed} old removed, ${r.total} now in the list.`
          : `Merged into "${r.name}" — ${r.added} new, ${r.tagged} tagged. Total: ${r.total}.`,
      );
      qc.invalidateQueries({ queryKey: ["user-watchlists"] });
      setMergeOpen(false);
      setMergeNewName("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Merge failed"),
  });

  const [bundleProgress, setBundleProgress] = useState<{ done: number; total: number } | null>(null);
  const downloadBundleMut = useMutation({
    mutationFn: async () => {
      const rows = applySaveLimits(sortedRows);
      if (rows.length === 0) throw new Error("No results to download");
      const symbols = rows.map((r) => r.symbol);
      // Chunk to stay under the 50-symbol server cap and show progress.
      const CHUNK = 25;
      const ohlc: Record<string, any> = {};
      const errors: Record<string, string> = {};
      setBundleProgress({ done: 0, total: symbols.length });
      for (let i = 0; i < symbols.length; i += CHUNK) {
        const slice = symbols.slice(i, i + CHUNK);
        const r = await bundleFn({ data: { symbols: slice } });
        Object.assign(ohlc, r.ohlc);
        Object.assign(errors, r.errors);
        setBundleProgress({ done: Math.min(i + CHUNK, symbols.length), total: symbols.length });
      }
      const bundle = {
        version: 1,
        generatedAt: new Date().toISOString(),
        scanName: currentScreenName,
        rows,
        ohlc,
        errors,
      };
      const blob = new Blob([JSON.stringify(bundle)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = currentScreenName.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "scanner";
      a.href = url;
      a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return { count: Object.keys(ohlc).length, failed: Object.keys(errors).length };
    },
    onSuccess: (r) => toast.success(`Bundle downloaded — ${r.count} symbols${r.failed ? `, ${r.failed} failed` : ""}. Open /viewer to view offline.`),
    onError: (e: any) => toast.error(e?.message ?? "Download failed"),
    onSettled: () => setBundleProgress(null),
  });




  const saveAsNewMut = useMutation({
    mutationFn: async (name: string) =>
      saveScreen({ data: { name, filters } }),
    onSuccess: (r: any) => {
      toast.success(`Created screener "${r.screen.name}"`);
      qc.invalidateQueries({ queryKey: ["custom-screens"] });
      setPresetId(CUSTOM_PREFIX + r.screen.id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const id = presetId.startsWith(CUSTOM_PREFIX) ? presetId.slice(CUSTOM_PREFIX.length) : "";
      const cur = customScreens.find((s: any) => s.id === id);
      if (!cur) throw new Error("Not a custom screener");
      return saveScreen({ data: { id, name: cur.name, filters } });
    },
    onSuccess: () => {
      toast.success("Screener updated");
      qc.invalidateQueries({ queryKey: ["custom-screens"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const id = presetId.startsWith(CUSTOM_PREFIX) ? presetId.slice(CUSTOM_PREFIX.length) : "";
      if (!id) throw new Error("Built-in screeners can't be deleted");
      return deleteScreen({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Screener deleted");
      qc.invalidateQueries({ queryKey: ["custom-screens"] });
      applyPreset(PRESETS[0].id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const applyPreset = (id: string) => {
    if (id.startsWith(CUSTOM_PREFIX)) {
      const cs = customScreens.find((s: any) => s.id === id.slice(CUSTOM_PREFIX.length));
      if (!cs) return;
      setPresetId(id);
      setFilters(resolveFiltersForPreset(id, (cs.filters as unknown as Filter[]) ?? []));
      setSort({ field: rsBenchmark as keyof SnapshotRow, dir: "desc" });
      return;
    }
    const p = EFFECTIVE_BY_ID.get(id) ?? PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setFilters(resolveFiltersForPreset(id, p.filters));
    // Per-preset column override wins; else common columns if in scope.
    const perPreset = (p as any).columns as ColKey[] | null | undefined;
    const s = commonQuery.data?.settings;
    if (perPreset && perPreset.length > 0) {
      setVisibleCols(new Set(perPreset));
      setPresetColOrder(perPreset);
    } else if (s && Array.isArray(s.common_columns) && s.common_columns.length > 0 && scopeApplies(s.columns_scope, s.columns_ids, id)) {
      setVisibleCols(new Set(s.common_columns));
      setPresetColOrder(s.common_columns);
    } else {
      setPresetColOrder(null);
    }
    // Always default sort to RS rating desc, regardless of the preset's defaultSort.
    setSort({ field: rsBenchmark as keyof SnapshotRow, dir: "desc" });
  };



  const isCustom = presetId.startsWith(CUSTOM_PREFIX);
  const currentScreenName = isCustom
    ? (customScreens.find((s: any) => s.id === presetId.slice(CUSTOM_PREFIX.length))?.name ?? "Custom screener")
    : (EFFECTIVE_BY_ID.get(presetId)?.name ?? PRESETS.find((p) => p.id === presetId)?.name ?? "Screener results");

  const handleSaveAsNew = () => {
    const name = window.prompt("Name this screener", currentScreenName + " (copy)");
    if (!name) return;
    saveAsNewMut.mutate(name.trim());
  };

  const removeFilter = (i: number) => setFilters((arr) => arr.filter((_, idx) => idx !== i));

  const toggleSort = (field: keyof SnapshotRow) => {
    setSort((s) => s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" });
  };

  const [resultSearch, setResultSearch] = useState("");
  const allRows = screenerQuery.data?.rows ?? [];
  const rows = useMemo(() => {
    const q = resultSearch.trim().toLowerCase();
    if (!q) return allRows;
    const terms = q.split(/[\s,]+/).filter(Boolean);
    return allRows.filter((r: any) => {
      const hay = `${r.ticker ?? ""} ${r.name ?? ""} ${r.sector ?? ""}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    });
  }, [allRows, resultSearch]);
  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const { field, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    const getVal = (r: any): number | string | null => {
      if ((field as string) === "gap_pct") {
        const o = r.open, pc = r.prev_close;
        return typeof o === "number" && typeof pc === "number" && pc > 0 ? ((o - pc) / pc) * 100 : null;
      }
      return r[field] ?? null;
    };
    arr.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
    return arr;

  }, [rows, sort]);

  const perSectorCount = useMemo(() => {
    const rows = applySaveLimits(sortedRows);
    return new Set(rows.map((r) => r.sector ?? "Unknown")).size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedRows, saveLimitFrom, saveLimitTo, saveLimitTopN, saveLimitMinRs, rsBenchmark]);


  const saveSelectionCount = applySaveLimits(sortedRows).length;
  const saveSelectionLabel = saveSelectionCount === 1 ? "1 symbol" : `${saveSelectionCount} symbols`;
  const saveSelectionSummary = [
    (saveLimitFrom.trim() !== "" || saveLimitTo.trim() !== "") ? `Rows ${saveLimitFrom.trim() || "1"}${saveLimitTo.trim() ? `–${saveLimitTo.trim()}` : "+"}` : null,
    saveLimitTopN.trim() !== "" ? `Top ${saveLimitTopN}` : null,
    saveLimitMinRs.trim() !== "" ? `RS ≥ ${saveLimitMinRs}` : null,
  ].filter(Boolean).join(" · ");

  if (loading) {
    return <div className="dark flex h-screen items-center justify-center bg-background"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!user) {
    return (
      <div className="dark flex h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p className="text-muted-foreground">Sign in to use Screeners.</p>
        <Link to="/" className="text-primary underline">Go to sign in</Link>
      </div>
    );
  }
  if (!approved && !isAdmin) {
    return (
      <div className="dark flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        <h1 className="text-xl font-semibold">Pending approval</h1>
        <p className="max-w-md text-sm text-muted-foreground">Admin (keechu7@gmail.com) must approve your account before you can use the screeners.</p>
        <Link to="/" className="text-primary underline text-sm">Back home</Link>
      </div>
    );
  }


  const total = screenerQuery.data?.total ?? 0;
  const matchCount = screenerQuery.data?.matchCount ?? 0;
  const snapshotCount = statusQuery.data?.count ?? 0;
  const lastUpdated = statusQuery.data?.lastUpdated ? new Date(statusQuery.data.lastUpdated).toLocaleString() : "never";
  const bandUpdated = bandFreshnessQuery.data?.last_successful_fetch
    ? new Date(bandFreshnessQuery.data.last_successful_fetch).toLocaleString()
    : "pending first refresh";
  const activeOrder = colOrders[presetId] ?? presetColOrder;
  const orderedAll = (() => {
    if (!activeOrder || activeOrder.length === 0) return ALL_COLS;
    const idx = new Map(activeOrder.map((k, i) => [k, i]));
    return [...ALL_COLS].sort((a, b) => {
      const ai = idx.has(a.key) ? idx.get(a.key)! : 1000 + ALL_COLS.indexOf(a);
      const bi = idx.has(b.key) ? idx.get(b.key)! : 1000 + ALL_COLS.indexOf(b);
      return ai - bi;
    });
  })();
  const cols = orderedAll.filter((c) => visibleCols.has(c.key)).map((c) =>
    c.key === "rs_rating"
      ? { ...c, label: `RS (${rsBenchmark === "rs_rating" ? "All NSE" : rsBenchmark === "rs_rating_n50" ? "N50" : rsBenchmark === "rs_rating_n100" ? "N100" : rsBenchmark === "rs_rating_n200" ? "N200" : "N500"})`, sortField: rsBenchmark as keyof SnapshotRow, render: rsCellRender(rsBenchmark) }
      : c
  );

  // Export the currently visible columns/rows as a real .xlsx workbook.
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const data = sortedRows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const c of cols) {
        const field = (c.sortField as string) ?? c.key;
        const v = (r as any)[field] ?? (r as any)[c.key] ?? null;
        o[c.label] = typeof v === "number" ? Number(v.toFixed(4)) : v;
      }
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = cols.map((c) => ({ wch: Math.max(10, c.label.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `screener-${presetId || "results"}-${stamp}.xlsx`);
  };



  // Move a visible column left/right; the resulting order is stored against
  // the active scanner so each user keeps their own layout per scanner.
  const moveCol = (key: ColKey, dir: -1 | 1) => {
    const visible = orderedAll.filter((c) => visibleCols.has(c.key)).map((c) => c.key);
    const i = visible.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= visible.length) return;
    [visible[i], visible[j]] = [visible[j]!, visible[i]!];
    const hidden = orderedAll.map((c) => c.key).filter((k) => !visibleCols.has(k));
    setColOrders((o) => ({ ...o, [presetId]: [...visible, ...hidden] }));
  };

  // Drag & drop reorder from the table header. `from`/`to` are ColKeys of
  // currently visible columns; hidden columns keep their relative order.
  const dropColBefore = (from: ColKey, to: ColKey) => {
    if (from === to) return;
    const visible = orderedAll.filter((c) => visibleCols.has(c.key)).map((c) => c.key);
    const i = visible.indexOf(from);
    if (i < 0) return;
    visible.splice(i, 1);
    const j = visible.indexOf(to);
    visible.splice(j < 0 ? visible.length : j, 0, from);
    const hidden = orderedAll.map((c) => c.key).filter((k) => !visibleCols.has(k));
    setColOrders((o) => ({ ...o, [presetId]: [...visible, ...hidden] }));
  };

  const saveColLayout = () => {
    const visible = orderedAll.filter((c) => visibleCols.has(c.key)).map((c) => c.key);
    const hidden = orderedAll.map((c) => c.key).filter((k) => !visibleCols.has(k));
    const next = { ...colOrders, [presetId]: [...visible, ...hidden] };
    setColOrders(next);
    try { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    toast.success("Column layout saved for this scanner");
  };




  const renderHeaderActions = () => (
    <>
      <Button size="sm" variant="outline" onClick={handleSaveAsNew} disabled={saveAsNewMut.isPending}>
        <FilePlus className="mr-1 h-3.5 w-3.5" /> Save as new
      </Button>
      <Button
        size="sm"
        variant={showSectorPie ? "default" : "outline"}
        onClick={() => setShowSectorPie((v) => !v)}
        title="Show a pie summary of results by sector"
      >
        <PieChartIcon className="mr-1 h-3.5 w-3.5" /> Sector mix
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={exportExcel}
        disabled={sortedRows.length === 0}
        title="Download the visible scanner results as an Excel (.xlsx) file"
      >
        <Download className="mr-1 h-3.5 w-3.5" /> Excel
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" title="More scanner tools">
            <MoreHorizontal className="mr-1 h-3.5 w-3.5" /> Tools
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-64 space-y-1.5 p-2"
          onInteractOutside={(e) => {
            const t = e.target as HTMLElement | null;
            if (t?.closest?.("[data-radix-popper-content-wrapper]")) e.preventDefault();
          }}
        >
          <div className="mb-1 text-[10px] uppercase text-muted-foreground">Scanner tools</div>
          <div className="grid gap-1.5 [&_button]:w-full [&_button]:justify-start">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline"><Columns3 className="mr-1 h-3.5 w-3.5" /> Columns</Button>
            </PopoverTrigger>
            <PopoverContent className="max-h-[60vh] w-72 overflow-auto">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Column order — drag table headers too</span>
                <div className="flex items-center gap-2">
                  <button className="text-primary hover:underline" onClick={saveColLayout}>Save</button>
                  <button
                    className="text-muted-foreground hover:underline"
                    onClick={() => setColOrders((o) => { const n = { ...o }; delete n[presetId]; return n; })}
                  >Reset</button>
                </div>
              </div>
              <div className="mb-3 space-y-1 rounded-md border border-border p-1">
                {cols.map((c, i) => (
                  <div key={c.key} className="flex items-center gap-1 rounded px-1 py-0.5 text-xs">
                    <span className="w-5 shrink-0 text-muted-foreground">{i + 1}.</span>
                    <span className="flex-1 truncate">{c.label}</span>
                    <button
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                      disabled={i === 0}
                      onClick={() => moveCol(c.key, -1)}
                      aria-label={`Move ${c.label} left`}
                    ><ArrowUp className="h-3 w-3" /></button>
                    <button
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                      disabled={i === cols.length - 1}
                      onClick={() => moveCol(c.key, 1)}
                      aria-label={`Move ${c.label} right`}
                    ><ArrowDown className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Visible columns</span>
                <button className="text-primary hover:underline" onClick={() => setVisibleCols(new Set(DEFAULT_VISIBLE))}>Reset</button>
              </div>
              <div className="space-y-1.5">
                {orderedAll.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                    <Checkbox
                      checked={visibleCols.has(c.key)}
                      onCheckedChange={(v) => {
                        setVisibleCols((s) => {
                          const next = new Set(s);
                          if (v) next.add(c.key); else next.delete(c.key);
                          if (next.size === 0) next.add("ticker");
                          return next;
                        });
                      }}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {isCustom && (
            <>
              <Button size="sm" variant="outline" onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
                <Save className="mr-1 h-3.5 w-3.5" /> Update
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={deleteMut.isPending}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this screener?</AlertDialogTitle>
                    <AlertDialogDescription>
                      "{currentScreenName}" will be permanently removed from your account.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMut.mutate()}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending || volMaxMut.isPending}>
            {refreshMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            {refreshMut.isPending && refreshProgress ? `Refreshing ${refreshProgress.done}/${refreshProgress.total || "…"}` : "Refresh data"}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={histApplied.mode === "live" ? "outline" : "default"}
                title="Scan on a past date or across a date range (recomputed from OHLC)"
              >
                <CalendarClock className="mr-1 h-3.5 w-3.5" />
                {histApplied.mode === "live"
                  ? "Historical"
                  : histApplied.mode === "single"
                    ? `As of ${histApplied.date}`
                    : `${histApplied.startDate} → ${histApplied.endDate}`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-2 p-3">
              <div className="text-xs font-medium">Scanner date</div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={histMode === "live" ? "default" : "outline"}
                  className="h-7 flex-1 text-xs"
                  onClick={() => setHistMode("live")}
                >Live</Button>
                <Button
                  size="sm"
                  variant={histMode === "single" ? "default" : "outline"}
                  className="h-7 flex-1 text-xs"
                  onClick={() => setHistMode("single")}
                >As of date</Button>
                <Button
                  size="sm"
                  variant={histMode === "range" ? "default" : "outline"}
                  className="h-7 flex-1 text-xs"
                  onClick={() => setHistMode("range")}
                >Range</Button>
              </div>
              {histMode === "single" && (
                <div>
                  <Label className="text-[10px] text-muted-foreground">Date</Label>
                  <Input
                    type="date"
                    value={histDate}
                    max={todayStr()}
                    onChange={(e) => setHistDate(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
              )}
              {histMode === "range" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">From</Label>
                    <Input type="date" value={histStart} max={histEnd} onChange={(e) => setHistStart(e.target.value)} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">To</Label>
                    <Input type="date" value={histEnd} min={histStart} max={todayStr()} onChange={(e) => setHistEnd(e.target.value)} className="h-7 text-xs" />
                  </div>
                </div>
              )}
              {histMode !== "live" && (
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Historical scans recompute price, volume, EMAs, RSI, ADR, 52w hi/lo and perf windows from Yahoo daily OHLC (top ~800 by liquidity).
                  Filters on market-cap, P/E, dividend yield, RS ratings, and max-vol buckets are ignored.
                </p>
              )}
              <div className="flex justify-end gap-1 pt-1">
                {histApplied.mode !== "live" && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setHistMode("live"); setHistApplied({ mode: "live" }); }}>
                    Back to live
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    if (histMode === "live") setHistApplied({ mode: "live" });
                    else if (histMode === "single") setHistApplied({ mode: "single", date: histDate });
                    else setHistApplied({ mode: "range", startDate: histStart, endDate: histEnd });
                  }}
                >
                  Apply
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            size="sm"
            variant="outline"
            onClick={() => volMaxMut.mutate()}
            disabled={refreshMut.isPending || volMaxMut.isPending}
            title="Recompute historical max volume (all-time / 1Y / 1Q). Slow — fetches per symbol."
          >
            {volMaxMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            {volMaxMut.isPending && refreshProgress ? `Vol hist ${refreshProgress.done}/${refreshProgress.total || "…"}` : "Refresh vol history"}
          </Button>
          <Button
            size="sm"
            variant={groupBySector ? "default" : "outline"}
            onClick={() => setGroupBySector((v) => !v)}
            title="Group results by sector"
          >
            <Layers className="mr-1 h-3.5 w-3.5" /> Group by sector
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadBundleMut.mutate()}
            disabled={downloadBundleMut.isPending || sortedRows.length === 0}
            title="Download scanner rows + daily/weekly/hourly candles as a JSON bundle for offline viewing at /viewer."
          >
            {downloadBundleMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
            {downloadBundleMut.isPending && bundleProgress ? `Bundling ${bundleProgress.done}/${bundleProgress.total}` : "Download bundle"}
          </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" disabled={saveMut.isPending || sortedRows.length === 0}>
            <Save className="mr-1 h-3.5 w-3.5" /> Save as watchlist
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 space-y-2 p-2"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="rounded border border-border/60 bg-muted/30 p-2">
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">
              Limit selection (optional)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Top N (by sort)</Label>
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="e.g. 50"
                  value={saveLimitTopN}
                  onChange={(e) => setSaveLimitTopN(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Min RS rating</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                  placeholder="e.g. 70"
                  value={saveLimitMinRs}
                  onChange={(e) => setSaveLimitMinRs(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">From</Label>
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="1"
                  value={saveLimitFrom}
                  onChange={(e) => setSaveLimitFrom(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">To</Label>
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="3000"
                  value={saveLimitTo}
                  onChange={(e) => setSaveLimitTo(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Will save {saveSelectionCount} of {sortedRows.length} symbols
              {saveSelectionSummary ? ` · ${saveSelectionSummary}` : ""}
            </div>
          </div>
          <button
            className="w-full rounded px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
            onClick={() => saveMut.mutate("combined")}
            disabled={saveMut.isPending || saveSelectionCount === 0}
          >
            <div className="font-medium">Combined (one list)</div>
            <div className="text-xs text-muted-foreground">Save {saveSelectionLabel} into one watchlist</div>
          </button>
          {!hidePerSectorSave && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="w-full rounded px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                  disabled={saveMut.isPending || saveSelectionCount === 0}
                >
                  <div className="font-medium">Per sector (multiple lists)</div>
                  <div className="text-xs text-muted-foreground">Save {saveSelectionLabel} into sector-based watchlists</div>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Create {perSectorCount} sector watchlists?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This creates one new watchlist per sector ({perSectorCount} lists) from {saveSelectionCount} symbols.
                    Existing watchlists aren't touched, but this can clutter your sidebar — you'll have to delete them
                    one by one to undo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => saveMut.mutate("per-sector")}>
                    Create {perSectorCount} lists
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <button
            className="w-full rounded px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
            onClick={openMergeDialog}
            disabled={saveMut.isPending || saveSelectionCount === 0}
          >
            <div className="font-medium">Merge into existing / new (dedupe)</div>
            <div className="text-xs text-muted-foreground">Merge {saveSelectionLabel} into a watchlist and keep duplicates once</div>
          </button>
        </PopoverContent>
      </Popover>
    </>
  );



  return (
    <div className="dark flex h-screen flex-col overflow-hidden bg-background text-foreground">

      <header className="flex flex-nowrap items-center gap-2 border-b border-border px-3 py-2">
        <Link
          to="/"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          title="Back to charts"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden lg:inline">Back to charts</span>
        </Link>
        <span className="hidden shrink-0 text-lg font-semibold sm:inline">Screeners</span>
        <Link
          to="/price-alerts"
          className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-2 py-1 text-xs text-amber-500 hover:bg-muted"
          title="Price & volume alerts"
        >
          <BellRing className="h-3.5 w-3.5" />
        </Link>
        <Link
          to="/breadth"
          className="hidden shrink-0 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground md:inline-block"
          title="NSE Market Breadth"
        >
          Breadth
        </Link>

        <Select value={presetId} onValueChange={applyPreset}>
          <SelectTrigger className="h-8 w-[160px] shrink-0 text-sm sm:w-[200px] md:w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent position="popper" sideOffset={4} className="max-h-[70vh] overflow-y-auto">

            {(() => {
              // Group presets by their assigned group so the dropdown shows
              // Daily / Weekly / Playbooks / Volume / … sections.
              const byGroup = new Map<string, typeof EFFECTIVE_PRESETS>();
              for (const p of EFFECTIVE_PRESETS) {
                const g = (p as any).group ?? "General";
                const arr = byGroup.get(g) ?? [];
                arr.push(p);
                byGroup.set(g, arr);
              }
              const ORDER = ["Daily", "General", "Weekly", "Earnings", "Playbooks", "Volume", "Legacy"];
              const names = [...byGroup.keys()].sort(
                (a, b) => (ORDER.indexOf(a) + 1 || 999) - (ORDER.indexOf(b) + 1 || 999) || a.localeCompare(b),
              );
              return names.map((g) => (
                <SelectGroup key={g}>
                  <SelectLabel className="flex items-center gap-1 text-xs">{g}</SelectLabel>
                  {byGroup.get(g)!.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="pl-6">
                      {p.name}
                      {(p as any).unlocked ? " ✎" : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>

              ));
            })()}
            {customScreens.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs">My screeners</SelectLabel>
                {customScreens.map((s: any) => (
                  <SelectItem key={s.id} value={CUSTOM_PREFIX + s.id}>{s.name}</SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>

        {isCustom || (EFFECTIVE_BY_ID.get(presetId) as any)?.unlocked ? (
          <span title="Editable screener" className="hidden shrink-0 text-xs text-muted-foreground md:inline">editable</span>
        ) : (
          <span title="Built-in screener — locked, save a copy to edit" className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground md:inline-flex">
            <Lock className="h-3 w-3" /> locked
          </span>
        )}

        <span className="ml-auto hidden truncate text-xs text-muted-foreground xl:inline">
          {snapshotCount} symbols · snapshot {lastUpdated} · NSE bands {bandUpdated}
        </span>

        {/* Inline actions on wide screens */}
        <div className="ml-auto hidden shrink-0 items-center gap-2 xl:ml-2 xl:flex">
          {renderHeaderActions()}
          <ProfileMenu />
        </div>


        {/* Hamburger on narrow screens */}
        <div className="ml-auto flex shrink-0 items-center gap-1 xl:hidden">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" aria-label="More actions" title="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <div className="mb-2 px-1 text-[11px] text-muted-foreground">
                {snapshotCount} symbols · snapshot {lastUpdated}<br />NSE bands {bandUpdated}
              </div>
              <div className="flex flex-col gap-1.5 [&>button]:w-full [&>button]:justify-start [&_button]:w-full [&_button]:justify-start">
                {renderHeaderActions()}
              </div>
            </PopoverContent>
          </Popover>

          <ProfileMenu />
        </div>
      </header>


      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {saveSelectionCount} results into a watchlist</DialogTitle>
            <DialogDescription>
              Each symbol's note is tagged with
              <span className="font-mono"> Scan: {currentScreenName}</span> so you can trace which scan(s) it came from.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Target watchlist</Label>
              <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                <SelectTrigger><SelectValue placeholder="Select watchlist" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">+ Create new watchlist…</SelectItem>
                  {(wlListQuery.data?.lists ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name} ({l.count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mergeTargetId === "__new__" ? (
              <div className="space-y-1">
                <Label>New watchlist name</Label>
                <Input
                  value={mergeNewName}
                  onChange={(e) => setMergeNewName(e.target.value)}
                  placeholder={currentScreenName}
                  maxLength={60}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Existing names in that watchlist</Label>
                <RadioGroup
                  value={mergeMode}
                  onValueChange={(v) => setMergeMode(v as "override" | "append")}
                  className="gap-2"
                >
                  <label className="flex cursor-pointer items-start gap-2 rounded border border-border/60 p-2">
                    <RadioGroupItem value="override" id="merge-override" className="mt-0.5" />
                    <span className="text-xs">
                      <span className="font-medium">Replace (override)</span>
                      <span className="block text-muted-foreground">
                        Delete everything currently in the watchlist and keep only these results.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded border border-border/60 p-2">
                    <RadioGroupItem value="append" id="merge-append" className="mt-0.5" />
                    <span className="text-xs">
                      <span className="font-medium">Append</span>
                      <span className="block text-muted-foreground">
                        Keep existing names and add these ones (no duplicates).
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
            <Button onClick={() => mergeMut.mutate()} disabled={mergeMut.isPending}>
              {mergeMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2 text-xs">
        <span className="text-muted-foreground">RS Rating benchmark:</span>
        <Select
          value={rsBenchmark}
          onValueChange={(v) => {
            const next = v as RsField;
            setRsBenchmark(next);
            // Update any active RS filter to use the chosen benchmark.
            setFilters((arr) => arr.map((x) => (RS_FIELDS as readonly string[]).includes(x.field) ? { ...x, field: next } : x));
            setSort({ field: next as keyof SnapshotRow, dir: "desc" });
          }}
        >
          <SelectTrigger className="h-7 w-[180px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="rs_rating">All NSE (default)</SelectItem>
            <SelectItem value="rs_rating_n50">NIFTY 50</SelectItem>
            <SelectItem value="rs_rating_n100">NIFTY 100</SelectItem>
            <SelectItem value="rs_rating_n200">NIFTY 200</SelectItem>
            <SelectItem value="rs_rating_n500">NIFTY 500</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">
          Each stock's percentile rank (1–99) of its 12-month total return vs the selected benchmark. ≥70 highlights green.
        </span>
      </div>


      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {filters.map((f, i) => (
          <FilterChip
            key={i}
            filter={f}
            onChange={(nf) => setFilters((arr) => arr.map((x, idx) => idx === i ? nf : x))}
            onRemove={() => removeFilter(i)}
          />
        ))}
        <FilterEditor mode="add" onSubmit={(f) => setFilters((arr) => [...arr, f])} />

        <Button size="sm" className="ml-auto" onClick={() => screenerQuery.refetch()}>
          <Play className="mr-1 h-3.5 w-3.5" /> Run
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={resultSearch}
            onChange={(e) => setResultSearch(e.target.value)}
            placeholder="Search results (symbol, name, sector)…"
            className="h-7 w-64 pl-7 pr-7 text-xs"
          />
          {resultSearch && (
            <button
              onClick={() => setResultSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear results search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {resultSearch.trim() && <span>{sortedRows.length} shown ·</span>}
        {screenerQuery.isFetching ? "Running…" : `${matchCount} matches out of ${total} symbols · sorted by ${String(sort.field)} ${sort.dir}`}
        {snapshotCount === 0 && (
          <span className="ml-2 text-amber-500">Snapshot is empty — click "Refresh data" once to seed it.</span>
        )}
      </div>

      {showSectorPie && <SectorPie rows={allRows} />}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background/95 backdrop-blur">
            <tr className="border-b border-border text-xs uppercase text-muted-foreground">
              {cols.map((c) => {
                const active = sort.field === c.sortField;
                const isDragOver = dragOverCol === c.key && dragCol !== c.key;
                return (
                  <th
                    key={c.key}
                    draggable
                    onDragStart={(e) => { setDragCol(c.key); e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOverCol !== c.key) setDragOverCol(c.key); }}
                    onDragLeave={() => setDragOverCol((k) => (k === c.key ? null : k))}
                    onDrop={(e) => { e.preventDefault(); if (dragCol) dropColBefore(dragCol, c.key); setDragCol(null); setDragOverCol(null); }}
                    onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
                    className={`cursor-pointer select-none px-3 py-2 ${c.align === "right" ? "text-right" : "text-left"} hover:text-foreground ${isDragOver ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : ""} ${dragCol === c.key ? "opacity-50" : ""}`}
                    onClick={() => toggleSort(c.sortField)}
                    title="Drag to reorder · click to sort"
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {active && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!groupBySector && sortedRows.map((r) => {
              // Highlight rows that closed ≥ 4% up today (4% Breakout &
              // held above the 3% mark by close — user preset).
              const hot = (r.perf_1d ?? 0) >= 4;
              return (
                <tr
                  key={r.symbol}
                  title={hot ? "Closed ≥ 4% up today — 4% breakout hold" : undefined}
                  className={`cursor-pointer border-b border-border/50 hover:bg-muted/50 ${hot ? "bg-emerald-500/10 border-l-2 border-l-emerald-500" : ""}`}
                  onClick={() => window.open(chartUrlForSymbol(r.symbol), "_blank", "noopener,noreferrer")}
                >
                  {cols.map((c) => (
                    <td key={c.key} className={`px-3 py-1.5 ${c.align === "right" ? "text-right" : "text-left"}`}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })}

            {groupBySector && (() => {
              const groups = new Map<string, typeof sortedRows>();
              for (const r of sortedRows) {
                const k = r.sector ?? "Unknown";
                const a = groups.get(k) ?? [];
                a.push(r);
                groups.set(k, a);
              }
              const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
              return entries.flatMap(([sector, srows]) => {
                const collapsed = collapsedSectors.has(sector);
                const header = (
                  <tr key={`__sec_${sector}`} className="border-b border-border bg-muted/30">
                    <td colSpan={cols.length} className="px-3 py-1.5">
                      <button
                        className="inline-flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
                        onClick={() => setCollapsedSectors((s) => {
                          const n = new Set(s);
                          if (n.has(sector)) n.delete(sector); else n.add(sector);
                          return n;
                        })}
                      >
                        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {sector} <span className="ml-1 text-foreground/70">({srows.length})</span>
                      </button>
                    </td>
                  </tr>
                );
                if (collapsed) return [header];
                const rows = srows.map((r) => {
                  const hot = (r.perf_1d ?? 0) >= 4;
                  return (
                    <tr
                      key={r.symbol}
                      title={hot ? "Closed ≥ 4% up today — 4% breakout hold" : undefined}
                      className={`cursor-pointer border-b border-border/50 hover:bg-muted/50 ${hot ? "bg-emerald-500/10 border-l-2 border-l-emerald-500" : ""}`}
                      onClick={() => window.open(chartUrlForSymbol(r.symbol), "_blank", "noopener,noreferrer")}
                    >
                      {cols.map((c) => (
                        <td key={c.key} className={`px-3 py-1.5 ${c.align === "right" ? "text-right" : "text-left"}`}>
                          {c.render(r)}
                        </td>
                      ))}
                    </tr>
                  );
                });

                return [header, ...rows];
              });
            })()}
            {!screenerQuery.isFetching && sortedRows.length === 0 && (
              <tr><td colSpan={cols.length} className="px-3 py-10 text-center text-muted-foreground">No matches.</td></tr>
            )}
          </tbody>

        </table>
      </div>
    </div>
  );
}

function FilterChip({ filter, onChange, onRemove }: { filter: Filter; onChange: (f: Filter) => void; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground">
      <FilterEditor mode="edit" initial={filter} onSubmit={onChange}>
        <button className="hover:underline">{describeFilter(filter)}</button>
      </FilterEditor>
      <button className="ml-1 text-muted-foreground hover:text-foreground" onClick={onRemove} aria-label="Remove filter">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

type OpKind = "numeric" | "between" | "enum" | "enumMulti" | "near_ref" | "cmp_ref";

function opsFor(def: { type: string } | undefined): { value: Filter["op"]; label: string; kind: OpKind }[] {
  if (!def) return [];
  if (def.type === "enum")
    return [
      { value: "eq", label: "is", kind: "enum" },
      { value: "not_eq", label: "is not", kind: "enum" },
      { value: "in", label: "is one of", kind: "enumMulti" },
      { value: "not_in", label: "is not one of", kind: "enumMulti" },
    ];
  const numeric: { value: Filter["op"]; label: string; kind: OpKind }[] = [
    { value: "gt", label: "greater than", kind: "numeric" },
    { value: "gte", label: "greater or equal", kind: "numeric" },
    { value: "lt", label: "less than", kind: "numeric" },
    { value: "lte", label: "less or equal", kind: "numeric" },
    { value: "between", label: "between", kind: "between" },
    { value: "cmp_field", label: "vs another field", kind: "cmp_ref" },
    { value: "below_by", label: "below another field by % (range)", kind: "near_ref" },
    { value: "above_by", label: "above another field by % (range)", kind: "near_ref" },
  ];
  return numeric;
}

function FilterEditor({
  mode, initial, onSubmit, children,
}: {
  mode: "add" | "edit";
  initial?: Filter;
  onSubmit: (f: Filter) => void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState<string>(initial?.field ?? FIELD_DEFS[0].id);
  const [op, setOp] = useState<Filter["op"]>(initial?.op ?? "gt");
  const [v1, setV1] = useState<string>(initial?.value != null ? String(initial.value) : "");
  const [v2, setV2] = useState<string>(initial?.value2 != null ? String(initial.value2) : "");
  const [enumValue, setEnumValue] = useState<string>(initial?.enumValue ?? "");
  const [enumValues, setEnumValues] = useState<string[]>(initial?.enumValues ?? []);
  const [refField, setRefField] = useState<string>(initial?.refField ?? "price");
  const [cmpOp, setCmpOp] = useState<NonNullable<Filter["cmpOp"]>>(initial?.cmpOp ?? "gt");

  const def = FIELD_BY_ID[fieldId];
  const ops = opsFor(def);
  const currentKind = ops.find((o) => o.value === op)?.kind ?? "numeric";

  // Reset all local state from `initial` whenever the popover opens, so
  // editing chip B doesn't show stale values from chip A.
  useEffect(() => {
    if (!open) return;
    setFieldId(initial?.field ?? FIELD_DEFS[0].id);
    setOp(initial?.op ?? "gt");
    setV1(initial?.value != null ? String(initial.value) : "");
    setV2(initial?.value2 != null ? String(initial.value2) : "");
    setEnumValue(initial?.enumValue ?? "");
    setEnumValues(initial?.enumValues ?? []);
    setRefField(initial?.refField ?? "price");
    setCmpOp(initial?.cmpOp ?? "gt");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep operator/enum-value sane when the field changes.
  useEffect(() => {
    if (def?.type === "enum") {
      if (!ops.find((o) => o.value === op)) setOp("eq");
      if (def.options && !def.options.includes(enumValue)) {
        setEnumValue(def.id === "exchange" ? "NSE" : def.options[0] ?? "");
      }
    } else if (op === "eq") {
      setOp("gt");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId]);

  const grouped = useMemo(() => {
    const m: Record<string, typeof FIELD_DEFS> = {};
    for (const f of FIELD_DEFS) (m[f.category] ??= []).push(f);
    return m;
  }, []);

  const numericFields = useMemo(
    () => FIELD_DEFS.filter((f) => f.type !== "enum"),
    []
  );

  const submit = () => {
    const next: Filter = { field: fieldId, op };
    if (currentKind === "enum") {
      next.enumValue = enumValue;
    } else if (currentKind === "enumMulti") {
      next.enumValues = enumValues;
    } else if (currentKind === "cmp_ref") {
      next.refField = refField;
      next.cmpOp = cmpOp;
    } else if (currentKind === "near_ref") {
      next.refField = refField;
      const n1 = parseFloat(v1); const n2 = parseFloat(v2);
      next.value = isFinite(n1) ? n1 : 0;
      next.value2 = isFinite(n2) ? n2 : next.value;
    } else if (currentKind === "between") {
      const n1 = parseFloat(v1); const n2 = parseFloat(v2);
      next.value = isFinite(n1) ? n1 : undefined;
      next.value2 = isFinite(n2) ? n2 : undefined;
    } else {
      const n1 = parseFloat(v1);
      next.value = isFinite(n1) ? n1 : undefined;
    }
    onSubmit(next);
    setOpen(false);
  };

  const placeholder =
    def?.type === "percent" ? "value (%)" :
    def?.type === "bigInt" ? "raw value (e.g. 2000000000)" :
    def?.type === "currency" ? `value${def.unit ? " (" + def.unit + ")" : ""}` :
    "value";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button size="sm" variant="outline" className="h-7 text-xs">
            <Plus className="mr-1 h-3 w-3" /> Add filter
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Field</label>
          <Select value={fieldId} onValueChange={setFieldId}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(grouped).map(([cat, fields]) => (
                <SelectGroup key={cat}>
                  <SelectLabel className="text-[10px] uppercase">{cat}</SelectLabel>
                  {fields.map((f) => (<SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Operator</label>
          <Select value={op} onValueChange={(v) => setOp(v as Filter["op"])}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ops.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        {currentKind === "enum" && def?.options && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Value</label>
            <Select value={enumValue} onValueChange={setEnumValue}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {def.options.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        )}

        {currentKind === "enumMulti" && def?.options && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Values (any of)</label>
            <div className="flex flex-wrap gap-3 rounded border border-border/60 p-2">
              {def.options.map((o) => {
                const checked = enumValues.includes(o);
                return (
                  <label key={o} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setEnumValues((prev) =>
                          v ? Array.from(new Set([...prev, o])) : prev.filter((x) => x !== o),
                        );
                      }}
                    />
                    {o}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {currentKind === "cmp_ref" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Comparison</label>
              <Select value={cmpOp} onValueChange={(v) => setCmpOp(v as NonNullable<Filter["cmpOp"]>)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gt">&gt;</SelectItem>
                  <SelectItem value="gte">≥</SelectItem>
                  <SelectItem value="lt">&lt;</SelectItem>
                  <SelectItem value="lte">≤</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Field</label>
              <Select value={refField} onValueChange={setRefField}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {numericFields.map((f) => (<SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {currentKind === "near_ref" && (
          <>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Reference field</label>
              <Select value={refField} onValueChange={setRefField}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {numericFields.map((f) => (<SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input value={v1} onChange={(e) => setV1(e.target.value)} placeholder="from % (e.g. 0)" className="h-8 text-sm" />
              <Input value={v2} onChange={(e) => setV2(e.target.value)} placeholder="to % (e.g. 5)" className="h-8 text-sm" />
            </div>
          </>
        )}

        {(currentKind === "numeric" || currentKind === "between") && (
          fieldId === "days_since_earnings" ? (
            <DaysSinceEarningsInput
              kind={currentKind}
              v1={v1}
              v2={v2}
              setV1={setV1}
              setV2={setV2}
            />
          ) : (
            <div className="flex gap-2">
              <Input value={v1} onChange={(e) => setV1(e.target.value)} placeholder={placeholder} className="h-8 text-sm" />
              {currentKind === "between" && (
                <Input value={v2} onChange={(e) => setV2(e.target.value)} placeholder="upper" className="h-8 text-sm" />
              )}
            </div>
          )
        )}


        <Button size="sm" className="w-full" onClick={submit}>{mode === "edit" ? "Save" : "Add"}</Button>
      </PopoverContent>
    </Popover>
  );
}

// For the `days_since_earnings` filter we let users pick a date (e.g. Jun 30)
// instead of counting days manually — the stored filter value is still a
// day count so the evaluator doesn't change. Days-count text input stays
// available as a fallback for quick edits.
function DaysSinceEarningsInput({
  kind, v1, v2, setV1, setV2,
}: {
  kind: "numeric" | "between";
  v1: string; v2: string;
  setV1: (s: string) => void;
  setV2: (s: string) => void;
}) {
  const daysToDate = (days: string): string => {
    const n = parseFloat(days);
    if (!isFinite(n)) return "";
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - Math.round(n));
    return d.toISOString().slice(0, 10);
  };
  const dateToDays = (iso: string): string => {
    if (!iso) return "";
    const picked = new Date(iso + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - picked.getTime()) / 86400000);
    return String(Math.max(0, diff));
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground w-14 shrink-0">
          {kind === "between" ? "From" : "Since"}
        </label>
        <Input
          type="date"
          value={daysToDate(v1)}
          onChange={(e) => setV1(dateToDays(e.target.value))}
          className="h-8 text-sm"
        />
        <Input
          value={v1}
          onChange={(e) => setV1(e.target.value)}
          placeholder="days"
          className="h-8 w-20 text-sm"
        />
      </div>
      {kind === "between" && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-14 shrink-0">To</label>
          <Input
            type="date"
            value={daysToDate(v2)}
            onChange={(e) => setV2(dateToDays(e.target.value))}
            className="h-8 text-sm"
          />
          <Input
            value={v2}
            onChange={(e) => setV2(e.target.value)}
            placeholder="days"
            className="h-8 w-20 text-sm"
          />
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Pick the earnings release date — we convert it to days for the filter.
      </p>
    </div>
  );
}


