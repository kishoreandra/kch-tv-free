// Server-side approval gate. Any handler that returns market data or writes
// user-scoped data should call `assertApproved(context)` immediately after
// `requireSupabaseAuth`. This mirrors the client-side ApprovalGate so
// unapproved sessions cannot bypass the UI by calling server functions
// directly (curl, devtools, etc.).
export async function assertApproved(context: { supabase: any; userId: string }): Promise<void> {
  const { data, error } = await context.supabase
    .from("user_profiles")
    .select("approved,is_admin")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: profile not found");
  if (!data.approved && !data.is_admin) {
    throw new Error("Forbidden: account pending admin approval");
  }
}
