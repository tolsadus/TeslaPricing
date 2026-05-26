import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const LS_KEY = "teslapricing_pinned";

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

export function usePinned(user: User | null) {
  const [pinned, setPinned] = useState<Set<number>>(lsLoad);

  useEffect(() => {
    if (!user) {
      setPinned(lsLoad());
      return;
    }
    supabase
      .from("user_pinned")
      .select("listing_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const dbIds = new Set((data ?? []).map((r) => r.listing_id as number));
        const local = lsLoad();
        const toSync = [...local].filter((id) => !dbIds.has(id));
        if (toSync.length > 0) {
          supabase.from("user_pinned").insert(toSync.map((listing_id) => ({ user_id: user.id, listing_id }))).then(() => {});
        }
        const merged = new Set([...dbIds, ...local]);
        setPinned(merged);
        lsSave(merged);
      });
  }, [user?.id]);

  const toggle = useCallback((id: number) => {
    setPinned((prev) => {
      const next = new Set(prev);
      const removing = next.has(id);
      removing ? next.delete(id) : next.add(id);
      lsSave(next);
      if (user) {
        if (removing) {
          supabase.from("user_pinned").delete().eq("user_id", user.id).eq("listing_id", id).then(() => {});
        } else {
          supabase.from("user_pinned").insert({ user_id: user.id, listing_id: id }).then(() => {});
        }
      }
      return next;
    });
  }, [user]);

  const isPinned = useCallback((id: number) => pinned.has(id), [pinned]);

  return { pinned, toggle, isPinned };
}
