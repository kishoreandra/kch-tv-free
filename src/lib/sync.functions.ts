import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

// Pull the user's full sync row. Returns null if nothing saved yet.
export const pullUserData = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_data")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

import type { Json } from "@/integrations/supabase/types";
const jsonish = z.unknown() as unknown as z.ZodType<Json | undefined>;
const payloadSchema = z.object({
  panes: jsonish.optional(),
  indicators: jsonish.optional(),
  chart_cfg: jsonish.optional(),
  selected: z.string().nullable().optional(),
  watchlist: jsonish.optional(),
  lists: jsonish.optional(),
  last_list_id: z.string().nullable().optional(),
  alerts: jsonish.optional(),
  alert_sound: z.boolean().optional(),
  viewed_by_list: jsonish.optional(),
});

export const pushUserData = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((input: unknown) => payloadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = { user_id: userId, ...data };
    const { error } = await supabase
      .from("user_data")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
