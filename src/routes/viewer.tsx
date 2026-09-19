// Offline scanner bundle viewer. Loads a JSON file exported from the
// Screeners page and renders the row table + a candle chart per symbol
// with a Daily / Weekly / Hourly toggle. Uses lightweight-charts directly
// so it works without any network calls once the app bundle is cached.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload } from "lucide-react";

export const Route = createFileRoute("/viewer")({
  head: () => ({
    meta: [
      { title: "Scanner Bundle Viewer — NSE MultiView" },
      { name: "description", content: "Offline viewer for downloaded scanner result bundles (daily / weekly / hourly candles)." },
    ],
  }),
  component: ViewerPage,
});

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
interface BundleRow {
  ticker: string;
  symbol: string;
  name?: string | null;
  sector?: string | null;
  price?: number | null;
  change_pct?: number | null;
  perf_1d?: number | null;
  perf_1w?: number | null;
  market_cap?: number | null;
  volume?: number | null;
  [k: string]: unknown;
}
interface Bundle {
  generatedAt: string;
  scanName: string;
  rows: BundleRow[];
  ohlc: Record<string, { D: Candle[]; W: Candle[]; "60": Candle[] }>;
  errors?: Record<string, string>;
}

type Interval = "D" | "W" | "60";

function ViewerPage() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>("D");

  const onFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Bundle;
        if (!parsed || !parsed.ohlc || !parsed.rows) throw new Error("Invalid bundle");
        setBundle(parsed);
        const firstSym = parsed.rows[0]?.symbol ?? Object.keys(parsed.ohlc)[0] ?? null;
        setSelectedSymbol(firstSym);
      } catch (e: any) {
        setError(e?.message ?? "Failed to parse bundle");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="dark flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border/60 px-4 py-2">
        <Link to="/"><Button size="sm" variant="ghost"><ArrowLeft className="mr-1 h-4 w-4" /> Home</Button></Link>
        <h1 className="text-sm font-semibold">Scanner Bundle Viewer (offline)</h1>
        <div className="ml-auto flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-border/60 bg-muted/40 px-2 py-1 text-xs hover:bg-muted">
            <Upload className="h-3.5 w-3.5" />
            Load bundle (.json)
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
          </label>
        </div>
      </header>

      {!bundle && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
          {error ? <p className="text-destructive">{error}</p> : null}
          <p>Load a JSON bundle exported from the Screeners page to view results offline.</p>
        </div>
      )}

      {bundle && (
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-72 shrink-0 overflow-auto border-r border-border/60">
            <div className="border-b border-border/60 p-3 text-xs">
              <div className="font-semibold">{bundle.scanName}</div>
              <div className="text-muted-foreground">Generated {new Date(bundle.generatedAt).toLocaleString()}</div>
              <div className="text-muted-foreground">{bundle.rows.length} symbols · {Object.keys(bundle.ohlc).length} with candles</div>
            </div>
            <ul>
              {bundle.rows.map((r) => {
                const active = r.symbol === selectedSymbol;
                const chg = r.change_pct ?? r.perf_1d ?? null;
                return (
                  <li key={r.symbol}>
                    <button
                      onClick={() => setSelectedSymbol(r.symbol)}
                      className={`flex w-full items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5 text-left text-xs hover:bg-muted ${active ? "bg-muted" : ""}`}
                    >
                      <span className="font-medium">{r.ticker}</span>
                      <span className={chg == null ? "text-muted-foreground" : chg >= 0 ? "text-green-500" : "text-red-500"}>
                        {chg == null ? "—" : `${chg.toFixed(2)}%`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <main className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs">
              <span className="font-semibold">{selectedSymbol ?? "—"}</span>
              <div className="ml-4 flex gap-1">
                {(["D", "W", "60"] as Interval[]).map((iv) => (
                  <button
                    key={iv}
                    onClick={() => setInterval(iv)}
                    className={`rounded px-2 py-0.5 text-[11px] ${interval === iv ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
                  >
                    {iv === "D" ? "Daily" : iv === "W" ? "Weekly" : "Hourly"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {selectedSymbol && bundle.ohlc[selectedSymbol] ? (
                <OfflineChart candles={bundle.ohlc[selectedSymbol][interval] ?? []} />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  {selectedSymbol ? `No candles for ${selectedSymbol}${bundle.errors?.[selectedSymbol] ? ` (${bundle.errors[selectedSymbol]})` : ""}` : "Select a symbol"}
                </div>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function OfflineChart({ candles }: { candles: Candle[] }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const data = useMemo(() => candles
    .filter((c) => Number.isFinite(c.time))
    .map((c) => ({
      time: c.time as unknown as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })), [candles]);
  const vols = useMemo(() => candles.map((c) => ({
    time: c.time as unknown as Time,
    value: c.volume,
    color: c.close >= c.open ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)",
  })), [candles]);

  useEffect(() => {
    if (!boxRef.current) return;
    const chart = createChart(boxRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#cbd5e1" },
      grid: { vertLines: { color: "rgba(148,163,184,0.08)" }, horzLines: { color: "rgba(148,163,184,0.08)" } },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.2)" },
      timeScale: { borderColor: "rgba(148,163,184,0.2)", timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444", borderVisible: false,
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chartRef.current = chart;
    candleRef.current = candleSeries;
    volRef.current = volSeries;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    candleRef.current?.setData(data as any);
    volRef.current?.setData(vols as any);
    chartRef.current?.timeScale().fitContent();
  }, [data, vols]);

  return <div ref={boxRef} className="h-full w-full" />;
}
