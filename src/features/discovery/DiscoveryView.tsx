import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Archive, CircleAlert, LoaderCircle } from "lucide-react";
import {
  getTorrentSearchDetails,
  getTorrentSearchSource,
  type SearchCategory,
  type TorrentDownloadSource,
  type TorrentSearchDetails,
  type TorrentSearchResult,
} from "../../lib/discovery";
import { describeError } from "../../lib/desktop";
import { BrowseDetailsPanel } from "./BrowseDetailsPanel";
import { BrowseResults, BrowseResultsSkeleton } from "./BrowseResults";
import { BrowseSearchBar, type BrowseSort } from "./BrowseSearchBar";
import { BrowseSearchHistory } from "./BrowseSearchHistory";
import { useRecentSearches } from "./useRecentSearches";
import { useTorrentSearch } from "./useTorrentSearch";

interface DiscoveryViewProps {
  enabled: boolean;
  onReviewSource: (source: TorrentDownloadSource) => void;
}

function sortResults(results: TorrentSearchResult[], sort: BrowseSort): TorrentSearchResult[] {
  if (sort === "relevance") return results;
  return results.map((result, index) => ({ result, index })).sort((left, right) => {
    let comparison = 0;
    if (sort === "newest") {
      const leftDate = left.result.publishedAt ? Date.parse(left.result.publishedAt) : Number.NaN;
      const rightDate = right.result.publishedAt ? Date.parse(right.result.publishedAt) : Number.NaN;
      const leftHasDate = !Number.isNaN(leftDate);
      const rightHasDate = !Number.isNaN(rightDate);
      if (leftHasDate && !rightHasDate) return -1;
      if (!leftHasDate && rightHasDate) return 1;
      if (leftHasDate && rightHasDate) comparison = rightDate - leftDate;
    } else {
      const field = sort === "size" ? "sizeBytes" : "seeders";
      const leftValue = left.result[field];
      const rightValue = right.result[field];
      if (leftValue === null && rightValue !== null) return 1;
      if (rightValue === null && leftValue !== null) return -1;
      comparison = (rightValue ?? 0) - (leftValue ?? 0);
    }
    return comparison || left.index - right.index;
  }).map(({ result }) => result);
}

function resultKey(result: TorrentSearchResult): string {
  return `${result.provider}:${result.id}`;
}

export function DiscoveryView({ enabled, onReviewSource }: DiscoveryViewProps) {
  const search = useTorrentSearch(enabled);
  const recent = useRecentSearches();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [category, setCategory] = useState<SearchCategory | null>(null);
  const [providerId, setProviderId] = useState("");
  const [sort, setSort] = useState<BrowseSort>("relevance");
  const [selectedResult, setSelectedResult] = useState<TorrentSearchResult | null>(null);
  const [details, setDetails] = useState<TorrentSearchDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsRevision, setDetailsRevision] = useState(0);
  const [inspecting, setInspecting] = useState(false);
  const detailsRequest = useRef(0);

  useEffect(() => {
    if (!selectedResult) {
      setDetails(null);
      setDetailsError("");
      setDetailsLoading(false);
      return;
    }
    let current = true;
    const request = ++detailsRequest.current;
    setDetails(null);
    setDetailsError("");
    setDetailsLoading(true);
    getTorrentSearchDetails(selectedResult.provider, selectedResult.id)
      .then((response) => {
        if (current && request === detailsRequest.current) setDetails(response);
      })
      .catch((cause: unknown) => {
        if (current && request === detailsRequest.current) setDetailsError(describeError(cause));
      })
      .finally(() => {
        if (current && request === detailsRequest.current) setDetailsLoading(false);
      });
    return () => { current = false; };
  }, [selectedResult?.provider, selectedResult?.id, detailsRevision]);

  const providerById = useMemo(
    () => new Map(search.providers.map((provider) => [provider.id, provider.name])),
    [search.providers],
  );
  const filteredResults = useMemo(() => {
    const filtered = providerId
      ? search.results.filter((result) => result.provider === providerId)
      : search.results;
    return sortResults(filtered, sort);
  }, [providerId, search.results, sort]);
  const hasSeederData = search.results.some((result) => result.seeders !== null);
  const selectedKey = selectedResult ? resultKey(selectedResult) : null;
  const providerWarnings = search.providerStatuses.filter(({ health }) => health.state !== "healthy");

  function runQuery(term: string, nextCategory = category, nextProvider = providerId) {
    const normalized = term.trim();
    if (!normalized) return;
    setQuery(normalized);
    setSubmittedQuery(normalized);
    setSelectedResult(null);
    setDetails(null);
    setDetailsError("");
    recent.remember(normalized);
    void search.runSearch(normalized, {
      category: nextCategory,
      providerId: nextProvider || null,
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!search.loading) runQuery(query);
  }

  function changeCategory(next: SearchCategory | null) {
    setCategory(next);
    if (submittedQuery) runQuery(submittedQuery, next);
  }

  function retryDetails() {
    setDetailsRevision((revision) => revision + 1);
  }

  async function inspectTorrent(item: TorrentSearchDetails) {
    setInspecting(true);
    setDetailsError("");
    try {
      const source = await getTorrentSearchSource(item.result.provider, item.result.id);
      onReviewSource(source);
    } catch (cause) {
      setDetailsError(describeError(cause));
    } finally {
      setInspecting(false);
    }
  }

  return (
    <section className="browse-view" aria-label="Browse authorized open content">
      <BrowseSearchBar
        query={query}
        category={category}
        providerId={providerId}
        sort={sort}
        providers={search.providers}
        hasSeederData={hasSeederData}
        enabled={enabled}
        loading={search.loading}
        onQueryChange={setQuery}
        onCategoryChange={changeCategory}
        onProviderChange={(nextProvider) => {
          setProviderId(nextProvider);
          if (submittedQuery) runQuery(submittedQuery, category, nextProvider);
          if (!nextProvider || selectedResult?.provider !== nextProvider) setSelectedResult(null);
        }}
        onSortChange={setSort}
        onSubmit={submit}
        onCancel={() => void search.cancelSearch()}
      />

      <div className="browse-provider-note">
        <span className="browse-provider-note__indicator" aria-hidden="true" />
        <span>Open-licensed catalogs</span>
        {search.providers.map((provider) => (
          <span className={`browse-provider-note__source browse-provider-note__source--${provider.health.state}`} key={provider.id} title={provider.health.message ?? provider.name}>
            <Archive size={12} aria-hidden="true" /> {provider.name}
          </span>
        ))}
        <span className="browse-provider-note__privacy">Search terms are sent to the selected catalog source(s).</span>
      </div>

      {search.error && <div className="browse-alert" role="alert"><CircleAlert size={14} aria-hidden="true" />{search.error}</div>}
      {providerWarnings.length > 0 && submittedQuery && (
        <div className="browse-alert browse-alert--warning" role="status">
          <CircleAlert size={14} aria-hidden="true" />
          {providerWarnings.map(({ providerId: id, health }) => `${providerById.get(id) ?? id}: ${health.message ?? health.state}`).join(" · ")}
        </div>
      )}

      <BrowseSearchHistory
        searches={recent.searches}
        onChoose={(term) => runQuery(term)}
        onClear={recent.clear}
      />

      <div className={`browse-content${selectedResult ? " has-details" : ""}`}>
        <div className="browse-main-column">
          {submittedQuery ? (
            <div className="browse-results-heading">
              <h2>Results for <span>“{submittedQuery}”</span></h2>
              {!search.loading && <span>{filteredResults.length} shown</span>}
            </div>
          ) : null}

          {search.loading && search.results.length === 0 ? (
            <BrowseResultsSkeleton />
          ) : filteredResults.length > 0 ? (
            <div className="browse-results-wrap">
              <BrowseResults
                results={filteredResults}
                selectedKey={selectedKey}
                providers={providerById}
                onSelect={setSelectedResult}
              />
              {search.hasMore && (
                <button
                  className="secondary-button browse-load-more"
                  type="button"
                  disabled={search.loading}
                  onClick={() => search.loadMore(submittedQuery, { category, providerId: providerId || null })}
                >
                  {search.loading ? <LoaderCircle size={14} className="is-spinning" aria-hidden="true" /> : null}
                  {search.loading ? "Loading more…" : "Show more results"}
                </button>
              )}
            </div>
          ) : submittedQuery && !search.loading ? (
            <div className="browse-empty" role="status">
              <div className="browse-empty__icon"><Archive size={19} aria-hidden="true" /></div>
              <strong>{providerId ? "No results from this source" : "No openly licensed results found"}</strong>
              <span>{providerId ? "Try All Sources or continue through the available pages." : "Try a broader term or choose another category."}</span>
              {search.hasMore && (
                <button className="secondary-button browse-empty__more" type="button" onClick={() => search.loadMore(submittedQuery, { category, providerId: providerId || null })}>
                  Show more results
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="browse-welcome">
                <div className="browse-welcome__mark" aria-hidden="true"><Archive size={21} strokeWidth={1.7} /></div>
                <h2>Browse with confidence</h2>
                <p>Search authorized open software, datasets, and media. Review source details before inspecting any files.</p>
              </div>
            </>
          )}
        </div>

        {selectedResult && (
          <BrowseDetailsPanel
            result={selectedResult}
            details={details}
            providerName={providerById.get(selectedResult.provider) ?? selectedResult.provider}
            loading={detailsLoading}
            error={detailsError}
            inspecting={inspecting}
            onClose={() => setSelectedResult(null)}
            onRetry={retryDetails}
            onInspect={(item) => void inspectTorrent(item)}
          />
        )}
      </div>
    </section>
  );
}
