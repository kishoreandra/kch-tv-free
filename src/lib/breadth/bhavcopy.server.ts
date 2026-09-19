// Helpers for downloading and parsing NSE daily archive files.
// Uses the same request-header pattern that the circuit-band job relies on —
// NSE's archive server rejects requests without a browser-like User-Agent.

import { isFundTicker } from "@/data/nse-funds";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function fetchNseCsv(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/csv,*/*", "Accept-Language": "en-US,en;q=0.9" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return await res.text();
}

export function csvFields(line: string): string[] {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { fields.push(value.trim()); value = ""; continue; }
    value += char;
  }
  fields.push(value.trim());
  return fields;
}

// "2026-08-07" -> "07082026" (NSE archive file naming)
export function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}${m}${y}`;
}

export function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export interface BhavRow {
  symbol: string;
  trade_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  prev_close: number | null;
  volume: number | null;
  turnover: number | null;
}

const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/**
 * Reads the trade date stamped inside a `sec_bhavdata_full` CSV (the `DATE1`
 * column, e.g. ` 07-Aug-2026`) so callers can prove the file they downloaded
 * really is the session they asked for. Returns null when absent.
 */
export function parseBhavcopyFileDate(text: string): string | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const header = csvFields(lines[0]).map((h) => h.trim().toUpperCase());
  const iDate = header.findIndex((h) => h === "DATE1" || h === "DATE" || h === "TIMESTAMP");
  if (iDate < 0) return null;
  for (let i = 1; i < Math.min(lines.length, 20); i++) {
    const raw = csvFields(lines[i])[iDate]?.trim();
    if (!raw) continue;
    const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw);
    if (m) {
      const mon = MONTHS.indexOf(m[2].toUpperCase());
      if (mon < 0) continue;
      return `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (iso) return raw;
  }
  return null;
}

/**
 * Proves the downloaded CSV really is the session we asked for.
 *
 * Why this is required: for a date the archive has no file for (a holiday, or a
 * session that has not published yet) `nsearchives.nseindia.com` frequently
 * answers **HTTP 200 with an older file** instead of 404 — verified on
 * 14-Sep-2026 (Ganesh Chaturthi), which served the 11-Sep CSV, and on
 * 01-May-2026, which served the 30-Apr CSV. A successful download is therefore
 * *not* evidence that a session exists. Without this check the caller stamps
 * every row with the date it asked for, which writes the previous session a
 * second time under the holiday's date — a phantom candle that then shows up on
 * every chart, screener and breadth figure.
 *
 * Throws when the file is not the requested session — including when it carries
 * no readable date at all, since every file the archive holds from 2020 onward is
 * self-dated in `DATE1` and an unverifiable download is not worth the risk.
 * Returns the file's own date.
 *
 * Because the *file* decides, the trading calendar is not load-bearing here: a
 * holiday missing from `NSE_HOLIDAYS` still cannot produce a phantom (the echoed
 * file fails this check and the day is skipped), and a real session wrongly listed
 * as a holiday is still ingested (its file is self-dated) rather than silently
 * dropped. Callers should therefore skip weekends only, never calendar holidays.
 */
export function assertBhavcopyForDate(text: string, expected: string): string {
  const fileDate = parseBhavcopyFileDate(text);
  if (!fileDate) {
    throw new Error(
      `cannot confirm a session on ${expected} — the file carries no readable trade date`,
    );
  }
  if (fileDate !== expected) {
    throw new Error(`no NSE session on ${expected} — the archive served the ${fileDate} file`);
  }
  return fileDate;
}

/**
 * Did NSE actually trade on `date`? Answered from the archive itself: on a weekend
 * or holiday, or before the session's file is published, the download is either
 * absent (404) or an older session's file — both rejected by
 * `assertBhavcopyForDate`, so both answer false here.
 *
 * Use this instead of the trading calendar when the question is "is this date a
 * session worth recording?". The calendar is hand-maintained and has been wrong
 * (four real 2026 sessions were listed as holidays); the exchange's own file
 * cannot be. Costs one download, so call it once per run, not per row.
 */
export async function hasNseSession(date: string): Promise<boolean> {
  try {
    const text = await fetchNseCsv(
      `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy(date)}.csv`,
    );
    return assertBhavcopyForDate(text, date) === date;
  } catch {
    return false;
  }
}

// Parses `sec_bhavdata_full_DDMMYYYY.csv` (plain CSV, no zip).
export function parseBhavcopy(text: string, tradeDate: string): BhavRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = csvFields(lines[0]).map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const iSym = idx("SYMBOL");
  const iSer = idx("SERIES");
  const iPrev = idx("PREV_CLOSE");
  const iOpen = idx("OPEN_PRICE");
  const iHigh = idx("HIGH_PRICE");
  const iLow = idx("LOW_PRICE");
  const iClose = idx("CLOSE_PRICE");
  const iQty = idx("TTL_TRD_QNTY");
  const iTurn = idx("TURNOVER_LACS");
  if (iSym < 0 || iClose < 0) throw new Error("Unexpected Bhavcopy header layout");

  const out: BhavRow[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const p = csvFields(lines[i]);
    const symbol = p[iSym]?.toUpperCase();
    const series = iSer >= 0 ? p[iSer]?.toUpperCase() : "EQ";
    if (!symbol || !series) continue;
    // EQ-series equities only. BE/T2T, SME (SM/ST), BZ, trusts (IV/RR) and other
    // series are excluded, and so are the ETF/fund instruments NSE files under
    // EQ — the site universe is `src/data/nse-symbols.ts`.
    if (series !== "EQ" || isFundTicker(symbol)) continue;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    const turnoverLacs = iTurn >= 0 ? num(p[iTurn]) : null;
    out.push({
      symbol,
      trade_date: tradeDate,
      open: iOpen >= 0 ? num(p[iOpen]) : null,
      high: iHigh >= 0 ? num(p[iHigh]) : null,
      low: iLow >= 0 ? num(p[iLow]) : null,
      close: num(p[iClose]),
      prev_close: iPrev >= 0 ? num(p[iPrev]) : null,
      volume: iQty >= 0 ? num(p[iQty]) : null,
      turnover: turnoverLacs != null ? turnoverLacs * 100_000 : null,
    });
  }
  return out;
}

// Parses `ind_nifty500list.csv`
export function parseIndexList(text: string): { symbol: string; company: string | null; industry: string | null }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = csvFields(lines[0]).map((h) => h.trim().toUpperCase());
  const iSym = header.findIndex((h) => h === "SYMBOL");
  const iName = header.findIndex((h) => h === "COMPANY NAME");
  const iInd = header.findIndex((h) => h === "INDUSTRY");
  if (iSym < 0) return [];
  const out: { symbol: string; company: string | null; industry: string | null }[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const p = csvFields(lines[i]);
    const symbol = p[iSym]?.toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({
      symbol,
      company: iName >= 0 ? p[iName] || null : null,
      industry: iInd >= 0 ? p[iInd] || null : null,
    });
  }
  return out;
}

// Parses `ind_close_all_DDMMYYYY.csv` and returns the Nifty 50 close.
export function parseNifty50Close(text: string): number | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const header = csvFields(lines[0]).map((h) => h.trim().toUpperCase());
  const iName = header.findIndex((h) => h.includes("INDEX NAME"));
  const iClose = header.findIndex((h) => h.includes("CLOSING INDEX VALUE"));
  if (iName < 0 || iClose < 0) return null;
  for (let i = 1; i < lines.length; i++) {
    const p = csvFields(lines[i]);
    if ((p[iName] ?? "").trim().toUpperCase() === "NIFTY 50") return num(p[iClose]);
  }
  return null;
}
