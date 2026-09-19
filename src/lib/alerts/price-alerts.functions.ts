// CRUD + manual run for user technical alerts delivered to Telegram.
import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";
import { requireAdminAuth } from "@/lib/auth/approved-middleware";

export type AlertParams = Record<string, string | number>;

export interface PriceAlertRow {
  id: string;
  symbol: string;
  kind: string;
  timeframe: string;
  params: AlertParams | null;
  left_field: string;
  operator: string;
  right_field: string;
  right_value: number | null;
  tolerance_pct: number | null;
  note: string | null;
  enabled: boolean;
  repeat_alert: boolean;
  last_triggered_at: string | null;
  times_triggered: number;
  created_at: string;
}

const SELECT =
  "id,symbol,kind,timeframe,params,left_field,operator,right_field,right_value,tolerance_pct,note,enabled,repeat_alert,last_triggered_at,times_triggered,created_at";

const norm = (s: string) => String(s ?? "").trim().replace(/\.NS$/i, "").toUpperCase().slice(0, 32);

export const listPriceAlerts = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("price_alerts")
      .select(SELECT)
      .eq("user_id", context.userId)
      .order("symbol", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as PriceAlertRow[];
  });

/** Symbols the user tracks — used by the bulk-apply option. */
export const listAlertTargets = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const [watch, trades, ud] = await Promise.all([
      sb.from("band_watchlist").select("symbol").eq("user_id", context.userId).limit(2000),
      sb
        .from("trades")
        .select("symbol,status")
        .eq("user_id", context.userId)
        .eq("status", "open")
        .limit(2000),
      sb.from("user_data").select("lists").eq("user_id", context.userId).maybeSingle(),
    ]);
    const uniq = (rows: any[] | null) =>
      Array.from(new Set((rows ?? []).map((r: any) => norm(r.symbol)).filter(Boolean)));
    return { watchlist: uniq(watch.data), positions: uniq(trades.data), lists: readLists(ud?.data?.lists) };
  });

/** Custom watchlists live as JSON on user_data.lists (Holdings, Buyable, ...). */
function readLists(raw: unknown): { name: string; symbols: string[] }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l: any) => ({
      name: String(l?.name ?? "").trim(),
      symbols: Array.from(
        new Set(
          (Array.isArray(l?.symbols) ? l.symbols : [])
            .map((s: any) => norm(typeof s === "string" ? s : (s?.ticker ?? s?.yahoo ?? "")))
            .filter(Boolean),
        ),
      ) as string[],
    }))
    .filter((l) => !!l.name);
}


export const createPriceAlert = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator(
    (d: {
      symbol?: string;
      kind: string;
      timeframe?: string;
      params?: AlertParams;
      note?: string | null;
      repeat_alert?: boolean;
      apply_to?: "symbol" | "positions" | "watchlist" | "both" | "lists";
      list_names?: string[];
    }) => {
      const kind = String(d?.kind ?? "").trim();
      if (!kind) throw new Error("Alert type is required");
      const apply_to = d?.apply_to ?? "symbol";
      const symbol = norm(d?.symbol ?? "");
      if (apply_to === "symbol" && !symbol) throw new Error("Pick a symbol");
      const list_names = Array.isArray(d?.list_names)
        ? d.list_names.map((n) => String(n).trim()).filter(Boolean).slice(0, 20)
        : [];
      if (apply_to === "lists" && list_names.length === 0) throw new Error("Pick at least one watchlist");
      return {
        symbol,
        kind,
        timeframe: d?.timeframe === "W" ? "W" : "D",
        params: (d?.params ?? {}) as AlertParams,
        note: d?.note ? String(d.note).slice(0, 300) : null,
        repeat_alert: !!d?.repeat_alert,
        apply_to,
        list_names,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let symbols: string[] = [data.symbol];
    if (data.apply_to === "lists") {
      const { data: ud } = await sb
        .from("user_data")
        .select("lists")
        .eq("user_id", context.userId)
        .maybeSingle();
      const wanted = new Set(data.list_names.map((n) => n.toLowerCase()));
      const picked = readLists(ud?.lists)
        .filter((l) => wanted.has(l.name.toLowerCase()))
        .flatMap((l) => l.symbols);
      symbols = Array.from(new Set(picked.filter(Boolean)));
    } else if (data.apply_to !== "symbol") {
      const [watch, trades] = await Promise.all([
        sb.from("band_watchlist").select("symbol").eq("user_id", context.userId).limit(2000),
        sb
          .from("trades")
          .select("symbol,status")
          .eq("user_id", context.userId)
          .eq("status", "open")
          .limit(2000),
      ]);
      const w = (watch.data ?? []).map((r: any) => norm(r.symbol));
      const p = (trades.data ?? []).map((r: any) => norm(r.symbol));
      const picked =
        data.apply_to === "watchlist" ? w : data.apply_to === "positions" ? p : [...w, ...p];
      symbols = Array.from(new Set(picked.filter(Boolean)));
    }
    if (symbols.length === 0) throw new Error("No matching symbols to apply this alert to");


    const rows = symbols.map((symbol) => ({
      user_id: context.userId,
      symbol,
      kind: data.kind,
      timeframe: data.timeframe,
      params: data.params,
      note: data.note,
      repeat_alert: data.repeat_alert,
      // legacy columns kept satisfied for backwards compatibility
      left_field: "price",
      operator: "above",
      right_field: "value",
      right_value: null,
    }));
    const { error } = await sb.from("price_alerts").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, created: rows.length };
  });

export const updatePriceAlert = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((d: { id: string; enabled?: boolean; repeat_alert?: boolean; note?: string | null }) => {
    if (!d?.id) throw new Error("id required");
    const patch: Record<string, unknown> = {};
    if (typeof d.enabled === "boolean") patch["enabled"] = d.enabled;
    if (typeof d.repeat_alert === "boolean") patch["repeat_alert"] = d.repeat_alert;
    if (d.note !== undefined) patch["note"] = d.note ? String(d.note).slice(0, 300) : null;
    return { id: String(d.id), patch };
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("price_alerts")
      .update(data.patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePriceAlert = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id required");
    return { id: String(d.id) };
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("price_alerts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Enable/disable, or delete, every alert on one symbol in a single click. */
export const bulkSymbolAlerts = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((d: { symbol: string; action: "enable" | "disable" | "delete" }) => {
    const symbol = norm(d?.symbol ?? "");
    if (!symbol) throw new Error("symbol required");
    const action = d?.action;
    if (action !== "enable" && action !== "disable" && action !== "delete")
      throw new Error("invalid action");
    return { symbol, action };
  })
  .handler(async ({ data, context }) => {
    const sb = (context.supabase as any).from("price_alerts");
    const q =
      data.action === "delete"
        ? sb.delete()
        : sb.update({ enabled: data.action === "enable" });
    const { error } = await q.eq("user_id", context.userId).eq("symbol", data.symbol);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Evaluate this user's alerts right now (and push any matches to Telegram).
export const runPriceAlertsNow = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { evaluatePriceAlerts } = await import("./price-alerts.server");
    return evaluatePriceAlerts(context.userId);
  });

/** How much OHLCV history the alert engine actually has (honest labelling). */
export const historyCoverage = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("daily_prices")
      .select("trade_date")
      .order("trade_date", { ascending: true })
      .limit(1);
    const { data: last } = await supabaseAdmin
      .from("daily_prices")
      .select("trade_date")
      .order("trade_date", { ascending: false })
      .limit(1);
    return {
      from: (data?.[0] as any)?.trade_date ?? null,
      to: (last?.[0] as any)?.trade_date ?? null,
    };
  });

/** Admin-triggered historical backfill (walks back from a date, max 30 days per run). */
export const backfillHistory = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((d: { end?: string; days?: number; scope?: "tracked" | "all" }) => ({
    end: d?.end ? String(d.end) : undefined,
    days: Math.min(Math.max(Number(d?.days) || 15, 1), 30),
    scope: d?.scope === "all" ? ("all" as const) : ("tracked" as const),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { backfillDailyPrices } = await import("@/lib/history/backfill.server");
    return backfillDailyPrices(supabaseAdmin, data);
  });

/** Admin-triggered fast backfill via Yahoo (years of history per symbol, batched). */
export const backfillHistoryYahoo = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((d: { scope?: "tracked" | "universe"; years?: number; limit?: number; offset?: number }) => ({
    scope: d?.scope === "universe" ? ("universe" as const) : ("tracked" as const),
    years: Math.min(Math.max(Number(d?.years) || 3, 1), 10),
    limit: Math.min(Math.max(Number(d?.limit) || 60, 1), 120),
    offset: Math.max(Number(d?.offset) || 0, 0),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { backfillViaYahoo } = await import("@/lib/history/yahoo-backfill.server");
    return backfillViaYahoo(supabaseAdmin, data);
  });
