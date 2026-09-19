import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface ProfileInfo {
  approved: boolean;
  isAdmin: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    let cancelled = false;
    setProfileLoading(true);
    supabase
      .from("user_profiles")
      .select("approved,is_admin")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile({
          approved: Boolean(data?.approved),
          isAdmin: Boolean(data?.is_admin),
        });
        setProfileLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  return {
    user,
    loading: loading || (!!user && !profile),
    approved: profile?.approved ?? false,
    isAdmin: profile?.isAdmin ?? false,
  };
}
