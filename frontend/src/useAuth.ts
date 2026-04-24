import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return data !== null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  async function handleUser(u: User | null) {
    setUser(u);
    setIsAdmin(u ? await checkIsAdmin(u.id) : false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      handleUser(u).finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  function signInWithGoogle() {
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }

  function signInWithGithub() {
    supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }

  function signInWithTwitter() {
    supabase.auth.signInWithOAuth({
      provider: "twitter",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }

  function signOut() {
    supabase.auth.signOut();
  }

  return { user, loading, isAdmin, signInWithGoogle, signInWithGithub, signInWithTwitter, signOut };
}
