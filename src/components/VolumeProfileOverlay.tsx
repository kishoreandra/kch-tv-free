// Volume-by-price histogram drawn on the right edge of the chart.
// Lightweight-charts has no built-in volume profile, so this paints a canvas
// overlay using the visible logical range and the price series' coordinate
// mapping, and repaints whenever pan/zoom/size/data changes.

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  getChart: () => IChartApi | null;
  getSeries: () => ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area"> | null;
  candles: Candle[] | undefined;
  bins: number;
  widthPct: number; // % of chart width the widest bar occupies
  color: string;
  pocColor: string;
  opacity: number;
}

export function VolumeProfileOverlay({
  getChart,
  getSeries,
  candles,
  bins,
  widthPct,
  color,
  pocColor,
  opacity,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ bins, widthPct, color, pocColor, opacity, candles });
  stateRef.current = { bins, widthPct, color, pocColor, opacity, candles };

  useEffect(() => {
    let raf = 0;
    let lastKey = "";

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const chart = getChart();
      const series = getSeries();
      const s = stateRef.current;
      const rows = s.candles ?? [];
      if (!canvas || !chart || !series || rows.length === 0) return;

      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w < 10 || h < 10) return;

      let range: { from: number; to: number } | null = null;
      try {
        range = chart.timeScale().getVisibleLogicalRange() as { from: number; to: number } | null;
      } catch {
        return;
      }
      if (!range) return;

      const from = Math.max(0, Math.floor(range.from));
      const to = Math.min(rows.length - 1, Math.ceil(range.to));
      if (to <= from) return;

      const key = `${from}|${to}|${w}|${h}|${rows.length}|${rows[to]?.time}|${s.bins}|${s.widthPct}|${s.color}|${s.pocColor}|${s.opacity}`;
      if (key === lastKey) return;
      lastKey = key;

      const slice = rows.slice(from, to + 1);
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of slice) {
        if (c.low < lo) lo = c.low;
        if (c.high > hi) hi = c.high;
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return;

      const n = Math.max(6, Math.min(120, Math.round(s.bins)));
      const step = (hi - lo) / n;
      const buckets = new Array<number>(n).fill(0);
      for (const c of slice) {
        const tp = (c.high + c.low + c.close) / 3;
        let idx = Math.floor((tp - lo) / step);
        if (idx < 0) idx = 0;
        if (idx >= n) idx = n - 1;
        buckets[idx] += c.volume || 0;
      }
      let max = 0;
      let pocIdx = 0;
      for (let i = 0; i < n; i++) {
        if (buckets[i] > max) {
          max = buckets[i];
          pocIdx = i;
        }
      }
      if (max <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const maxW = Math.max(20, (w * Math.max(4, Math.min(45, s.widthPct))) / 100);
      let psw = 0;
      try { psw = chart.priceScale("right").width(); } catch { psw = 0; }
      const rightEdge = Math.max(maxW + 2, w - psw);
      ctx.globalAlpha = Math.max(0.05, Math.min(1, s.opacity));

      for (let i = 0; i < n; i++) {
        if (buckets[i] <= 0) continue;
        const pTop = lo + step * (i + 1);
        const pBot = lo + step * i;
        const yTop = series.priceToCoordinate(pTop);
        const yBot = series.priceToCoordinate(pBot);
        if (yTop == null || yBot == null) continue;
        const barH = Math.max(1, Math.abs(yBot - yTop) - 1);
        const barW = (buckets[i] / max) * maxW;
        ctx.fillStyle = i === pocIdx ? s.pocColor : s.color;
        ctx.fillRect(rightEdge - barW, Math.min(yTop, yBot), barW, barH);
      }
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getChart, getSeries]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      <canvas ref={canvasRef} />
    </div>
  );
}
