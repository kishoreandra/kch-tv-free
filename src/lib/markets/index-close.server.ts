// NSE publishes one daily file covering every index it calculates:
//   https://nsearchives.nseindia.com/content/indices/ind_close_all_DDMMYYYY.csv
// Columns: Index Name, Index Date, Open/High/Low/Closing Index Value, Points
// Change, Change(%), Volume, Turnover, P/E, P/B, Div Yield.
//
// Yahoo has no series at all for many NSE indices (Nifty Healthcare, Nifty Oil
// & Gas, NIFTY50 Equal Weight, Nifty Smallcap 100, Nifty Microcap 250, …), so
// charts for those are served from this archive instead of Yahoo.
//
// Symbols are stored as "^" + a slug of the NSE index name, e.g.
// "Nifty Oil & Gas" -> "^NIFTY_OIL_GAS". The "^" prefix keeps them out of the
// equity universe (see src/lib/eq-universe.server.ts) and out of NSE/Screener
// link generation, while still being a valid chart symbol.

import { csvFields, ddmmyyyy, fetchNseCsv, istToday } from "@/lib/breadth/bhavcopy.server";

const ARCHIVE = "https://nsearchives.nseindia.com";
// Even the 2017 files list 74 indices; anything smaller is a partial/blocked
// response and must not be written.
const MIN_ROWS = 40;
const MAX_HISTORY_DAYS = 5000;

export interface IndexCloseRow {
  symbol: string;
  index_name: string;
  trade_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface IndexCandle {
  time: number; // unix seconds, stamped at the IST session open (09:15)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** "Nifty Oil & Gas" -> "^NIFTY_OIL_GAS" */
export function indexSymbolFromName(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `^${slug}`;
}

/** True for archive-backed index symbols (always "^..."). */
export function isIndexSymbol(symbol: string): boolean {
  return String(symbol ?? "").trim().startsWith("^");
}

export function indexCloseUrl(date: string): string {
  return `${ARCHIVE}/content/indices/ind_close_all_${ddmmyyyy(date)}.csv`;
}

function num(value: string | undefined): number | null {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** "11-09-2026" -> "2026-09-11" */
function toIsoDate(value: string | undefined): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function addDays(iso: string, delta: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export function parseIndexClose(text: string, tradeDate: string): IndexCloseRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = csvFields(lines[0]).map((h) => h.toUpperCase());
  const find = (frag: string) => header.findIndex((h) => h.includes(frag));
  const iName = find("INDEX NAME");
  const iDate = find("INDEX DATE");
  const iOpen = find("OPEN INDEX VALUE");
  const iHigh = find("HIGH INDEX VALUE");
  const iLow = find("LOW INDEX VALUE");
  const iClose = find("CLOSING INDEX VALUE");
  const iVol = find("VOLUME");
  if (iName < 0 || iClose < 0) return [];

  const out: IndexCloseRow[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const p = csvFields(lines[i]);
    const name = (p[iName] ?? "").trim();
    const close = num(p[iClose]);
    if (!name || close == null || close <= 0) continue;
    const symbol = indexSymbolFromName(name);
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({
      symbol,
      index_name: name,
      trade_date: (iDate >= 0 ? toIsoDate(p[iDate]) : null) ?? tradeDate,
      open: num(p[iOpen]),
      high: num(p[iHigh]),
      low: num(p[iLow]),
      close,
      volume: num(p[iVol]),
    });
  }
  return out;
}

/** Downloads and stores one session. Throws on a missing/partial file. */
export async function ingestIndexCloseDay(admin: any, date: string): Promise<number> {
  const text = await fetchNseCsv(indexCloseUrl(date));
  const rows = parseIndexClose(text, date);
  if (rows.length < MIN_ROWS) {
    throw new Error(`index close file for ${date} parsed only ${rows.length} rows`);
  }
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("index_prices")
      .upsert(rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now })), {
        onConflict: "symbol,trade_date",
      });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

/**
 * Newest session NSE has actually published. The file only appears after the
 * close, and weekends/holidays never have one, so walk backwards until a real
 * file shows up. Returns null if nothing was found within `maxBack` days.
 */
export async function latestPublishedIndexDate(maxBack = 10): Promise<string | null> {
  const today = istToday();
  for (let back = 0; back <= maxBack; back++) {
    const date = addDays(today, -back);
    try {
      const text = await fetchNseCsv(indexCloseUrl(date));
      if (parseIndexClose(text, date).length >= MIN_ROWS) return date;
    } catch {
      /* not published for this day — keep walking back */
    }
  }
  return null;
}

const RANGE_DAYS: Record<string, number> = {
  "1d": 5,
  "5d": 10,
  "1mo": 31,
  "3mo": 93,
  "6mo": 186,
  "1y": 366,
  "2y": 731,
  "5y": 1827,
  "10y": 3653,
  ytd: 366,
  max: MAX_HISTORY_DAYS,
};

function rangeStartIso(range: string): string {
  return addDays(istToday(), -(RANGE_DAYS[range] ?? 366));
}

/** Same IST session-open convention ohlc.functions.ts uses for NSE bars. */
function unixFromIstOpen(isoDate: string): number {
  const [y, mo, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, mo - 1, d, 9, 15) / 1000 - 5.5 * 60 * 60);
}

/** Monday-anchored week key, month key — used to roll daily bars up. */
function bucketKey(isoDate: string, interval: "W" | "M"): string {
  if (interval === "M") return isoDate.slice(0, 7);
  const [y, mo, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(isoDate, -dow);
}

function rollUp(rows: Array<IndexCloseRow & { close: number }>, interval: "W" | "M"): IndexCandle[] {
  const buckets = new Map<string, IndexCandle>();
  const order: string[] = [];
  for (const row of rows) {
    const key = bucketKey(row.trade_date, interval);
    const candle = buckets.get(key);
    if (!candle) {
      buckets.set(key, {
        time: unixFromIstOpen(row.trade_date),
        open: row.open ?? row.close,
        high: row.high ?? row.close,
        low: row.low ?? row.close,
        close: row.close,
        volume: row.volume ?? 0,
      });
      order.push(key);
      continue;
    }
    candle.high = Math.max(candle.high, row.high ?? row.close);
    candle.low = Math.min(candle.low, row.low ?? row.close);
    candle.close = row.close;
    candle.volume += row.volume ?? 0;
  }
  return order.map((k) => buckets.get(k)!);
}

/**
 * Daily candles for an archive-backed index, straight from `index_prices`.
 * `interval` is our chart code ("D" | "W" | "M"); intraday codes return [] —
 * the archive is end-of-day only.
 */
export async function loadIndexCandles(
  supabase: any,
  symbol: string,
  range: string,
  interval: string,
): Promise<IndexCandle[]> {
  if (!isIndexSymbol(symbol)) return [];
  if (interval !== "D" && interval !== "W" && interval !== "M") return [];
  const { data, error } = await supabase
    .from("index_prices")
    .select("trade_date,open,high,low,close,volume")
    .eq("symbol", symbol)
    .gte("trade_date", rangeStartIso(range))
    .order("trade_date", { ascending: true })
    .limit(MAX_HISTORY_DAYS);
  if (error || !data?.length) return [];
  const rows = data as Array<{
    trade_date: string;
    open: number | string | null;
    high: number | string | null;
    low: number | string | null;
    close: number | string;
    volume: number | string | null;
  }>;
  const cleaned = rows.map((r) => ({
    symbol,
    index_name: symbol,
    trade_date: String(r.trade_date).slice(0, 10),
    open: num(String(r.open ?? "")),
    high: num(String(r.high ?? "")),
    low: num(String(r.low ?? "")),
    close: num(String(r.close ?? "")) ?? 0,
    volume: num(String(r.volume ?? "")),
  })).filter((r) => r.close > 0);

  if (interval === "D") {
    return cleaned.map((r) => ({
      time: unixFromIstOpen(r.trade_date),
      open: r.open ?? r.close,
      high: r.high ?? r.close,
      low: r.low ?? r.close,
      close: r.close,
      volume: r.volume ?? 0,
    }));
  }
  return rollUp(cleaned, interval);
}
