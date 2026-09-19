import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

export const getJournalNote = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ period_type: z.enum(["daily", "weekly", "monthly"]), period_start: z.string().min(8) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await (supabase as any)
      .from("journal_notes")
      .select("*")
      .eq("user_id", userId)
      .eq("period_type", data.period_type)
      .eq("period_start", data.period_start)
      .limit(1);
    if (error) throw new Error(error.message);
    return (rows && rows[0]) ?? null;
  });

export const upsertJournalNote = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        period_type: z.enum(["daily", "weekly", "monthly"]),
        period_start: z.string().min(8),
        period_end: z.string().min(8),
        content: z.string().max(20000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      id: data.id ?? undefined,
      user_id: userId,
      period_type: data.period_type,
      period_start: data.period_start,
      period_end: data.period_end,
      content: data.content ?? "",
      updated_at: new Date().toISOString(),
    } as any;
    const { data: upserted, error } = await (supabase as any)
      .from("journal_notes")
      .upsert(row, { onConflict: ["user_id", "period_type", "period_start"] })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return upserted ?? null;
  });

/** List notes of a period type within an inclusive date range. */
export const listJournalNotes = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        period_type: z.enum(["daily", "weekly", "monthly"]),
        from: z.string().min(8),
        to: z.string().min(8),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await (supabase as any)
      .from("journal_notes")
      .select("id, period_type, period_start, period_end, content, updated_at")
      .eq("user_id", userId)
      .eq("period_type", data.period_type)
      .gte("period_start", data.from)
      .lte("period_start", data.to)
      .order("period_start", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as {
      id: string;
      period_type: string;
      period_start: string;
      period_end: string;
      content: string;
      updated_at: string;
    }[];
  });
