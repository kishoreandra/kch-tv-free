// Admin-only server functions for user approval management.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.is_admin) throw new Error("Forbidden");
}

export const listPendingProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("user_profiles")
      .select("user_id,email,approved,is_admin,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { profiles: data ?? [] };
  });

export const setProfileApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; approved: boolean }) => {
    if (!d?.userId) throw new Error("userId required");
    return { userId: d.userId, approved: Boolean(d.approved) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("user_profiles")
      .update({ approved: data.approved })
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
