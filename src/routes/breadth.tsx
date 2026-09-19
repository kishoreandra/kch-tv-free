import { SymbolLink, TradingViewLink } from "@/components/SymbolLink";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Loader2, TrendingUp, TrendingDown, ChevronDown, ChevronRight, BookmarkPlus } from "lucide-react";
import { ProfileMenu } from "@/components/ProfileMenu";
import { DataFreshnessBadge } from "@/components/DataFreshnessBadge";


import { toast } from "sonner";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Legend,
  CartesianGrid,
  LabelList,
} from "recharts";


import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getBreadthHistory, snapshotBreadthNow, type BreadthRow } from "@/lib/breadth.functions";
import { getSectorBreadth, type SectorRow, type SectorTimeframe, type SectorLeader } from "@/lib/sector-breadth.functions";
import { saveResultsAsWatchlist } from "@/lib/screener/save-watchlist.functions";
import { getBreadthBucketSymbols, type BreadthBucket } from "@/lib/breadth-bucket.functions";

export const Route = createFileRoute("/breadth")({
  head: () => ({
    meta: [
      { title: "Market Breadth — NSE MultiView" },
      {
        name: "description",
        content:
          "Daily NSE market breadth: 4% up/down, 25%-in-1M, % above key EMAs, new 52w highs/lows — Stockbee Market Monitor style.",
      },
    ],
  }),
  component: BreadthPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Breadth failed to load: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

const RANGE_OPTIONS = [30, 90, 180, 365] as const;
type Range = (typeof RANGE_OPTIONS)[number];
const RANGE_KEY = "breadth.range.v1";

function BreadthPage() {
  const { user, loading, approved, isAdmin } = useAuth();
  const [range, setRange] = useState<Range>(() => {
    if (typeof window === "undefined") return 90;
    const raw = Number(localStorage.getItem(RANGE_KEY));
    return (RANGE_OPTIONS as readonly number[]).includes(raw) ? (raw as Range) : 90;
  });

  const history = useServerFn(getBreadthHistory);
  const snap = useServerFn(snapshotBreadthNow);

  const q = useQuery({
    queryKey: ["breadth", range],
    queryFn: () => history({ data: { days: range } }),
    enabled: !!user,
    staleTime: 60_000,
  });

  const snapMut = useMutation({
    mutationFn: () => snap(),
    onSuccess: () => {
      toast.success("Breadth snapshot updated for today");
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Snapshot failed"),
  });

  const fetchBucket = useServerFn(getBreadthBucketSymbols);
  const saveWl = useServerFn(saveResultsAsWatchlist);
  const saveBucketMut = useMutation({
    mutationFn: async (bucket: BreadthBucket) => {
      const r = await fetchBucket({ data: { bucket } });
      if (r.count === 0) throw new Error("No symbols currently match this bucket");
      const today = new Date().toISOString().slice(5, 10); // MM-DD
      return saveWl({
        data: {
          name: `${r.label} · ${today}`.slice(0, 60),
          symbols: r.symbols,
        },
      });
    },
    onSuccess: (r) => toast.success(`Saved "${r.name}" (${r.count} symbols)`),
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const rows: BreadthRow[] = q.data?.rows ?? [];
  const today = rows[rows.length - 1] ?? null;
  const prev5 = rows[rows.length - 6] ?? null;

  // Data-integrity guard: a healthy/advancing tape should print at least some
  // new 52-week highs. A run of exact zeros while breadth is positive almost
  // always means the trailing history behind the 52-week window is missing.
  const anomaly = useMemo(() => {
    const tail = rows.slice(-3);
    if (tail.length < 3) return null;
    if (!tail.every((r) => r.new_highs_52w === 0)) return null;
    const advancing = tail.some((r) => r.up_4pct > r.down_4pct);
    if (!advancing) return null;
    return `No new 52-week highs recorded for ${tail.length} straight sessions while the tape was advancing — the 52-week window likely lacks enough history. Run the Bhavcopy backfill to rebuild it.`;
  }, [rows]);


  const data = useMemo(
    () =>
      rows.map((r) => {
        const ratio =
          r.up_4pct + r.down_4pct > 0
            ? r.up_4pct / Math.max(1, r.down_4pct)
            : null;
        const newHighsNet = r.new_highs_52w - r.new_lows_52w;
        return {
          ...r,
          down_4pct_neg: -r.down_4pct,
          down_25pct_1m_neg: -r.down_25pct_1m,
          ratio,
          newHighsNet,
          pctAbove50: r.total > 0 ? (r.above_ema50 * 100) / r.total : 0,
          pctAbove200: r.total > 0 ? (r.above_ema200 * 100) / r.total : 0,
        };
      }),
    [rows],
  );

  const setRangePersist = (r: Range) => {
    setRange(r);
    try { localStorage.setItem(RANGE_KEY, String(r)); } catch {}
  };

  if (loading) {
    return (
      <div className="dark flex h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="dark flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center text-sm text-muted-foreground">
          Sign in to view market breadth.{" "}
          <Link to="/" className="text-primary hover:underline">Back to charts</Link>
        </div>
      </div>
    );
  }
  if (!approved && !isAdmin) {
    return (
      <div className="dark flex h-screen items-center justify-center bg-background text-foreground">
        <div className="max-w-md text-center text-sm text-muted-foreground">
          Pending admin approval (keechu7@gmail.com). Try again once approved.{" "}
          <Link to="/" className="text-primary hover:underline">Back</Link>
        </div>
      </div>
    );
  }


  return (
    <div className="dark flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex flex-nowrap items-center gap-2 border-b border-border px-3 py-2">
        <Link
          to="/"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          title="Back to charts"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to charts</span>
        </Link>
        <span className="shrink-0 text-base font-semibold sm:text-lg">Market Breadth — NSE</span>
        <DataFreshnessBadge />
        <Link to="/screeners" className="hidden shrink-0 text-xs text-muted-foreground hover:text-foreground sm:inline">
          Screeners →
        </Link>


        <div className="ml-auto flex shrink-0 items-center gap-1">
          {RANGE_OPTIONS.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              onClick={() => setRangePersist(r)}
              className="h-7 px-2 text-xs"
            >
              {r === 365 ? "1Y" : `${r}d`}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => snapMut.mutate()}
            disabled={snapMut.isPending}
            className="ml-2"
            title="Recompute today's breadth row from the latest stock snapshot"
          >
            {snapMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Snapshot today
          </Button>
          <ProfileMenu />
        </div>
      </header>


      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 border-b border-border px-3 py-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="4% Up" value={today?.up_4pct} prev={prev5?.up_4pct} tone="up"
          bucket="up_4pct" onSave={(b) => saveBucketMut.mutate(b)} saving={saveBucketMut.isPending && saveBucketMut.variables === "up_4pct"} />
        <Kpi label="4% Down" value={today?.down_4pct} prev={prev5?.down_4pct} tone="down"
          bucket="down_4pct" onSave={(b) => saveBucketMut.mutate(b)} saving={saveBucketMut.isPending && saveBucketMut.variables === "down_4pct"} />
        <Kpi
          label="Up : Down"
          value={
            today && today.up_4pct + today.down_4pct > 0
              ? +(today.up_4pct / Math.max(1, today.down_4pct)).toFixed(2)
              : null
          }
          prev={
            prev5 && prev5.up_4pct + prev5.down_4pct > 0
              ? +(prev5.up_4pct / Math.max(1, prev5.down_4pct)).toFixed(2)
              : null
          }
        />
        <Kpi label="New 52W Highs" value={today?.new_highs_52w} prev={prev5?.new_highs_52w} tone="up"
          bucket="new_highs_52w" onSave={(b) => saveBucketMut.mutate(b)} saving={saveBucketMut.isPending && saveBucketMut.variables === "new_highs_52w"} />
        <Kpi label="New 52W Lows" value={today?.new_lows_52w} prev={prev5?.new_lows_52w} tone="down"
          bucket="new_lows_52w" onSave={(b) => saveBucketMut.mutate(b)} saving={saveBucketMut.isPending && saveBucketMut.variables === "new_lows_52w"} />
        <Kpi
          label="T2108 (% > 50EMA)"
          value={today?.t2108 != null ? +Number(today.t2108).toFixed(1) : null}
          prev={prev5?.t2108 != null ? +Number(prev5.t2108).toFixed(1) : null}
          suffix="%"
          bucket="above_ema50"
          onSave={(b) => saveBucketMut.mutate(b)}
          saving={saveBucketMut.isPending && saveBucketMut.variables === "above_ema50"}
        />
      </div>

      {/* Secondary breadth buckets — save-to-watchlist */}
      <div className="grid grid-cols-2 gap-2 border-b border-border px-3 pb-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="25% Up 1M" value={today?.up_25pct_1m} prev={prev5?.up_25pct_1m} tone="up"
          bucket="up_25pct_1m" onSave={(b) => saveBucketMut.mutate(b)} saving={saveBucketMut.isPending && saveBucketMut.variables === "up_25pct_1m"} />
        <Kpi label="25% Down 1M" value={today?.down_25pct_1m} prev={prev5?.down_25pct_1m} tone="down"
          bucket="down_25pct_1m" onSave={(b) => saveBucketMut.mutate(b)} saving={saveBucketMut.isPending && saveBucketMut.variables === "down_25pct_1m"} />
        <Kpi label="25% Up 1Q" value={today?.up_25pct_1q} prev={prev5?.up_25pct_1q} tone="up"
          bucket="up_25pct_1q" onSave={(b) => saveBucketMut.mutate(b)} saving={saveBucketMut.isPending && saveBucketMut.variables === "up_25pct_1q"} />
        <Kpi label="25% Down 1Q" value={today?.down_25pct_1q} prev={prev5?.down_25pct_1q} tone="down"
          bucket="down_25pct_1q" onSave={(b) => saveBucketMut.mutate(b)} saving={saveBucketMut.isPending && saveBucketMut.variables === "down_25pct_1q"} />
        <Kpi label="Above 50 EMA" value={today?.above_ema50} prev={prev5?.above_ema50} tone="up"
          bucket="above_ema50" onSave={(b) => saveBucketMut.mutate(b)} saving={saveBucketMut.isPending && saveBucketMut.variables === "above_ema50"} />
        <Kpi label="Above 200 EMA" value={today?.above_ema200} prev={prev5?.above_ema200} tone="up"
          bucket="above_ema200" onSave={(b) => saveBucketMut.mutate(b)} saving={saveBucketMut.isPending && saveBucketMut.variables === "above_ema200"} />
      </div>


      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {anomaly && (
          <div className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
            <span className="mr-1 font-semibold">⚠ Data anomaly:</span>
            {anomaly}
          </div>
        )}
        {q.isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading breadth history…
          </div>
        )}

        {!q.isLoading && rows.length === 0 && (
          <div className="rounded border border-border bg-muted/30 p-4 text-sm">
            <div className="mb-1 font-medium">No breadth data yet.</div>
            <div className="text-xs text-muted-foreground">
              Click <span className="font-medium">Snapshot today</span> to capture the current breadth row. A
              daily cron will append future rows automatically.
            </div>
          </div>
        )}

        {rows.length > 0 && (() => {
          const showLabels = data.length <= 45;
          const labelGap = Math.max(1, Math.ceil(data.length / 30));
          const t = today!;
          const ratioToday = t.up_4pct + t.down_4pct > 0 ? t.up_4pct / Math.max(1, t.down_4pct) : null;
          const t2108Today = t.t2108 != null ? Number(t.t2108) : null;
          const netHighsToday = t.new_highs_52w - t.new_lows_52w;

          return (
          <>
            <ChartCard
              title="4% Breakouts vs Breakdowns (rel-vol ≥ 2)"
              subtitle="Daily count of stocks that moved ≥ 4% on volume ≥ 2× their 50-day average. Stockbee's primary momentum gauge — bull regimes show clusters of Up bars > 100; clusters of Down bars > 100 mark distribution days."
              latest={`Today: ${t.up_4pct} up · ${t.down_4pct} down`}
              tone={t.up_4pct > t.down_4pct ? "up" : t.down_4pct > t.up_4pct ? "down" : "neutral"}
            >
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={data} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tickFormatter={fmtDay} stroke="hsl(var(--muted-foreground))" fontSize={10} minTickGap={20} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip content={<TT />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <ReferenceLine y={100} stroke="hsl(142 70% 45%)" strokeDasharray="2 4" label={{ value: "100 = strong day", position: "insideTopRight", fontSize: 9, fill: "hsl(142 70% 45%)" }} />
                  <ReferenceLine y={-100} stroke="hsl(0 70% 55%)" strokeDasharray="2 4" />
                  <Bar dataKey="up_4pct" name="4% Up" fill="hsl(142 70% 45%)">
                    {showLabels && <LabelList dataKey="up_4pct" position="top" fontSize={9} fill="hsl(142 70% 60%)" formatter={(v: number) => (v ? v : "")} />}
                  </Bar>
                  <Bar dataKey="down_4pct_neg" name="4% Down" fill="hsl(0 70% 55%)">
                    {showLabels && <LabelList dataKey="down_4pct" position="bottom" fontSize={9} fill="hsl(0 70% 65%)" formatter={(v: number) => (v ? v : "")} />}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Up : Down Ratio (4% breakouts)"
              subtitle="Today's 4%-up count divided by 4%-down count. > 2 = momentum buy regime · 0.5–2 = mixed · < 0.5 = momentum sell regime. Persistent readings > 2 for several sessions historically precede sustained up-trends."
              latest={ratioToday != null ? `Today: ${ratioToday.toFixed(2)}` : "Today: —"}
              tone={ratioToday == null ? "neutral" : ratioToday >= 2 ? "up" : ratioToday <= 0.5 ? "down" : "neutral"}
            >
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={data} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tickFormatter={fmtDay} stroke="hsl(var(--muted-foreground))" fontSize={10} minTickGap={20} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} domain={[0, "auto"]} />
                  <Tooltip content={<TT />} />
                  <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" label={{ value: "neutral 1.0", position: "insideTopRight", fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                  <ReferenceLine y={2} stroke="hsl(142 70% 45%)" strokeDasharray="2 2" label={{ value: "bullish 2.0", position: "insideTopRight", fontSize: 9, fill: "hsl(142 70% 50%)" }} />
                  <ReferenceLine y={0.5} stroke="hsl(0 70% 55%)" strokeDasharray="2 2" label={{ value: "bearish 0.5", position: "insideBottomRight", fontSize: 9, fill: "hsl(0 70% 60%)" }} />
                  <Line type="monotone" dataKey="ratio" name="Up/Down" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="% of stocks above 50 / 200 EMA (T2108 proxy)"
              subtitle="Share of the universe trading above its 50- and 200-day EMA. Classic T2108: < 20% = washout / oversold (bottom-fishing zone) · > 80% = overbought (rallies become extended). The 50-EMA line leads; 200-EMA confirms primary trend."
              latest={t2108Today != null ? `Today: ${t2108Today.toFixed(1)}% > 50EMA` : "Today: —"}
              tone={t2108Today == null ? "neutral" : t2108Today >= 60 ? "up" : t2108Today <= 30 ? "down" : "neutral"}
            >
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={data} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tickFormatter={fmtDay} stroke="hsl(var(--muted-foreground))" fontSize={10} minTickGap={20} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} domain={[0, 100]} ticks={[0, 20, 40, 50, 60, 80, 100]} />
                  <Tooltip content={<TT suffix="%" />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceArea y1={0} y2={20} fill="hsl(0 70% 55%)" fillOpacity={0.07} />
                  <ReferenceArea y1={80} y2={100} fill="hsl(142 70% 45%)" fillOpacity={0.07} />
                  <ReferenceLine y={20} stroke="hsl(0 70% 55%)" strokeDasharray="2 2" label={{ value: "oversold 20%", position: "insideBottomRight", fontSize: 9, fill: "hsl(0 70% 60%)" }} />
                  <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="1 4" />
                  <ReferenceLine y={80} stroke="hsl(142 70% 45%)" strokeDasharray="2 2" label={{ value: "overbought 80%", position: "insideTopRight", fontSize: 9, fill: "hsl(142 70% 50%)" }} />
                  <Line type="monotone" dataKey="pctAbove50" name="> 50 EMA" stroke="hsl(220 90% 60%)" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="pctAbove200" name="> 200 EMA" stroke="hsl(280 80% 65%)" dot={false} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Net New 52-Week Highs − Lows"
              subtitle="New highs minus new lows. Sustained positive readings = leadership expanding (healthy uptrend); deeply negative + rising lows = bear-market washout. Divergence vs the index is a heads-up (e.g., index up but net turning negative = thinning leadership)."
              latest={`Today: ${netHighsToday >= 0 ? "+" : ""}${netHighsToday}  (${t.new_highs_52w} H · ${t.new_lows_52w} L)`}
              tone={netHighsToday > 0 ? "up" : netHighsToday < 0 ? "down" : "neutral"}
            >
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={data} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tickFormatter={fmtDay} stroke="hsl(var(--muted-foreground))" fontSize={10} minTickGap={20} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip content={<TT />} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Bar dataKey="newHighsNet" name="Net (Highs − Lows)" fill="hsl(45 90% 55%)">
                    {showLabels && (
                      <LabelList
                        dataKey="newHighsNet"
                        position="top"
                        fontSize={9}
                        fill="hsl(45 90% 65%)"
                        formatter={(v: number, _entry: any, idx: number) =>
                          v && idx % labelGap === 0 ? (v > 0 ? `+${v}` : `${v}`) : ""
                        }
                      />
                    )}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="25%+ in 1 Month — Primary Indicator (Stockbee)"
              subtitle="Stocks up (or down) ≥ 25% over the last 22 sessions. Bull-market kickoffs typically print 25%-up readings > 300 for multiple days. Spikes on the down side flag panic / capitulation — often coincident with intermediate lows."
              latest={`Today: ${t.up_25pct_1m} up · ${t.down_25pct_1m} down`}
              tone={t.up_25pct_1m > t.down_25pct_1m ? "up" : t.down_25pct_1m > t.up_25pct_1m ? "down" : "neutral"}
            >
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={data} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tickFormatter={fmtDay} stroke="hsl(var(--muted-foreground))" fontSize={10} minTickGap={20} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip content={<TT />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <ReferenceLine y={300} stroke="hsl(142 70% 45%)" strokeDasharray="2 4" label={{ value: "300 = kickoff", position: "insideTopRight", fontSize: 9, fill: "hsl(142 70% 50%)" }} />
                  <Bar dataKey="up_25pct_1m" name="25%+ Up" fill="hsl(142 70% 45%)">
                    {showLabels && <LabelList dataKey="up_25pct_1m" position="top" fontSize={9} fill="hsl(142 70% 60%)" formatter={(v: number) => (v ? v : "")} />}
                  </Bar>
                  <Bar dataKey="down_25pct_1m_neg" name="25%+ Down" fill="hsl(0 70% 55%)">
                    {showLabels && <LabelList dataKey="down_25pct_1m" position="bottom" fontSize={9} fill="hsl(0 70% 65%)" formatter={(v: number) => (v ? v : "")} />}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
          );
        })()}


        <SectorRotation />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  prev,
  tone,
  suffix = "",
  bucket,
  onSave,
  saving,
}: {
  label: string;
  value: number | null | undefined;
  prev: number | null | undefined;
  tone?: "up" | "down";
  suffix?: string;
  bucket?: BreadthBucket;
  onSave?: (bucket: BreadthBucket) => void;
  saving?: boolean;
}) {
  const delta = value != null && prev != null ? value - prev : null;
  const arrow = delta == null ? null : delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : null;
  const deltaColor =
    delta == null || delta === 0
      ? "text-muted-foreground"
      : (tone === "down" ? delta < 0 : delta > 0)
        ? "text-green-500"
        : "text-red-500";
  return (
    <div className="relative rounded border border-border bg-muted/20 px-3 py-2">
      <div className="flex items-start justify-between gap-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        {bucket && onSave && value != null && value > 0 && (
          <button
            onClick={() => onSave(bucket)}
            disabled={saving}
            title="Save current constituents as a new watchlist"
            className="inline-flex items-center gap-0.5 rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <BookmarkPlus className="h-2.5 w-2.5" />}
            Save
          </button>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums">
          {value == null ? "—" : `${value}${suffix}`}
        </span>
        {delta != null && (
          <span className={`flex items-center gap-0.5 text-[11px] ${deltaColor}`}>
            {arrow}
            {delta > 0 ? "+" : ""}
            {delta}
            {suffix}
            <span className="text-muted-foreground"> vs 5d</span>
          </span>
        )}
      </div>
    </div>
  );
}


function ChartCard({
  title,
  subtitle,
  latest,
  tone = "neutral",
  children,
}: {
  title: string;
  subtitle?: string;
  latest?: string;
  tone?: "up" | "down" | "neutral";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "up"
      ? "border-green-500/30 bg-green-500/10 text-green-400"
      : tone === "down"
        ? "border-red-500/30 bg-red-500/10 text-red-400"
        : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div className="rounded border border-border bg-muted/10 p-3">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {latest && (
          <span className={`rounded border px-2 py-0.5 text-[10px] font-medium tabular-nums ${toneClass}`}>
            {latest}
          </span>
        )}
      </div>
      {subtitle && (
        <div className="mb-2 text-[11px] leading-relaxed text-muted-foreground">{subtitle}</div>
      )}
      {children}
    </div>
  );
}

function fmtDay(d: string) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtFullDay(d: string) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function TT({ active, payload, label, suffix = "" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-border bg-background/95 px-2 py-1.5 text-[11px] shadow">
      <div className="mb-1 font-medium">{fmtFullDay(label)}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="tabular-nums">{Math.abs(Number(p.value)).toLocaleString()}{suffix}</span>
        </div>
      ))}
    </div>
  );
}


const SECTOR_TFS: SectorTimeframe[] = ["1d", "1w", "1m", "3m"];
const SECTOR_TF_LABEL: Record<SectorTimeframe, string> = {
  "1d": "Day",
  "1w": "Week",
  "1m": "Month",
  "3m": "Quarter",
};
const SECTOR_TF_KEY = "breadth.sectorTf.v1";

function SectorRotation() {
  const [tf, setTf] = useState<SectorTimeframe>(() => {
    if (typeof window === "undefined") return "1d";
    const raw = localStorage.getItem(SECTOR_TF_KEY) as SectorTimeframe | null;
    return raw && SECTOR_TFS.includes(raw) ? raw : "1d";
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchSectors = useServerFn(getSectorBreadth);
  const saveWl = useServerFn(saveResultsAsWatchlist);

  const q = useQuery({
    queryKey: ["sector-breadth", tf],
    queryFn: () => fetchSectors({ data: { timeframe: tf, leadersPerSector: 8 } }),
    staleTime: 60_000,
  });

  const saveSectorMut = useMutation({
    mutationFn: async (s: SectorRow) => {
      const symbols = [...s.leaders, ...s.laggards].map((l) => ({
        ticker: l.ticker,
        name: l.name,
        yahoo: l.yahoo,
        sector: s.sector,
      }));
      return saveWl({
        data: {
          name: `${s.sector} — ${SECTOR_TF_LABEL[tf]} movers`.slice(0, 60),
          symbols,
        },
      });
    },
    onSuccess: (r) => toast.success(`Saved "${r.name}" (${r.count} symbols)`),
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const setTfPersist = (next: SectorTimeframe) => {
    setTf(next);
    try { localStorage.setItem(SECTOR_TF_KEY, next); } catch {}
  };

  const sectors = q.data?.sectors ?? [];

  return (
    <div className="rounded border border-border bg-muted/10 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium">Sector Rotation</div>
        <div className="text-[11px] text-muted-foreground">
          Avg/median % move, breadth, and leaders per sector — liquid NSE only.
        </div>
        <div className="ml-auto flex items-center gap-1">
          {SECTOR_TFS.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tf === t ? "default" : "outline"}
              onClick={() => setTfPersist(t)}
              className="h-7 px-2 text-xs"
            >
              {SECTOR_TF_LABEL[t]}
            </Button>
          ))}
        </div>
      </div>

      {q.isLoading && (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Computing sector breadth…
        </div>
      )}
      {q.error && (
        <div className="py-3 text-xs text-destructive">
          {(q.error as any)?.message ?? "Failed to load sector breadth"}
        </div>
      )}

      {sectors.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="w-4 px-1 py-1.5"></th>
                <th className="px-2 py-1.5 text-left font-medium">Sector</th>
                <th className="px-2 py-1.5 text-right font-medium">N</th>
                <th className="px-2 py-1.5 text-right font-medium">Avg %</th>
                <th className="px-2 py-1.5 text-right font-medium">Median %</th>
                <th className="px-2 py-1.5 text-right font-medium">Adv</th>
                <th className="px-2 py-1.5 text-right font-medium">Dec</th>
                <th className="px-2 py-1.5 text-right font-medium">% Up</th>
                <th className="px-2 py-1.5 text-left font-medium">Top leaders</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((s) => {
                const open = expanded === s.sector;
                return (
                  <React.Fragment key={s.sector}>
                    <tr
                      className="cursor-pointer border-b border-border/50 hover:bg-muted/40"
                      onClick={() => setExpanded(open ? null : s.sector)}
                    >
                      <td className="px-1 py-1.5 text-muted-foreground">
                        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-2 py-1.5 font-medium">{s.sector}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{s.count}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${perfColor(s.avg)}`}>
                        {fmtPct(s.avg)}
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${perfColor(s.median)}`}>
                        {fmtPct(s.median)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-green-500">{s.advancers}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-red-500">{s.decliners}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s.pctUp.toFixed(0)}%</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {s.leaders.slice(0, 3).map((l) => l.ticker).join(", ")}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted"
                          onClick={(e) => { e.stopPropagation(); saveSectorMut.mutate(s); }}
                          disabled={saveSectorMut.isPending}
                          title="Save leaders + laggards as a new watchlist"
                        >
                          <BookmarkPlus className="h-3 w-3" /> Save
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-border/50 bg-muted/20">
                        <td colSpan={10} className="px-2 py-2">
                          <div className="grid gap-3 md:grid-cols-2">
                            <LeaderTable title="Leaders" rows={s.leaders} />
                            <LeaderTable title="Laggards" rows={s.laggards} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LeaderTable({ title, rows }: { title: string; rows: SectorLeader[] }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{title}</div>
      <table className="w-full text-[11px]">
        <thead className="text-muted-foreground">
          <tr>
            <th className="px-1.5 py-1 text-left font-medium">Symbol</th>
            <th className="px-1.5 py-1 text-right font-medium">%</th>
            <th className="px-1.5 py-1 text-right font-medium">Price</th>
            <th className="px-1.5 py-1 text-right font-medium">RVol</th>
            <th className="px-1.5 py-1 text-right font-medium">RS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.yahoo} className="border-t border-border/40">
              <td className="px-1.5 py-1">
                <span className="inline-flex items-center gap-1">
                  <SymbolLink symbol={l.yahoo} label={l.ticker} title={l.name} className="font-medium" />
                  <TradingViewLink symbol={l.yahoo} />
                </span>
              </td>
              <td className={`px-1.5 py-1 text-right tabular-nums ${perfColor(l.perf)}`}>{fmtPct(l.perf)}</td>
              <td className="px-1.5 py-1 text-right tabular-nums">{l.price?.toFixed(2) ?? "—"}</td>
              <td className="px-1.5 py-1 text-right tabular-nums">{l.rel_vol?.toFixed(2) ?? "—"}</td>
              <td className="px-1.5 py-1 text-right tabular-nums">{l.rs_rating_n500?.toFixed(0) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function perfColor(v: number) {
  if (v > 0) return "text-green-500";
  if (v < 0) return "text-red-500";
  return "";
}
function fmtPct(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}
