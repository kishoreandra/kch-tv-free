// Situational Awareness — NSE-adapted Stockbee Market Monitor.
import { SymbolLink } from "@/components/SymbolLink";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";

import { Button } from "@/components/ui/button";
import { ApprovalGate } from "@/components/ApprovalGate";
import { AuthButton } from "@/components/AuthButton";
import { ProfileMenu } from "@/components/ProfileMenu";
import { useAuth } from "@/hooks/use-auth";
import {
  getBreadthHistorySA,
  getTodaysMovers,
  runBhavcopyIngestion,
  type BreadthDay,
} from "@/lib/breadth/market-sa.functions";

export const Route = createFileRoute("/market-sa")({
  head: () => ({
    meta: [
      { title: "Situational Awareness — NSE Market Breadth" },
      { name: "description", content: "NSE-adapted Stockbee Market Monitor: 4% movers, breadth ratios, % above 50DMA and momentum bursts across the Nifty 500." },
      { property: "og:title", content: "Situational Awareness — NSE Market Breadth" },
      { property: "og:description", content: "Daily NSE breadth dashboard for momentum traders: net breadth, 5/10-day ratios, new highs vs lows and momentum bursts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarketSAPage,
});

const REQUIRED_DAYS = 252;

function verdict(latest: BreadthDay | undefined): { tone: "bull" | "bear" | "neutral"; text: string } {
  if (!latest) return { tone: "neutral", text: "No breadth data yet — waiting for the first Bhavcopy ingestion." };
  const r10 = latest.up4pct_ratio_10day;
  const r5 = latest.up4pct_ratio_5day;
  const above = latest.pct_above_50dma;
  const burst = latest.momentum_burst_5day_count;
  if (r10 != null && r10 >= 2 && (above ?? 0) >= 50) {
    return { tone: "bull", text: `Breadth expanding — 10-day ratio ${r10.toFixed(2)}, ${above?.toFixed(0)}% above 50DMA, ${burst} momentum bursts. Favourable for aggressive breakout entries.` };
  }
  if (r10 != null && r10 < 1 && (r5 ?? 1) < 1) {
    return { tone: "bear", text: `Breadth deteriorating — more stocks down 4%+ than up over 10 sessions (ratio ${r10.toFixed(2)}). Reduce size, tighten stops.` };
  }
  return { tone: "neutral", text: `Mixed tape — 10-day ratio ${r10 != null ? r10.toFixed(2) : "n/a"}, ${above != null ? above.toFixed(0) + "% above 50DMA" : "50DMA gauge building"}. Trade selectively, normal size.` };
}

function MarketSAPage() {
  return (
    <ApprovalGate
      signedOut={
        <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-center">
          <h1 className="text-2xl font-semibold">Situational Awareness</h1>
          <p className="text-sm text-muted-foreground">Please sign in to view NSE market breadth.</p>
          <AuthButton />
        </div>
      }
    >
      <SAContent />
    </ApprovalGate>
  );
}

function SAContent() {
  const { isAdmin } = useAuth() as any;
  const [range, setRange] = useState(120);
  const historyFn = useServerFn(getBreadthHistorySA);
  const moversFn = useServerFn(getTodaysMovers);
  const ingestFn = useServerFn(runBhavcopyIngestion);

  const q = useQuery({
    queryKey: ["market-sa", range],
    queryFn: () => historyFn({ data: { days: range } }),
  });
  const moversQ = useQuery({
    queryKey: ["market-sa-movers"],
    queryFn: () => moversFn({ data: { limit: 50 } }),
  });

  const ingest = useMutation({
    mutationFn: () => ingestFn({ data: { days: 5 } }),
    onSuccess: (r: any) => { toast.success(r?.message ?? "Ingestion complete"); q.refetch(); moversQ.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Ingestion failed"),
  });

  const rows = (q.data?.rows ?? []) as BreadthDay[];
  const latest = rows[rows.length - 1];
  const historyDays = latest?.history_days ?? 0;
  const v = verdict(latest);

  const chartData = useMemo(
    () => rows.map((r) => ({
      date: r.trade_date.slice(5),
      net: r.up4pct_count - r.down4pct_count,
      up: r.up4pct_count,
      down: r.down4pct_count,
      nifty: r.nifty_close,
      burst: r.momentum_burst_5day_count,
      up25m: r.up25pct_month_count,
      down25m: r.down25pct_month_count,
      up25q: r.up25pct_quarter_count,
      down25q: r.down25pct_quarter_count,
      up50m: r.up50pct_month_count,
      up50q: r.up50pct_quarter_count,
    })),
    [rows],
  );

  const toneClass = v.tone === "bull" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
    : v.tone === "bear" ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
    : "border-amber-500/40 bg-amber-500/10 text-amber-400";

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3">
        <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-sm font-semibold">Situational Awareness</h1>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Nifty 500 breadth</span>
        <nav className="ml-4 flex items-center gap-1 text-xs">
          <Link to="/journal" className="rounded px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">Journal</Link>
          <Link to="/screeners" className="rounded px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">Screeners</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="h-8 rounded border bg-background px-2 text-xs"
            aria-label="History range"
          >
            <option value={60}>60d</option>
            <option value={120}>120d</option>
            <option value={250}>250d</option>
            <option value={500}>500d</option>
          </select>
          {isAdmin ? (
            <Button size="sm" variant="outline" onClick={() => ingest.mutate()} disabled={ingest.isPending}>
              {ingest.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Ingest now
            </Button>
          ) : null}
          <ProfileMenu />
        </div>
      </header>

      <main className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {historyDays < REQUIRED_DAYS ? (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            Building history — {historyDays}/{REQUIRED_DAYS} trading days collected. Monthly (21d), quarterly (63d) and
            52-week metrics stay unreliable until enough sessions accumulate; treat them as provisional.
          </div>
        ) : null}

        <div className={`rounded border px-3 py-2 text-sm ${toneClass}`}>
          <span className="mr-2 rounded bg-background/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Rule-of-thumb read</span>
          {v.text}
          <div className="mt-1 text-[11px] opacity-70">Starting-point thresholds only — calibrate them yourself against the raw numbers below.</div>
        </div>

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading breadth…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No breadth rows yet. Run the Bhavcopy ingestion to seed the first session.</p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Up 4%+" value={latest.up4pct_count} tone="up" />
              <Stat label="Down 4%+" value={latest.down4pct_count} tone="down" />
              <Stat label="5-day ratio" value={latest.up4pct_ratio_5day?.toFixed(2) ?? "—"} tone={ratioTone(latest.up4pct_ratio_5day)} />
              <Stat label="10-day ratio" value={latest.up4pct_ratio_10day?.toFixed(2) ?? "—"} tone={ratioTone(latest.up4pct_ratio_10day)} />
              <Stat label="% above 50DMA" value={latest.pct_above_50dma != null ? `${latest.pct_above_50dma.toFixed(0)}%` : "—"} tone={latest.pct_above_50dma != null && latest.pct_above_50dma >= 50 ? "up" : "down"} />
              <Stat label="52w H / L" value={`${latest.new_52w_highs} / ${latest.new_52w_lows}`} tone={latest.new_52w_highs >= latest.new_52w_lows ? "up" : "down"} />
            </section>

            <p className="text-[11px] text-muted-foreground">
              Session {latest.trade_date} · universe {latest.universe_count} liquid names ·{" "}
              {latest.circuit_excluded} circuit-frozen excluded from the 4% counts ·{" "}
              {latest.liquidity_excluded} skipped for thin turnover.
            </p>

            <section className="rounded border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Net breadth (up 4% − down 4%) vs Nifty 50</h2>
              <div className="h-80">
                <ResponsiveContainer>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                    <XAxis dataKey="date" fontSize={10} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} />
                    <YAxis yAxisId="left" fontSize={10} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} fontSize={10} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickLine={false} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }} />
                    <ReferenceLine yAxisId="left" y={0} stroke="var(--muted-foreground)" />
                    <Bar yAxisId="left" dataKey="net" name="Net 4% movers">
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={netColor(d.net)} />
                      ))}
                    </Bar>
                    <Line yAxisId="right" type="monotone" dataKey="nifty" name="Nifty 50" stroke="var(--primary)" strokeWidth={1.25} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <MiniTrend title="Momentum bursts (up 20% in 5 days)" data={chartData} keys={[{ k: "burst", c: "#10b981" }]} />
              <MiniTrend title="25% movers — month (21d)" data={chartData} keys={[{ k: "up25m", c: "#10b981" }, { k: "down25m", c: "#f43f5e" }]} />
              <MiniTrend title="25% movers — quarter (63d)" data={chartData} keys={[{ k: "up25q", c: "#10b981" }, { k: "down25q", c: "#f43f5e" }]} />
              <MiniTrend title="50% movers — month / quarter" data={chartData} keys={[{ k: "up50m", c: "#38bdf8" }, { k: "up50q", c: "#a78bfa" }]} />
            </section>

            <section className="rounded border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Today's movers · 4%+ on above-average volume, or 20%+ in 5 days</h2>
              {moversQ.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : (moversQ.data?.rows ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No qualifying movers for the latest session.</p>
              ) : (
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-1">Symbol</th>
                        <th className="py-1 text-right">Close</th>
                        <th className="py-1 text-right">% day</th>
                        <th className="py-1 text-right">% 5d</th>
                        <th className="py-1 text-right">Rel vol</th>
                        <th className="py-1 text-right">Turnover (₹Cr)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(moversQ.data?.rows ?? []).map((m) => (
                        <tr key={m.symbol} className="border-t border-border/50">
                          <td className="py-1 font-medium"><SymbolLink symbol={m.symbol} /></td>
                          <td className="py-1 text-right">{m.close?.toFixed(2) ?? "—"}</td>
                          <td className={`py-1 text-right ${(m.change_pct ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{m.change_pct?.toFixed(2) ?? "—"}</td>
                          <td className="py-1 text-right">{m.gain_5day?.toFixed(1) ?? "—"}</td>
                          <td className="py-1 text-right">{m.rel_volume?.toFixed(2) ?? "—"}</td>
                          <td className="py-1 text-right">{m.turnover != null ? (m.turnover / 10_000_000).toFixed(2) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function ratioTone(v: number | null | undefined): "up" | "down" | "flat" {
  if (v == null) return "flat";
  if (v >= 1.5) return "up";
  if (v < 1) return "down";
  return "flat";
}

function netColor(net: number): string {
  if (net >= 40) return "#059669";
  if (net > 0) return "#34d399";
  if (net <= -40) return "#be123c";
  if (net < 0) return "#fb7185";
  return "var(--muted-foreground)";
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: "up" | "down" | "flat" }) {
  const c = tone === "up" ? "text-emerald-500" : tone === "down" ? "text-rose-500" : "text-foreground";
  return (
    <div className="rounded border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${c}`}>{value}</div>
    </div>
  );
}

function MiniTrend({ title, data, keys }: { title: string; data: any[]; keys: { k: string; c: string }[] }) {
  return (
    <div className="rounded border bg-card p-3">
      <h3 className="mb-2 text-xs font-semibold">{title}</h3>
      <div className="h-40">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
            <XAxis dataKey="date" fontSize={9} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} tickLine={false} />
            <YAxis fontSize={9} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} tickLine={false} width={28} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }} />
            {keys.map((k) => (
              <Line key={k.k} type="monotone" dataKey={k.k} stroke={k.c} strokeWidth={1.25} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
