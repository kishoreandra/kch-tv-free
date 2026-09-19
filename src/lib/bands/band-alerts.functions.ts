// User-facing reads/writes for circuit-band change tracking.
import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth, requireAdminAuth } from "@/lib/auth/approved-middleware";

function norm(sym: string): string {
  return sym.replace(/\.NS$/i, "").toUpperCase();
}

export interface BandChangeRow {
  id: number;
  symbol: string;
  old_band: string | null;
  new_band: string | null;
  old_band_pct: number | null;
  new_band_pct: number | null;
  detected_at: string;
  notified: boolean;
  digested: boolean;
}

export interface BandWatchRow {
  id: string;
  symbol: string;
  notes: string | null;
  added_at: string;
}

export const listBandChanges = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("circuit_band_changes")
      .select("id,symbol,old_band,new_band,old_band_pct,new_band_pct,detected_at,notified,digested")
      .order("detected_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []) as BandChangeRow[];
  });

export const listBandWatchlist = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("band_watchlist")
      .select("id,symbol,notes,added_at")
      .eq("user_id", context.userId)
      .order("added_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as BandWatchRow[];
  });

export const listAllWatchlistSymbols = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { loadAllWatchlistSymbols } = await import("@/lib/bands/watchlist-symbols.server");
    return await loadAllWatchlistSymbols();
  });

export const addBandWatch = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((d: { symbol: string; notes?: string | null }) => {
    const symbol = String(d?.symbol ?? "").trim().replace(/\.NS$/i, "").toUpperCase();
    if (!symbol) throw new Error("symbol required");
    return { symbol: symbol.slice(0, 32), notes: d?.notes ? String(d.notes).slice(0, 300) : null };
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("band_watchlist")
      .upsert({ user_id: context.userId, symbol: data.symbol, notes: data.notes }, { onConflict: "user_id,symbol" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeBandWatch = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id required");
    return { id: String(d.id) };
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("band_watchlist")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin: push the most recent day's band changes to Telegram on demand.
// Mirrors the two-message format of the automatic recordBandChanges job:
//  1. Urgent (positions / band-watchlist / custom-watchlist) as rich HTML
//  2. Everything else as a monospace digest table, 45 rows per message
export const sendLatestBandChanges = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("circuit_band_changes")
      .select("symbol,old_band,new_band,old_band_pct,new_band_pct,detected_at")
      .order("detected_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as BandChangeRow[];
    if (rows.length === 0) throw new Error("No band changes recorded yet");

    const latestDay = new Date(rows[0].detected_at).toDateString();
    const today = rows.filter((r) => new Date(r.detected_at).toDateString() === latestDay);

    const { sendTelegram, escapeHtml, symbolLinks } = await import("@/lib/telegram.server");
    const { loadAllWatchlistSymbols } = await import("@/lib/bands/watchlist-symbols.server");

    // 1. Watchlist symbols (all users, scanning excluded)
    let inLists = new Map<string, string[]>();
    try {
      inLists = await loadAllWatchlistSymbols();
    } catch {
      /* best-effort */
    }

    // 2. Open positions
    const { data: openTrades } = await (context.supabase as any)
      .from("trades")
      .select("symbol,quantity,entry_price")
      .eq("status", "open");
    const positions = new Map<string, { qty: number; entry: number }>();
    for (const t of (openTrades ?? []) as Array<{ symbol: string; quantity: number; entry_price: number }>) {
      const key = norm(t.symbol);
      const cur = positions.get(key);
      positions.set(key, {
        qty: (cur?.qty ?? 0) + Number(t.quantity ?? 0),
        entry: cur?.entry ?? Number(t.entry_price ?? 0),
      });
    }

    // 3. Band watchlist (with notes)
    const { data: watchRows } = await (context.supabase as any)
      .from("band_watchlist")
      .select("symbol,notes");
    const watched = new Map<string, string | null>();
    for (const w of (watchRows ?? []) as Array<{ symbol: string; notes: string | null }>) {
      watched.set(norm(w.symbol), w.notes);
    }

    const label = (b: string | null, p: number | null) =>
      b && b.trim() ? (b.includes("%") ? b : `${b}%`) : p != null ? `${p}%` : "—";
    const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    const rank = (b: string | null, p: number | null) => {
      const n = p ?? Number(String(b ?? "").replace(/[^\d.]/g, ""));
      return n === 20 ? 0 : n === 10 ? 1 : 2;
    };
    const sort = (arr: BandChangeRow[]) =>
      [...arr].sort((a, b) => rank(a.new_band, a.new_band_pct) - rank(b.new_band, b.new_band_pct) || a.symbol.localeCompare(b.symbol));

    const isUrgent = (c: BandChangeRow) =>
      positions.has(c.symbol) || watched.has(c.symbol) || inLists.has(c.symbol.toUpperCase());

    const urgent = sort(today.filter(isUrgent));
    const others = sort(today.filter((c) => !isUrgent(c)));

    const dayLabel = new Date(rows[0].detected_at).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });

    let sent = 0;

    // ── Message 1: urgent symbols (rich HTML) ──────────────────────────────
    if (urgent.length > 0) {
      const lines = urgent.map((c) => {
        const listed = inLists.get(c.symbol.toUpperCase());
        const flag = listed ? "🔥" : "⚠️";
        const sym = listed
          ? `<b><u>${symbolLinks(c.symbol)}</u></b>`
          : symbolLinks(c.symbol);
        const head = `${flag} ${sym}  <b>${escapeHtml(label(c.old_band, c.old_band_pct))} → ${escapeHtml(label(c.new_band, c.new_band_pct))}</b>`;
        const extras: string[] = [];
        const pos = positions.get(c.symbol);
        if (pos) extras.push(`   📌 Open position: <b>${pos.qty}</b> qty @ ${escapeHtml(money(pos.entry))}`);
        if (listed) extras.push(`   ⭐ <b>In watchlist:</b> ${escapeHtml(listed.join(", "))}`);
        const note = watched.get(c.symbol);
        if (watched.has(c.symbol)) extras.push(`   👁 Band watch${note ? ` — ${escapeHtml(note)}` : ""}`);
        return [head, ...extras].join("\n");
      });
      const res = await sendTelegram(`⚠️ <b>Circuit band changes</b>\n\n${lines.join("\n\n")}`, { html: true });
      if (!res.sent) throw new Error(res.reason ?? "Telegram send failed (urgent)");
      sent += urgent.length;
    }

    // ── Message 2+: digest table for the rest ──────────────────────────────
    if (others.length > 0) {
      const widest = Math.max(6, ...others.map((c) => c.symbol.length));
      const arrow = (c: BandChangeRow) => {
        const from = Number(c.old_band_pct ?? NaN);
        const to = Number(c.new_band_pct ?? NaN);
        if (Number.isFinite(from) && Number.isFinite(to)) return to > from ? "🟢" : "🔴";
        return "•";
      };
      const header = `${"SYMBOL".padEnd(widest)}  ${"OLD".padStart(5)} → ${"NEW".padStart(5)}`;
      const batches: BandChangeRow[][] = [];
      for (let i = 0; i < others.length; i += 45) batches.push(others.slice(i, i + 45));
      for (let i = 0; i < batches.length; i++) {
        const body = batches[i]
          .map(
            (c) =>
              `${c.symbol.padEnd(widest)}  ${label(c.old_band, c.old_band_pct).padStart(5)} → ${label(c.new_band, c.new_band_pct).padStart(5)} ${arrow(c)}`,
          )
          .join("\n");
        const page = batches.length > 1 ? ` · ${i + 1}/${batches.length}` : "";
        const res = await sendTelegram(
          `ℹ️ <b>Band change digest</b> — ${others.length} symbols${page}\n<pre>${escapeHtml(`${header}\n${"-".repeat(header.length)}\n${body}`)}</pre>`,
          { html: true },
        );
        if (!res.sent) throw new Error(res.reason ?? "Telegram send failed (digest)");
      }
      sent += others.length;
    }

    // Record delivery so the "Alerted" column tells the truth. The automatic
    // job sets these flags; a manual send used to leave the rows looking
    // unsent forever. Writes go through the service role because
    // circuit_band_changes is SELECT-only for signed-in users.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const chunks = (syms: string[]) => {
      const out: string[][] = [];
      for (let i = 0; i < syms.length; i += 150) out.push(syms.slice(i, i + 150));
      return out;
    };
    for (const chunk of chunks(urgent.map((c) => c.symbol))) {
      const { error: flagErr } = await supabaseAdmin
        .from("circuit_band_changes")
        .update({ notified: true })
        .in("symbol", chunk)
        .eq("notified", false);
      if (flagErr) console.error("band change notified flag failed:", flagErr.message);
    }
    for (const chunk of chunks(others.map((c) => c.symbol))) {
      const { error: flagErr } = await supabaseAdmin
        .from("circuit_band_changes")
        .update({ digested: true })
        .in("symbol", chunk)
        .eq("digested", false);
      if (flagErr) console.error("band change digested flag failed:", flagErr.message);
    }

    return { ok: true, count: sent, day: dayLabel };
  });

// Admin: verify Telegram delivery end-to-end.
export const sendTelegramTest = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .handler(async () => {
    const { sendTelegram } = await import("@/lib/telegram.server");
    const res = await sendTelegram("✅ Test alert from your NSE journal — circuit band alerts are wired up.");
    if (!res.sent) throw new Error(res.reason ?? "Telegram send failed");
    return { ok: true, chatId: res.chatId };
  });
