import { useState } from "react";

const MAX = 3;
const KEY = "compare_ids";

function load(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function save(ids: number[]) {
  localStorage.setItem(KEY, JSON.stringify(ids));
}

export function useCompare() {
  const [ids, setIds] = useState<number[]>(load);

  function toggle(id: number) {
    setIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < MAX ? [...prev, id] : prev;
      save(next);
      return next;
    });
  }

  function clear() {
    setIds([]);
    save([]);
  }

  function isComparing(id: number) {
    return ids.includes(id);
  }

  return { ids, toggle, clear, isComparing };
}
