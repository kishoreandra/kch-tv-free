// CRUD for personal reminders (title + note + send time) delivered to Telegram.
import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

export interface ReminderRow {
  id: string;
  title: string;
  body: string | null;
  send_at: string;
  enabled: boolean;
  sent_at: string | null;
  created_at: string;
  repeat_minutes: number | null;
  repeat_until: string | null;
  last_sent_at: string | null;
}

const SELECT =
  "id,title,body,send_at,enabled,sent_at,created_at,repeat_minutes,repeat_until,last_sent_at";

export const listReminders = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("custom_reminders")
      .select(SELECT)
      .eq("user_id", context.userId)
      .order("send_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ReminderRow[];
  });

export const createReminder = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator(
    (d: {
      title?: string;
      body?: string;
      send_at?: string;
      repeat_minutes?: number | null;
      repeat_until?: string | null;
    }) => {
      const title = String(d?.title ?? "").trim().slice(0, 160);
      if (!title) throw new Error("Title is required");
      const when = d?.send_at ? new Date(d.send_at) : null;
      if (!when || Number.isNaN(when.getTime())) throw new Error("Pick a valid date & time");
      const repeat = Number(d?.repeat_minutes ?? 0);
      const until = d?.repeat_until ? new Date(d.repeat_until) : null;
      return {
        title,
        body: String(d?.body ?? "").slice(0, 4000),
        send_at: when.toISOString(),
        repeat_minutes: Number.isFinite(repeat) && repeat > 0 ? Math.round(repeat) : null,
        repeat_until: until && !Number.isNaN(until.getTime()) ? until.toISOString() : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("custom_reminders")
      .insert({ ...data, user_id: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateReminder = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator(
    (d: {
      id: string;
      title?: string;
      body?: string;
      send_at?: string;
      enabled?: boolean;
      repeat_minutes?: number | null;
    }) => {
      if (!d?.id) throw new Error("id required");
      const patch: Record<string, unknown> = {};
      if (d.title !== undefined) patch["title"] = String(d.title).trim().slice(0, 160);
      if (d.body !== undefined) patch["body"] = String(d.body).slice(0, 4000);
      if (d.send_at !== undefined) {
        const when = new Date(d.send_at);
        if (Number.isNaN(when.getTime())) throw new Error("Invalid date & time");
        patch["send_at"] = when.toISOString();
        patch["sent_at"] = null;
      }
      if (d.repeat_minutes !== undefined) {
        const n = Number(d.repeat_minutes ?? 0);
        patch["repeat_minutes"] = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      }
      if (typeof d.enabled === "boolean") patch["enabled"] = d.enabled;
      return { id: String(d.id), patch };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("custom_reminders")
      .update(data.patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteReminder = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id required");
    return { id: String(d.id) };
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("custom_reminders")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Send any of this user's reminders that are already due, right now. */
export const runRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { deliverDueReminders } = await import("./reminders.server");
    return deliverDueReminders(context.userId);
  });
