import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelTorrentSearch,
  refreshSearchProviderHealth,
  searchTorrents,
  type SearchFilters,
  type SearchProviderInfo,
  type SearchProviderStatus,
  type TorrentSearchResult,
} from "../../lib/discovery";
import { describeError } from "../../lib/desktop";

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useTorrentSearch(enabled: boolean) {
  const [providers, setProviders] = useState<SearchProviderInfo[]>([]);
  const [results, setResults] = useState<TorrentSearchResult[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<SearchProviderStatus[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeSearchId = useRef<string | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    refreshSearchProviderHealth()
      .then((items) => {
        if (active) setProviders(items);
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause));
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  const cancelSearch = useCallback(async () => {
    const current = activeSearchId.current;
    if (!current) return;
    activeSearchId.current = null;
    sequence.current += 1;
    setLoading(false);
    try {
      await cancelTorrentSearch(current);
    } catch (cause) {
      setError(`Could not stop the search request: ${describeError(cause)}`);
    }
  }, []);

  const runSearch = useCallback(async (
    query: string,
    filters: SearchFilters,
    nextPage = 1,
    append = false,
  ) => {
    const previous = activeSearchId.current;
    activeSearchId.current = null;
    if (previous) {
      try {
        await cancelTorrentSearch(previous);
      } catch (cause) {
        setError(`Could not stop the earlier search: ${describeError(cause)}`);
      }
    }

    const id = requestId();
    const currentSequence = ++sequence.current;
    activeSearchId.current = id;
    setError("");
    setLoading(true);
    if (!append) {
      setResults([]);
      setProviderStatuses([]);
      setPage(0);
      setHasMore(false);
    }

    try {
      const response = await searchTorrents(id, query, nextPage, filters);
      if (activeSearchId.current !== id || currentSequence !== sequence.current) return;
      if (response.cancelled) return;
      setResults((current) => {
        if (!append) return response.results;
        const seen = new Set(current.map((result) => `${result.provider}:${result.id}`));
        return [...current, ...response.results.filter((result) => !seen.has(`${result.provider}:${result.id}`))];
      });
      setProviderStatuses(response.providers);
      setPage(response.page);
      setHasMore(response.hasMore);
    } catch (cause) {
      if (activeSearchId.current === id && currentSequence === sequence.current) {
        setError(describeError(cause));
      }
    } finally {
      if (activeSearchId.current === id && currentSequence === sequence.current) {
        activeSearchId.current = null;
        setLoading(false);
      }
    }
  }, []);

  const loadMore = useCallback((query: string, filters: SearchFilters) => {
    if (loading || !hasMore || page < 1) return;
    void runSearch(query, filters, page + 1, true);
  }, [hasMore, loading, page, runSearch]);

  return {
    providers,
    results,
    providerStatuses,
    page,
    hasMore,
    loading,
    error,
    setError,
    runSearch,
    cancelSearch,
    loadMore,
  };
}
