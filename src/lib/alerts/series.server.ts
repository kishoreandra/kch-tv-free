// OHLCV series helpers for the alert engine. Reads `daily_prices` and
// resamples to ISO weeks for weekly-timeframe alerts.

export interface Bar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number;
  turnover: number | null;
}

export function ema(values: number[], period: number): (number | null)[] {
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

export function sma(values: number[], period: number, endIdx: number): number | null {
  if (endIdx + 1 < period) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) sum += values[i];
  return sum / period;
}

/** Common Pine ADR% : 100 * (sma(high/low, len) - 1) */
export function adrPct(bars: Bar[], endIdx: number, len = 20): number | null {
  if (endIdx + 1 < len) return null;
  let sum = 0;
  for (let i = endIdx - len + 1; i <= endIdx; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    if (!h || !l || l <= 0) return null;
    sum += h / l;
  }
  return (sum / len - 1) * 100;
}

function isoWeekKey(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function toWeekly(daily: Bar[]): Bar[] {
  const out: Bar[] = [];
  let key = "";
  for (const b of daily) {
    const k = isoWeekKey(b.date);
    if (k !== key) {
      key = k;
      out.push({ ...b });
      continue;
    }
    const w = out[out.length - 1];
    w.date = b.date;
    w.close = b.close;
    if (b.high != null) w.high = w.high == null ? b.high : Math.max(w.high, b.high);
    if (b.low != null) w.low = w.low == null ? b.low : Math.min(w.low, b.low);
    w.volume += b.volume;
    if (b.turnover != null) w.turnover = (w.turnover ?? 0) + b.turnover;
  }
  return out;
}

/** Load daily bars for a set of symbols in one pass. */
export async function loadDailyBars(
  admin: { from: (t: string) => any },
  symbols: string[],
  maxBarsPerSymbol = 900,
): Promise<Map<string, Bar[]>> {
  const map = new Map<string, Bar[]>();
  if (symbols.length === 0) return map;
  const chunkSize = 40;
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    let from = 0;
    const pageSize = 1000;
    // Paginate so large symbol sets do not silently truncate.
    for (;;) {
      const { data, error } = await admin
        .from("daily_prices")
        .select("symbol,trade_date,open,high,low,close,volume,turnover")
        .in("symbol", chunk)
        .order("symbol", { ascending: true })
        .order("trade_date", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as any[];
      for (const r of rows) {
        if (r.close == null) continue;
        const arr = map.get(r.symbol) ?? [];
        arr.push({
          date: r.trade_date,
          open: r.open == null ? null : Number(r.open),
          high: r.high == null ? null : Number(r.high),
          low: r.low == null ? null : Number(r.low),
          close: Number(r.close),
          volume: Number(r.volume ?? 0),
          turnover: r.turnover == null ? null : Number(r.turnover),
        });
        map.set(r.symbol, arr);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
  }
  for (const [k, v] of map) {
    if (v.length > maxBarsPerSymbol) map.set(k, v.slice(v.length - maxBarsPerSymbol));
  }
  return map;
}
