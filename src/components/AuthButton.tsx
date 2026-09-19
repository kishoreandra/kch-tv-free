import { useState, type ReactNode } from "react";
import { LogIn, LogOut, User as UserIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthButton({ extraMenuItems }: { extraMenuItems?: ReactNode } = {}) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  if (user) {
    const label = user.email?.[0]?.toUpperCase() ?? "U";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Signed in as
            <div className="truncate font-medium text-foreground">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {extraMenuItems}
          {extraMenuItems ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            onClick={async () => {
              await supabase.auth.signOut();
              toast.success("Signed out");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const handleGoogle = async () => {
    setBusy(true);
    try {
      // Standalone / self-hosted deployments (outside Lovable) sign in straight
      // through Supabase Auth. Set VITE_STANDALONE_AUTH=true in the host's env.
      if (import.meta.env.VITE_STANDALONE_AUTH === "true") {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
        if (error) {
          toast.error(error.message || "Google sign-in failed");
          setBusy(false);
        }
        return;
      }

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message || "Google sign-in failed");
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      setOpen(false);
      toast.success("Signed in");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleEmail = async () => {
    if (!email || !password) {
      toast.error("Email and password required");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <LogIn className="mr-1 h-3.5 w-3.5" /> Sign in
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{mode === "signin" ? "Sign in" : "Create account"}</DialogTitle>
            <DialogDescription>
              Sync your watchlists, alerts and chart settings across devices.
            </DialogDescription>
          </DialogHeader>

          <Button variant="outline" onClick={handleGoogle} disabled={busy} className="w-full">
            <UserIcon className="mr-2 h-4 w-4" /> Continue with Google
          </Button>

          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="auth-email" className="text-xs">Email</Label>
              <Input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="auth-password" className="text-xs">Password</Label>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                onKeyDown={(e) => e.key === "Enter" && handleEmail()}
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={handleEmail} disabled={busy} className="w-full">
              {mode === "signin" ? "Sign in" : "Sign up"}
            </Button>
            <button
              type="button"
              className="text-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
            >
              {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
