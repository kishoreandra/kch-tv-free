// Delivery of user custom reminders to Telegram.
import { sendTelegram, escapeHtml } from "@/lib/telegram.server";

export interface ReminderDeliveryResult {
  due: number;
  sent: number;
  reason?: string;
}

interface DueRow {
  id: string;
  title: string;
  body: string | null;
  send_at: string;
  repeat_minutes: number | null;
  repeat_until: string | null;
}

/** Light markdown-ish note formatting -> Telegram HTML. */
function renderBody(body: string): string {
  return escapeHtml(body)
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/_([^_\n]+)_/g, "<i>$1</i>");
}

/** Next occurrence strictly in the future, honouring the repeat interval. */
function nextOccurrence(sendAt: string, minutes: number, now: Date): Date {
  const base = new Date(sendAt).getTime();
  const step = minutes * 60_000;
  const missed = Math.floor((now.getTime() - base) / step) + 1;
  return new Date(base + Math.max(1, missed) * step);
}

/** Sends every enabled, unsent reminder whose time has passed. */
export async function deliverDueReminders(onlyUserId?: string): Promise<ReminderDeliveryResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const nowIso = now.toISOString();

  let q = (supabaseAdmin as any)
    .from("custom_reminders")
    .select("id,user_id,title,body,send_at,repeat_minutes,repeat_until")
    .eq("enabled", true)
    .is("sent_at", null)
    .lte("send_at", nowIso)
    .order("send_at", { ascending: true })
    .limit(200);
  if (onlyUserId) q = q.eq("user_id", onlyUserId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DueRow[];
  if (rows.length === 0) return { due: 0, sent: 0 };

  const text =
    "⏰ <b>Reminders</b>\n\n" +
    rows
      .map((r) => {
        const repeat =
          r.repeat_minutes && r.repeat_minutes > 0
            ? ` <i>(repeats every ${r.repeat_minutes} min)</i>`
            : "";
        const body = r.body ? `\n${renderBody(r.body)}` : "";
        return `🔸 <b>${escapeHtml(r.title)}</b>${repeat}${body}`;
      })
      .join("\n\n");

  const res = await sendTelegram(text, { html: true });

  // Repeating reminders roll forward to their next slot; one-shot reminders go
  // inactive. We mark either way so a delivery failure can't loop forever.
  for (const r of rows) {
    const repeats = (r.repeat_minutes ?? 0) > 0;
    const nextAt = repeats ? nextOccurrence(r.send_at, r.repeat_minutes!, now) : null;
    const withinWindow =
      nextAt != null && (!r.repeat_until || nextAt.getTime() <= new Date(r.repeat_until).getTime());

    const patch = withinWindow
      ? { send_at: nextAt!.toISOString(), sent_at: null, last_sent_at: nowIso, enabled: true }
      : { sent_at: nowIso, last_sent_at: nowIso, enabled: false };

    await (supabaseAdmin as any).from("custom_reminders").update(patch).eq("id", r.id);
  }

  return { due: rows.length, sent: res.sent ? rows.length : 0, reason: res.reason };
}
