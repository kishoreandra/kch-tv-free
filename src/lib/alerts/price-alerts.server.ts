// Server-side evaluation of user technical alerts.
//
// Two families live side by side:
//  * legacy snapshot alerts (kind = 'legacy') — evaluated against stock_snapshot
//  * kind-based price/volume alerts — evaluated against daily_prices history,
//    on the Daily or Weekly timeframe.
// Matches are delivered to Telegram with the actual numbers behind the trigger.

import { sendTelegram, escapeHtml, symbolLinks } from "@/lib/telegram.server";
import { describeAlertCondition } from "./price-alert-meta";
import { describeKind } from "./alert-kinds";
import { loadDailyBars, toWeekly } from "./series.server";
import { evaluateKind } from "./evaluate-kinds.server";

export { LEFT_FIELDS, RIGHT_FIELDS, OPERATORS, FIELD_LABELS, OPERATOR_LABELS } from "./price-alert-meta";
export type { LeftField, RightField, AlertOperator } from "./price-alert-meta";

export interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  kind: string;
  timeframe: string;
  params: Record<string, unknown> | null;
  left_field: string;
  operator: string;
  right_field: string;
  right_value: number | null;
  tolerance_pct: number | null;
  note: string | null;
  enabled: boolean;
  repeat_alert: boolean;
  last_state: boolean | null;
}

type Snap = Record<string, number | null>;

function pick(snap: Snap, field: string): number | null {
  const v = snap[field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function describeAlert(
  a: Pick<AlertRow, "left_field" | "operator" | "right_field" | "right_value" | "tolerance_pct">,
): string {
  return describeAlertCondition(a);
}

/** True when a legacy snapshot alert's condition currently holds. */
export function conditionHolds(a: AlertRow, snap: Snap): boolean | null {
  const left = pick(snap, a.left_field);
  const right = a.right_field === "value" ? (a.right_value ?? null) : pick(snap, a.right_field);
  if (left == null || right == null) return null;
  switch (a.operator) {
    case "above":
    case "crosses_above":
      return left > right;
    case "below":
    case "crosses_below":
      return left < right;
    case "near": {
      const tol = Math.abs(Number(a.tolerance_pct ?? 1));
      if (right === 0) return false;
      return (Math.abs(left - right) / Math.abs(right)) * 100 <= tol;
    }
    default:
      return null;
  }
}

function norm(sym: string): string {
  return sym.replace(/\.NS$/i, "").toUpperCase();
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export interface EvaluateResult {
  alerts: number;
  fired: number;
  sent: boolean;
  reason?: string;
}

export async function evaluatePriceAlerts(onlyUserId?: string): Promise<EvaluateResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { recentDeals } = await import("@/lib/history/backfill.server");

  let q = supabaseAdmin.from("price_alerts").select("*").eq("enabled", true);
  if (onlyUserId) q = q.eq("user_id", onlyUserId);
  const { data: alertsData, error } = await q;
  if (error) throw new Error(error.message);
  const alerts = (alertsData ?? []) as unknown as AlertRow[];
  if (alerts.length === 0) return { alerts: 0, fired: 0, sent: false };

  const legacy = alerts.filter((a) => (a.kind ?? "legacy") === "legacy");
  const modern = alerts.filter((a) => (a.kind ?? "legacy") !== "legacy");

  const bySymbol = new Map<string, string[]>();
  const firedIds: string[] = [];
  const clearedIds: string[] = [];
  const push = (symbol: string, line: string) => {
    const arr = bySymbol.get(symbol) ?? [];
    arr.push(line);
    bySymbol.set(symbol, arr);
  };

  // ---------------------------------------------------------------- legacy
  if (legacy.length > 0) {
    const symbols = Array.from(new Set(legacy.map((a) => norm(a.symbol))));
    const { data: snapData, error: snapErr } = await supabaseAdmin
      .from("stock_snapshot")
      .select("symbol,ticker,price,ema10,ema20,ema50,ema100,ema200,rsi14,high_52w,low_52w,ath")
      .in("ticker", symbols);
    if (snapErr) throw new Error(snapErr.message);
    const snaps = new Map<string, Snap>();
    for (const r of (snapData ?? []) as Array<Record<string, unknown>>) {
      snaps.set(norm(String(r["ticker"] ?? r["symbol"] ?? "")), r as Snap);
    }
    for (const a of legacy) {
      const snap = snaps.get(norm(a.symbol));
      if (!snap) continue;
      const holds = conditionHolds(a, snap);
      if (holds == null) continue;
      if (!holds) {
        if (a.last_state !== false) clearedIds.push(a.id);
        continue;
      }
      if (a.last_state === true && !a.repeat_alert) continue;
      firedIds.push(a.id);
      push(
        norm(a.symbol),
        `• ${describeAlert(a)} · LTP ${fmt(pick(snap, "price"))}${a.note ? `\n   📝 ${a.note}` : ""}`,
      );
    }
  }

  // --------------------------------------------------------------- modern
  if (modern.length > 0) {
    const symbols = Array.from(new Set(modern.map((a) => norm(a.symbol))));
    const barsBySymbol = await loadDailyBars(supabaseAdmin as any, symbols);
    const weeklyCache = new Map<string, ReturnType<typeof toWeekly>>();

    for (const a of modern) {
      const sym = norm(a.symbol);
      const daily = barsBySymbol.get(sym);
      if (!daily || daily.length < 10) continue;
      const tf = a.timeframe === "W" ? "W" : "D";
      let bars = daily;
      if (tf === "W") {
        let w = weeklyCache.get(sym);
        if (!w) {
          w = toWeekly(daily);
          weeklyCache.set(sym, w);
        }
        bars = w;
      }
      const params = (a.params ?? {}) as Record<string, unknown>;
      const res = evaluateKind(a.kind, params, bars);
      if (!res) continue;
      if (!res.holds) {
        if (a.last_state !== false) clearedIds.push(a.id);
        continue;
      }
      if (a.last_state === true && !a.repeat_alert) continue;
      firedIds.push(a.id);

      let extra = "";
      if (a.kind === "volume_record") {
        const deals = await recentDeals(supabaseAdmin, sym, bars[bars.length - 1].date);
        extra = deals.count
          ? `\n   ⚠️ coincides with ${deals.summary}`
          : "\n   ✅ no reported bulk/block deal — looks like broad participation";
      }
      // Price-level alerts already read as a full sentence ("Closed above ₹340
      // (closed at ₹342.50)"), so we skip the generic description line.
      const headline =
        a.kind === "price_level"
          ? `• [${tf === "W" ? "Weekly" : "Daily"}] ${res.detail}`
          : `• [${tf === "W" ? "Weekly" : "Daily"}] ${describeKind(a.kind, tf, params)}\n   ${res.detail}`;
      push(sym, `${headline}${a.note ? `\n   📝 ${a.note}` : ""}${extra}`);
    }
  }

  let sent = false;
  let reason: string | undefined;
  if (bySymbol.size > 0) {
    // Telegram HTML: symbol links out to our chart + TradingView, the headline
    // of every trigger is bold, and direction gets a colour cue.
    const decorate = (line: string) => {
      const [head, ...rest] = escapeHtml(line).split("\n");
      const cue = /above|crosses up|breakout|high/i.test(head)
        ? "🟢"
        : /below|crosses down|low/i.test(head)
          ? "🔴"
          : "🔹";
      const bolded = head.replace(/^•\s*/, "");
      return [`${cue} <b>${bolded}</b>`, ...rest].join("\n");
    };
    const blocks = Array.from(bySymbol.entries()).map(
      ([sym, lines]) => `${symbolLinks(sym)}\n${lines.map(decorate).join("\n")}`,
    );
    const res = await sendTelegram(`📈 <b>Technical alerts</b>\n\n${blocks.join("\n\n")}`, {
      html: true,
    });
    sent = res.sent;
    if (!res.sent) reason = res.reason;
  }

  const now = new Date().toISOString();
  const repeatById = new Map(alerts.map((a) => [a.id, a.repeat_alert]));
  // Fired one-shot alerts go inactive; repeating alerts stay armed.
  const oneShot = firedIds.filter((id) => !repeatById.get(id));
  const repeating = firedIds.filter((id) => repeatById.get(id));
  for (let i = 0; i < oneShot.length; i += 200) {
    await (supabaseAdmin as any).rpc("bump_alert_triggers", {
      _ids: oneShot.slice(i, i + 200),
      _at: now,
      _disable: true,
    });
  }
  for (let i = 0; i < repeating.length; i += 200) {
    await (supabaseAdmin as any).rpc("bump_alert_triggers", {
      _ids: repeating.slice(i, i + 200),
      _at: now,
      _disable: false,
    });
  }
  for (let i = 0; i < clearedIds.length; i += 200) {
    await supabaseAdmin
      .from("price_alerts")
      .update({ last_state: false })
      .in("id", clearedIds.slice(i, i + 200));
  }

  return { alerts: alerts.length, fired: firedIds.length, sent, reason };
}
