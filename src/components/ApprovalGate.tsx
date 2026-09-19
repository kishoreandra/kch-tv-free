import type { ReactNode } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
  signedOut: ReactNode;
}

export function ApprovalGate({ children, signedOut }: Props) {
  const { user, loading, approved, isAdmin } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <>{signedOut}</>;
  if (!approved && !isAdmin) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <ShieldAlert className="h-10 w-10 text-amber-500" />
        <h1 className="text-2xl font-semibold">Access pending approval</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Your sign-up was received. The admin (keechu7@gmail.com) needs to approve your account before you can use the app.
          You will be granted access once approved — try signing in again later.
        </p>
        <div className="text-xs text-muted-foreground">Signed in as {user.email}</div>
        <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </div>
    );
  }
  return <>{children}</>;
}
