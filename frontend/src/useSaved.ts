import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const LS_KEY = "teslapricing_saved";

function lsLoad(): Set<number> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

function lsSave(ids: Set<number>) {
  localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
}

export function useSaved(user: User | null) {
  const [saved, setSaved] = useState<Set<number>>(lsLoad);

  // When user logs in, load their DB watchlist and merge with localStorage
  useEffect(() => {
    if (!user) {
      setSaved(lsLoad());
      return;
    }
    supabase
      .from("user_watchlist")
      .select("listing_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const dbIds = new Set((data ?? []).map((r) => r.listing_id as number));
        const local = lsLoad();
        // Merge local into DB
        const toSync = [...local].filter((id) => !dbIds.has(id));
        if (toSync.length > 0) {
          supabase.from("user_watchlist").insert(toSync.map((listing_id) => ({ user_id: user.id, listing_id }))).then(() => {});
        }
        const merged = new Set([...dbIds, ...local]);
        setSaved(merged);
        lsSave(merged);
      });
  }, [user?.id]);

  const toggle = useCallback((id: number) => {
    setSaved((prev) => {
      const next = new Set(prev);
      const removing = next.has(id);
      removing ? next.delete(id) : next.add(id);
      lsSave(next);
      if (user) {
        if (removing) {
          supabase.from("user_watchlist").delete().eq("user_id", user.id).eq("listing_id", id).then(() => {});
        } else {
          supabase.from("user_watchlist").insert({ user_id: user.id, listing_id: id }).then(() => {});
        }
      }
      return next;
    });
  }, [user]);

  const isSaved = useCallback((id: number) => saved.has(id), [saved]);

  return { saved, toggle, isSaved };
}
