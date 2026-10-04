import { useCallback, useState } from "react";

const STORAGE_KEY = "torque.browse.recent-searches.v1";
const MAX_RECENT_SEARCHES = 8;

function readRecentSearches(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function useRecentSearches() {
  const [searches, setSearches] = useState(readRecentSearches);

  const save = useCallback((next: string[]) => {
    setSearches(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing or a locked storage quota should not block search.
    }
  }, []);

  const remember = useCallback((query: string) => {
    const term = query.trim();
    if (!term) return;
    save([term, ...searches.filter((item) => item.toLocaleLowerCase() !== term.toLocaleLowerCase())]
      .slice(0, MAX_RECENT_SEARCHES));
  }, [save, searches]);

  const clear = useCallback(() => save([]), [save]);

  return { searches, remember, clear };
}
