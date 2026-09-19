// Browser-side alerts engine.
// Triggers fire when the relationship between two series flips between
// the previous closed bar and the latest closed bar.

export type AlertDirection = "above" | "below";
export type AlertType = "price" | "price_ema" | "ema_ema";

export interface AlertBase {
  id: string;
  symbol: string;        // yahoo ticker
  interval: string;      // timeframe code (D, W, 5, 15, ...)
  type: AlertType;
  direction: AlertDirection;
  enabled: boolean;
  note?: string;
  createdAt: number;
  lastTriggeredAt?: number;
  lastBarTime?: number;  // last closed bar time we've already evaluated
}

export interface PriceAlert extends AlertBase {
  type: "price";
  level: number;
}
export interface PriceEmaAlert extends AlertBase {
  type: "price_ema";
  ema: number;
}
export interface EmaEmaAlert extends AlertBase {
  type: "ema_ema";
  fast: number;
  slow: number;
}
export type Alert = PriceAlert | PriceEmaAlert | EmaEmaAlert;

export const EMA_OPTIONS = [9, 10, 20, 21, 50, 100, 200];

const STORAGE_KEY = "kch.alerts.v1";

export function loadAlerts(): Alert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Alert[]) : [];
  } catch {
    return [];
  }
}
export function saveAlerts(alerts: Alert[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {}
}

export function describeAlert(a: Alert): string {
  const dir = a.direction === "above" ? "↑ crosses above" : "↓ crosses below";
  if (a.type === "price") return `Price ${dir} ${a.level}`;
  if (a.type === "price_ema") return `Price ${dir} EMA ${a.ema}`;
  return `EMA ${a.fast} ${dir} EMA ${a.slow}`;
}

// Compute EMA over closes; returns array aligned with input.
export function computeEma(values: number[], period: number): (number | null)[] {
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

// Returns { fired: boolean, closedBarTime } for the most-recently-closed bar.
// Compares last closed bar vs prior closed bar. Ignores still-forming bar.
export function evaluateAlert(
  alert: Alert,
  candles: { time: number; close: number }[],
): { fired: boolean; barTime: number | null } {
  if (candles.length < 3) return { fired: false, barTime: null };
  // Skip the in-progress bar -> last closed is candles[n-2], prior is candles[n-3]
  const currIdx = candles.length - 2;
  const prevIdx = candles.length - 3;
  const curr = candles[currIdx];
  const prev = candles[prevIdx];

  let a_prev: number | null = null, a_curr: number | null = null;
  let b_prev: number | null = null, b_curr: number | null = null;

  if (alert.type === "price") {
    a_prev = prev.close; a_curr = curr.close;
    b_prev = alert.level; b_curr = alert.level;
  } else if (alert.type === "price_ema") {
    const closes = candles.map((c) => c.close);
    const e = computeEma(closes, alert.ema);
    a_prev = prev.close; a_curr = curr.close;
    b_prev = e[prevIdx]; b_curr = e[currIdx];
  } else {
    const closes = candles.map((c) => c.close);
    const f = computeEma(closes, alert.fast);
    const s = computeEma(closes, alert.slow);
    a_prev = f[prevIdx]; a_curr = f[currIdx];
    b_prev = s[prevIdx]; b_curr = s[currIdx];
  }

  if (a_prev == null || a_curr == null || b_prev == null || b_curr == null) {
    return { fired: false, barTime: curr.time };
  }
  const fired =
    alert.direction === "above"
      ? a_prev <= b_prev && a_curr > b_curr
      : a_prev >= b_prev && a_curr < b_curr;
  return { fired, barTime: curr.time };
}
