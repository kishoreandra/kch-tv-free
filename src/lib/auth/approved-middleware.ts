// Server-function middleware that composes requireSupabaseAuth with the
// admin approval gate. Any user-data or market-data server fn should use
// `requireApprovedAuth` so that an authenticated-but-unapproved account
// cannot call the RPC directly (curl/devtools) and bypass the client-side
// ApprovalGate. Use `requireAdminAuth` for expensive/privileged actions.
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireApprovedAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
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
    return next({ context: { isAdmin: Boolean(data.is_admin) } });
  });

export const requireAdminAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.is_admin) throw new Error("Forbidden: admin only");
    return next();
  });
