// Historical OHLCV backfill for `daily_prices` plus NSE bulk/block deal ingestion.
// Scope is the Nifty 500 universe merged with every symbol the app actually
// tracks (alerts, band watchlist, open journal positions) so alert history is
// accurate for names outside the index.

import { assertBhavcopyForDate, fetchNseCsv, parseBhavcopy, csvFields, ddmmyyyy, istToday } from "@/lib/breadth/bhavcopy.server";
import { isEqTicker } from "@/lib/eq-universe.server";

const ARCHIVE = "https://nsearchives.nseindia.com";

const norm = (s: string) => s.replace(/\.NS$/i, "").trim().toUpperCase();

export async function trackedSymbols(admin: any): Promise<string[]> {
  const out = new Set<string>();
  const add = (rows: any[] | null) => {
    for (const r of rows ?? []) if (r?.symbol) out.add(norm(String(r.symbol)));
  };
  const [alerts, watch, trades] = await Promise.all([
    admin.from("price_alerts").select("symbol").limit(5000),
    admin.from("band_watchlist").select("symbol").limit(5000),
    admin.from("trades").select("symbol,status").eq("status", "open").limit(5000),
  ]);
  add(alerts.data);
  add(watch.data);
  add(trades.data);
  return Array.from(out);
}

async function allowedSet(admin: any, scope: "tracked" | "all"): Promise<Set<string> | null> {
  if (scope === "all") return null; // no filter — every EQ-series symbol
  const set = new Set<string>();
  const { data } = await admin.from("nifty500_constituents").select("symbol").limit(1000);
  for (const r of data ?? []) set.add(norm(String(r.symbol)));
  for (const s of await trackedSymbols(admin)) set.add(s);
  return set;
}

export interface BackfillResult {
  days_ingested: number;
  rows: number;
  skipped: { date: string; reason: string }[];
  from: string | null;
  to: string | null;
}

/** Walks back `days` calendar days from `end`, ingesting each available session. */
export async function backfillDailyPrices(
  admin: any,
  opts: { end?: string; days?: number; scope?: "tracked" | "all" } = {},
): Promise<BackfillResult> {
  const end = opts.end ?? istToday();
  const days = Math.min(Math.max(Number(opts.days) || 10, 1), 30);
  const allowed = await allowedSet(admin, opts.scope ?? "tracked");

  const skipped: { date: string; reason: string }[] = [];
  let rows = 0;
  let ingested = 0;
  let first: string | null = null;
  let last: string | null = null;

  for (let i = 0; i < days; i++) {
    const d = new Date(`${end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    // Weekends only — the file's own date decides holidays, so a stale calendar
    // entry can never skip a real session here either.
    if (dow === 0 || dow === 6) continue;
    try {
      const text = await fetchNseCsv(`${ARCHIVE}/products/content/sec_bhavdata_full_${ddmmyyyy(iso)}.csv`);
      // A date with no session is served as the previous session's file — never
      // store that under `iso`, it would duplicate the earlier candle.
      assertBhavcopyForDate(text, iso);
      const parsed = parseBhavcopy(text, iso);
      const scoped = allowed ? parsed.filter((r) => allowed.has(r.symbol)) : parsed;
      if (scoped.length === 0) {
        skipped.push({ date: iso, reason: "no matching symbols" });
        continue;
      }
      const now = new Date().toISOString();
      for (let k = 0; k < scoped.length; k += 500) {
        const { error } = await admin
          .from("daily_prices")
          .upsert(
            scoped.slice(k, k + 500).map((r) => ({ ...r, updated_at: now })),
            { onConflict: "symbol,trade_date" },
          );
        if (error) throw new Error(error.message);
      }
      rows += scoped.length;
      ingested++;
      last = last ?? iso;
      first = iso;
    } catch (e) {
      skipped.push({ date: iso, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { days_ingested: ingested, rows, skipped, from: first, to: last };
}

// ---------------------------------------------------------------- bulk deals

function parseDealDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const mi = months.indexOf(m[2].toUpperCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1]}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  return null;
}

function parseDeals(text: string, source: "bulk" | "block") {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = csvFields(lines[0]).map((h) => h.toUpperCase());
  const find = (frag: string) => header.findIndex((h) => h.includes(frag));
  const iDate = find("DATE");
  const iSym = find("SYMBOL");
  const iClient = find("CLIENT");
  const iType = header.findIndex((h) => h.includes("BUY") || h.includes("SELL"));
  const iQty = find("QUANTITY");
  const iPrice = find("PRICE");
  const out: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const p = csvFields(lines[i]);
    const date = iDate >= 0 ? parseDealDate(p[iDate] ?? "") : null;
    const symbol = iSym >= 0 ? norm(p[iSym] ?? "") : "";
    // Deals files carry every series; keep the EQ universe only.
    if (!date || !symbol || !isEqTicker(symbol)) continue;
    const qty = Number(String(p[iQty] ?? "").replace(/,/g, ""));
    const price = Number(String(p[iPrice] ?? "").replace(/,/g, ""));
    out.push({
      deal_date: date,
      symbol,
      client_name: iClient >= 0 ? (p[iClient] ?? "").slice(0, 200) : null,
      deal_type: iType >= 0 ? (p[iType] ?? "").toUpperCase().slice(0, 8) : null,
      quantity: Number.isFinite(qty) ? Math.round(qty) : null,
      price: Number.isFinite(price) ? price : null,
      source,
    });
  }
  return out;
}

export async function ingestBulkBlockDeals(admin: any): Promise<{ bulk: number; block: number }> {
  const counts = { bulk: 0, block: 0 };
  for (const source of ["bulk", "block"] as const) {
    try {
      const text = await fetchNseCsv(`${ARCHIVE}/content/equities/${source}.csv`);
      const rows = parseDeals(text, source);
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin
          .from("bulk_block_deals")
          .upsert(rows.slice(i, i + 500), {
            onConflict: "deal_date,symbol,client_name,deal_type,source,quantity",
            ignoreDuplicates: true,
          });
        if (error) throw new Error(error.message);
      }
      counts[source] = rows.length;
    } catch (e) {
      console.error(`${source} deals ingest failed:`, e instanceof Error ? e.message : String(e));
    }
  }
  return counts;
}

/** Recent large negotiated trades for a symbol, used to annotate volume records. */
export async function recentDeals(
  admin: any,
  symbol: string,
  onDate: string,
): Promise<{ count: number; summary: string | null }> {
  const { data } = await admin
    .from("bulk_block_deals")
    .select("client_name,deal_type,quantity,source")
    .eq("symbol", norm(symbol))
    .eq("deal_date", onDate)
    .limit(5);
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return { count: 0, summary: null };
  const top = rows[0];
  return {
    count: rows.length,
    summary: `${rows.length} ${top.source} deal(s) — e.g. ${top.client_name ?? "?"} ${top.deal_type ?? ""}`.trim(),
  };
}
