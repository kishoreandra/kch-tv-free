// Replaces the complete price-band dataset from NSE's official security list.
// One file covers the full universe and explicitly identifies "No Band" rows.

import { createFileRoute } from "@tanstack/react-router";
import { isScheduledJobAuthorized } from "./-_auth";
import { isFundTicker } from "@/data/nse-funds";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function csvFields(line: string): string[] {
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

function istDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

interface Row {
  symbol: string;
  series: string | null;
  security_name: string | null;
  band: string;
  band_pct: number | null;
  remarks: string | null;
  effective_date: string;
  source_date: string;
  updated_at: string;
}

function parseCsv(text: string, effective: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = csvFields(lines[0]).map((h) => h.toUpperCase());
  const iSym = header.findIndex((h) => h === "SYMBOL");
  const iSer = header.findIndex((h) => h === "SERIES");
  const iName = header.findIndex((h) => h === "SECURITY NAME");
  const iBand = header.findIndex((h) => h === "BAND");
  const iRemarks = header.findIndex((h) => h === "REMARKS");
  if (iSym < 0 || iBand < 0) return [];
  const out: Row[] = [];
  const seen = new Set<string>();
  const updatedAt = new Date().toISOString();
  for (let i = 1; i < lines.length; i++) {
    const parts = csvFields(lines[i]);
    const sym = parts[iSym]?.toUpperCase();
    const band = parts[iBand]?.trim() || "";
    const series = iSer >= 0 ? parts[iSer]?.toUpperCase() || "" : "EQ";
    const numeric = Number(band.replace("%", ""));
    if (!sym || !band) continue;
    // EQ series only, and equities only: NSE files ~350 ETF/fund instruments
    // under the EQ series, and those are excluded site-wide. BE (trade-for-trade),
    // SME (SM/ST), BZ/SZ and trusts (IV/RR) are excluded by series.
    if (series !== "EQ" || isFundTicker(sym)) continue;
    if (seen.has(sym)) continue;
    seen.add(sym);
    out.push({
      symbol: sym,
      series: iSer >= 0 ? parts[iSer]?.toUpperCase() || null : null,
      security_name: iName >= 0 ? parts[iName] || null : null,
      band,
      band_pct: Number.isFinite(numeric) ? numeric : null,
      remarks: iRemarks >= 0 ? parts[iRemarks] || null : null,
      effective_date: effective,
      source_date: effective,
      updated_at: updatedAt,
    });
  }
  return out;
}

export const Route = createFileRoute("/api/public/cron/refresh-price-bands")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isScheduledJobAuthorized(request)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const sourceDate = istDate();
          const response = await fetch("https://nsearchives.nseindia.com/content/equities/sec_list.csv", {
            headers: { "User-Agent": UA, Accept: "text/csv,*/*" },
            cache: "no-store",
          });
          if (!response.ok) throw new Error(`NSE security list returned ${response.status}`);
          const rows = parseCsv(await response.text(), sourceDate);
          if (rows.length < 1000) throw new Error(`NSE security list parsed only ${rows.length} rows`);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Historical log + change detection must read the previous "latest"
          // state before the upsert overwrites it.
          let bandChanges: unknown = null;
          try {
            const { recordBandChanges } = await import("@/lib/bands/band-changes.server");
            bandChanges = await recordBandChanges(
              rows.map((r) => ({ symbol: r.symbol, band: r.band, band_pct: r.band_pct })),
            );
          } catch (changeErr) {
            console.error("band change detection failed:", changeErr);
          }

          const chunkSize = 500;
          let upserted = 0;
          for (let i = 0; i < rows.length; i += chunkSize) {
            const { error } = await supabaseAdmin.from("price_bands").upsert(rows.slice(i, i + chunkSize), { onConflict: "symbol" });
            if (error) throw error;
            upserted += Math.min(chunkSize, rows.length - i);
          }
          // Drop anything outside the EQ universe: rows from a stale date and,
          // importantly, any non-EQ series rows written before the EQ-only
          // filter existed (a same-day run would otherwise leave them behind,
          // since only the date is stale the following day).
          const { error: staleError } = await supabaseAdmin
            .from("price_bands")
            .delete()
            .or(`source_date.neq.${sourceDate},source_date.is.null,series.neq.EQ,series.is.null`);
          if (staleError) throw staleError;
          const now = new Date().toISOString();
          const { error: logError } = await supabaseAdmin.from("price_band_fetch_log").upsert({
            id: 1, last_successful_fetch: now, row_count: rows.length, last_attempt_status: "ok", last_attempt_at: now,
          });
          if (logError) throw logError;
          return Response.json({ ok: true, source: "NSE sec_list.csv", upserted, effective_date: sourceDate, bandChanges });

        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("refresh-price-bands failed:", msg);
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("price_band_fetch_log").upsert({ id: 1, last_attempt_status: "failed", last_attempt_at: new Date().toISOString() });
          } catch { /* preserve original failure */ }
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
