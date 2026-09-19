import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  X,
  PanelLeftClose,
  PanelLeft,
  Maximize2,
  Minimize2,
  RotateCcw,
  Bell,
  BellRing,
  Search,
  Settings2,
  ExternalLink,
  HelpCircle,
  Shield,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  LightweightChart,
  DEFAULT_CHART_CONFIG,
  type IndicatorConfig,
  type ChartConfig,
} from "@/components/LightweightChart";
import { IndicatorsMenu } from "@/components/IndicatorsMenu";
import { ChartSettingsMenu } from "@/components/ChartSettingsMenu";
import { Watchlist, makeDefaultLists, type CustomList } from "@/components/Watchlist";
import { CommandPalette } from "@/components/CommandPalette";
import { HeaderSymbolActions } from "@/components/HeaderSymbolActions";
import { DataFreshnessBadge } from "@/components/DataFreshnessBadge";

import { AlertsDialog } from "@/components/AlertsDialog";
import { AuthButton } from "@/components/AuthButton";
import { ProfileMenu } from "@/components/ProfileMenu";

import { useCloudSync } from "@/hooks/use-cloud-sync";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NSE_SYMBOLS, type NseSymbol, findSymbol } from "@/data/nse-symbols";
import { BSE_INDEX_YAHOOS } from "@/data/markets-catalog";
import { defaultRangeFor, rangesFor, rangeLabel } from "@/lib/timeframes";
import { loadAlerts, saveAlerts, type Alert } from "@/lib/alerts";
import { requestNotifPermission } from "@/hooks/use-alerts";
import {
  isGlobalSymbol,
  isIndianEquitySymbol,
  normalizeChartSymbol,
  nseUrlForSymbol,
  screenerUrlForSymbol,
  tradingViewUrlForSymbol,
} from "@/lib/chart-links";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NSE MultiView — Free Multi-Timeframe Charts for Indian Markets" },
      {
        name: "description",
        content:
          "Free configurable multi-timeframe charts for NSE stocks and indices. Build your own watchlist, drag to reorder, navigate with arrow keys.",
      },
      { property: "og:title", content: "NSE MultiView — Multi-Timeframe Charts" },
      {
        property: "og:description",
        content: "Side-by-side timeframe charts for Indian markets. No popups, no signup.",
      },
    ],
  }),
  component: IndexGate,
});

import { useAuth } from "@/hooks/use-auth";
import { ChartCaptureButton } from "@/components/ChartCaptureButton";
import { Loader2 } from "lucide-react";

function IndexGate() {
  const { user, loading, approved, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) {
    return (
      <div
        className="relative flex h-screen w-full flex-col items-center justify-center gap-8 overflow-hidden px-4 text-center [height:100dvh]"
        style={{
          background:
            "radial-gradient(ellipse at top, hsl(220 40% 12%) 0%, hsl(222 45% 7%) 45%, hsl(224 50% 4%) 100%)",
        }}
      >
        {/* Ambient glows */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl"
          style={{
            background: "radial-gradient(circle, hsl(265 80% 55% / 0.55), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -right-32 h-[480px] w-[480px] rounded-full opacity-40 blur-3xl"
          style={{
            background: "radial-gradient(circle, hsl(190 90% 50% / 0.45), transparent 70%)",
          }}
        />
        {/* Subtle grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/60 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_hsl(150_80%_50%)]" />
            Private beta · 5 seats
          </div>
          <h1 className="bg-gradient-to-b from-white via-white to-white/60 bg-clip-text text-5xl font-semibold tracking-tight text-transparent sm:text-6xl">
            KcH TV
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-white/60">
            Side-by-side timeframe charts for Indian markets.
            <br />
            Please sign in to continue.
          </p>
        </div>

        <div className="relative z-10">
          <AuthButton />
        </div>

        <div className="relative z-10 mt-4 flex flex-col items-center gap-1 text-xs text-white/40">
          <p className="flex items-center gap-1.5">
            Made with <span className="text-red-400">♥</span> in India
          </p>
        </div>
      </div>
    );
  }
  if (!approved && !isAdmin) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center [height:100dvh]">
        <div className="text-amber-500 text-3xl">⏳</div>
        <h1 className="text-2xl font-semibold">Access pending approval</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Your sign-up was received. The admin (keechu7@gmail.com) needs to approve your account
          before you can use the app. You'll be granted access once approved — please try signing in
          again later.
        </p>
        <div className="text-xs text-muted-foreground">Signed in as {user.email}</div>
        <button
          className="text-xs underline text-muted-foreground hover:text-foreground"
          onClick={() =>
            import("@/integrations/supabase/client").then((m) => m.supabase.auth.signOut())
          }
        >
          Sign out
        </button>
      </div>
    );
  }
  return <Index />;
}

const TIMEFRAMES = [
  { label: "5 min", interval: "5" },
  { label: "15 min", interval: "15" },
  { label: "30 min", interval: "30" },
  { label: "1 Hour", interval: "60" },
  { label: "1 Day", interval: "D" },
  { label: "1 Week", interval: "W" },
  { label: "1 Month", interval: "M" },
];

const tfLabel = (i: string) => TIMEFRAMES.find((t) => t.interval === i)?.label ?? i;

const PANES_KEY = "nse-mv:panes";
const WATCHLIST_KEY = "nse-mv:watchlist";
const SHORTLIST_KEY = "nse-mv:shortlist"; // legacy, migrated
const LISTS_KEY = "nse-mv:lists";
const LAST_LIST_KEY = "nse-mv:lastListId";
const SELECTED_KEY = "nse-mv:selected";
const INDICATORS_KEY = "nse-mv:indicators";
const CHART_KEY = "nse-mv:chart";
const SIDEBAR_KEY = "nse-mv:sidebar-open";
const SIDEBAR_WIDTH_KEY = "nse-mv:sidebar-width";

interface Pane {
  interval: string;
  range: string;
  indicators?: IndicatorConfig | null;
}

const DEFAULT_PANES: Pane[] = [
  { interval: "D", range: defaultRangeFor("D") },
  { interval: "60", range: defaultRangeFor("60") },
  { interval: "W", range: defaultRangeFor("W") },
];
const SHORTCUT_PANES: Pane[] = [
  { interval: "D", range: defaultRangeFor("D") },
  { interval: "60", range: defaultRangeFor("60") },
  { interval: "W", range: defaultRangeFor("W") },
  { interval: "M", range: defaultRangeFor("M") },
];
const DEFAULT_INDICATORS: IndicatorConfig = {
  ema: [21, 50, 200],
  sma: [],
  vwap: false,
  anchoredVwaps: [],
};
// Default watchlist: indices only (Nifty 50 + Bank Nifty)
const DEFAULT_WATCHLIST_YAHOOS = ["^NSEI", "^NSEBANK"];

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizePanes(raw: unknown): Pane[] {
  if (!Array.isArray(raw)) return DEFAULT_PANES;
  const out: Pane[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ interval: item, range: defaultRangeFor(item) });
    } else if (item && typeof item === "object" && typeof (item as any).interval === "string") {
      const interval = (item as any).interval as string;
      const range = (item as any).range as string | undefined;
      const ind = (item as any).indicators as IndicatorConfig | null | undefined;
      const allowed = rangesFor(interval);
      out.push({
        interval,
        range: range && allowed.includes(range as any) ? range : defaultRangeFor(interval),
        indicators: ind && typeof ind === "object" ? ind : null,
      });
    }
  }
  return out.length ? out : DEFAULT_PANES;
}

function ensureSwitchableDefaultPanes(panes: Pane[]): Pane[] {
  if (panes.length > 1) return panes;
  const byInterval = new Map(panes.map((p) => [p.interval, p]));
  return ["D", "60", "W"].map(
    (interval) => byInterval.get(interval) ?? { interval, range: defaultRangeFor(interval) },
  );
}

function symbolFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("symbol");
  return raw ? normalizeChartSymbol(raw) : null;
}

function customSymbol(yahoo: string): NseSymbol | null {
  // FX / commodity futures / crypto: tradeable, but not an NSE or BSE listing.
  if (isGlobalSymbol(yahoo)) return { ticker: yahoo, name: yahoo, yahoo, sector: "Global" };
  const key = yahoo.trim().toUpperCase();
  // The site carries NSE equities plus the curated indices. A ".BO" id is only
  // allowed for the BSE *indices* we list; a BSE-listed stock is refused so it
  // can never be added to a watchlist or charted here.
  if (key.endsWith(".BO")) {
    if (!BSE_INDEX_YAHOOS.has(key)) return null;
    const ticker = key.slice(0, -3);
    return { ticker, name: `${ticker} (BSE)`, yahoo: key, sector: "Index" };
  }
  if (!key.endsWith(".NS")) return null;
  const ticker = key.slice(0, -3);
  return { ticker, name: `${ticker} (NSE)`, yahoo: key, sector: "Custom" };
}

function formatVol(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return `${Math.round(n)}`;
}

function formatPx(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type BarField = "o" | "h" | "l" | "c" | "v" | "pv";
const BAR_FIELDS: { key: BarField; label: string }[] = [
  { key: "o", label: "Open" },
  { key: "h", label: "High" },
  { key: "l", label: "Low" },
  { key: "c", label: "Close" },
  { key: "v", label: "Volume" },
  { key: "pv", label: "Price × Volume (Cr)" },
];
const DEFAULT_BAR_FIELDS: Record<BarField, boolean> = {
  o: true,
  h: true,
  l: true,
  c: true,
  v: true,
  pv: true,
};

type HoverBar = {
  time?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adr20?: number | null;
  atr14?: number | null;
  pct52wHigh?: number | null;
  pctFromLod?: number | null;
  pctFromMa?: number | null;
  maLabel?: string | null;
};

function formatCr(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  return (n / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function VolumeInfo({
  bar,
  fields,
  onFieldsChange,
}: {
  bar: HoverBar | null;
  fields: Record<BarField, boolean>;
  onFieldsChange: (f: Record<BarField, boolean>) => void;
}) {
  const up = bar ? bar.close >= bar.open : true;
  const color = up ? "text-emerald-500" : "text-rose-500";
  const pv = bar ? bar.close * bar.volume : 0;
  return (
    <div className="hidden items-center gap-1.5 md:flex">
      {bar && (
        <div className={`flex items-center gap-1.5 text-[10px] tabular-nums ${color}`}>
          {fields.o && (
            <span>
              <span className="text-muted-foreground">O</span>
              {formatPx(bar.open)}
            </span>
          )}
          {fields.h && (
            <span>
              <span className="text-muted-foreground">H</span>
              {formatPx(bar.high)}
            </span>
          )}
          {fields.l && (
            <span>
              <span className="text-muted-foreground">L</span>
              {formatPx(bar.low)}
            </span>
          )}
          {fields.c && (
            <span>
              <span className="text-muted-foreground">C</span>
              {formatPx(bar.close)}
            </span>
          )}
          {fields.v && bar.volume > 0 && (
            <span>
              <span className="text-muted-foreground">Vol</span>
              {formatVol(bar.volume)}
            </span>
          )}
          {fields.pv && bar.volume > 0 && (
            <span>
              <span className="text-muted-foreground">P×V </span>
              {formatCr(pv)}
              <span className="text-muted-foreground">Cr</span>
            </span>
          )}
          {bar.adr20 != null && Number.isFinite(bar.adr20) && (
            <span className="px-1">
              <span className="text-muted-foreground">ADR20 </span>
              {bar.adr20.toFixed(2)}%
            </span>
          )}
          {bar.atr14 != null && Number.isFinite(bar.atr14) && (
            <>
              <span className="px-1">
                <span className="text-muted-foreground">ATR14 </span>
                {bar.atr14.toFixed(2)}
              </span>
              <span className="px-1" title="Close − ATR14 (nearby support)">
                <span className="text-muted-foreground">−ATR </span>
                <span className="text-sky-400">{(bar.close - bar.atr14).toFixed(2)}</span>
              </span>
            </>
          )}
          {/* % from 52-week high now lives in the toolbar beside the watchlist position. */}
          {bar.pctFromLod != null && Number.isFinite(bar.pctFromLod) && (
            <span>
              <span className="text-muted-foreground">LoD </span>+{bar.pctFromLod.toFixed(2)}%
            </span>
          )}
          {bar.pctFromMa != null && Number.isFinite(bar.pctFromMa) && bar.maLabel && (
            <span>
              <span className="text-muted-foreground">{bar.maLabel} </span>
              <span className={bar.pctFromMa >= 0 ? "text-emerald-500" : "text-rose-500"}>
                {bar.pctFromMa >= 0 ? "+" : ""}
                {bar.pctFromMa.toFixed(2)}%
              </span>
            </span>
          )}
        </div>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle bar info fields"
          >
            <Settings2 className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-2">
          <div className="text-[11px] font-medium text-muted-foreground px-1 pb-1">Show fields</div>
          {BAR_FIELDS.map((f) => (
            <label
              key={f.key}
              className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer hover:bg-accent rounded"
            >
              <Checkbox
                checked={fields[f.key]}
                onCheckedChange={(c) => onFieldsChange({ ...fields, [f.key]: c === true })}
              />
              {f.label}
            </label>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Index() {
  const { isAdmin } = useAuth();
  const initialUrlSymbol = useRef<string | null>(symbolFromUrl());
  const urlLockedPaneLayout = useRef(false);

  const [panes, setPanes] = useState<Pane[]>(DEFAULT_PANES);
  const [watchlist, setWatchlist] = useState<NseSymbol[]>([]);
  const [lists, setLists] = useState<CustomList[]>([]);
  const [lastListId, setLastListId] = useState<string | null>(null);

  // Refs mirroring the latest values, used by the global keydown handler so it
  // can read current state without being torn down/rebuilt on every change.
  const listsRef = useRef<CustomList[]>([]);
  const lastListIdRef = useRef<string | null>(null);
  const selectedSymbolRef = useRef<NseSymbol | null>(null);

  const [group, setGroup] = useState<string>("main");
  const [selected, setSelected] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const w = loadJson<number>(SIDEBAR_WIDTH_KEY, 288);
    return typeof w === "number" && w >= 220 && w <= 640 ? w : 288;
  });
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, JSON.stringify(sidebarWidth));
    } catch {}
  }, [sidebarWidth]);

  const [focusedPane, setFocusedPane] = useState<number | null>(0);
  // Nudge charts/overlays to re-measure after sidebar/focus changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fire = () => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new CustomEvent("nse-mv:chart-resize", { detail: { fit: true } }));
    };
    const ids = [
      window.requestAnimationFrame(fire),
      window.setTimeout(fire, 0) as unknown as number,
      window.setTimeout(fire, 60) as unknown as number,
      window.setTimeout(fire, 160) as unknown as number,
      window.setTimeout(fire, 320) as unknown as number,
    ];
    return () => {
      window.cancelAnimationFrame(ids[0]);
      ids.slice(1).forEach((id) => window.clearTimeout(id));
    };
  }, [sidebarOpen, focusedPane, panes.length]);

  const [indicators, setIndicators] = useState<IndicatorConfig>(DEFAULT_INDICATORS);
  const [chartCfg, setChartCfg] = useState<ChartConfig>(DEFAULT_CHART_CONFIG);
  const [hoverBars, setHoverBars] = useState<Record<number, HoverBar | null>>({});
  const [barFields, setBarFields] = useState<Record<BarField, boolean>>(() => {
    if (typeof window === "undefined") return DEFAULT_BAR_FIELDS;
    try {
      const raw = localStorage.getItem("bar-fields");
      if (raw) return { ...DEFAULT_BAR_FIELDS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_BAR_FIELDS;
  });
  useEffect(() => {
    try {
      localStorage.setItem("bar-fields", JSON.stringify(barFields));
    } catch {}
  }, [barFields]);
  const [resetTicks, setResetTicks] = useState<number[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertSound, setAlertSound] = useState(false);
  const [alertsOpenIdx, setAlertsOpenIdx] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [, setActiveSymbols] = useState<NseSymbol[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target?.isContentEditable ?? false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "/" && !isTyping) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (
        !isTyping &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        (e.key === "\\" || e.key === "b" || e.key === "B")
      ) {
        // Toggle watchlist sidebar (TradingView-style)
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (!isTyping && e.key === "Escape") {
        setFocusedPane((cur) => (cur != null ? null : cur));
      } else if (
        !isTyping &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.shiftKey &&
        (e.key === "W" || e.key === "w")
      ) {
        // Shift+W = add current symbol to last-used watchlist (never removes).
        e.preventDefault();
        const sym = selectedSymbolRef.current;
        const lid = lastListIdRef.current;
        const ls = listsRef.current;
        if (!sym) {
          toast.info("Pick a symbol first");
        } else if (!lid || !ls.some((l) => l.id === lid)) {
          const focused = ls.find((l) => l.name.toLowerCase() === "focused");
          if (!focused) {
            toast.info(
              "Open the star menu and pick a list once — Shift+W will add to it next time",
            );
            return;
          }
          if (focused.symbols.some((x) => x.yahoo === sym.yahoo)) {
            toast.info(`${sym.ticker} already in “${focused.name}”`);
          } else {
            setLists((arr) =>
              arr.map((l) => (l.id === focused.id ? { ...l, symbols: [...l.symbols, sym] } : l)),
            );
            setLastListId(focused.id);
            toast.success(`Added ${sym.ticker} to “${focused.name}”`);
          }
        } else {
          const list = ls.find((l) => l.id === lid);
          if (!list) return;
          if (list.symbols.some((x) => x.yahoo === sym.yahoo)) {
            toast.info(`${sym.ticker} already in “${list.name}”`);
          } else {
            setLists((arr) =>
              arr.map((l) => (l.id === lid ? { ...l, symbols: [...l.symbols, sym] } : l)),
            );
            toast.success(`Added ${sym.ticker} to “${list.name}”`);
          }
        }
      } else if (!isTyping && !e.metaKey && !e.ctrlKey && !e.altKey && /^[0-9]$/.test(e.key)) {
        // 1..9 = focus that pane, 0 = restore grid
        e.preventDefault();
        const n = Number(e.key);
        if (n === 0) {
          setFocusedPane(null);
        } else {
          const idx = n - 1;
          setPanes((arr) => {
            if (idx < arr.length) return arr;
            const next = [...arr];
            for (let i = next.length; i <= idx; i += 1) {
              const template = SHORTCUT_PANES[i] ?? { interval: "D", range: defaultRangeFor("D") };
              next.push({ ...template });
            }
            return next;
          });
          setFocusedPane((cur) => {
            return cur === idx ? null : idx;
          });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    // Defaults are sidebar closed + Daily focused, while keeping the usual
    // Daily / Hourly / Weekly panes available for shortcuts and tab switching.
    let initialPanes: Pane[] = ensureSwitchableDefaultPanes(
      normalizePanes(loadJson<unknown>(PANES_KEY, DEFAULT_PANES)),
    );
    let initialFocus: number | null = 0;
    try {
      const sp = new URLSearchParams(window.location.search);
      const tfRaw = sp.get("tf");
      const focusRaw = sp.get("focus");
      const paneRaw = sp.get("pane");
      if (tfRaw) {
        const valid = new Set(["5", "15", "30", "60", "D", "W", "M"]);
        const list = tfRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => valid.has(s));
        // Back-compat: old URLs used ?tf=D to mean "show Daily". Treat a
        // single tf without an explicit focus/pane param as the active pane,
        // not as permission to delete the Hourly/Weekly panes.
        if (list.length > 1 || focusRaw != null || paneRaw != null) {
          if (list.length)
            initialPanes = list.map((i) => ({ interval: i, range: defaultRangeFor(i) }));
          urlLockedPaneLayout.current = true;
        } else if (list.length === 1) {
          const idx = initialPanes.findIndex((p) => p.interval === list[0]);
          if (idx >= 0) initialFocus = idx;
          else {
            initialPanes = [
              { interval: list[0], range: defaultRangeFor(list[0]) },
              ...initialPanes,
            ];
            initialFocus = 0;
          }
        }
      }
      if (focusRaw === "grid" || focusRaw === "all") initialFocus = null;
      else if (focusRaw != null) {
        const n = Number(focusRaw);
        if (Number.isInteger(n) && n >= 0 && n < initialPanes.length) initialFocus = n;
      } else if (paneRaw === "grid" || paneRaw === "all") initialFocus = null;
      else if (paneRaw != null) {
        const n = Number(paneRaw);
        const idx = Number.isInteger(n) ? n - 1 : -1;
        if (idx >= 0 && idx < initialPanes.length) initialFocus = idx;
      }
      const sb = sp.get("sidebar");
      if (sb === "1" || sb === "open") setSidebarOpen(true);
      else if (sb === "0" || sb === "closed") setSidebarOpen(false);
    } catch {}
    setPanes(initialPanes);
    setFocusedPane(initialFocus);

    const storedWl = loadJson<string[] | null>(WATCHLIST_KEY, null);
    const yahoos = storedWl ?? DEFAULT_WATCHLIST_YAHOOS;
    const resolved = yahoos
      .map((y): NseSymbol | null => {
        const found = findSymbol(y);
        if (found) return found;
        const custom = customSymbol(y);
        if (custom) return custom;
        return null;
      })
      .filter((s): s is NseSymbol => Boolean(s));
    setWatchlist(resolved);

    const resolveList = (yahoos: string[]): NseSymbol[] =>
      yahoos
        .map((y): NseSymbol | null => {
          const found = findSymbol(y);
          if (found) return found;
          const custom = customSymbol(y);
          if (custom) return custom;
          return null;
        })
        .filter((s): s is NseSymbol => Boolean(s));

    // Load custom lists, or migrate old shortlist, or seed defaults
    const storedLists = loadJson<CustomList[] | null>(LISTS_KEY, null);
    if (storedLists && Array.isArray(storedLists) && storedLists.length > 0) {
      // Re-hydrate symbol entries via resolver in case data shape changed.
      // Respect whatever the user has set — do not force-lock any list.
      const fixed: CustomList[] = storedLists.map((l: any) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        notes: l.notes ?? {},
        pinned: !!l.pinned,
        kind: l.kind,
        protected: !!l.protected,
        symbols: Array.isArray(l.symbols)
          ? l.symbols
              .map((s: any) =>
                typeof s === "string"
                  ? (resolveList([s])[0] ?? null)
                  : s && s.yahoo
                    ? (findSymbol(s.yahoo) ?? s)
                    : null,
              )
              .filter((x: NseSymbol | null): x is NseSymbol => Boolean(x))
          : [],
      }));
      setLists(fixed);
    } else {
      // Brand-new user: seed with Holdings / Buyable / Focused, locked + pinned by default.
      // User can unlock/unpin/rename/recolor/delete any of these from the UI.
      const seeded = makeDefaultLists();
      const legacy = loadJson<string[] | null>(SHORTLIST_KEY, null);
      if (legacy && legacy.length > 0) {
        seeded.push({
          id: `l_legacy_${Date.now().toString(36)}`,
          name: "Shortlist",
          color: "#eab308",
          symbols: resolveList(legacy),
          notes: {},
        });
      }
      setLists(seeded);
    }

    const storedLast = loadJson<string | null>(LAST_LIST_KEY, null);
    // Default the star's quick-add target to Focused, even when an older
    // stored target was Buyable. Users can still choose any list in the menu.
    const focusedId =
      (storedLists ?? makeDefaultLists()).find((l) => l.name.toLowerCase() === "focused")?.id ??
      null;
    setLastListId(focusedId ?? storedLast);

    const storedSel = loadJson<string | null>(SELECTED_KEY, null);
    setSelected(initialUrlSymbol.current ?? storedSel ?? resolved[0]?.yahoo ?? null);

    setIndicators(loadJson<IndicatorConfig>(INDICATORS_KEY, DEFAULT_INDICATORS));
    // Merge stored chart config and migrate the old chart-level RS line into the IBD overlay.
    const storedChart = loadJson<Partial<ChartConfig>>(CHART_KEY, {});
    setChartCfg({
      ...DEFAULT_CHART_CONFIG,
      ...storedChart,
      rsEnabled: false,
      rsOverlay: storedChart.rsOverlay ?? storedChart.rsEnabled ?? DEFAULT_CHART_CONFIG.rsOverlay,
    });

    setAlerts(loadAlerts());
    try {
      const snd = localStorage.getItem("kch.alerts.sound");
      if (snd != null) setAlertSound(snd === "1");
    } catch {}

    setHydrated(true);
  }, []);

  // URL params <-> state sync (list + symbol)
  useEffect(() => {
    if (!hydrated) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const listParam = sp.get("list");
      const symParam = sp.get("symbol");
      if (listParam) {
        if (listParam === "main") setGroup("main");
        else {
          const match = lists.find(
            (l) => l.id === listParam || l.name.toLowerCase() === listParam.toLowerCase(),
          );
          if (match) setGroup(match.id);
        }
      }
      if (symParam) setSelected(normalizeChartSymbol(symParam));
    } catch {}
    // run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const listName = group === "main" ? "main" : (lists.find((l) => l.id === group)?.name ?? "");
      if (listName) sp.set("list", listName);
      else sp.delete("list");
      if (selected) {
        const sym = selected.endsWith(".NS") ? selected.slice(0, -3) : selected;
        sp.set("symbol", sym);
      } else sp.delete("symbol");
      sp.set("tf", panes.map((p) => p.interval).join(","));
      sp.set("focus", focusedPane == null ? "grid" : String(focusedPane));
      sp.set("sidebar", sidebarOpen ? "1" : "0");
      const qs = sp.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState(null, "", url);
    } catch {}
  }, [group, selected, lists, panes, focusedPane, sidebarOpen, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveAlerts(alerts);
  }, [alerts, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("kch.alerts.sound", alertSound ? "1" : "0");
    } catch {}
  }, [alertSound, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CHART_KEY, JSON.stringify(chartCfg));
    } catch {}
  }, [chartCfg, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(INDICATORS_KEY, JSON.stringify(indicators));
    } catch {}
  }, [indicators, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PANES_KEY, JSON.stringify(panes));
    } catch {}
  }, [panes, hydrated]);

  // Intentionally not persisting sidebar-open to localStorage — the chart page
  // should still default to sidebar closed unless the URL says otherwise.

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist.map((s) => s.yahoo)));
    } catch {}
  }, [watchlist, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
    } catch {}
  }, [lists, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (lastListId) localStorage.setItem(LAST_LIST_KEY, JSON.stringify(lastListId));
      else localStorage.removeItem(LAST_LIST_KEY);
    } catch {}
  }, [lastListId, hydrated]);

  useEffect(() => {
    if (!hydrated || !selected) return;
    try {
      localStorage.setItem(SELECTED_KEY, JSON.stringify(selected));
    } catch {}
  }, [selected, hydrated]);

  // ---- Stable list navigation --------------------------------------------
  // The cursor is an *index* into the active list, not a symbol lookup. Symbol
  // lookup breaks (jumps to a far-away position) whenever the same name appears
  // twice in a long scanning list, which is exactly what happens after adding a
  // name to another watchlist. We remember the position and only fall back to a
  // lookup when the remembered slot no longer holds the selected symbol.
  const navPosRef = useRef<number>(-1);

  // Derive navigation directly from the selected tab. Do not infer it from a
  // symbol's membership in other lists: while reviewing Scanning Process, the
  // cursor must remain anchored to that list even after adding the symbol to
  // Holdings, Focused, or another watchlist.
  const navigationSymbols = useMemo(() => {
    const source =
      group === "main" ? watchlist : (lists.find((list) => list.id === group)?.symbols ?? []);
    const seen = new Set<string>();
    return source.filter((symbol) => {
      const key = symbol.yahoo.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [group, lists, watchlist]);

  const navListOf = useCallback(() => navigationSymbols, [navigationSymbols]);

  const currentNavPos = useCallback(
    (list: NseSymbol[]) => {
      const p = navPosRef.current;
      if (p >= 0 && p < list.length && list[p]?.yahoo === selected) return p;
      return list.findIndex((s) => s.yahoo === selected);
    },
    [selected],
  );

  const stepSymbol = useCallback(
    (delta: number) => {
      const list = navListOf();
      if (list.length === 0) return;
      const base = currentNavPos(list);
      const idx = ((((base < 0 ? 0 : base) + delta) % list.length) + list.length) % list.length;
      navPosRef.current = idx;
      const next = list[idx];
      if (next) setSelected(next.yahoo);
    },
    [navListOf, currentNavPos],
  );

  const gotoNavIndex = useCallback(
    (idx: number) => {
      const list = navListOf();
      const target = list[idx];
      if (!target) return;
      navPosRef.current = idx;
      setSelected(target.yahoo);
    },
    [navListOf],
  );

  // Keyboard navigation across the currently active watchlist (main or any custom list)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      const list = navListOf();
      if (list.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        stepSymbol(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        stepSymbol(-1);
      } else if (e.key === "PageDown") {
        e.preventDefault();
        stepSymbol(10);
      } else if (e.key === "PageUp") {
        e.preventDefault();
        stepSymbol(-10);
      } else if (e.key === "Home") {
        e.preventDefault();
        gotoNavIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        gotoNavIndex(list.length - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navListOf, stepSymbol, gotoNavIndex]);

  // Cloud sync (no-op when signed out)
  useCloudSync({
    hydrated,
    state: {
      panes,
      // Intentionally NOT syncing sidebar state — default closed must win.
      indicators,
      chart_cfg: chartCfg,
      selected,
      watchlist: watchlist.map((s) => s.yahoo),
      lists,
      last_list_id: lastListId,
      alerts,
      alert_sound: alertSound,
    },
    applyRemote: (remote) => {
      const resolveList = (yahoos: unknown): NseSymbol[] => {
        if (!Array.isArray(yahoos)) return [];
        return yahoos
          .map((y): NseSymbol | null => {
            if (typeof y !== "string") return null;
            const found = findSymbol(y);
            if (found) return found;
            const custom = customSymbol(y);
            if (custom) return custom;
            return null;
          })
          .filter((s): s is NseSymbol => Boolean(s));
      };
      if (remote.panes && !urlLockedPaneLayout.current)
        setPanes(ensureSwitchableDefaultPanes(normalizePanes(remote.panes)));
      if (remote.indicators) setIndicators(remote.indicators as IndicatorConfig);

      if (remote.chart_cfg)
        setChartCfg({ ...DEFAULT_CHART_CONFIG, ...(remote.chart_cfg as Partial<ChartConfig>) });
      if (remote.watchlist) setWatchlist(resolveList(remote.watchlist));
      if (remote.lists && Array.isArray(remote.lists)) {
        setLists(
          (remote.lists as CustomList[]).map((l) => ({
            id: l.id,
            name: l.name,
            color: l.color,
            notes: l.notes ?? {},
            pinned: Boolean((l as any).pinned),
            kind: (l as any).kind,
            protected: Boolean((l as any).protected),
            symbols: resolveList(
              (l.symbols ?? []).map((s: any) => (typeof s === "string" ? s : s?.yahoo)),
            ),
          })),
        );
      }
      if ("last_list_id" in remote) setLastListId(remote.last_list_id ?? null);
      if ("selected" in remote && remote.selected && !initialUrlSymbol.current)
        setSelected(remote.selected);
      if (Array.isArray(remote.alerts)) setAlerts(remote.alerts as Alert[]);
      if (typeof remote.alert_sound === "boolean") setAlertSound(remote.alert_sound);
    },
  });

  const addAlert = useCallback((a: Alert) => {
    setAlerts((prev) => [...prev, a]);
    requestNotifPermission();
  }, []);
  const updateAlert = useCallback((id: string, patch: Partial<Alert>) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? ({ ...a, ...patch } as Alert) : a)));
  }, []);
  const removeAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);
  const handleAlertUpdate = useCallback((id: string, lastBarTime: number, fired: boolean) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? ({
              ...a,
              lastBarTime,
              lastTriggeredAt: fired ? Date.now() : a.lastTriggeredAt,
            } as Alert)
          : a,
      ),
    );
  }, []);

  const addPane = () => {
    if (panes.length >= 6) return;
    const usedIntervals = new Set(panes.map((p) => p.interval));
    const next = TIMEFRAMES.find((t) => !usedIntervals.has(t.interval))?.interval ?? "60";
    setPanes([...panes, { interval: next, range: defaultRangeFor(next) }]);
  };
  const removePane = (idx: number) => {
    if (panes.length <= 1) return;
    setPanes(panes.filter((_, i) => i !== idx));
  };
  const setPaneInterval = (idx: number, interval: string) => {
    setPanes((arr) =>
      arr.map((p, i) => {
        if (i !== idx) return p;
        const allowed = rangesFor(interval);
        const range = allowed.includes(p.range as any) ? p.range : defaultRangeFor(interval);
        return { interval, range };
      }),
    );
  };
  const setPaneRange = (idx: number, range: string) => {
    setPanes((arr) => arr.map((p, i) => (i === idx ? { ...p, range } : p)));
  };

  const setPaneIndicators = (idx: number, next: IndicatorConfig | null) => {
    setPanes((arr) => arr.map((p, i) => (i === idx ? { ...p, indicators: next } : p)));
  };

  const paneRefs = useRef<Array<HTMLDivElement | null>>([]);
  const captureRef = useRef<HTMLElement | null>(null);
  const toggleFullscreen = (idx: number) => {
    const el = paneRefs.current[idx];
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  const setMain = useCallback((updater: (cur: NseSymbol[]) => NseSymbol[]) => {
    setWatchlist((wl) => {
      const next = updater(wl);
      setSelected((cur) => cur ?? next[0]?.yahoo ?? null);
      return next;
    });
  }, []);

  const visiblePanes =
    focusedPane != null && panes[focusedPane]
      ? [{ pane: panes[focusedPane], idx: focusedPane }]
      : panes.map((pane, idx) => ({ pane, idx }));

  const gridCols =
    visiblePanes.length === 1
      ? "grid-cols-1"
      : visiblePanes.length === 2
        ? "grid-cols-1 md:grid-cols-2"
        : visiblePanes.length === 3
          ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
          : visiblePanes.length === 4
            ? "grid-cols-1 md:grid-cols-2"
            : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";

  const selectedSymbol = selected
    ? (watchlist.find((s) => s.yahoo === selected) ??
      lists.flatMap((l) => l.symbols).find((s) => s.yahoo === selected) ??
      findSymbol(selected) ??
      customSymbol(selected))
    : null;

  // Snapshot stats shown beside the watchlist position: price band, RS,
  // % from 52w high and % from all-time high.
  const symbolStatsQuery = useQuery({
    queryKey: ["symbol-stats", selectedSymbol?.yahoo ?? null],
    enabled: !!selectedSymbol?.yahoo,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const yahoo = selectedSymbol!.yahoo;
      const ticker =
        selectedSymbol!.ticker?.toUpperCase() ?? yahoo.replace(/\.(NS|BO)$/i, "").toUpperCase();
      const { data: snap } = await supabase
        .from("stock_snapshot")
        .select("price,high_52w,ath,rs_rating_n500,rs_rating")
        .eq("symbol", yahoo)
        .maybeSingle();
      const { data: band } = await supabase
        .from("price_bands")
        .select("band_pct,band")
        .in("symbol", [yahoo.toUpperCase(), ticker])
        .limit(1)
        .maybeSingle();
      const price = snap?.price ?? null;
      const pctFrom = (ref: number | null | undefined) =>
        typeof price === "number" && typeof ref === "number" && ref > 0
          ? Math.max(0, ((ref - price) / ref) * 100)
          : null;
      const rawBand = band?.band_pct as number | string | null | undefined;
      const bandNum = rawBand == null ? null : Number(rawBand);
      return {
        band: bandNum != null && Number.isFinite(bandNum) ? bandNum : null,
        bandLabel: band?.band ?? null,
        rs: (snap?.rs_rating_n500 ?? snap?.rs_rating ?? null) as number | null,
        pct52w: pctFrom(snap?.high_52w),
        pctAth: pctFrom(snap?.ath),
      };
    },
  });
  const symbolStats = symbolStatsQuery.data;

  // Keep refs in sync for the global keydown handler.
  listsRef.current = lists;
  lastListIdRef.current = lastListId;
  selectedSymbolRef.current = selectedSymbol ?? null;

  return (
    <div className="dark flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground [height:100svh] [height:100dvh]">
      <header className="flex min-h-[44px] shrink-0 flex-nowrap items-center gap-x-2 overflow-hidden border-b border-border bg-card/50 px-2 py-1 backdrop-blur md:px-3 md:py-2 lg:min-h-[52px] lg:gap-x-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle watchlist"
          title="Toggle watchlist (\ or B) · Navigate: ↑/↓ or J/K"
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </Button>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            N
          </div>
          <div className="hidden leading-tight 2xl:block">
            <h1 className="text-sm font-semibold">NSE MultiView</h1>
            <p className="text-[10px] text-muted-foreground">Indian markets · Yahoo Finance</p>
          </div>
        </div>

        {selectedSymbol && (
          <>
            <div className="mx-1 h-6 w-px shrink-0 bg-border" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {(() => {
                const navList = navigationSymbols;
                const canNav = navList.length > 1;
                const step = (delta: number) => {
                  if (!canNav) return;
                  stepSymbol(delta);
                };
                return (
                  <div className="flex flex-col overflow-hidden rounded border border-border">
                    <button
                      type="button"
                      onClick={() => step(-1)}
                      disabled={!canNav}
                      className="flex h-4 w-6 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                      title="Previous symbol (↑ / k)"
                      aria-label="Previous symbol"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => step(1)}
                      disabled={!canNav}
                      className="flex h-4 w-6 items-center justify-center border-t border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                      title="Next symbol (↓ / j)"
                      aria-label="Next symbol"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                );
              })()}
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="shrink-0 truncate text-base font-semibold tracking-tight">
                  {selectedSymbol.ticker}
                </span>
                <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground lg:inline-block">
                  {selectedSymbol.name}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <ChartCaptureButton
                  getTarget={() => captureRef.current}
                  fileName={selectedSymbol.ticker}
                />
                <HeaderSymbolActions
                  symbol={selectedSymbol}
                  lists={lists}
                  setLists={setLists}
                  lastListId={lastListId}
                  setLastListId={setLastListId}
                  onGoToList={(listId) => {
                    setGroup(listId);
                    setSidebarOpen(true);
                  }}
                />
                <a
                  href={tradingViewUrlForSymbol(selectedSymbol.yahoo)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={`Open ${selectedSymbol.ticker} on TradingView`}
                  aria-label="Open on TradingView"
                >
                  <img
                    src="https://static.tradingview.com/static/images/favicon.ico"
                    alt="TradingView"
                    className="h-3.5 w-3.5 rounded-sm object-contain"
                  />
                </a>
                {!selectedSymbol.isIndex && isIndianEquitySymbol(selectedSymbol.yahoo) && (
                  <>
                    <a
                      href={nseUrlForSymbol(selectedSymbol.yahoo, selectedSymbol.name)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      title={`Open ${selectedSymbol.ticker} on NSE India`}
                      aria-label="Open on NSE India"
                    >
                      <img
                        src="https://www.nseindia.com/favicon.ico?favicon.8c25df6c.ico"
                        alt="NSE India"
                        className="h-3.5 w-3.5 object-contain"
                      />
                    </a>
                    <a
                      href={screenerUrlForSymbol(selectedSymbol.yahoo)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      title={`Open ${selectedSymbol.ticker} on Screener`}
                      aria-label="Open on Screener"
                    >
                      <img
                        src="https://cdn-static.screener.in/favicon/favicon-32x32.00205914303a.png"
                        alt="Screener"
                        className="h-3.5 w-3.5 object-contain"
                      />
                    </a>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1.5">
          {selectedSymbol && symbolStats && (
            <div className="hidden items-center gap-2 rounded-md border border-border bg-card/90 px-2 py-1 text-[11px] text-muted-foreground 2xl:flex">
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                {navigationSymbols.length === 0
                  ? "— / —"
                  : `${currentNavPos(navigationSymbols) + 1}/${navigationSymbols.length}`}
              </span>
              <span className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1 truncate" title="NSE price band">
                <span className="text-muted-foreground">Band</span>
                <span
                  className={
                    symbolStats.band != null
                      ? symbolStats.band <= 5
                        ? "text-amber-500"
                        : "text-emerald-500"
                      : "text-muted-foreground"
                  }
                >
                  {symbolStats.bandLabel ??
                    (symbolStats.band != null ? `${symbolStats.band}%` : "—")}
                </span>
              </div>
              <span className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1 truncate" title="Relative strength rating">
                <span className="text-muted-foreground">RS</span>
                <span
                  className={
                    symbolStats.rs != null
                      ? symbolStats.rs >= 70
                        ? "text-emerald-500"
                        : symbolStats.rs <= 30
                          ? "text-rose-500"
                          : "text-amber-500"
                      : "text-muted-foreground"
                  }
                >
                  {symbolStats.rs != null ? Math.round(symbolStats.rs) : "—"}
                </span>
              </div>
              <span className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1 truncate" title="% below 52-week high">
                <span className="text-muted-foreground">52wH</span>
                <span
                  className={
                    symbolStats.pct52w != null
                      ? symbolStats.pct52w <= 5
                        ? "text-emerald-500"
                        : symbolStats.pct52w <= 10
                          ? "text-amber-500"
                          : "text-rose-500"
                      : "text-muted-foreground"
                  }
                >
                  {symbolStats.pct52w != null ? `-${symbolStats.pct52w.toFixed(1)}%` : "—"}
                </span>
              </div>
              <span className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1 truncate" title="% below all-time high">
                <span className="text-muted-foreground">ATH</span>
                <span
                  className={
                    symbolStats.pctAth != null
                      ? symbolStats.pctAth <= 5
                        ? "text-emerald-500"
                        : symbolStats.pctAth <= 10
                          ? "text-amber-500"
                          : "text-rose-500"
                      : "text-muted-foreground"
                  }
                >
                  {symbolStats.pctAth != null ? `-${symbolStats.pctAth.toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:min-w-[180px] lg:px-3 xl:min-w-[200px] 2xl:min-w-[260px] 2xl:px-4"
            aria-label="Search symbols"
            title="Search (⌘K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Search…</span>

            <kbd className="hidden rounded border border-border bg-muted px-1 py-0.5 text-[9px] xl:inline-block">
              ⌘K
            </kbd>
          </button>

          {/* Chart + indicator menus: inline on very wide screens, tucked into
              a Tools popover on tablet/laptop so the symbol row stays readable. */}
          <div className="hidden items-center gap-1.5 2xl:flex">
            <ChartSettingsMenu value={chartCfg} onChange={setChartCfg} />
            <IndicatorsMenu value={indicators} onChange={setIndicators} />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="px-2 2xl:hidden"
                aria-label="Chart tools"
                title="Chart & indicator settings"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-2">
              <div className="flex items-center gap-2">
                <ChartSettingsMenu value={chartCfg} onChange={setChartCfg} />
                <IndicatorsMenu value={indicators} onChange={setIndicators} />
              </div>
            </PopoverContent>
          </Popover>

          <Link to="/screeners">
            <Button size="sm" variant="outline">
              Screeners
            </Button>
          </Link>
          <Link to="/price-alerts" title="Price & volume alerts">
            <Button size="sm" variant="outline" className="px-2" aria-label="Alerts">
              <BellRing className="h-4 w-4 text-amber-500" />
            </Button>
          </Link>

          <Link to="/journal">
            <Button size="sm" variant="outline">
              Journal
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="px-2" aria-label="More" title="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  addPane();
                }}
                disabled={panes.length >= 6}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add pane
                <span className="ml-auto text-[10px] text-muted-foreground">{panes.length}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/markets">Indices &amp; ETFs</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/breadth">Breadth</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/band-alerts">Circuit band alerts</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/price-alerts">Price alerts (Telegram)</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/position-analyzer">Position analyzer</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ProfileMenu withNavMenu={false} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen && (
          <aside className="relative shrink-0" style={{ width: `${sidebarWidth}px` }}>
            <Watchlist
              main={watchlist}
              setMain={setMain}
              lists={lists}
              setLists={setLists}
              selected={selected}
              onSelect={setSelected}
              lastListId={lastListId}
              setLastListId={setLastListId}
              onActiveSymbolsChange={setActiveSymbols}
              group={group}
              onGroupChange={setGroup}
            />
            {/* Drag handle to resize sidebar width; double-click to reset */}
            <div
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize · double-click to reset"
              onDoubleClick={() => setSidebarWidth(288)}
              onPointerDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startW = sidebarWidth;
                const onMove = (ev: PointerEvent) => {
                  const next = Math.min(640, Math.max(220, startW + (ev.clientX - startX)));
                  setSidebarWidth(next);
                };
                const onUp = () => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
              }}
              className="absolute right-0 top-0 z-20 flex h-full w-5 -mr-2 cursor-col-resize touch-none items-center justify-center bg-primary/10 transition-colors hover:bg-primary/20 2xl:w-1.5 2xl:-mr-0.5 2xl:bg-transparent 2xl:hover:bg-primary/30"
            >
              <span className="h-12 w-1 rounded-full bg-primary/45 2xl:hidden" />
            </div>
          </aside>
        )}

        <main
          ref={captureRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-1 md:p-2"
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            (e.currentTarget as any)._sw = { x: t.clientX, y: t.clientY, t: Date.now() };
          }}
          onTouchEnd={(e) => {
            const start = (e.currentTarget as any)._sw as
              { x: number; y: number; t: number } | undefined;
            if (!start) return;
            (e.currentTarget as any)._sw = undefined;
            const t = e.changedTouches[0];
            const dx = t.clientX - start.x;
            const dy = t.clientY - start.y;
            const dt = Date.now() - start.t;
            // Vertical swipe: prev/next stock in current list. Ignore if horizontal-dominant or too slow.
            if (dt > 700) return;
            if (Math.abs(dy) < 60 || Math.abs(dx) > Math.abs(dy)) return;
            const list = navigationSymbols;
            if (list.length === 0) return;
            stepSymbol(dy < 0 ? 1 : -1); // swipe up → next, swipe down → prev
          }}
        >
          {selectedSymbol && panes.length > 1 && (
            <div className="mb-1 flex shrink-0 items-center gap-1 overflow-x-auto rounded-md border border-border bg-card/60 p-1 2xl:hidden">
              <button
                onClick={() => setFocusedPane(null)}
                className={`h-8 shrink-0 rounded px-3 text-xs font-medium ${focusedPane == null ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                Grid
              </button>
              {panes.map((pane, idx) => (
                <button
                  key={`${idx}-${pane.interval}`}
                  onClick={() => setFocusedPane((cur) => (cur === idx ? null : idx))}
                  className={`h-8 shrink-0 rounded px-3 text-xs font-medium ${focusedPane === idx ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  {tfLabel(pane.interval)}
                </button>
              ))}
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <span
                  className="inline-flex h-6 items-center rounded bg-amber-400/10 px-1.5 text-[11px] font-semibold text-amber-400 ring-1 ring-amber-400/20"
                  title="Position in active watchlist"
                >
                  {(() => {
                    const pos = currentNavPos(navigationSymbols);
                    const total = navigationSymbols.length;
                    return pos < 0 || total === 0 ? `-- / ${total}` : `${pos + 1} / ${total}`;
                  })()}
                </span>
                {symbolStats && (
                  <>
                    <span className="h-4 w-px bg-border" />
                    <span className="inline-flex h-6 items-center gap-2 rounded border border-border bg-muted/30 px-1.5 text-[11px]">
                      <span title="NSE price band">
                        <span className="text-muted-foreground">Band </span>
                        <span
                          className={
                            symbolStats.band != null
                              ? symbolStats.band <= 5
                                ? "text-amber-500"
                                : "text-emerald-500"
                              : "text-muted-foreground"
                          }
                        >
                          {symbolStats.bandLabel ??
                            (symbolStats.band != null ? `${symbolStats.band}%` : "—")}
                        </span>
                      </span>
                      <span title="Relative strength rating">
                        <span className="text-muted-foreground">RS </span>
                        <span
                          className={
                            symbolStats.rs != null
                              ? symbolStats.rs >= 70
                                ? "text-emerald-500"
                                : symbolStats.rs <= 30
                                  ? "text-rose-500"
                                  : "text-amber-500"
                              : "text-muted-foreground"
                          }
                        >
                          {symbolStats.rs != null ? Math.round(symbolStats.rs) : "—"}
                        </span>
                      </span>
                      <span title="% below 52-week high">
                        <span className="text-muted-foreground">52wH </span>
                        <span
                          className={
                            symbolStats.pct52w != null
                              ? symbolStats.pct52w <= 5
                                ? "text-emerald-500"
                                : symbolStats.pct52w <= 10
                                  ? "text-amber-500"
                                  : "text-rose-500"
                              : "text-muted-foreground"
                          }
                        >
                          {symbolStats.pct52w != null ? `-${symbolStats.pct52w.toFixed(1)}%` : "—"}
                        </span>
                      </span>
                      <span title="% below all-time high">
                        <span className="text-muted-foreground">ATH </span>
                        <span
                          className={
                            symbolStats.pctAth != null
                              ? symbolStats.pctAth <= 5
                                ? "text-emerald-500"
                                : symbolStats.pctAth <= 10
                                  ? "text-amber-500"
                                  : "text-rose-500"
                              : "text-muted-foreground"
                          }
                        >
                          {symbolStats.pctAth != null ? `-${symbolStats.pctAth.toFixed(1)}%` : "—"}
                        </span>
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {!selectedSymbol ? (
            <EmptyState />
          ) : (
            <div className={`grid min-h-0 min-w-0 flex-1 gap-2 ${gridCols}`}>
              {visiblePanes.map(({ pane, idx }) => {
                const allowedRanges = rangesFor(pane.interval);
                const effectiveInd = pane.indicators ?? indicators;
                const hasOverride = pane.indicators != null;
                const paneAlerts = alerts.filter(
                  (a) => a.symbol === selectedSymbol.yahoo && a.interval === pane.interval,
                );
                const armed = paneAlerts.some((a) => a.enabled);
                return (
                  <div
                    key={`${idx}-${pane.interval}`}
                    ref={(el) => {
                      paneRefs.current[idx] = el;
                    }}
                    className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
                  >
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1.5">
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <Select
                          value={pane.interval}
                          onValueChange={(v) => setPaneInterval(idx, v)}
                        >
                          <SelectTrigger className="h-7 w-[110px] border-0 bg-transparent px-2 text-xs font-semibold uppercase tracking-wider shadow-none focus:ring-0">
                            <SelectValue>{tfLabel(pane.interval)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {TIMEFRAMES.map((t) => (
                              <SelectItem key={t.interval} value={t.interval}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={pane.range} onValueChange={(v) => setPaneRange(idx, v)}>
                          <SelectTrigger
                            className="h-7 w-[100px] border border-border/60 bg-transparent px-2 text-[11px] text-muted-foreground shadow-none focus:ring-0"
                            title="Lookback range"
                          >
                            <SelectValue>{rangeLabel(pane.range)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {allowedRanges.map((r) => (
                              <SelectItem key={r} value={r}>
                                {rangeLabel(r)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <VolumeInfo
                          bar={hoverBars[idx] ?? null}
                          fields={barFields}
                          onFieldsChange={setBarFields}
                        />
                        {idx === 0 && <DataFreshnessBadge className="ml-auto" />}
                      </div>
                      <span className="truncate text-xs font-medium text-muted-foreground">
                        {selectedSymbol.ticker}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <IndicatorsMenu
                          value={effectiveInd}
                          onChange={(next) => setPaneIndicators(idx, next)}
                          compact
                          hasOverride={hasOverride}
                        />
                        {hasOverride && (
                          <button
                            onClick={() => setPaneIndicators(idx, null)}
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Reset pane indicators to global default"
                            title="Reset pane indicators to global default"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setAlertsOpenIdx(idx)}
                          className="relative rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="Alerts"
                          title={`Alerts (${paneAlerts.length})`}
                        >
                          <Bell className="h-3.5 w-3.5" />
                          {armed && (
                            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                          )}
                        </button>
                        <button
                          onClick={() => setFocusedPane((cur) => (cur === idx ? null : idx))}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label={focusedPane === idx ? "Restore grid" : "Focus pane"}
                          title={
                            focusedPane === idx
                              ? `Restore grid (Esc or 0)`
                              : `Focus this pane (${idx + 1}) · Esc to restore`
                          }
                        >
                          {focusedPane === idx ? (
                            <Minimize2 className="h-3.5 w-3.5" />
                          ) : (
                            <Maximize2 className="h-3.5 w-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => removePane(idx)}
                          disabled={panes.length <= 1}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                          aria-label="Remove pane"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                      <LightweightChart
                        symbol={selectedSymbol.yahoo}
                        interval={pane.interval}
                        range={pane.range}
                        indicators={effectiveInd}
                        onIndicatorsChange={(next) => {
                          if (hasOverride) setPaneIndicators(idx, next);
                          else setIndicators(next);
                        }}
                        chartConfig={chartCfg}
                        resetSignal={resetTicks[idx] ?? 0}
                        alerts={alerts}
                        alertSoundEnabled={alertSound}
                        onAlertUpdate={handleAlertUpdate}
                        onHoverBarChange={(bar) =>
                          setHoverBars((prev) =>
                            prev[idx] === bar ? prev : { ...prev, [idx]: bar },
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {alertsOpenIdx != null && selectedSymbol && panes[alertsOpenIdx] && (
        <AlertsDialog
          open={alertsOpenIdx != null}
          onOpenChange={(o) => !o && setAlertsOpenIdx(null)}
          symbol={selectedSymbol.yahoo}
          interval={panes[alertsOpenIdx].interval}
          alerts={alerts}
          onAdd={addAlert}
          onUpdate={updateAlert}
          onRemove={removeAlert}
          soundEnabled={alertSound}
          onSoundChange={setAlertSound}
        />
      )}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        history={watchlist}
        setHistory={setMain}
        lists={lists}
        setLists={setLists}
        onSelect={setSelected}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-sm text-center">
        <h2 className="text-base font-semibold">No symbols in watchlist</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open the sidebar and click <span className="font-medium text-foreground">Add</span> to
          pick NSE stocks or indices.
        </p>
      </div>
    </div>
  );
}

// Quiet unused-import warning if NSE_SYMBOLS isn't directly referenced elsewhere.
void NSE_SYMBOLS;
