import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type MouseEventParams,
} from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOhlc } from "@/lib/ohlc.functions";
import { VolumeProfileOverlay, type Candle as VpCandle } from "@/components/VolumeProfileOverlay";
import { useAlerts } from "@/hooks/use-alerts";
import { Loader2, AlertCircle, Minus, TrendingUp, Ruler, MousePointer2, Trash2, Pencil, Anchor as AnchorIcon, ExternalLink, Highlighter, Type as TypeIcon, Square, Magnet, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { isIndianEquitySymbol, nseUrlForSymbol, screenerUrlForSymbol, tradingViewUrlForSymbol } from "@/lib/chart-links";
import { findSymbol } from "@/data/nse-symbols";
import { resolveEffectiveIndicators } from "@/lib/indicators-adapt";

// Distinct colors for overlays
const EMA_COLORS: Record<number, string> = {
  10: "#06b6d4",
  21: "#3b82f6",
  50: "#a855f7",
  200: "#ef4444",
};
const SMA_COLORS: Record<number, string> = {
  20: "#06b6d4",
  50: "#84cc16",
  100: "#ec4899",
  200: "#f97316",
};
const colorFor = (map: Record<number, string>, p: number) =>
  map[p] ?? `hsl(${(p * 47) % 360} 70% 60%)`;

export type LineStyleName = "solid" | "dashed" | "dotted";
export interface IndicatorStyle {
  color: string;
  width: 1 | 2 | 3 | 4;
  style: LineStyleName;
}
export interface AnchoredVwap {
  id: string;
  time: number; // unix seconds, must match a candle time on the chart
  label?: string;
}
export interface IndicatorConfig {
  ema: number[];
  sma: number[];
  vwap: boolean;
  anchoredVwaps?: AnchoredVwap[];
  styles?: Record<string, Partial<IndicatorStyle>>;
}

const AVWAP_PALETTE = [
  "#f43f5e", "#22d3ee", "#34d399", "#a78bfa",
  "#a78bfa", "#fb923c", "#34d399", "#f472b6",
];
function avwapColorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVWAP_PALETTE[h % AVWAP_PALETTE.length];
}

export type ChartType = "candles" | "bars" | "line" | "area" | "heikin-ashi";
export type RsCompareMode = "benchmark" | "compare";
export type VolumeStyle = "v1" | "v2";
export type VolumeShape = "histogram" | "bar" | "line";

export interface VolumeV2Settings {
  ppvLookback: number;
  avgLookback: number;
  rvolLookback: number;
  dryFraction: number;
  showHVE: boolean;
  showHVY: boolean;
  showHVQ: boolean;
  showHVIPO: boolean;
  latestOnly: boolean;
  showAvgRupeeVol: boolean;
  showRVol: boolean;
  showOneMinLiq: boolean;
  paintHVE: boolean;
  paintHVY: boolean;
  preservePriceBody: boolean;
}

export const DEFAULT_VOLUME_V2: VolumeV2Settings = {
  ppvLookback: 10,
  avgLookback: 50,
  rvolLookback: 20,
  dryFraction: 5,
  showHVE: true,
  showHVY: true,
  showHVQ: true,
  showHVIPO: false,
  latestOnly: false,
  showAvgRupeeVol: true,
  showRVol: true,
  showOneMinLiq: true,
  paintHVE: false,
  paintHVY: false,
  preservePriceBody: true,
};

export interface ChartConfig {
  chartType: ChartType;
  logScale: boolean;
  showVolume: boolean;
  upColor: string;
  downColor: string;
  lineColor: string;
  volumeOpacity: number;
  volumeStyle: VolumeStyle;
  volumeShape: VolumeShape;
  volumeV2: VolumeV2Settings;
  showVolumeMA: boolean;
  volumeMALength: number;
  volumeMAColor: string;
  rsEnabled: boolean;
  rsSymbol: string;
  rsColor: string;
  rsOverlay: boolean;
  rsOverlayColor: string;
  rsCompareMode: RsCompareMode;
  rsStockColor: string;
  rightBarOffset: number;
  // MACD (optional sub-pane indicator)
  macdEnabled: boolean;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  macdLineColor: string;
  macdSignalColor: string;
  macdHistUpColor: string;
  macdHistDownColor: string;
  // Volume profile (volume-by-price on the right edge)
  showVolumeProfile: boolean;
  vpBins: number;
  vpWidthPct: number;
  vpColor: string;
  vpPocColor: string;
  vpOpacity: number;
  // IBD-style optional labels
  showRsRatingLabel: boolean;
  showEpsLabel: boolean;
  showSwingLabels: boolean;
  swingStrength: number;
  swingMaxLabels: number;
  // Key horizontal levels
  show52wHighLine: boolean;
  show52wLowLine: boolean;
  showAthLine: boolean;
  showAtlLine: boolean;
}


export const DEFAULT_CHART_CONFIG: ChartConfig = {
  chartType: "candles",
  logScale: false,
  showVolume: true,
  upColor: "#22c55e",
  downColor: "#ef4444",
  lineColor: "#3b82f6",
  volumeOpacity: 0.35,
  volumeStyle: "v1",
  volumeShape: "histogram",
  volumeV2: DEFAULT_VOLUME_V2,
  showVolumeMA: false,
  volumeMALength: 10,
  volumeMAColor: "#ffffff",
  rsEnabled: false,
  rsSymbol: "^CRSLDX",
  rsColor: "#22c55e",
  rsOverlay: true,
  rsOverlayColor: "#f8fafc",
  rsCompareMode: "benchmark",
  rsStockColor: "#38bdf8",
  rightBarOffset: 10,
  macdEnabled: false,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  macdLineColor: "#3b82f6",
  macdSignalColor: "#f97316",
  macdHistUpColor: "#22c55e",
  macdHistDownColor: "#ef4444",
  showVolumeProfile: false,
  vpBins: 40,
  vpWidthPct: 18,
  vpColor: "#94a3b8",
  vpPocColor: "#06b6d4",
  vpOpacity: 0.45,
  showRsRatingLabel: false,
  showEpsLabel: false,
  showSwingLabels: false,
  swingStrength: 5,
  swingMaxLabels: 10,
  show52wHighLine: false,
  show52wLowLine: false,
  showAthLine: false,
  showAtlLine: false,
};


/**
 * Fractal swing pivots: bar i is a swing high when its high is the highest
 * within ±strength bars (and likewise for lows). Pivots that are not at least
 * `minMovePct` away from the previous opposite pivot are dropped so only
 * meaningful turning points get labelled (IBD-style).
 */
export function findSwingPivots(
  candles: { time: number; high: number; low: number }[],
  strength: number,
  maxLabels: number,
  minMovePct = 3,
): { index: number; time: number; price: number; kind: "high" | "low" }[] {
  const k = Math.max(2, Math.round(strength));
  const raw: { index: number; time: number; price: number; kind: "high" | "low" }[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) raw.push({ index: i, time: candles[i].time, price: candles[i].high, kind: "high" });
    else if (isLow) raw.push({ index: i, time: candles[i].time, price: candles[i].low, kind: "low" });
  }
  // Keep alternating high/low sequence, keeping the more extreme of same-kind runs.
  const zigzag: typeof raw = [];
  for (const p of raw) {
    const last = zigzag[zigzag.length - 1];
    if (!last) { zigzag.push(p); continue; }
    if (last.kind === p.kind) {
      const better = p.kind === "high" ? p.price > last.price : p.price < last.price;
      if (better) zigzag[zigzag.length - 1] = p;
      continue;
    }
    const move = last.price > 0 ? Math.abs((p.price - last.price) / last.price) * 100 : 0;
    if (move < minMovePct) continue;
    zigzag.push(p);
  }
  return zigzag.slice(-Math.max(1, maxLabels));
}


export function defaultStyleFor(key: string): IndicatorStyle {
  // Supports both `ema:<p>` and per-timeframe override keys `ema:<tf>:<p>`.
  if (key.startsWith("ema:") || key.startsWith("sma:")) {
    const parts = key.split(":");
    const p = parseInt(parts[parts.length - 1], 10);
    const map = key.startsWith("ema:") ? EMA_COLORS : SMA_COLORS;
    const styleName: LineStyleName = key.startsWith("ema:") ? "solid" : "dashed";
    return { color: colorFor(map, p), width: 2, style: styleName };
  }
  if (key === "vwap") return { color: "#22c55e", width: 2, style: "solid" };
  if (key.startsWith("avwap:")) return { color: avwapColorFor(key.slice(6)), width: 2, style: "solid" };
  return { color: "#3b82f6", width: 2, style: "solid" };
}

export function resolveStyle(cfg: IndicatorConfig, key: string): IndicatorStyle {
  const d = defaultStyleFor(key);
  const o = cfg.styles?.[key];
  return { ...d, ...o };
}

interface Props {
  symbol: string;
  interval: string;
  range?: string;
  indicators?: IndicatorConfig;
  onIndicatorsChange?: (next: IndicatorConfig) => void;
  chartConfig?: ChartConfig;
  resetSignal?: number;
  alerts?: import("@/lib/alerts").Alert[];
  alertSoundEnabled?: boolean;
  onAlertUpdate?: (alertId: string, lastBarTime: number, fired: boolean) => void;
  onHoverBarChange?: (bar: { time: number; open: number; high: number; low: number; close: number; volume: number; adr20?: number | null; atr14?: number | null; pct52wHigh?: number | null; pctFromLod?: number | null; pctFromMa?: number | null; maLabel?: string | null } | null) => void;
}

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number; adr20?: number | null; atr14?: number | null };

// --- Drawings ----------------------------------------------------------------

type Tool = "none" | "hline" | "tline" | "measure" | "avwap" | "pen" | "text" | "rect";

interface HLine {
  id: string;
  type: "hline";
  price: number;
  note?: string;
  color: string;
}
interface TLine {
  id: string;
  type: "tline";
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  color: string;
}
interface RectBox {
  id: string;
  type: "rect";
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  color: string;
  /** Optional label rendered inside the box (double-click the box to edit). */
  label?: string;

}
interface PenStroke {
  id: string;
  type: "pen";
  points: Array<{ t: number; p: number }>;
  color: string;
}
interface TextNote {
  id: string;
  type: "text";
  t: number;
  p: number;
  text: string;
  color: string;
}
type Drawing = HLine | TLine | RectBox | PenStroke | TextNote;
type ChartPoint = { x: number; y: number; t: number; p: number };
type PriceSeriesApi = ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area">;

const DRAW_COLOR = "#22c55e";

// Box / zone colors: white text on a colored border, tinted by what the note says.
const BOX_COLORS = ["#22c55e", "#3b82f6", "#ef4444"] as const; // green, blue, red
const BOX_BLUE_WORDS = /\b(note|watch|range|zone|level|info)\b/i;
const BOX_RED_WORDS = /\b(sell|short|resistance|bearish|risk|stop|sl|supply|breakdown|exit)\b/i;
function boxColorForLabel(label?: string): string {
  const t = (label ?? "").trim();
  if (!t) return BOX_COLORS[0];
  if (BOX_RED_WORDS.test(t)) return BOX_COLORS[2];
  if (BOX_BLUE_WORDS.test(t)) return BOX_COLORS[1];
  return BOX_COLORS[0];
}
function nextBoxColor(current: string): string {
  const i = BOX_COLORS.indexOf(current as (typeof BOX_COLORS)[number]);
  return BOX_COLORS[(i + 1) % BOX_COLORS.length];
}
const MEASURE_UP = "#22c55e";
const MEASURE_DOWN = "#ef4444";
const DRAWINGS_SYNC_EVENT = "nse-mv:drawings-sync";
const CROSSHAIR_SYNC_EVENT = "nse-mv:crosshair-sync";
const CHART_RESIZE_EVENT = "nse-mv:chart-resize";

function drawingsKey(symbol: string) {
  return `nse-mv:drawings:${symbol}`;
}

function legacyDrawingsPrefix(symbol: string) {
  return `nse-mv:drawings:${symbol}:`;
}

function removeLegacyDrawingKeys(symbol: string) {
  const prefix = legacyDrawingsPrefix(symbol);
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

function readStoredDrawings(symbol: string): Drawing[] {
  const key = drawingsKey(symbol);
  const raw = localStorage.getItem(key);
  if (raw !== null) {
    removeLegacyDrawingKeys(symbol);
    return JSON.parse(raw) as Drawing[];
  }

  const merged: Drawing[] = [];
  const seen = new Set<string>();
  const prefix = legacyDrawingsPrefix(symbol);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(prefix)) continue;
    try {
      const arr = JSON.parse(localStorage.getItem(k) || "[]") as Drawing[];
      for (const d of arr) {
        if (!seen.has(d.id)) { seen.add(d.id); merged.push(d); }
      }
    } catch {
      // Ignore malformed legacy drawing keys.
    }
  }
  localStorage.setItem(key, JSON.stringify(merged));
  removeLegacyDrawingKeys(symbol);
  return merged;
}

function xForDrawingTime(chart: IChartApi | null, candles: Candle[] | undefined, time: number): number | null {
  if (!chart) return null;
  const exact = chart.timeScale().timeToCoordinate(time as Time);
  if (exact != null) return exact;
  if (!candles?.length) return null;

  let hi = candles.findIndex((c) => c.time >= time);
  if (hi < 0) hi = candles.length - 1;
  if (hi === 0) return chart.timeScale().timeToCoordinate(candles[0].time as Time);

  const lo = hi - 1;
  const left = candles[lo];
  const right = candles[hi];
  const x1 = chart.timeScale().timeToCoordinate(left.time as Time);
  const x2 = chart.timeScale().timeToCoordinate(right.time as Time);
  if (x1 == null || x2 == null || right.time === left.time) return x2 ?? x1 ?? null;
  const ratio = (time - left.time) / (right.time - left.time);
  return x1 + (x2 - x1) * ratio;
}

function secondsPerCandle(candles: Candle[] | undefined): number {
  if (!candles || candles.length < 2) return 86_400;
  const diffs: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const diff = candles[i].time - candles[i - 1].time;
    if (Number.isFinite(diff) && diff > 0) diffs.push(diff);
  }
  if (!diffs.length) return 86_400;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] ?? 86_400;
}

function pointFromPointer(
  event: { clientX: number; clientY: number },
  element: HTMLElement,
  chart: IChartApi | null,
  series: PriceSeriesApi | null,
  candles: Candle[] | undefined,
): ChartPoint | null {
  if (!chart || !series) return null;
  const rect = element.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const price = series.coordinateToPrice(y);
  if (price == null) return null;
  const scale = chart.timeScale();
  let time = scale.coordinateToTime(x) as number | null;
  if (time == null && candles?.length) {
    const first = candles[0];
    const last = candles[candles.length - 1];
    const firstX = scale.timeToCoordinate(first.time as Time);
    const lastX = scale.timeToCoordinate(last.time as Time);
    if (firstX != null && lastX != null && firstX !== lastX) {
      const pxPerBar = Math.abs(lastX - firstX) / Math.max(1, candles.length - 1);
      const step = secondsPerCandle(candles);
      if (x < firstX) time = Math.round(first.time - ((firstX - x) / Math.max(1, pxPerBar)) * step);
      else if (x > lastX) time = Math.round(last.time + ((x - lastX) / Math.max(1, pxPerBar)) * step);
      else time = Math.round(first.time + ((x - firstX) / (lastX - firstX)) * (last.time - first.time));
    } else {
      time = last.time;
    }
  }
  if (time == null) return null;
  return { x, y, t: time, p: price as number };
}

// Magnet: snap a free point to the nearest OHLC value of the bar under the
// pointer, like TradingView's magnet mode. Returns the point untouched when
// disabled or when no bar is close enough.
function snapChartPoint(
  point: ChartPoint,
  candles: Candle[] | undefined,
  enabled: boolean,
): ChartPoint {
  if (!enabled || !candles?.length) return point;
  let best: Candle | null = null;
  let bestDt = Infinity;
  for (const c of candles) {
    const dt = Math.abs(c.time - point.t);
    if (dt < bestDt) { bestDt = dt; best = c; }
  }
  if (!best) return point;
  const candidates = [best.open, best.high, best.low, best.close];
  let snapped = point.p;
  let bestDp = Infinity;
  for (const v of candidates) {
    const dp = Math.abs(v - point.p);
    if (dp < bestDp) { bestDp = dp; snapped = v; }
  }
  const range = Math.max(best.high - best.low, Math.abs(point.p) * 0.005);
  if (bestDp > range * 0.6) return { ...point, t: best.time };
  return { ...point, t: best.time, p: snapped };
}



// --- math --------------------------------------------------------------------

function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

function vwapSeries(candles: Candle[]): (number | null)[] {
  const out: (number | null)[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumV += c.volume;
    out.push(cumV > 0 ? cumPV / cumV : null);
  }
  return out;
}

// Anchored VWAP: cumulates typical-price * volume from a chosen anchor time
// onward. Returns nulls for bars before the anchor. If anchor predates the
// data, we anchor to the first available candle.
function anchoredVwapSeries(candles: Candle[], anchorTime: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  // Find first index with time >= anchorTime
  let startIdx = candles.findIndex((c) => c.time >= anchorTime);
  if (startIdx === -1) return out;
  let cumPV = 0;
  let cumV = 0;
  for (let i = startIdx; i < candles.length; i++) {
    const c = candles[i];
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumV += c.volume;
    out[i] = cumV > 0 ? cumPV / cumV : null;
  }
  return out;
}

function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const prev = out[i - 1];
    const haOpen = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    out.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose, volume: c.volume });
  }
  return out;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// === Volume v2 classification ================================================

export type VolClass = "ppv" | "highUp" | "highDown" | "dry" | "noise";

export interface VolClassified {
  klass: VolClass;
  avgVol: number;       // SMA(volume, avgLookback) at this index
  maxDownN: number;     // max volume across last N down-days excluding current
}

function classifyVolumes(candles: Candle[], v2: VolumeV2Settings): VolClassified[] {
  const n = candles.length;
  const out: VolClassified[] = new Array(n);
  const vols = candles.map((c) => c.volume);
  const avg = sma(vols, v2.avgLookback);
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const isUp = c.close >= c.open;
    const a = avg[i];
    // Max volume across the last ppvLookback DOWN-days, excluding current bar
    let maxDownN = 0;
    let found = 0;
    for (let j = i - 1; j >= 0 && found < v2.ppvLookback; j--) {
      const cj = candles[j];
      if (cj.close < cj.open) {
        if (cj.volume > maxDownN) maxDownN = cj.volume;
        found++;
      }
    }
    let klass: VolClass = "noise";
    if (a != null) {
      if (isUp && maxDownN > 0 && c.volume > maxDownN && c.volume > a) {
        klass = "ppv";
      } else if (isUp && c.volume > a) {
        klass = "highUp";
      } else if (!isUp && c.volume > a) {
        klass = "highDown";
      } else if (v2.dryFraction > 0 && c.volume < a / v2.dryFraction) {
        klass = "dry";
      }
    }
    out[i] = { klass, avgVol: a ?? 0, maxDownN };
  }
  return out;
}

export interface HVTags {
  hve: number[];   // indices flagged HVE
  hvy: number[];
  hvq: number[];
  hvIpo: number[];
}

function findHighestVolumes(candles: Candle[]): HVTags {
  const tags: HVTags = { hve: [], hvy: [], hvq: [], hvIpo: [] };
  let maxAll = 0;
  for (let i = 0; i < candles.length; i++) {
    const v = candles[i].volume;
    if (v > maxAll) { maxAll = v; tags.hve = [i]; }
    else if (v === maxAll) tags.hve.push(i);

    let yMax = 0, yIdx = -1;
    const yStart = Math.max(0, i - 251);
    for (let j = yStart; j <= i; j++) { if (candles[j].volume > yMax) { yMax = candles[j].volume; yIdx = j; } }
    if (yIdx === i && yMax > 0) tags.hvy.push(i);

    let qMax = 0, qIdx = -1;
    const qStart = Math.max(0, i - 62);
    for (let j = qStart; j <= i; j++) { if (candles[j].volume > qMax) { qMax = candles[j].volume; qIdx = j; } }
    if (qIdx === i && qMax > 0) tags.hvq.push(i);
  }
  // HVIPO: first bar if its volume is the max within first 20 bars
  if (candles.length > 0) {
    const horizon = Math.min(candles.length, 20);
    let m = 0, mIdx = 0;
    for (let i = 0; i < horizon; i++) if (candles[i].volume > m) { m = candles[i].volume; mIdx = i; }
    if (mIdx === 0) tags.hvIpo = [0];
  }
  return tags;
}

function formatCrLakh(rupees: number): string {
  if (!Number.isFinite(rupees) || rupees <= 0) return "—";
  const cr = rupees / 1e7;
  if (cr >= 1) return `₹${cr.toFixed(cr >= 100 ? 0 : cr >= 10 ? 1 : 2)} Cr`;
  const lk = rupees / 1e5;
  return `₹${lk.toFixed(lk >= 100 ? 0 : lk >= 10 ? 1 : 2)} L`;
}

const VOL_V2_COLORS: Record<VolClass, string> = {
  ppv: "#3b82f6",
  highUp: "#22c55e",
  highDown: "#ef4444",
  dry: "#06b6d4",
  noise: "#94a3b8",
};

const HV_PAINT = {
  hve: "#3b82f6", // blue (HVE / HVIPO)
  hvy: "#22c55e", // green (HVY)
};
const HV_WICK = "#ffffff";

// --- IST display helpers ----------------------------------------------------
// Lightweight-charts treats `Time` as either a unix-second number (intraday)
// or a {year,month,day} business day (daily/weekly/monthly). NSE bars from
// Yahoo are real UTC seconds; shift by +5:30 and read UTC components so axis
// & crosshair labels read like IST without depending on the browser locale.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function toIstDate(time: Time): Date {
  if (typeof time === "number") return new Date(time * 1000 + IST_OFFSET_MS);
  const bd = time as { year: number; month: number; day: number };
  return new Date(Date.UTC(bd.year, bd.month - 1, bd.day));
}
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatIstTime(time: Time): string {
  const d = toIstDate(time);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mon = MONTHS[d.getUTCMonth()];
  const yyyy = d.getUTCFullYear();
  if (typeof time !== "number") return `${dd} ${mon} ${yyyy}`;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd} ${mon} ${yyyy}  ${hh}:${mi} IST`;
}
function formatIstTick(time: Time, tickMarkType: number): string {
  const d = toIstDate(time);
  // 0=Year, 1=Month, 2=DayOfMonth, 3=Time, 4=TimeWithSeconds
  if (tickMarkType === 0) return String(d.getUTCFullYear());
  if (tickMarkType === 1) return MONTHS[d.getUTCMonth()];
  if (tickMarkType === 2) return String(d.getUTCDate());
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}
function formatDateOnly(time: Time): string {
  const d = toIstDate(time);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mon = MONTHS[d.getUTCMonth()];
  return `${dd} ${mon} ${d.getUTCFullYear()}`;
}
function formatDateTick(time: Time, tickMarkType: number): string {
  const d = toIstDate(time);
  if (tickMarkType === 0) return String(d.getUTCFullYear());
  if (tickMarkType === 1) return MONTHS[d.getUTCMonth()];
  return String(d.getUTCDate());
}

export function LightweightChart({ symbol, interval, range, indicators, onIndicatorsChange, chartConfig, resetSignal, alerts, alertSoundEnabled, onAlertUpdate, onHoverBarChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const chartSizeRef = useRef({ width: 0, height: 0 });
  const priceSeriesRef = useRef<ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area"> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram" | "Line"> | null>(null);
  const volMaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const overlayRefs = useRef<ISeriesApi<"Line">[]>([]);
  const benchOverlayRef = useRef<ISeriesApi<"Line"> | null>(null);
  const benchStockOverlayRef = useRef<ISeriesApi<"Line"> | null>(null);
  const benchMarkersRef = useRef<{ detach: () => void } | null>(null);
  const macdLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [overlayPts, setOverlayPts] = useState<{ time: number; stockN: number; benchN: number }[]>([]);
  const [volStats, setVolStats] = useState<{ avgRupeeVol: number; rvolPct: number | null; oneMinL: number } | null>(null);

  const cfg: IndicatorConfig = useMemo(
    () => indicators ?? { ema: [], sma: [], vwap: false, anchoredVwaps: [] },
    [indicators],
  );
  const chart_cfg: ChartConfig = useMemo(() => {
    const src = chartConfig ?? DEFAULT_CHART_CONFIG;
    return {
      ...DEFAULT_CHART_CONFIG,
      ...src,
      volumeV2: { ...DEFAULT_VOLUME_V2, ...(src.volumeV2 ?? {}) },
    };
  }, [chartConfig]);

  const fetchOhlc = useServerFn(getOhlc);
  const isIntraday = interval === "5" || interval === "15" || interval === "30" || interval === "60";
  const { data, isLoading, error } = useQuery({
    queryKey: ["ohlc", symbol, interval, range ?? "default"],
    queryFn: () => fetchOhlc({ data: { symbol, interval, range } }),
    // Cache aggressively so navigating away and back does not re-fetch.
    // Snapshot cron / manual refresh explicitly invalidates when needed.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const overlayEnabled = chart_cfg.rsOverlay && chart_cfg.rsSymbol && chart_cfg.rsSymbol !== symbol;
  const { data: benchData } = useQuery({
    queryKey: ["ohlc", chart_cfg.rsSymbol, interval, range ?? "default"],
    queryFn: () => fetchOhlc({ data: { symbol: chart_cfg.rsSymbol, interval, range } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    enabled: Boolean(overlayEnabled),
  });

  // Optional IBD-style fundamentals labels (RS Rating / EPS growth).
  const fundamentalsEnabled = chart_cfg.showRsRatingLabel || chart_cfg.showEpsLabel;
  const { data: fundamentals } = useQuery({
    queryKey: ["chart-fundamentals", symbol],
    enabled: Boolean(fundamentalsEnabled && symbol),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: snap } = await supabase
        .from("stock_snapshot")
        .select("rs_rating,rs_rating_n500,net_profit_qoq,net_profit_yoy,earnings_release_date")
        .eq("symbol", symbol)
        .maybeSingle();
      return {
        rs: (snap?.rs_rating_n500 ?? snap?.rs_rating ?? null) as number | null,
        epsQoq: (snap?.net_profit_qoq ?? null) as number | null,
        epsYoy: (snap?.net_profit_yoy ?? null) as number | null,
        earningsDate: (snap?.earnings_release_date ?? null) as string | null,
      };
    },
  });

  // Optional key horizontal levels (52W high/low, all-time high/low).
  const levelsEnabled =
    chart_cfg.show52wHighLine || chart_cfg.show52wLowLine || chart_cfg.showAthLine || chart_cfg.showAtlLine;
  const needsFullHistory = chart_cfg.showAthLine || chart_cfg.showAtlLine;
  const { data: monthlyHistory } = useQuery({
    queryKey: ["ohlc", symbol, "M", "max"],
    queryFn: () => fetchOhlc({ data: { symbol, interval: "M", range: "max" } }),
    enabled: Boolean(levelsEnabled && needsFullHistory && symbol),
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: 1,
  });
  const { data: snapLevels } = useQuery({
    queryKey: ["chart-levels", symbol],
    enabled: Boolean(levelsEnabled && symbol),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: snap } = await supabase
        .from("stock_snapshot")
        .select("high_52w,low_52w,ath")
        .eq("symbol", symbol)
        .maybeSingle();
      return {
        high52w: (snap?.high_52w ?? null) as number | null,
        low52w: (snap?.low_52w ?? null) as number | null,
        ath: (snap?.ath ?? null) as number | null,
      };
    },
  });

  const keyLevels = useMemo(() => {
    const monthly = monthlyHistory?.candles ?? [];
    const cutoff = Date.now() / 1000 - 370 * 86400;
    const lastYear = monthly.filter((c) => c.time >= cutoff);
    const maxOf = (arr: Candle[]) => (arr.length ? Math.max(...arr.map((c) => c.high)) : null);
    const minOf = (arr: Candle[]) => (arr.length ? Math.min(...arr.map((c) => c.low)) : null);
    return {
      high52w: snapLevels?.high52w ?? maxOf(lastYear),
      low52w: snapLevels?.low52w ?? minOf(lastYear),
      ath: snapLevels?.ath ?? maxOf(monthly),
      atl: minOf(monthly),
    };
  }, [snapLevels, monthlyHistory]);



  useAlerts({
    symbol,
    interval,
    candles: data?.candles,
    alerts: alerts ?? [],
    soundEnabled: alertSoundEnabled,
    onUpdate: (id, t, fired) => onAlertUpdate?.(id, t, fired),
  });

  // Stable ref for hover callback so we don't re-run effects on every parent render.
  const onHoverBarChangeRef = useRef(onHoverBarChange);
  useEffect(() => { onHoverBarChangeRef.current = onHoverBarChange; }, [onHoverBarChange]);

  // Precompute per-bar enrichment: % from rolling high, low-of-day, % from primary MA.
  const hoverExtras = useMemo(() => {
    const candles = (data?.candles ?? []) as Candle[];
    const n = candles.length;
    const window = interval === "D" ? 252 : interval === "W" ? 52 : interval === "M" ? 12 : Math.min(n, 500);
    const pct52wHigh: (number | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - window + 1);
      let m = -Infinity;
      for (let j = start; j <= i; j++) if (candles[j].high > m) m = candles[j].high;
      pct52wHigh[i] = m > 0 ? ((candles[i].close - m) / m) * 100 : null;
    }
    const pctFromLod: (number | null)[] = new Array(n).fill(null);
    if (interval === "D" || interval === "W" || interval === "M") {
      for (let i = 0; i < n; i++) {
        const l = candles[i].low;
        pctFromLod[i] = l > 0 ? ((candles[i].close - l) / l) * 100 : null;
      }
    } else {
      // Intraday: group by IST calendar day
      let dayKey = "";
      let dayLow = Infinity;
      let dayStart = 0;
      for (let i = 0; i <= n; i++) {
        const key = i < n ? new Date(((candles[i].time as number) + 5.5 * 3600) * 1000).toISOString().slice(0, 10) : "__end__";
        if (key !== dayKey) {
          // finalize previous day
          if (i > dayStart && dayLow > 0 && Number.isFinite(dayLow)) {
            for (let j = dayStart; j < i; j++) {
              pctFromLod[j] = ((candles[j].close - dayLow) / dayLow) * 100;
            }
          }
          dayKey = key;
          dayStart = i;
          dayLow = i < n ? candles[i].low : Infinity;
        } else if (i < n) {
          if (candles[i].low < dayLow) dayLow = candles[i].low;
        }
      }
    }
    // Primary MA: first line from the resolved (timeframe-adapted) list.
    let maArr: (number | null)[] | null = null;
    let maLabel: string | null = null;
    const closes = candles.map((c) => c.close);
    const { primaryMa } = resolveEffectiveIndicators(
      indicators ?? { ema: [], sma: [], vwap: false, anchoredVwaps: [] },
      interval,
    );
    if (primaryMa) {
      maArr = primaryMa.kind === "ema"
        ? ema(closes, primaryMa.effectivePeriod)
        : sma(closes, primaryMa.effectivePeriod);
      maLabel = primaryMa.label.replace(/\s+/g, "");
    }
    const pctFromMa: (number | null)[] = new Array(n).fill(null);
    if (maArr) {
      for (let i = 0; i < n; i++) {
        const v = maArr[i];
        pctFromMa[i] = v != null && v !== 0 ? ((candles[i].close - v) / v) * 100 : null;
      }
    }
    return { pct52wHigh, pctFromLod, pctFromMa, maLabel };
  }, [data, indicators, interval]);

  const enrichBar = useCallback((bar: Candle | null | undefined) => {
    if (!bar) return null;
    const idx = (data?.candles ?? []).findIndex((c) => c.time === bar.time);
    if (idx < 0) return { ...bar, maLabel: hoverExtras.maLabel };
    return {
      ...bar,
      pct52wHigh: hoverExtras.pct52wHigh[idx] ?? null,
      pctFromLod: hoverExtras.pctFromLod[idx] ?? null,
      pctFromMa: hoverExtras.pctFromMa[idx] ?? null,
      maLabel: hoverExtras.maLabel,
    };
  }, [data, hoverExtras]);

  // Emit latest bar whenever data changes so parent can show default volume info.
  useEffect(() => {
    const cb = onHoverBarChangeRef.current;
    if (!cb) return;
    if (data?.candles?.length) {
      cb(enrichBar(data.candles[data.candles.length - 1] as Candle));
    } else {
      cb(null);
    }
  }, [data, enrichBar]);



  // Create the chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const hostRect = containerRef.current.parentElement?.getBoundingClientRect();
    const chart = createChart(containerRef.current, {
      width: Math.max(1, Math.floor(hostRect?.width || containerRef.current.clientWidth || 1)),
      height: Math.max(1, Math.floor(hostRect?.height || containerRef.current.clientHeight || 1)),
      layout: { background: { color: "transparent" }, textColor: "#94a3b8", fontSize: 11 },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.08)" },
        horzLines: { color: "rgba(148, 163, 184, 0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.15)" },
      leftPriceScale: { borderColor: "rgba(148, 163, 184, 0.15)", visible: false },
      localization: { timeFormatter: formatIstTime },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.15)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: chartConfig?.rightBarOffset ?? 10,
        tickMarkFormatter: formatIstTick,
      },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: false,
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      volSeriesRef.current = null;
      overlayRefs.current = [];
      benchOverlayRef.current = null;
      benchStockOverlayRef.current = null;
      benchMarkersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      localization: { timeFormatter: isIntraday ? formatIstTime : formatDateOnly },
      timeScale: {
        timeVisible: isIntraday,
        secondsVisible: false,
        tickMarkFormatter: isIntraday ? formatIstTick : formatDateTick,
      },
    });
  }, [isIntraday]);

  // React to rightBarOffset changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.timeScale().applyOptions({ rightOffset: chart_cfg.rightBarOffset ?? 10 });
    } catch {}
  }, [chart_cfg.rightBarOffset]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (priceSeriesRef.current) {
      try { chart.removeSeries(priceSeriesRef.current); } catch {}
      priceSeriesRef.current = null;
    }
    if (volMarkersRef.current) {
      try { volMarkersRef.current.detach(); } catch {}
      volMarkersRef.current = null;
    }
    if (volSeriesRef.current) {
      try { chart.removeSeries(volSeriesRef.current); } catch {}
      volSeriesRef.current = null;
    }
    if (volMaSeriesRef.current) {
      try { chart.removeSeries(volMaSeriesRef.current); } catch {}
      volMaSeriesRef.current = null;
    }

    const { chartType, upColor, downColor, lineColor, showVolume } = chart_cfg;

    if (chartType === "candles" || chartType === "heikin-ashi") {
      priceSeriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor, downColor,
        borderUpColor: upColor, borderDownColor: downColor,
        wickUpColor: upColor, wickDownColor: downColor,
      });
    } else if (chartType === "bars") {
      priceSeriesRef.current = chart.addSeries(BarSeries, { upColor, downColor, thinBars: false });
    } else if (chartType === "line") {
      priceSeriesRef.current = chart.addSeries(LineSeries, { color: lineColor, lineWidth: 2 });
    } else if (chartType === "area") {
      priceSeriesRef.current = chart.addSeries(AreaSeries, {
        lineColor,
        topColor: hexToRgba(lineColor, 0.35),
        bottomColor: hexToRgba(lineColor, 0.02),
        lineWidth: 2,
      });
    }

    if (showVolume) {
      const shape = chart_cfg.volumeShape ?? "histogram";
      if (shape === "line") {
        volSeriesRef.current = chart.addSeries(LineSeries, {
          color: "rgba(148, 163, 184, 0.9)",
          lineWidth: 2,
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
          priceLineVisible: false,
          lastValueVisible: false,
        });
      } else {
        volSeriesRef.current = chart.addSeries(HistogramSeries, {
          color: "rgba(148, 163, 184, 0.4)",
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
          priceLineVisible: false,
          lastValueVisible: false,
        });
      }
      volSeriesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.05, bottom: 0.2 } });

      if (chart_cfg.showVolumeMA) {
        volMaSeriesRef.current = chart.addSeries(LineSeries, {
          color: chart_cfg.volumeMAColor || "#ffffff",
          lineWidth: 1,
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
      }
    } else {
      chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.05, bottom: 0.05 } });
    }
  }, [chart_cfg.chartType, chart_cfg.showVolume, chart_cfg.volumeShape, chart_cfg.upColor, chart_cfg.downColor, chart_cfg.lineColor, chart_cfg.showVolumeMA, chart_cfg.volumeMAColor]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale("right").applyOptions({ mode: chart_cfg.logScale ? 1 : 0 });
  }, [chart_cfg.logScale]);

  useEffect(() => {
    if (!data?.candles || !chartRef.current || !priceSeriesRef.current) return;
    const { chartType, upColor, downColor, volumeOpacity, volumeStyle, volumeV2 } = chart_cfg;
    const source = chartType === "heikin-ashi" ? heikinAshi(data.candles as Candle[]) : (data.candles as Candle[]);

    // Pre-compute v2 classification + HV tags if needed for either bars or paint
    const needV2 = volumeStyle === "v2";
    const needPaint = (volumeV2.paintHVE || volumeV2.paintHVY) &&
      (chartType === "candles" || chartType === "bars" || chartType === "heikin-ashi");
    const classified = (needV2 || needPaint) ? classifyVolumes(source, volumeV2) : null;
    const hvTags = (needV2 || needPaint) ? findHighestVolumes(source) : null;

    // Build per-bar paint overrides for price bars.
    // Color matches the volume bar's classification (green up, red down, blue PPV, etc.)
    // Priority: HVE/HVIPO wins over HVY.
    const paintIdxColor = new Map<number, string>();
    if (needPaint && hvTags && classified) {
      const colorFor = (i: number) => VOL_V2_COLORS[classified[i].klass];
      if (volumeV2.paintHVY) for (const i of hvTags.hvy) paintIdxColor.set(i, colorFor(i));
      if (volumeV2.paintHVE) {
        for (const i of hvTags.hve) paintIdxColor.set(i, colorFor(i));
        for (const i of hvTags.hvIpo) paintIdxColor.set(i, colorFor(i));
      }
    }

    if (chartType === "line" || chartType === "area") {
      const pts = source.map((c) => ({ time: c.time as Time, value: c.close }));
      (priceSeriesRef.current as ISeriesApi<"Line" | "Area">).setData(pts);
    } else {
      const ohlc = source.map((c, i) => {
        const base: Record<string, unknown> = { time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close };
        const paint = paintIdxColor.get(i);
        if (paint) {
          base.color = paint;
          base.borderColor = paint;
          base.wickColor = paint;
        }
        return base;
      });
      (priceSeriesRef.current as ISeriesApi<"Candlestick" | "Bar">).setData(ohlc as never);
    }

    if (volSeriesRef.current) {
      const shape = chart_cfg.volumeShape ?? "histogram";
      // Histogram = light/ghost fill (subtle). Bar = full opacity (solid).
      // Line = line series.
      const opa = shape === "bar" ? 1.0 : shape === "histogram" ? Math.min(0.45, volumeOpacity) : volumeOpacity;
      if (shape === "line") {
        const pts = source.map((c) => ({ time: c.time as Time, value: c.volume }));
        (volSeriesRef.current as ISeriesApi<"Line">).setData(pts);
      } else {
        // Default per-bar color: up/down by close vs open (fall back to prev close when flat).
        const upDownColor = (c: Candle, prev: Candle | undefined) => {
          const ref = c.close === c.open && prev ? prev.close : c.open;
          return c.close >= ref ? hexToRgba(upColor, opa) : hexToRgba(downColor, opa);
        };
        const volumes = source.map((c, i) => {
          let color = upDownColor(c, source[i - 1]);
          if (volumeStyle === "v2" && classified) {
            const klass = classified[i].klass;
            // Use V2 highlight colors only for non-noise classes; noise stays up/down colored.
            if (klass !== "noise") color = hexToRgba(VOL_V2_COLORS[klass], opa);
          }
          return { time: c.time as Time, value: c.volume, color };
        });
        (volSeriesRef.current as ISeriesApi<"Histogram">).setData(volumes);
      }
    }

    if (volMaSeriesRef.current) {
      const period = Math.max(1, chart_cfg.volumeMALength || 10);
      const maArr = sma(source.map((c) => c.volume), period);
      const pts = source
        .map((c, i) => ({ time: c.time as Time, value: maArr[i] }))
        .filter((p): p is { time: Time; value: number } => p.value != null);
      volMaSeriesRef.current.setData(pts);
    }

    // HV markers on the volume pane (v2 only)
    if (volMarkersRef.current) {
      try { volMarkersRef.current.detach(); } catch {}
      volMarkersRef.current = null;
    }
    if (needV2 && volSeriesRef.current && hvTags) {
      const markers: SeriesMarker<Time>[] = [];
      const claimed = new Set<number>();
      const pushMark = (idxs: number[], text: string, color: string) => {
        const filtered = idxs.filter((i) => !claimed.has(i));
        const list = volumeV2.latestOnly && filtered.length ? [filtered[filtered.length - 1]] : filtered;
        for (const i of list) {
          claimed.add(i);
          markers.push({
            time: source[i].time as Time,
            position: "aboveBar",
            shape: "circle",
            color,
            text,
            size: 0,
          });
        }
      };
      // Priority: HVIPO == HVE (IPO bar is often the all-time high for new listings,
      // and HVIPO is the more informative label) > HVY > HVQ
      if (volumeV2.showHVIPO) pushMark(hvTags.hvIpo, "HVIPO", "#a78bfa");
      if (volumeV2.showHVE) pushMark(hvTags.hve, "HVE", HV_PAINT.hve);
      if (volumeV2.showHVY) pushMark(hvTags.hvy, "HVY", HV_PAINT.hvy);
      if (volumeV2.showHVQ) pushMark(hvTags.hvq, "HVQ", "#a78bfa");
      // Sort by time asc (lightweight-charts requirement)
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      if (markers.length) {
        volMarkersRef.current = createSeriesMarkers<Time>(volSeriesRef.current, markers);
      }
    }

    // Volume chip stats (last bar). Use typical price (HLC/3) × volume to
    // match how most platforms (incl. TV) compute "Avg ₹Vol".
    if (needV2 && source.length > 0) {
      const last = source[source.length - 1];
      const rupeeVols = source.map((c) => ((c.high + c.low + c.close) / 3) * c.volume);
      const avgRupeeArr = sma(rupeeVols, volumeV2.avgLookback);
      const avgRupeeVol = avgRupeeArr[avgRupeeArr.length - 1] ?? 0;
      const volAvgArr = sma(source.map((c) => c.volume), volumeV2.rvolLookback);
      const va = volAvgArr[volAvgArr.length - 1];
      const rvolPct = va && va > 0 ? (last.volume / va) * 100 : null;
      const oneMinL = avgRupeeVol / 375 / 1e5; // Lakhs per minute (NSE = 375 min/day)
      setVolStats({ avgRupeeVol, rvolPct, oneMinL });
    } else {
      setVolStats(null);
    }

    chartRef.current.timeScale().fitContent();
  }, [data, chart_cfg]);

  // Key horizontal levels drawn as price lines on the main series.
  useEffect(() => {
    const series = priceSeriesRef.current;
    if (!series) return;
    const created: ReturnType<typeof series.createPriceLine>[] = [];
    const add = (price: number | null | undefined, title: string, color: string) => {
      if (price == null || !Number.isFinite(price)) return;
      created.push(
        series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title,
        }),
      );
    };
    if (chart_cfg.show52wHighLine) add(keyLevels.high52w, "52W H", "#22c55e");
    if (chart_cfg.show52wLowLine) add(keyLevels.low52w, "52W L", "#ef4444");
    if (chart_cfg.showAthLine) add(keyLevels.ath, "ATH", "#38bdf8");
    if (chart_cfg.showAtlLine) add(keyLevels.atl, "ATL", "#f97316");
    return () => {
      for (const l of created) {
        try { series.removePriceLine(l); } catch {}
      }
    };
  }, [
    keyLevels,
    data,
    chart_cfg.show52wHighLine,
    chart_cfg.show52wLowLine,
    chart_cfg.showAthLine,
    chart_cfg.showAtlLine,
    chart_cfg.chartType,
  ]);


  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !data?.candles) return;

    for (const s of overlayRefs.current) {
      try { chart.removeSeries(s); } catch {}
    }
    overlayRefs.current = [];

    const closes = data.candles.map((c) => c.close);
    const times = data.candles.map((c) => c.time as Time);
    const lineStyleCode = (s: LineStyleName) => (s === "dashed" ? 2 : s === "dotted" ? 1 : 0);

    const addLine = (values: (number | null)[], key: string, _title: string) => {
      const st = resolveStyle(cfg, key);
      const series = chart.addSeries(LineSeries, {
        color: st.color,
        lineWidth: st.width,
        lineStyle: lineStyleCode(st.style),
        priceLineVisible: false,
        lastValueVisible: true,
      });
      const pts = values
        .map((v, i) => (v == null ? null : { time: times[i], value: v }))
        .filter(Boolean) as { time: Time; value: number }[];
      series.setData(pts);
      overlayRefs.current.push(series);
    };

    const { lines: maLines } = resolveEffectiveIndicators(cfg, interval);
    for (const ml of maLines) {
      const vals = ml.kind === "ema" ? ema(closes, ml.effectivePeriod) : sma(closes, ml.effectivePeriod);
      addLine(vals, ml.styleKey, ml.label);
    }
    if (cfg.vwap) addLine(vwapSeries(data.candles as Candle[]), "vwap", "VWAP");
    if (cfg.anchoredVwaps?.length) {
      for (const a of cfg.anchoredVwaps) {
        const dateStr = new Date(a.time * 1000).toISOString().slice(0, 10);
        addLine(
          anchoredVwapSeries(data.candles as Candle[], a.time),
          `avwap:${a.id}`,
          `AVWAP ${a.label ?? dateStr}`,
        );
      }
    }
  }, [data, cfg, chart_cfg.chartType]);

  // Benchmark overlay (IBD-style): benchmark lives in a reserved top band of the price pane.
  // We push the price scale's top margin down whenever the overlay is active so candles never
  // overlap the benchmark line.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (benchMarkersRef.current) {
      try { benchMarkersRef.current.detach(); } catch {}
      benchMarkersRef.current = null;
    }
    if (benchOverlayRef.current) {
      try { chart.removeSeries(benchOverlayRef.current); } catch {}
      benchOverlayRef.current = null;
    }
    if (benchStockOverlayRef.current) {
      try { chart.removeSeries(benchStockOverlayRef.current); } catch {}
      benchStockOverlayRef.current = null;
    }

    const priceBottom = chart_cfg.showVolume ? 0.2 : 0.05;
    const priceTop = overlayEnabled ? 0.22 : 0.05;
    chart.priceScale("right").applyOptions({ scaleMargins: { top: priceTop, bottom: priceBottom } });

    if (!overlayEnabled || !data?.candles || !benchData?.candles) {
      setOverlayPts([]);
      return;
    }

    const compareMode = chart_cfg.rsCompareMode === "compare";

    // Align both series on the intersection of timestamps
    const benchByTime = new Map<number, number>(benchData.candles.map((c) => [c.time, c.close]));
    const aligned = data.candles
      .filter((c) => benchByTime.has(c.time))
      .map((c) => ({ time: c.time as Time, stock: c.close, bench: benchByTime.get(c.time)! }));
    if (aligned.length === 0) {
      setOverlayPts([]);
      return;
    }

    if (!compareMode) {
      // Benchmark-only mode: plot raw benchmark close on its own hidden scale (original behavior).
      const benchSeries = chart.addSeries(LineSeries, {
        color: chart_cfg.rsOverlayColor,
        lineWidth: 1,
        lineStyle: 0,
        priceLineVisible: false,
        lastValueVisible: false,
        priceScaleId: "bench-overlay",
        title: "",
      });
      benchSeries.setData(aligned.map((a) => ({ time: a.time, value: a.bench })));
      benchSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.02, bottom: 0.82 },
        visible: false,
      });
      benchOverlayRef.current = benchSeries;
      setOverlayPts([]);
      return;
    }

    // Compare mode: normalize both to 100 at the first common bar so they share a scale
    const base = aligned[0];
    const benchPts = aligned.map((a) => ({ time: a.time, value: (a.bench / base.bench) * 100 }));
    const stockPts = aligned.map((a) => ({ time: a.time, value: (a.stock / base.stock) * 100 }));

    const benchSeries = chart.addSeries(LineSeries, {
      color: chart_cfg.rsOverlayColor,
      lineWidth: 1,
      lineStyle: 0,
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: "bench-overlay",
      title: "",
    });
    benchSeries.setData(benchPts);
    benchSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.02, bottom: 0.82 },
      visible: false,
    });
    benchOverlayRef.current = benchSeries;

    const stockSeries = chart.addSeries(LineSeries, {
      color: chart_cfg.rsStockColor,
      lineWidth: 1,
      lineStyle: 0,
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: "stock-overlay",
      title: "",
    });
    stockSeries.setData(stockPts);
    stockSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.02, bottom: 0.82 },
      visible: false,
    });
    benchStockOverlayRef.current = stockSeries;

    setOverlayPts(aligned.map((a, i) => ({
      time: a.time as number,
      stockN: stockPts[i].value,
      benchN: benchPts[i].value,
    })));
  }, [overlayEnabled, data, benchData, chart_cfg.rsOverlayColor, chart_cfg.rsStockColor, chart_cfg.rsCompareMode, chart_cfg.rsSymbol, chart_cfg.showVolume, symbol]);

  // Clear overlay state when disabled
  useEffect(() => {
    if (!overlayEnabled) setOverlayPts([]);
  }, [overlayEnabled]);

  // === MACD sub-pane (optional) ============================================
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Teardown previous series
    const cleanup = () => {
      for (const ref of [macdLineRef, macdSignalRef, macdHistRef] as const) {
        if (ref.current) {
          try { chart.removeSeries(ref.current); } catch {}
          ref.current = null;
        }
      }
    };
    cleanup();

    const enabled = chart_cfg.macdEnabled;

    // Restore default scale margins when MACD is off
    if (!enabled) {
      const priceTop = overlayEnabled ? 0.22 : 0.05;
      if (chart_cfg.showVolume) {
        chart.priceScale("right").applyOptions({ scaleMargins: { top: priceTop, bottom: 0.2 } });
        try { chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } }); } catch {}
      } else {
        chart.priceScale("right").applyOptions({ scaleMargins: { top: priceTop, bottom: 0.05 } });
      }
      return;
    }

    if (!data?.candles?.length) return;

    const closes = (data.candles as Candle[]).map((c) => c.close);
    const times = (data.candles as Candle[]).map((c) => c.time as Time);
    const fast = Math.max(2, chart_cfg.macdFast || 12);
    const slow = Math.max(fast + 1, chart_cfg.macdSlow || 26);
    const sigLen = Math.max(1, chart_cfg.macdSignal || 9);

    const ef = ema(closes, fast);
    const es = ema(closes, slow);
    const macdVals: (number | null)[] = closes.map((_, i) =>
      ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null,
    );
    const startIdx = macdVals.findIndex((v) => v != null);
    const signalVals: (number | null)[] = new Array(closes.length).fill(null);
    if (startIdx >= 0) {
      const tail = macdVals.slice(startIdx).map((v) => v as number);
      const sigTail = ema(tail, sigLen);
      for (let i = 0; i < sigTail.length; i++) signalVals[startIdx + i] = sigTail[i];
    }
    const histVals: (number | null)[] = macdVals.map((v, i) =>
      v != null && signalVals[i] != null ? v - (signalVals[i] as number) : null,
    );

    const histSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "macd",
      priceFormat: { type: "price", precision: 3, minMove: 0.001 },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const histData = histVals
      .map((v, i) =>
        v == null
          ? null
          : {
              time: times[i],
              value: v,
              color: v >= 0 ? chart_cfg.macdHistUpColor : chart_cfg.macdHistDownColor,
            },
      )
      .filter(Boolean) as { time: Time; value: number; color: string }[];
    histSeries.setData(histData);
    macdHistRef.current = histSeries;

    const macdSeries = chart.addSeries(LineSeries, {
      color: chart_cfg.macdLineColor,
      lineWidth: 2,
      priceScaleId: "macd",
      priceLineVisible: false,
      lastValueVisible: true,
    });
    macdSeries.setData(
      macdVals
        .map((v, i) => (v == null ? null : { time: times[i], value: v }))
        .filter(Boolean) as { time: Time; value: number }[],
    );
    macdLineRef.current = macdSeries;

    const sigSeries = chart.addSeries(LineSeries, {
      color: chart_cfg.macdSignalColor,
      lineWidth: 2,
      priceScaleId: "macd",
      priceLineVisible: false,
      lastValueVisible: true,
    });
    sigSeries.setData(
      signalVals
        .map((v, i) => (v == null ? null : { time: times[i], value: v }))
        .filter(Boolean) as { time: Time; value: number }[],
    );
    macdSignalRef.current = sigSeries;

    // Allocate bottom band for MACD; squeeze price (and volume) to make room.
    chart.priceScale("macd").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const priceTop = overlayEnabled ? 0.22 : 0.05;
    if (chart_cfg.showVolume) {
      chart.priceScale("right").applyOptions({ scaleMargins: { top: priceTop, bottom: 0.4 } });
      try { chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.62, bottom: 0.22 } }); } catch {}
    } else {
      chart.priceScale("right").applyOptions({ scaleMargins: { top: priceTop, bottom: 0.22 } });
    }
  }, [
    data,
    chart_cfg.macdEnabled,
    chart_cfg.macdFast,
    chart_cfg.macdSlow,
    chart_cfg.macdSignal,
    chart_cfg.macdLineColor,
    chart_cfg.macdSignalColor,
    chart_cfg.macdHistUpColor,
    chart_cfg.macdHistDownColor,
    chart_cfg.showVolume,
    overlayEnabled,
  ]);



  // Right-click on the chart resets zoom (TradingView-style)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      const chart = chartRef.current;
      if (!chart) return;
      chart.timeScale().fitContent();
      chart.priceScale("right").applyOptions({ autoScale: true });
    };
    el.addEventListener("contextmenu", onCtx);
    return () => el.removeEventListener("contextmenu", onCtx);
  }, []);

  useEffect(() => {
    if (resetSignal === undefined) return;
    const chart = chartRef.current;
    if (!chart) return;
    chart.timeScale().fitContent();
    chart.priceScale("right").applyOptions({ autoScale: true });
  }, [resetSignal]);

  // Auto-reset zoom on fullscreen enter/exit so chart adapts to new viewport
  useEffect(() => {
    const onFs = () => {
      const chart = chartRef.current;
      if (!chart) return;
      // Defer so the container has resized before we refit
      setTimeout(() => {
        chart.timeScale().fitContent();
        chart.priceScale("right").applyOptions({ autoScale: true });
      }, 80);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // === Drawings ============================================================

  const [tool, setTool] = useState<Tool>("none");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ t: number; p: number } | null>(null);
  const [pendingHline, setPendingHline] = useState<{ price: number } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  // Text / box-label entry dialog (replaces window.prompt)
  const [textDialog, setTextDialog] = useState<
    | { mode: "box"; id: string }
    | { mode: "note"; t: number; p: number }
    | null
  >(null);
  const [textDraft, setTextDraft] = useState("");
  const [hover, setHover] = useState<{ x: number; y: number; t: number | null; p: number | null } | null>(null);
  const [penDraft, setPenDraft] = useState<Array<{ t: number; p: number }> | null>(null);
  const penDraftRef = useRef<Array<{ t: number; p: number }> | null>(null);
  // TradingView-like helpers: magnet snapping to OHLC and "stay in tool" lock.
  const [magnet, setMagnet] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("nse-mv:draw-magnet") === "1";
  });
  const [lockTool, setLockTool] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("nse-mv:draw-lock") === "1";
  });
  const magnetRef = useRef(magnet);
  useEffect(() => {
    magnetRef.current = magnet;
    try { localStorage.setItem("nse-mv:draw-magnet", magnet ? "1" : "0"); } catch { /* ignore */ }
  }, [magnet]);
  useEffect(() => {
    try { localStorage.setItem("nse-mv:draw-lock", lockTool ? "1" : "0"); } catch { /* ignore */ }
  }, [lockTool]);
  const lockToolRef = useRef(lockTool);
  useEffect(() => { lockToolRef.current = lockTool; }, [lockTool]);
  const undoStackRef = useRef<Drawing[][]>([]);
  const [, forceRender] = useState(0);
  const drawingsRef = useRef<Drawing[]>([]);
  const selectedDrawingIdRef = useRef<string | null>(null);
  const skipNextPersistRef = useRef(false);
  const dragRef = useRef<null | {
    id: string;
    mode: "hline" | "tline-body" | "tline-p1" | "tline-p2" | "rect-body" | "rect-p1" | "rect-p2";
    startX: number;
    startY: number;
    startDrawing: Drawing;
  }>(null);

  // Push current drawings onto the undo stack before a mutation.
  const pushUndo = useCallback(() => {
    undoStackRef.current.push(drawingsRef.current.map((d) => ({ ...d })));
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
  }, []);
  const addDrawing = useCallback((d: Drawing) => {
    pushUndo();
    setDrawings((arr) => [...arr, d]);
  }, [pushUndo]);
  const endTool = useCallback(() => {
    setPending(null);
    if (!lockToolRef.current) setTool("none");
  }, []);


  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);
  useEffect(() => { selectedDrawingIdRef.current = selectedDrawingId; }, [selectedDrawingId]);

  // Load saved drawings per symbol (shared across all timeframes)
  useEffect(() => {
    skipNextPersistRef.current = true;
    try {
      setDrawings(readStoredDrawings(symbol));
    } catch {
      setDrawings([]);
    }
    setPending(null);
    setSelectedDrawingId(null);
  }, [symbol]);

  // Persist and notify other mounted timeframes/charts for the same symbol.
  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    try {
      removeLegacyDrawingKeys(symbol);
      localStorage.setItem(drawingsKey(symbol), JSON.stringify(drawings));
      window.dispatchEvent(new CustomEvent(DRAWINGS_SYNC_EVENT, { detail: { symbol, drawings } }));
    } catch {
      // Drawing sync is best-effort when browser storage is unavailable.
    }
  }, [drawings, symbol]);

  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ symbol?: string; drawings?: Drawing[] }>).detail;
      if (detail?.symbol !== symbol || !Array.isArray(detail.drawings)) return;
      const incoming = detail.drawings;
      if (JSON.stringify(incoming) === JSON.stringify(drawingsRef.current)) return;
      skipNextPersistRef.current = true;
      setDrawings(incoming);
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== drawingsKey(symbol)) return;
      try {
        const incoming = event.newValue ? (JSON.parse(event.newValue) as Drawing[]) : [];
        if (JSON.stringify(incoming) === JSON.stringify(drawingsRef.current)) return;
        skipNextPersistRef.current = true;
        setDrawings(incoming);
      } catch {
        // Ignore malformed cross-tab drawing payloads.
      }
    };
    window.addEventListener(DRAWINGS_SYNC_EVENT, sync);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(DRAWINGS_SYNC_EVENT, sync);
      window.removeEventListener("storage", storage);
    };
  }, [symbol]);

  // Repaint overlay on chart pan/zoom/resize
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ts = chart.timeScale();
    const rerender = () => forceRender((n) => n + 1);
    ts.subscribeVisibleTimeRangeChange(rerender);
    ts.subscribeVisibleLogicalRangeChange(rerender);
    chart.subscribeCrosshairMove((p) => {
      const cb = onHoverBarChangeRef.current;
      // Track hover for measure preview + pending tline preview
      if (!p.point) {
        setHover(null);
        if (cb && data?.candles?.length) {
          const last = data.candles[data.candles.length - 1] as Candle;
          cb(enrichBar(last));
        }
        if (!applyingSyncRef.current) {
          window.dispatchEvent(new CustomEvent(CROSSHAIR_SYNC_EVENT, { detail: { symbol, time: null, price: null } }));
        }
        return;
      }
      const series = priceSeriesRef.current;
      if (!series) return;
      const price = series.coordinateToPrice(p.point.y);
      const time = (p.time as number | undefined) ?? null;
      setHover({ x: p.point.x, y: p.point.y, t: time, p: price });
      if (cb && data?.candles) {
        const bar = time != null
          ? (data.candles.find((c) => c.time === time) as Candle | undefined)
          : undefined;
        cb(enrichBar(bar ?? (data.candles[data.candles.length - 1] as Candle) ?? null));
      }
      if (!applyingSyncRef.current && time != null) {
        window.dispatchEvent(new CustomEvent(CROSSHAIR_SYNC_EVENT, {
          detail: { symbol, time, price: price ?? null },
        }));
      }
      rerender();
    });
    const kick = (fit = false) => {
      const el = containerRef.current;
      if (el && chartRef.current) {
        const rect = el.parentElement?.getBoundingClientRect() ?? el.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width || el.clientWidth));
        const height = Math.max(1, Math.floor(rect.height || el.clientHeight));
        const sizeChanged = chartSizeRef.current.width !== width || chartSizeRef.current.height !== height;
        if (!sizeChanged && !fit) return;
        chartSizeRef.current = { width, height };
        try {
          if (sizeChanged) {
            chartRef.current.applyOptions({ width, height, autoSize: false });
            chartRef.current.resize(width, height, true);
          }
          if (fit) {
            chartRef.current.timeScale().fitContent();
            chartRef.current.priceScale("right").applyOptions({ autoScale: true });
          }
        } catch {}
      }
      if (fit) rerender();
    };
    const scheduleKick = (event?: Event) => {
      const fit = (event as CustomEvent<{ fit?: boolean }> | undefined)?.detail?.fit === true;
      kick(fit);
      requestAnimationFrame(() => kick(fit));
      requestAnimationFrame(() => requestAnimationFrame(() => kick(fit)));
    };
    const ro = new ResizeObserver(() => scheduleKick());
    if (containerRef.current) ro.observe(containerRef.current);
    if (containerRef.current?.parentElement) ro.observe(containerRef.current.parentElement);
    window.addEventListener("resize", scheduleKick);
    window.addEventListener(CHART_RESIZE_EVENT, scheduleKick);
    // Re-measure on next frames in case the layout settles after this effect runs
    const r1 = requestAnimationFrame(() => kick());
    const t1 = window.setTimeout(() => kick(), 80);
    const t2 = window.setTimeout(() => kick(), 220);
    return () => {
      try {
        ts.unsubscribeVisibleTimeRangeChange(rerender);
        ts.unsubscribeVisibleLogicalRangeChange(rerender);
      } catch {}
      ro.disconnect();
      window.removeEventListener("resize", scheduleKick);
      window.removeEventListener(CHART_RESIZE_EVENT, scheduleKick);
      cancelAnimationFrame(r1);
      clearTimeout(t1);
      clearTimeout(t2);
    };

  }, [data, symbol, enrichBar]);

  // Cross-timeframe crosshair sync: when another chart for the same symbol
  // reports a hovered time + price, mirror it here on the nearest candle, at
  // the originally hovered price so the horizontal line aligns across panes.
  const applyingSyncRef = useRef(false);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ symbol?: string; time: number | null; price: number | null }>).detail;
      if (!detail || detail.symbol !== symbol) return;
      const chart = chartRef.current;
      const series = priceSeriesRef.current;
      if (!chart || !series) return;
      applyingSyncRef.current = true;
      try {
        if (detail.time == null || !data?.candles?.length) {
          chart.clearCrosshairPosition();
          return;
        }
        const candles = data.candles;
        let best = candles[0] as Candle;
        let bestDist = Math.abs((best.time as number) - detail.time);
        for (let i = 1; i < candles.length; i++) {
          const c = candles[i] as Candle;
          const d = Math.abs((c.time as number) - detail.time);
          if (d < bestDist) { best = c; bestDist = d; }
          if ((c.time as number) > detail.time) break;
        }
        const priceForLine = detail.price ?? best.close;
        chart.setCrosshairPosition(priceForLine, best.time as Time, series);
      } finally {
        setTimeout(() => { applyingSyncRef.current = false; }, 0);
      }
    };
    window.addEventListener(CROSSHAIR_SYNC_EVENT, handler);
    return () => window.removeEventListener(CROSSHAIR_SYNC_EVENT, handler);
  }, [symbol, data]);



  // Track modifier keys for snap-to-OHLC (Ctrl/Cmd) and shift-drag measure.
  const modKeysRef = useRef({ ctrl: false, shift: false });

  // Click handler for tool placement
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const onClick = (param: MouseEventParams) => {
      if (tool === "none") return;
      if (!param.point) return;
      const series = priceSeriesRef.current;
      if (!series) return;
      const priceRaw = series.coordinateToPrice(param.point.y);
      if (priceRaw == null) return;
      let price = priceRaw as number;
      const time = (param.time as number | undefined) ?? null;

      if (tool === "hline") {
        // Ctrl/Cmd-click → snap to nearest OHLC of the bar under cursor.
        if ((modKeysRef.current.ctrl || magnetRef.current) && time != null && data?.candles) {
          const bar = data.candles.find((c) => c.time === time);
          if (bar) {
            const candidates: Array<{ v: number; label: string }> = [
              { v: bar.open, label: "O" },
              { v: bar.high, label: "H" },
              { v: bar.low, label: "L" },
              { v: bar.close, label: "C" },
            ];
            let best = candidates[0];
            let bestDist = Math.abs(candidates[0].v - price);
            for (let i = 1; i < candidates.length; i++) {
              const d = Math.abs(candidates[i].v - price);
              if (d < bestDist) { best = candidates[i]; bestDist = d; }
            }
            price = best.v;
          }
        }
        setPendingHline({ price });
        setNoteDraft("");
        setTool("none");
        return;
      }
      if (tool === "avwap") {
        if (time == null) return;
        if (onIndicatorsChange) {
          const newAnchor: AnchoredVwap = { id: cryptoId(), time };
          const existing = cfg.anchoredVwaps ?? [];
          onIndicatorsChange({ ...cfg, anchoredVwaps: [...existing, newAnchor] });
        }
        setTool("none");
        return;
      }
      // tline + measure both need two clicks
      if (time == null) return;
      if (!pending) {
        setPending({ t: time, p: price });
        return;
      }
      if (tool === "tline") {
        addDrawing({ id: cryptoId(), type: "tline", t1: pending.t, p1: pending.p, t2: time, p2: price, color: DRAW_COLOR });
      }
      // measure is ephemeral — just clear pending; user sees result then leaves tool
      endTool();
    };
    chart.subscribeClick(onClick);
    return () => {
      try { chart.unsubscribeClick(onClick); } catch {}
    };
  }, [tool, pending, cfg, onIndicatorsChange, data]);

  // Keyboard shortcuts: Esc cancels, Shift+H = hline, Shift+S = trend line,
  // Shift held + drag on chart = measure. Also tracks Ctrl/Cmd for snap.
  // Use a ref for hover so the listener doesn't need to be re-bound on every
  // crosshair move (binding lag was letting the chart start panning before
  // we could intercept the mousedown).
  const hoverRef = useRef(hover);
  useEffect(() => { hoverRef.current = hover; }, [hover]);

  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) return;

    const isTyping = () => {
      const a = document.activeElement as HTMLElement | null;
      if (!a) return false;
      const tag = a.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || a.isContentEditable;
    };

    let scrollDisabled = false;
    const setScroll = (enabled: boolean) => {
      try {
        chart.applyOptions({
          handleScroll: enabled,
          handleScale: enabled
            ? { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
            : { axisPressedMouseMove: false, mouseWheel: true, pinch: true },
        });
      } catch {}
      scrollDisabled = !enabled;
    };

    // Pre-emptively disable chart panning the instant Shift is pressed, so
    // the chart can't grab the first pixels of drag before we hand control
    // over to the measure tool.
    const onKey = (e: KeyboardEvent) => {
      modKeysRef.current.ctrl = e.ctrlKey || e.metaKey;
      modKeysRef.current.shift = e.shiftKey;
      if (isTyping()) return;
      if (e.key === "Escape") {
        if (scrollDisabled) setScroll(true);
        setPending(null);
        setTool("none");
        setSelectedDrawingId(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        const prev = undoStackRef.current.pop();
        if (prev) {
          e.preventDefault();
          setDrawings(prev);
          setSelectedDrawingId(null);
        }
        return;
      }
      const selectedId = selectedDrawingIdRef.current;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteOne(selectedId);
        setSelectedDrawingId(null);
        return;
      }
      if (e.key === "Shift" && !scrollDisabled) {
        setScroll(false);
        return;
      }
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "h") { e.preventDefault(); setTool("hline"); setPending(null); }
        else if (k === "s") { e.preventDefault(); setTool("tline"); setPending(null); }
        else if (k === "r") { e.preventDefault(); setTool("rect"); setPending(null); }
        else if (k === "m") { e.preventDefault(); setMagnet((v) => !v); }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      modKeysRef.current.ctrl = e.ctrlKey || e.metaKey;
      modKeysRef.current.shift = e.shiftKey;
      if (e.key === "Shift") {
        if (scrollDisabled) setScroll(true);
        // If a measurement was in progress but not yet finished, clear it.
        setPending(null);
        setTool((t) => (t === "measure" ? "none" : t));
      }
    };

    // Capture-phase mousedown — runs before lightweight-charts' internal
    // pan handler, so we can always claim a Shift+drag for measurement.
    const onDown = (e: MouseEvent) => {
      if (!e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (!scrollDisabled) setScroll(false);
      setTool("measure");
      const h = hoverRef.current;
      if (h && h.t != null && h.p != null) {
        setPending({ t: h.t, p: h.p });
      }
    };
    const onUp = (e: MouseEvent) => {
      // Finish the measurement on release (preview already shows Δ/%/bars).
      // Leave scroll disabled if Shift is still held — keyup will restore it.
      if (!e.shiftKey && scrollDisabled) setScroll(true);
      setPending(null);
      setTool((t) => (t === "measure" ? "none" : t));
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    el.addEventListener("mousedown", onDown, true); // capture
    window.addEventListener("mouseup", onUp);
    // If the window loses focus while Shift is down, restore panning.
    const onBlur = () => { if (scrollDisabled) setScroll(true); };
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      el.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onBlur);
      if (scrollDisabled) setScroll(true);
    };
  }, []);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const clearAll = () => {
    if (!drawings.length) return;
    setConfirmClearOpen(true);
  };
  const deleteOne = (id: string) => { pushUndo(); setDrawings((arr) => arr.filter((d) => d.id !== id)); };

  const chartScrollRef = useRef(true);
  const setChartDragScroll = useCallback((enabled: boolean) => {
    const chartApi = chartRef.current;
    if (!chartApi || chartScrollRef.current === enabled) return;
    try {
      chartApi.applyOptions({
        handleScroll: enabled,
        handleScale: enabled
          ? { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
          : { axisPressedMouseMove: false, mouseWheel: true, pinch: true },
      });
      chartScrollRef.current = enabled;
    } catch {
      // Chart may be disposed while a drag is ending.
    }
  }, []);

  // Disable chart pan/scroll whenever a drawing tool is active so taps
  // (especially on touch devices) land on the tool rather than dragging the
  // chart. Bypasses the setChartDragScroll ref guard because the shift-drag
  // measure handler mutates chart options directly and can leave the ref stale.
  useEffect(() => {
    const chartApi = chartRef.current;
    if (!chartApi) return;
    const active = tool !== "none";
    try {
      chartApi.applyOptions({
        handleScroll: !active,
        handleScale: !active
          ? { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
          : { axisPressedMouseMove: false, mouseWheel: true, pinch: true },
      });
      chartScrollRef.current = !active;
    } catch {
      // Chart may be disposed mid-toggle.
    }
    return () => {
      try {
        chartApi.applyOptions({
          handleScroll: true,
          handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        });
        chartScrollRef.current = true;
      } catch {
        // ignore
      }
    };
  }, [tool]);

  const startDrawingDrag = useCallback((e: React.PointerEvent, id: string, mode: "hline" | "tline-body" | "tline-p1" | "tline-p2" | "rect-body" | "rect-p1" | "rect-p2") => {
    if (e.button !== 0) return;
    const startDrawing = drawingsRef.current.find((d) => d.id === id);
    if (!startDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pushUndo();
    setTool("none");
    setPending(null);
    setSelectedDrawingId(id);
    setChartDragScroll(false);
    dragRef.current = { id, mode, startX: e.clientX, startY: e.clientY, startDrawing };
  }, [setChartDragScroll, pushUndo]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const chartApi = chartRef.current;
      const seriesApi = priceSeriesRef.current;
      const container = containerRef.current;
      if (!drag || !chartApi || !seriesApi || !container) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const price = seriesApi.coordinateToPrice(y);
      if (price == null) return;

      setDrawings((arr) => arr.map((d) => {
        if (d.id !== drag.id) return d;
        const start = drag.startDrawing;
        if (drag.mode === "hline" && start.type === "hline") {
          return { ...start, price: price as number };
        }
        if (start.type !== "tline" && start.type !== "rect") return d;
        const point = pointFromPointer(e, container, chartApi, seriesApi, data?.candles as Candle[] | undefined);
        if (drag.mode === "tline-p1" || drag.mode === "rect-p1") return { ...start, p1: price as number, t1: point?.t ?? start.t1 };
        if (drag.mode === "tline-p2" || drag.mode === "rect-p2") return { ...start, p2: price as number, t2: point?.t ?? start.t2 };

        const startY1 = seriesApi.priceToCoordinate(start.p1);
        const startY2 = seriesApi.priceToCoordinate(start.p2);
        const dy = e.clientY - drag.startY;
        const nextP1 = startY1 == null ? start.p1 : seriesApi.coordinateToPrice(startY1 + dy) ?? start.p1;
        const nextP2 = startY2 == null ? start.p2 : seriesApi.coordinateToPrice(startY2 + dy) ?? start.p2;
        const startX1 = chartApi.timeScale().timeToCoordinate(start.t1 as Time);
        const startX2 = chartApi.timeScale().timeToCoordinate(start.t2 as Time);
        const dx = e.clientX - drag.startX;
        const nextPoint1 = startX1 == null ? null : pointFromPointer({ clientX: rect.left + startX1 + dx, clientY: e.clientY }, container, chartApi, seriesApi, data?.candles as Candle[] | undefined);
        const nextPoint2 = startX2 == null ? null : pointFromPointer({ clientX: rect.left + startX2 + dx, clientY: e.clientY }, container, chartApi, seriesApi, data?.candles as Candle[] | undefined);
        const nextT1 = nextPoint1?.t ?? start.t1;
        const nextT2 = nextPoint2?.t ?? start.t2;
        return { ...start, p1: nextP1 as number, p2: nextP2 as number, t1: nextT1, t2: nextT2 };
      }));
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setChartDragScroll(true);
      forceRender((n) => n + 1);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [setChartDragScroll]);

  // === Render coords ========================================================

  const chart = chartRef.current;
  const series = priceSeriesRef.current;
  const getChartApi = useCallback(() => chartRef.current, []);
  const getPriceSeries = useCallback(() => priceSeriesRef.current, []);
  const containerW = containerRef.current?.clientWidth ?? 0;
  const containerH = containerRef.current?.clientHeight ?? 0;

  const xOf = (t: number) => xForDrawingTime(chart ?? null, data?.candles as Candle[] | undefined, t);
  const yOf = (p: number) => series?.priceToCoordinate(p) ?? null;

  // Measure preview (live while hovering after first click in measure mode)
  let measurePreview: null | {
    x1: number; y1: number; x2: number; y2: number; dp: number; pct: number; bars: number; up: boolean;
  } = null;
  if (tool === "measure" && pending && hover && hover.t != null && hover.p != null) {
    const x1 = xOf(pending.t);
    const y1 = yOf(pending.p);
    const x2 = xOf(hover.t);
    const y2 = yOf(hover.p);
    if (x1 != null && y1 != null && x2 != null && y2 != null) {
      const dp = hover.p - pending.p;
      const pct = pending.p !== 0 ? (dp / pending.p) * 100 : 0;
      const bars = estimateBars(data?.candles, pending.t, hover.t);
      measurePreview = { x1, y1, x2, y2, dp, pct, bars, up: dp >= 0 };
    }
  }

  // Trend line preview (after first click in tline mode)
  let tlinePreview: null | { x1: number; y1: number; x2: number; y2: number } = null;
  if (tool === "tline" && pending && hover && hover.t != null && hover.p != null) {
    const x1 = xOf(pending.t);
    const y1 = yOf(pending.p);
    const x2 = xOf(hover.t);
    const y2 = yOf(hover.p);
    if (x1 != null && y1 != null && x2 != null && y2 != null) {
      tlinePreview = { x1, y1, x2, y2 };
    }
  }


  // Rectangle / zone preview (after first click or while dragging in rect mode)
  let rectPreview: null | { x: number; y: number; w: number; h: number } = null;
  if (tool === "rect" && pending && hover && hover.t != null && hover.p != null) {
    const x1 = xOf(pending.t);
    const y1 = yOf(pending.p);
    const x2 = xOf(hover.t);
    const y2 = yOf(hover.p);
    if (x1 != null && y1 != null && x2 != null && y2 != null) {
      rectPreview = {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
      };
    }
  }


  const swingPivots = chart_cfg.showSwingLabels
    ? findSwingPivots(
        (data?.candles ?? []) as Candle[],
        chart_cfg.swingStrength ?? 5,
        chart_cfg.swingMaxLabels ?? 10,
      )
    : [];

  const overlayActive = tool !== "none";

  return (
    <div className="relative h-full w-full min-w-0 overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />

      {chart_cfg.showVolumeProfile && (
        <VolumeProfileOverlay
          getChart={getChartApi}
          getSeries={getPriceSeries}
          candles={data?.candles as VpCandle[] | undefined}
          bins={chart_cfg.vpBins ?? 40}
          widthPct={chart_cfg.vpWidthPct ?? 18}
          color={chart_cfg.vpColor ?? "#94a3b8"}
          pocColor={chart_cfg.vpPocColor ?? "#06b6d4"}
          opacity={chart_cfg.vpOpacity ?? 0.45}
        />
      )}

      {overlayEnabled && (() => {
        const benchLabel = (() => {
          const s = chart_cfg.rsSymbol.replace(/^\^/, "");
          const map: Record<string, string> = { CRSLDX: "CNX500", NSEI: "NIFTY50", NSEBANK: "BANKNIFTY", BSESN: "SENSEX" };
          return map[s] ?? s;
        })();
        return (
          <div className="pointer-events-none absolute left-1/2 top-1 z-10 flex -translate-x-1/2 items-center gap-1.5 text-[10px] font-normal leading-none">
            <span style={{ color: chart_cfg.rsOverlayColor }}>{benchLabel}</span>
            {chart_cfg.rsCompareMode === "compare" && (
              <span style={{ color: chart_cfg.rsStockColor }}>{symbol}</span>
            )}
          </div>
        );
      })()}

      {fundamentalsEnabled && fundamentals && (
        <div className="pointer-events-none absolute right-16 top-1 z-10 flex flex-col items-end gap-0.5 text-[10px] leading-none">
          {chart_cfg.showRsRatingLabel && fundamentals.rs != null && (
            <span className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-sky-300 backdrop-blur">
              RS Rating <span className="font-semibold">{Math.round(fundamentals.rs)}</span>
            </span>
          )}
          {chart_cfg.showEpsLabel && (fundamentals.epsQoq != null || fundamentals.epsYoy != null) && (
            <span
              className="rounded border px-1.5 py-0.5 backdrop-blur"
              style={{
                borderColor: (fundamentals.epsQoq ?? fundamentals.epsYoy ?? 0) >= 0 ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)",
                backgroundColor: (fundamentals.epsQoq ?? fundamentals.epsYoy ?? 0) >= 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                color: (fundamentals.epsQoq ?? fundamentals.epsYoy ?? 0) >= 0 ? "#86efac" : "#fca5a5",
              }}
            >
              EPS{" "}
              {fundamentals.epsQoq != null && (
                <span className="font-semibold">
                  {fundamentals.epsQoq >= 0 ? "+" : ""}
                  {fundamentals.epsQoq.toFixed(0)}% QoQ
                </span>
              )}
              {fundamentals.epsQoq != null && fundamentals.epsYoy != null && " · "}
              {fundamentals.epsYoy != null && (
                <span className="font-semibold">
                  {fundamentals.epsYoy >= 0 ? "+" : ""}
                  {fundamentals.epsYoy.toFixed(0)}% YoY
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {chart_cfg.showVolume && chart_cfg.volumeStyle === "v2" && volStats && (
        <div className="pointer-events-none absolute z-10 flex flex-wrap items-center justify-end gap-1 text-[10px] leading-none" style={{ top: "calc(82% - 18px)", right: "60px" }}>
          {chart_cfg.volumeV2.showAvgRupeeVol && (
            <span
              className="rounded border px-1.5 py-0.5 backdrop-blur"
              style={{
                borderColor: "rgba(34,197,94,0.45)",
                backgroundColor: "rgba(34,197,94,0.12)",
                color: "#86efac",
              }}
            >
              Avg ₹Vol <span className="font-semibold">{formatCrLakh(volStats.avgRupeeVol)}</span>
            </span>
          )}
          {chart_cfg.volumeV2.showRVol && volStats.rvolPct != null && (
            <span
              className="rounded border px-1.5 py-0.5 backdrop-blur"
              style={{
                borderColor: volStats.rvolPct >= 100 ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)",
                backgroundColor: volStats.rvolPct >= 100 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                color: volStats.rvolPct >= 100 ? "#86efac" : "#fca5a5",
              }}
            >
              RVol <span className="font-semibold">{volStats.rvolPct.toFixed(0)}%</span>
            </span>
          )}
          {chart_cfg.volumeV2.showOneMinLiq && (
            <span
              className="rounded border px-1.5 py-0.5 backdrop-blur"
              style={{
                borderColor: "rgba(56,189,248,0.45)",
                backgroundColor: "rgba(56,189,248,0.12)",
                color: "#7dd3fc",
              }}
            >
              1mL <span className="font-semibold">{volStats.oneMinL >= 1 ? `${volStats.oneMinL.toFixed(volStats.oneMinL >= 10 ? 0 : 1)} L` : `${(volStats.oneMinL * 100).toFixed(0)} k`}</span>
            </span>
          )}
        </div>
      )}


      {/* Drawing tools toolbar */}
      <div className="absolute left-2 top-2 z-10 flex items-center gap-0.5 rounded-md border border-border bg-card/85 p-0.5 backdrop-blur">
        <ToolBtn active={tool === "none"} onClick={() => { setTool("none"); setPending(null); }} title="Cursor (Esc)">
          <MousePointer2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={tool === "hline"} onClick={() => { setTool("hline"); setPending(null); }} title="Horizontal line + note (Shift+H) · Ctrl/⌘+click snaps to OHLC">
          <Minus className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={tool === "tline"} onClick={() => { setTool("tline"); setPending(null); }} title="Trend line — click-drag or 2 clicks (Shift+S)">
          <TrendingUp className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={tool === "rect"} onClick={() => { setTool("rect"); setPending(null); }} title="Rectangle / zone — click-drag (Shift+R)">
          <Square className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={tool === "measure"} onClick={() => { setTool("measure"); setPending(null); }} title="Measure: Δ price, %, bars (2 clicks · or hold Shift and drag)">
          <Ruler className="h-3.5 w-3.5" />
        </ToolBtn>
        {onIndicatorsChange && (
          <ToolBtn active={tool === "avwap"} onClick={() => { setTool("avwap"); setPending(null); }} title="Anchored VWAP — click a bar to anchor">
            <AnchorIcon className="h-3.5 w-3.5" />
          </ToolBtn>
        )}
        <ToolBtn active={tool === "pen"} onClick={() => { setTool("pen"); setPending(null); }} title="Free-hand pen — click and drag to sketch">
          <Highlighter className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={tool === "text"} onClick={() => { setTool("text"); setPending(null); }} title="Text annotation — click on chart to place">
          <TypeIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        <div className="mx-0.5 h-4 w-px bg-border" />
        <ToolBtn active={magnet} onClick={() => setMagnet((v) => !v)} title="Magnet — snap points to bar open/high/low/close (Shift+M)">
          <Magnet className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn active={lockTool} onClick={() => setLockTool((v) => !v)} title="Stay in drawing mode — keep the tool active after each drawing">
          <Lock className="h-3.5 w-3.5" />
        </ToolBtn>
        <div className="mx-0.5 h-4 w-px bg-border" />
        <ToolBtn onClick={clearAll} disabled={drawings.length === 0} title="Clear all drawings">
          <Trash2 className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>

      {tool !== "none" && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border border-border bg-card/90 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
          {tool === "hline" && "Click to place horizontal line · Ctrl/⌘+click snaps to bar OHLC"}
          {tool === "tline" && (pending ? "Click or release to set second point" : "Click or click-drag to draw trend line")}
          {tool === "rect" && (pending ? "Click or release to finish the box" : "Click-drag to draw a zone / box")}
          {tool === "measure" && (pending ? "Click or release to finish measure" : "Click or click-drag to measure")}
          {tool === "avwap" && "Click a candle to anchor VWAP from that bar"}
          {tool === "pen" && "Click and drag to sketch · release to save · stays saved per symbol"}
          {tool === "text" && "Click on the chart to add a text note"}
          {magnet ? " · Magnet on" : ""}
          {" · Ctrl+Z undo · Esc to cancel"}
        </div>
      )}

      {/* Free-drag capture layer for trend line, rectangle + measure — click OR drag anywhere on the plot */}
      {(tool === "tline" || tool === "measure" || tool === "rect") && (
        <div
          className="absolute inset-0 z-30 cursor-crosshair"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType === "mouse") return;
            const chartApi = chartRef.current;
            const seriesApi = priceSeriesRef.current;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            const raw = pointFromPointer(e, e.currentTarget as HTMLElement, chartApi, seriesApi, data?.candles as Candle[] | undefined);
            if (!raw) return;
            const point = snapChartPoint(raw, data?.candles as Candle[] | undefined, magnet && tool !== "measure");
            if (pending) {
              // Second click of a click-click flow → finish the drawing.
              if (tool === "tline") {
                addDrawing({ id: cryptoId(), type: "tline", t1: pending.t, p1: pending.p, t2: point.t, p2: point.p, color: DRAW_COLOR });
              } else if (tool === "rect") {
                addDrawing({ id: cryptoId(), type: "rect", t1: pending.t, p1: pending.p, t2: point.t, p2: point.p, color: DRAW_COLOR });
              }
              (e.currentTarget as HTMLElement).dataset.startx = "";
              (e.currentTarget as HTMLElement).dataset.starty = "";
              endTool();
              return;
            }
            (e.currentTarget as HTMLElement).dataset.startx = String(e.clientX);
            (e.currentTarget as HTMLElement).dataset.starty = String(e.clientY);
            setPending({ t: point.t, p: point.p });
            setHover({ x: point.x, y: point.y, t: point.t, p: point.p });

          }}
          onPointerMove={(e) => {
            const chartApi = chartRef.current;
            const seriesApi = priceSeriesRef.current;
            const raw = pointFromPointer(e, e.currentTarget as HTMLElement, chartApi, seriesApi, data?.candles as Candle[] | undefined);
            if (!raw) return;
            const point = snapChartPoint(raw, data?.candles as Candle[] | undefined, magnet && tool !== "measure");
            setHover({ x: point.x, y: point.y, t: point.t, p: point.p });
          }}
          onPointerUp={(e) => {
            const el = e.currentTarget as HTMLElement;
            const sx = Number(el.dataset.startx ?? NaN);
            const sy = Number(el.dataset.starty ?? NaN);
            const moved = Number.isFinite(sx) && Number.isFinite(sy)
              ? Math.hypot(e.clientX - sx, e.clientY - sy)
              : 0;
            el.dataset.startx = "";
            el.dataset.starty = "";
            if (moved < 5) return; // treat as click → keep pending for 2nd-click flow
            const chartApi = chartRef.current;
            const seriesApi = priceSeriesRef.current;
            if (!pending) return;
            const raw = pointFromPointer(e, el, chartApi, seriesApi, data?.candles as Candle[] | undefined);
            if (!raw) return;
            const point = snapChartPoint(raw, data?.candles as Candle[] | undefined, magnet && tool !== "measure");
            if (tool === "tline") {
              addDrawing({ id: cryptoId(), type: "tline", t1: pending.t, p1: pending.p, t2: point.t, p2: point.p, color: DRAW_COLOR });
            } else if (tool === "rect") {
              addDrawing({ id: cryptoId(), type: "rect", t1: pending.t, p1: pending.p, t2: point.t, p2: point.p, color: DRAW_COLOR });
            }
            endTool();
          }}
        />
      )}

      {/* Pen / text capture layer */}
      {(tool === "pen" || tool === "text") && (
        <div
          className="absolute inset-0 z-30 cursor-crosshair"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType === "mouse") return;
            const chartApi = chartRef.current;
            const seriesApi = priceSeriesRef.current;
            const point = pointFromPointer(e, e.currentTarget as HTMLElement, chartApi, seriesApi, data?.candles as Candle[] | undefined);
            if (!point) return;
            if (tool === "text") {
              setTextDraft("");
              setTextDialog({ mode: "note", t: point.t, p: point.p });
              setTool("none");
              return;
            }
            // pen: start capturing
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            const initial = [{ t: point.t, p: point.p }];
            penDraftRef.current = initial;
            setPenDraft(initial);
          }}
          onPointerMove={(e) => {
            if (tool !== "pen" || !penDraftRef.current) return;
            const chartApi = chartRef.current;
            const seriesApi = priceSeriesRef.current;
            const point = pointFromPointer(e, e.currentTarget as HTMLElement, chartApi, seriesApi, data?.candles as Candle[] | undefined);
            if (!point) return;
            const next = [...penDraftRef.current, { t: point.t, p: point.p }];
            penDraftRef.current = next;
            setPenDraft(next);
          }}
          onPointerUp={() => {
            if (tool !== "pen") return;
            const pts = penDraftRef.current;
            penDraftRef.current = null;
            setPenDraft(null);
            if (pts && pts.length > 1) {
              setDrawings((arr) => [...arr, { id: cryptoId(), type: "pen", points: pts, color: DRAW_COLOR }]);
            }
          }}
          onPointerCancel={() => { penDraftRef.current = null; setPenDraft(null); }}
        />
      )}


      {/* SVG overlay — chart stays pannable, only delete controls receive pointer events */}
      <svg
        className={`pointer-events-none absolute inset-0 z-20 ${overlayActive ? "cursor-crosshair" : ""}`}
        width={containerW}
        height={containerH}
        style={{ overflow: "visible" }}
      >
        {/* RS region fill removed for a cleaner look */}

        {/* Swing high / low price labels (IBD-style) */}
        {swingPivots.map((p) => {
          const x = xOf(p.time);
          const y = yOf(p.price);
          if (x == null || y == null) return null;
          const isHigh = p.kind === "high";
          const label = p.price >= 1000 ? p.price.toFixed(0) : p.price.toFixed(2);
          const w = label.length * 6 + 8;
          return (
            <g key={`swing-${p.kind}-${p.time}`} transform={`translate(${x}, ${isHigh ? y - 16 : y + 6})`}>
              <rect x={-w / 2} y={0} width={w} height={13} rx={2} fill="rgba(15,23,42,0.75)" />
              <text
                x={0}
                y={10}
                fontSize={10}
                textAnchor="middle"
                fill={isHigh ? "#86efac" : "#fca5a5"}
                fontFamily="ui-sans-serif, system-ui"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* AVWAP anchor markers (thin vertical line + remove button) */}
        {(cfg.anchoredVwaps ?? []).map((a) => {
          const x = xOf(a.time);
          if (x == null) return null;
          const st = resolveStyle(cfg, `avwap:${a.id}`);
          return (
            <g key={`avwap-${a.id}`}>
              <line x1={x} x2={x} y1={0} y2={containerH} stroke={st.color} strokeWidth={1} strokeDasharray="2 4" opacity={0.5} />
              {onIndicatorsChange && (
                <g
                  className="pointer-events-auto cursor-pointer"
                  transform={`translate(${x - 8}, 4)`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onIndicatorsChange({
                      ...cfg,
                      anchoredVwaps: (cfg.anchoredVwaps ?? []).filter((x) => x.id !== a.id),
                    });
                  }}
                >
                  <rect width={16} height={16} rx={3} fill="rgba(15,23,42,0.9)" stroke={st.color} strokeWidth={0.75} />
                  <text x={8} y={12} fontSize={10} fill={st.color} textAnchor="middle" fontWeight={600}>⚓</text>
                </g>
              )}
            </g>
          );
        })}


        {/* Persisted horizontal lines */}
        {drawings.filter((d): d is HLine => d.type === "hline").map((d) => {
          const y = yOf(d.price);
          if (y == null) return null;
          const selected = selectedDrawingId === d.id;
          return (
            <g key={d.id}>
              <line
                className="pointer-events-auto cursor-ns-resize"
                x1={0}
                x2={containerW}
                y1={y}
                y2={y}
                stroke="transparent"
                strokeWidth={14}
                onPointerDown={(e) => startDrawingDrag(e, d.id, "hline")}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedDrawingId(d.id); }}
              />
              <line x1={0} x2={containerW} y1={y} y2={y} stroke={d.color} strokeWidth={selected ? 1.75 : 1} strokeDasharray="4 3" />
            </g>
          );
        })}

        {/* Persisted trend lines */}
        {drawings.filter((d): d is TLine => d.type === "tline").map((d) => {
          const x1 = xOf(d.t1);
          const y1 = yOf(d.p1);
          const x2 = xOf(d.t2);
          const y2 = yOf(d.p2);
          if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
          const selected = selectedDrawingId === d.id;
          return (
            <g key={d.id}>
              <line
                className="pointer-events-auto cursor-move"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth={14}
                onPointerDown={(e) => startDrawingDrag(e, d.id, "tline-body")}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedDrawingId(d.id); }}
              />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color} strokeWidth={selected ? 2 : 1.5} />
              <circle className="pointer-events-auto cursor-move" cx={x1} cy={y1} r={selected ? 4 : 3} fill={d.color} onPointerDown={(e) => startDrawingDrag(e, d.id, "tline-p1")} />
              <circle className="pointer-events-auto cursor-move" cx={x2} cy={y2} r={selected ? 4 : 3} fill={d.color} onPointerDown={(e) => startDrawingDrag(e, d.id, "tline-p2")} />
              <g
                className="pointer-events-auto cursor-pointer"
                transform={`translate(${(x1 + x2) / 2 - 9}, ${(y1 + y2) / 2 - 9})`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteOne(d.id); }}
              >
                <rect x={-8} y={-8} width={34} height={34} rx={5} fill="transparent" />
                <rect width={18} height={18} rx={3} fill="rgba(15,23,42,0.9)" stroke={d.color} strokeWidth={0.75}/>
                <text x={9} y={13} fontSize={11} fill={d.color} textAnchor="middle" fontWeight={600}>×</text>
              </g>
            </g>
          );
        })}

        {/* Persisted rectangles / zones */}
        {drawings.filter((d): d is RectBox => d.type === "rect").map((d) => {
          const x1 = xOf(d.t1);
          const y1 = yOf(d.p1);
          const x2 = xOf(d.t2);
          const y2 = yOf(d.p2);
          if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
          const x = Math.min(x1, x2);
          const y = Math.min(y1, y2);
          const w = Math.abs(x2 - x1);
          const h = Math.abs(y2 - y1);
          const selected = selectedDrawingId === d.id;
          return (
            <g key={d.id}>
              <rect
                className="pointer-events-auto cursor-move"
                x={x} y={y} width={w} height={h}
                fill={hexToRgba(d.color, 0.12)}
                stroke={d.color}
                strokeWidth={selected ? 2 : 1.25}
                onPointerDown={(e) => startDrawingDrag(e, d.id, "rect-body")}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedDrawingId(d.id); }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedDrawingId(d.id);
                  setTextDraft(d.label ?? "");
                  setTextDialog({ mode: "box", id: d.id });
                }}
              />
              {d.label ? (
                <g className="pointer-events-none select-none">
                  <rect
                    x={x + 3}
                    y={y + 3}
                    width={Math.max(18, d.label.length * 6.2 + 10)}
                    height={17}
                    rx={3}
                    fill={hexToRgba(d.color, 0.9)}
                  />
                  <text
                    x={x + 8}
                    y={y + 15}
                    fontSize={11}
                    fontWeight={600}
                    fill="#ffffff"
                    fontFamily="ui-sans-serif, system-ui"
                  >
                    {d.label}
                  </text>
                </g>
              ) : null}
              <circle className="pointer-events-auto cursor-nwse-resize" cx={x1} cy={y1} r={selected ? 4 : 3} fill={d.color} onPointerDown={(e) => startDrawingDrag(e, d.id, "rect-p1")} />
              <circle className="pointer-events-auto cursor-nwse-resize" cx={x2} cy={y2} r={selected ? 4 : 3} fill={d.color} onPointerDown={(e) => startDrawingDrag(e, d.id, "rect-p2")} />
              {selected && (
                <g
                  className="pointer-events-auto cursor-pointer"
                  transform={`translate(${x + w - 55}, ${y - 20})`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDrawings((arr) => arr.map((it) => (it.id === d.id && it.type === "rect" ? { ...it, color: nextBoxColor(it.color) } : it)));
                  }}
                >
                  <title>Cycle colour (green / blue / red)</title>
                  <rect width={18} height={18} rx={3} fill="rgba(15,23,42,0.9)" stroke={d.color} strokeWidth={0.75} />
                  <circle cx={9} cy={9} r={5} fill={d.color} />
                </g>
              )}

              {selected && (
                <g
                  className="pointer-events-auto cursor-pointer"
                  transform={`translate(${x + w - 32}, ${y - 20})`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTextDraft(d.label ?? "");
                    setTextDialog({ mode: "box", id: d.id });
                  }}
                >
                  <rect width={18} height={18} rx={3} fill="rgba(15,23,42,0.9)" stroke={d.color} strokeWidth={0.75} />
                  <text x={9} y={13} fontSize={10} fill={d.color} textAnchor="middle" fontWeight={600}>T</text>
                </g>
              )}

              {selected && (
                <g
                  className="pointer-events-auto cursor-pointer"
                  transform={`translate(${x + w - 9}, ${y - 20})`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteOne(d.id); }}
                >
                  <rect width={18} height={18} rx={3} fill="rgba(15,23,42,0.9)" stroke={d.color} strokeWidth={0.75} />
                  <text x={9} y={13} fontSize={11} fill={d.color} textAnchor="middle" fontWeight={600}>×</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Rectangle preview */}
        {rectPreview && (
          <rect
            x={rectPreview.x} y={rectPreview.y}
            width={rectPreview.w} height={rectPreview.h}
            fill={hexToRgba(DRAW_COLOR, 0.1)}
            stroke={DRAW_COLOR} strokeWidth={1} strokeDasharray="3 3"
          />
        )}

        {/* Trend line preview */}

        {tlinePreview && (
          <line
            x1={tlinePreview.x1} y1={tlinePreview.y1}
            x2={tlinePreview.x2} y2={tlinePreview.y2}
            stroke={DRAW_COLOR} strokeWidth={1.5} strokeDasharray="3 3"
          />
        )}
        {tool === "tline" && pending && (() => {
          const x = xOf(pending.t); const y = yOf(pending.p);
          return x != null && y != null ? <circle cx={x} cy={y} r={3} fill={DRAW_COLOR} /> : null;
        })()}

        {/* Measure preview */}
        {measurePreview && (
          <g>
            <rect
              x={Math.min(measurePreview.x1, measurePreview.x2)}
              y={Math.min(measurePreview.y1, measurePreview.y2)}
              width={Math.abs(measurePreview.x2 - measurePreview.x1)}
              height={Math.abs(measurePreview.y2 - measurePreview.y1)}
              fill={hexToRgba(measurePreview.up ? MEASURE_UP : MEASURE_DOWN, 0.12)}
              stroke={measurePreview.up ? MEASURE_UP : MEASURE_DOWN}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <g transform={`translate(${(measurePreview.x1 + measurePreview.x2) / 2}, ${Math.min(measurePreview.y1, measurePreview.y2) - 8})`}>
              <rect x={-70} y={-12} width={140} height={28} rx={3}
                fill="rgba(15,23,42,0.92)"
                stroke={measurePreview.up ? MEASURE_UP : MEASURE_DOWN} strokeWidth={0.75}/>
              <text x={0} y={0} fontSize={10} textAnchor="middle"
                fill={measurePreview.up ? MEASURE_UP : MEASURE_DOWN}
                fontFamily="ui-sans-serif, system-ui">
                {(measurePreview.dp >= 0 ? "+" : "") + measurePreview.dp.toFixed(2)}
                {"  ("}{(measurePreview.pct >= 0 ? "+" : "") + measurePreview.pct.toFixed(2)}%)
              </text>
              <text x={0} y={12} fontSize={9} textAnchor="middle"
                fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
                {measurePreview.bars} bars
              </text>
            </g>
          </g>
        )}
        {tool === "measure" && pending && (() => {
          const x = xOf(pending.t); const y = yOf(pending.p);
          return x != null && y != null ? <circle cx={x} cy={y} r={3} fill={MEASURE_UP} /> : null;
        })()}

        {/* Persisted pen strokes */}
        {drawings.filter((d): d is PenStroke => d.type === "pen").map((d) => {
          const pts = d.points
            .map((pt) => { const x = xOf(pt.t); const y = yOf(pt.p); return x != null && y != null ? `${x},${y}` : null; })
            .filter((v): v is string => v != null);
          if (pts.length < 2) return null;
          const selected = selectedDrawingId === d.id;
          return (
            <g key={d.id}>
              <polyline
                className="pointer-events-auto cursor-pointer"
                points={pts.join(" ")}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedDrawingId(d.id); }}
              />
              <polyline
                points={pts.join(" ")}
                fill="none"
                stroke={d.color}
                strokeWidth={selected ? 2.25 : 1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.95}
              />
              {selected && (() => {
                const [fx, fy] = pts[0].split(",").map(Number);
                return (
                  <g
                    className="pointer-events-auto cursor-pointer"
                    transform={`translate(${fx - 9}, ${fy - 20})`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteOne(d.id); }}
                  >
                    <rect width={18} height={18} rx={3} fill="rgba(15,23,42,0.9)" stroke={d.color} strokeWidth={0.75}/>
                    <text x={9} y={13} fontSize={11} fill={d.color} textAnchor="middle" fontWeight={600}>×</text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* Live pen preview */}
        {penDraft && penDraft.length > 1 && (() => {
          const pts = penDraft
            .map((pt) => { const x = xOf(pt.t); const y = yOf(pt.p); return x != null && y != null ? `${x},${y}` : null; })
            .filter((v): v is string => v != null);
          if (pts.length < 2) return null;
          return (
            <polyline
              points={pts.join(" ")}
              fill="none"
              stroke={DRAW_COLOR}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
          );
        })()}
      </svg>

      {/* Persisted text notes */}
      {drawings.filter((d): d is TextNote => d.type === "text").map((d) => {
        const x = xOf(d.t);
        const y = yOf(d.p);
        if (x == null || y == null) return null;
        const selected = selectedDrawingId === d.id;
        return (
          <div
            key={d.id}
            className="pointer-events-auto absolute z-30 flex items-center gap-1"
            style={{ left: x, top: y, transform: "translate(-50%, -110%)" }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedDrawingId(d.id); }}
          >
            <div
              className="max-w-[240px] rounded border bg-card/95 px-1.5 py-0.5 text-[11px] font-medium shadow-sm"
              style={{ borderColor: d.color, color: d.color }}
              title={d.text}
            >
              {d.text}
            </div>
            {selected && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteOne(d.id); }}
                className="flex h-5 w-5 items-center justify-center rounded border border-border bg-card/95 text-[11px] font-semibold text-foreground shadow-sm hover:bg-destructive/20 hover:text-destructive"
                aria-label="Delete text annotation"
                title="Delete text annotation"
              >
                ×
              </button>
            )}
          </div>
        );
      })}


      {drawings.filter((d): d is HLine => d.type === "hline").map((d) => {
        const y = yOf(d.price);
        if (y == null) return null;
        return (
          <NoteLabel
            key={d.id}
            line={d}
            y={y}
            maxWidth={Math.max(96, Math.min(containerW - 72, 360))}
            onDelete={() => deleteOne(d.id)}
            onSelect={() => setSelectedDrawingId(d.id)}
            onDragStart={(e) => startDrawingDrag(e, d.id, "hline")}
          />
        );
      })}

      {drawings.length > 0 && (
        <div className="pointer-events-none absolute bottom-1 left-2 z-10 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Pencil className="h-2.5 w-2.5" /> {drawings.length} drawing{drawings.length === 1 ? "" : "s"}
        </div>
      )}

      <div className="absolute bottom-1 right-2 z-30 flex items-center gap-1">
        <a
          href={tradingViewUrlForSymbol(symbol)}
          target="_blank"
          rel="noreferrer"
          className="flex h-6 w-6 items-center justify-center rounded border border-border bg-card/90 shadow-sm backdrop-blur transition-colors hover:bg-muted"
          title={`Open ${symbol.replace(/\.(NS|BO)$/i, "")} on TradingView`}
          aria-label="Open on TradingView"
        >
          <img
            src="https://static.tradingview.com/static/images/favicon.ico"
            alt="TradingView"
            className="h-3.5 w-3.5 rounded-sm object-contain"
          />
        </a>
        {isIndianEquitySymbol(symbol) && (
          <>
            <a
              href={nseUrlForSymbol(symbol, findSymbol(symbol)?.name)}
              target="_blank"
              rel="noreferrer"
              className="flex h-6 w-6 items-center justify-center rounded border border-border bg-card/90 shadow-sm backdrop-blur transition-colors hover:bg-muted"
              title={`Open ${symbol.replace(/\.(NS|BO)$/i, "")} on NSE India`}
              aria-label="Open on NSE India"
            >
              <img
                src="https://www.nseindia.com/favicon.ico?favicon.8c25df6c.ico"
                alt="NSE India"
                className="h-3.5 w-3.5 object-contain"
              />
            </a>
            <a
              href={screenerUrlForSymbol(symbol)}
              target="_blank"
              rel="noreferrer"
              className="flex h-6 w-6 items-center justify-center rounded border border-border bg-card/90 shadow-sm backdrop-blur transition-colors hover:bg-muted"
              title={`Open ${symbol.replace(/\.(NS|BO)$/i, "")} on Screener`}
              aria-label="Open on Screener"
            >
              <img
                src="https://cdn-static.screener.in/img/logo-black.f44abb4998d1.svg"
                alt="Screener"
                className="h-3.5 w-3.5 object-contain"
              />
            </a>
          </>
        )}
      </div>


      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="flex max-w-xs items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{(error as Error).message || "Failed to load chart"}</span>
          </div>
        </div>
      )}

      <Dialog
        open={pendingHline !== null}
        onOpenChange={(open) => { if (!open) { setPendingHline(null); setNoteDraft(""); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add horizontal line</DialogTitle>
            <DialogDescription>
              {pendingHline ? `Price level: ${pendingHline.price.toFixed(2)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            placeholder="Optional note (e.g. support, resistance, stop-loss)…"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                (e.currentTarget.closest("[role=dialog]")?.querySelector("[data-confirm-hline]") as HTMLButtonElement | null)?.click();
              }
            }}
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPendingHline(null); setNoteDraft(""); }}>
              Cancel
            </Button>
            <Button
              data-confirm-hline
              onClick={() => {
                if (!pendingHline) return;
                const note = noteDraft.trim();
                setDrawings((arr) => [
                  ...arr,
                  { id: cryptoId(), type: "hline", price: pendingHline.price, note: note || undefined, color: DRAW_COLOR },
                ]);
                setPendingHline(null);
                setNoteDraft("");
              }}
            >
              Add line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear all drawings?</DialogTitle>
            <DialogDescription>
              This will remove all {drawings.length} drawing{drawings.length === 1 ? "" : "s"} on this chart. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClearOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { pushUndo(); setDrawings([]); setConfirmClearOpen(false); }}
            >
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={textDialog !== null}
        onOpenChange={(open) => { if (!open) { setTextDialog(null); setTextDraft(""); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{textDialog?.mode === "box" ? "Box label" : "Text annotation"}</DialogTitle>
            <DialogDescription>
              {textDialog?.mode === "box"
                ? "White text on a coloured chip. Words like buy/support turn it green, sell/resistance/stop turn it red."
                : "This note is saved with the chart for this symbol."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            rows={3}
            placeholder={textDialog?.mode === "box" ? "e.g. demand zone, breakout, stop" : "Your note…"}
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.closest("[role=dialog]")?.querySelector("[data-confirm-text]") as HTMLButtonElement | null)?.click();
              }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setTextDialog(null); setTextDraft(""); }}>Cancel</Button>
            <Button
              data-confirm-text
              onClick={() => {
                if (!textDialog) return;
                const clean = textDraft.trim();
                if (textDialog.mode === "box") {
                  const label = clean.slice(0, 120);
                  pushUndo();
                  setDrawings((arr) =>
                    arr.map((it) =>
                      it.id === textDialog.id && it.type === "rect"
                        ? { ...it, label: label || undefined, color: label ? boxColorForLabel(label) : it.color }
                        : it,
                    ),
                  );
                } else if (clean) {
                  pushUndo();
                  setDrawings((arr) => [
                    ...arr,
                    { id: cryptoId(), type: "text", t: textDialog.t, p: textDialog.p, text: clean.slice(0, 200), color: DRAW_COLOR },
                  ]);
                }
                setTextDialog(null);
                setTextDraft("");
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolBtn({
  children, onClick, active, disabled, title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded p-1 transition-colors ${
        active
          ? "bg-primary/20 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      } disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

function NoteLabel({
  line,
  y,
  maxWidth,
  onDelete,
  onSelect,
  onDragStart,
}: {
  line: HLine;
  y: number;
  maxWidth: number;
  onDelete: () => void;
  onSelect: () => void;
  onDragStart: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className="pointer-events-auto absolute left-2 z-30 flex h-[22px] items-center gap-1"
      style={{ top: y - 11, maxWidth }}
      onPointerDown={onDragStart}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(); }}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-card/95 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-destructive/20 hover:text-destructive"
        aria-label="Delete note line"
        title="Delete note line"
      >
        ×
      </button>
      <div
        className="min-w-0 cursor-ns-resize truncate rounded border bg-card/95 px-1.5 py-0.5 text-[10px] shadow-sm"
        style={{ borderColor: line.color, color: line.color }}
        title={`${line.price.toFixed(2)}${line.note ? ` · ${line.note}` : ""}`}
      >
        {line.price.toFixed(2)}{line.note ? ` · ${line.note}` : ""}
      </div>
    </div>
  );
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function estimateBars(candles: Candle[] | undefined, t1: number, t2: number): number {
  if (!candles || candles.length === 0) return 0;
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  let n = 0;
  for (const c of candles) if (c.time >= lo && c.time <= hi) n++;
  return Math.max(0, n - 1);
}

// Re-export for callers that need the callback signature shape
export type DrawingToolName = Tool;
