// Circuit-band change detection + Telegram alerting.
//
// The band refresh job replaces the "latest" price_bands table each run. This
// module keeps an append-only history of band values, records every change,
// and pushes an urgent Telegram alert for symbols the user is holding
// (open trades) or watching (band_watchlist), plus a lower-priority digest
// for every other change.

import { sendTelegram, escapeHtml, symbolLinks, type TelegramResult } from "@/lib/telegram.server";

export interface BandRow {
  symbol: string;
  band: string;
  band_pct: number | null;
}

interface ChangeRow {
  symbol: string;
  old_band: string | null;
  new_band: string | null;
  old_band_pct: number | null;
  new_band_pct: number | null;
}

function norm(sym: string): string {
  return sym.replace(/\.NS$/i, "").toUpperCase();
}

function fmtBand(band: string | null, pct: number | null): string {
  if (band && band.trim()) return band.includes("%") ? band : `${band}%`;
  if (pct != null) return `${pct}%`;
  return "—";
}

function money(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function bandPriority(change: ChangeRow): number {
  const next = Number(change.new_band_pct ?? String(change.new_band ?? "").replace("%", ""));
  if (next === 20) return 0;
  if (next === 10) return 1;
  return 2;
}

function sortBandChanges(rows: ChangeRow[]): ChangeRow[] {
  return [...rows].sort((a, b) => bandPriority(a) - bandPriority(b) || a.symbol.localeCompare(b.symbol));
}

export interface BandChangeSummary {
  changes: number;
  urgent: number;
  others: number;
  alerted: boolean;
  alertError?: string;
}

// Telegram failures must never lose the recorded changes or hide themselves.
// `sendTelegram` already turns HTTP-level errors into {sent:false}, but a
// network-level throw used to escape this function entirely: the caller's
// try/catch swallowed it, the API still reported the change count, and the
// alert simply never arrived with nothing anywhere to show for it.
async function safeSend(text: string): Promise<TelegramResult> {
  try {
    return await sendTelegram(text, { html: true });
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function recordBandChanges(rows: BandRow[]): Promise<BandChangeSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Previous "latest" state, captured before the refresh overwrites it.
  // PostgREST caps a single response at 1000 rows, so page explicitly —
  // without this most symbols look brand new and their band moves are missed.
  const prev = new Map<string, { band: string | null; pct: number | null }>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: prevRows, error: prevErr } = await supabaseAdmin
      .from("price_bands")
      .select("symbol,band,band_pct")
      .order("symbol", { ascending: true })
      .range(from, from + PAGE - 1);
    if (prevErr) throw prevErr;
    const batch = (prevRows ?? []) as Array<{ symbol: string; band: string | null; band_pct: number | null }>;
    for (const r of batch) prev.set(norm(r.symbol), { band: r.band, pct: r.band_pct });
    if (batch.length < PAGE) break;
  }

  // Safety net: a symbol can be temporarily absent from price_bands (a partial
  // NSE file, a fresh listing, a failed earlier run). Fall back to its last
  // recorded history value so a real band move is never logged as "brand new".
  const missing = rows.filter((r) => !prev.has(norm(r.symbol)));
  if (missing.length > 0) {
    const seen = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data: histRows, error: histErr } = await supabaseAdmin
        .from("circuit_bands_history")
        .select("symbol,band,band_pct,fetched_at")
        .order("fetched_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (histErr) break;
      const batch = (histRows ?? []) as Array<{ symbol: string; band: string | null; band_pct: number | null }>;
      for (const h of batch) {
        const key = norm(h.symbol);
        if (seen.has(key) || prev.has(key)) continue;
        seen.add(key);
        prev.set(key, { band: h.band, pct: h.band_pct });
      }
      if (batch.length < PAGE) break;
    }
  }

  // Guard against a truncated/failed read wiping out the baseline: that would
  // mark the whole universe as "new" and silently swallow the day's real moves.
  if (prev.size > 0 && rows.length > 100 && prev.size < rows.length * 0.5) {
    throw new Error(
      `Band baseline looks incomplete (${prev.size} known vs ${rows.length} incoming) — aborting to avoid missing real changes`,
    );
  }


  const changes: ChangeRow[] = [];
  const historyRows: Array<{ symbol: string; band: string; band_pct: number | null }> = [];

  for (const r of rows) {
    const key = norm(r.symbol);
    const before = prev.get(key);
    const isNew = !before;
    const differs =
      !isNew && (String(before!.band ?? "") !== String(r.band ?? "") || Number(before!.pct) !== Number(r.band_pct));
    if (isNew || differs) {
      historyRows.push({ symbol: key, band: r.band, band_pct: r.band_pct });
    }
    if (differs) {
      changes.push({
        symbol: key,
        old_band: before!.band,
        new_band: r.band,
        old_band_pct: before!.pct,
        new_band_pct: r.band_pct,
      });
    }
  }

  // Append-only history for the values that moved (or appeared for the first time).
  for (let i = 0; i < historyRows.length; i += 500) {
    const { error } = await supabaseAdmin
      .from("circuit_bands_history")
      .insert(historyRows.slice(i, i + 500));
    if (error) throw error;
  }

  if (changes.length === 0) return { changes: 0, urgent: 0, others: 0, alerted: false };

  for (let i = 0; i < changes.length; i += 500) {
    const { error } = await supabaseAdmin.from("circuit_band_changes").insert(changes.slice(i, i + 500));
    if (error) throw error;
  }

  // ── Cross-reference open positions and the alert watchlist ──────────────
  const changedSymbols = new Set(changes.map((c) => c.symbol));

  const { data: openTrades } = await supabaseAdmin
    .from("trades")
    .select("symbol,quantity,entry_price")
    .eq("status", "open");
  const positions = new Map<string, { qty: number; entry: number }>();
  for (const t of (openTrades ?? []) as Array<{ symbol: string; quantity: number; entry_price: number }>) {
    const key = norm(t.symbol);
    if (!changedSymbols.has(key)) continue;
    const cur = positions.get(key);
    positions.set(key, {
      qty: (cur?.qty ?? 0) + Number(t.quantity ?? 0),
      entry: cur?.entry ?? Number(t.entry_price ?? 0),
    });
  }

  const { data: watchRows } = await supabaseAdmin
    .from("band_watchlist")
    .select("symbol,notes");
  const watched = new Map<string, string | null>();
  for (const w of (watchRows ?? []) as Array<{ symbol: string; notes: string | null }>) {
    const key = norm(w.symbol);
    if (changedSymbols.has(key)) watched.set(key, w.notes);
  }

  // Symbols sitting in any custom watchlist (Scanning Process excluded) get
  // the same urgent treatment so they stand out for action.
  const { loadAllWatchlistSymbols } = await import("@/lib/bands/watchlist-symbols.server");
  const inLists = new Map<string, string[]>();
  try {
    for (const [sym, names] of await loadAllWatchlistSymbols()) {
      if (changedSymbols.has(sym)) inLists.set(sym, names);
    }
  } catch {
    /* watchlist highlighting is best-effort */
  }

  const isUrgent = (c: ChangeRow) => positions.has(c.symbol) || watched.has(c.symbol) || inLists.has(c.symbol);
  const urgent = sortBandChanges(changes.filter(isUrgent));
  const others = sortBandChanges(changes.filter((c) => !isUrgent(c)));

  let alerted = false;
  let alertError: string | undefined;

  if (urgent.length > 0) {
    const lines = urgent.map((c) => {
      const listed = inLists.get(c.symbol);
      const flag = listed ? "🔥" : "⚠️";
      const sym = listed
        ? `<b><u>${symbolLinks(c.symbol)}</u></b>`
        : symbolLinks(c.symbol);
      const head = `${flag} ${sym}  <b>${escapeHtml(fmtBand(c.old_band, c.old_band_pct))} → ${escapeHtml(fmtBand(c.new_band, c.new_band_pct))}</b>`;
      const extras: string[] = [];
      const pos = positions.get(c.symbol);
      if (pos) extras.push(`   📌 Open position: <b>${pos.qty}</b> qty @ ${escapeHtml(money(pos.entry))}`);
      if (listed) extras.push(`   ⭐ <b>In watchlist:</b> ${escapeHtml(listed.join(", "))}`);
      const note = watched.get(c.symbol);
      if (watched.has(c.symbol)) extras.push(`   👁 Band watch${note ? ` — ${escapeHtml(note)}` : ""}`);
      return [head, ...extras].join("\n");
    });
    const res = await safeSend(`⚠️ <b>Circuit band changes</b>\n\n${lines.join("\n\n")}`);
    if (res.sent) alerted = true;
    else alertError = res.reason;
    if (res.sent) {
      const syms = urgent.map((c) => c.symbol);
      for (let i = 0; i < syms.length; i += 200) {
        await supabaseAdmin
          .from("circuit_band_changes")
          .update({ notified: true })
          .in("symbol", syms.slice(i, i + 200))
          .eq("notified", false);
      }
    }
  }

  if (others.length > 0) {
    // Monospace table — Telegram renders <pre> in a fixed-width block so the
    // columns line up. Send every row in self-contained batches so Telegram
    // never truncates the tail or receives an HTML tag split across messages.
    const widest = Math.max(6, ...others.map((c) => c.symbol.length));
    const arrow = (c: ChangeRow) => {
      const from = Number(c.old_band_pct ?? NaN);
      const to = Number(c.new_band_pct ?? NaN);
      if (Number.isFinite(from) && Number.isFinite(to)) return to > from ? "🟢" : "🔴";
      return "•";
    };
    const header = `${"SYMBOL".padEnd(widest)}  ${"OLD".padStart(5)} → ${"NEW".padStart(5)}`;
    const batches: ChangeRow[][] = [];
    for (let i = 0; i < others.length; i += 45) batches.push(others.slice(i, i + 45));
    let allSent = true;
    for (let i = 0; i < batches.length; i++) {
      const body = batches[i]
        .map(
          (c) =>
            `${c.symbol.padEnd(widest)}  ${fmtBand(c.old_band, c.old_band_pct).padStart(5)} → ${fmtBand(
              c.new_band,
              c.new_band_pct,
            ).padStart(5)} ${arrow(c)}`,
        )
        .join("\n");
      const page = batches.length > 1 ? ` · ${i + 1}/${batches.length}` : "";
      const res = await safeSend(
        `ℹ️ <b>Band change digest</b> — ${others.length} symbols${page}\n<pre>${escapeHtml(
          `${header}\n${"-".repeat(header.length)}\n${body}`,
        )}</pre>`,
      );
      if (!res.sent) {
        allSent = false;
        if (!alertError) alertError = res.reason;
        break;
      }
      alerted = true;
    }
    if (allSent) {
      const syms = others.map((c) => c.symbol);
      for (let i = 0; i < syms.length; i += 200) {
        await supabaseAdmin
          .from("circuit_band_changes")
          .update({ digested: true })
          .in("symbol", syms.slice(i, i + 200))
          .eq("digested", false);
      }
    }
  }

  if (alertError) console.error("band change alert not delivered:", alertError);

  return {
    changes: changes.length,
    urgent: urgent.length,
    others: others.length,
    alerted,
    alertError,
  };
}
