import { useState, type FormEvent } from "react";
import { Archive, ArrowDownToLine, ChevronDown, CircleAlert, LoaderCircle, Search, ShieldCheck, X } from "lucide-react";
import {
  getTorrentSearchSource,
  type SearchCategory,
  type SearchProviderHealthState,
  type TorrentDownloadSource,
  type TorrentSearchResult,
} from "../../lib/discovery";
import { describeError } from "../../lib/desktop";
import { useTorrentSearch } from "./useTorrentSearch";

interface DiscoveryViewProps {
  enabled: boolean;
  onReviewSource: (source: TorrentDownloadSource) => void;
}

const categories: { value: SearchCategory | null; label: string }[] = [
  { value: null, label: "All open content" },
  { value: "software", label: "Software" },
  { value: "datasets", label: "Datasets" },
  { value: "media", label: "Media" },
];

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "Size unavailable";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** unit;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: amount >= 100 ? 0 : 1 })} ${units[unit]}`;
}

function licenseName(license: string | null): string {
  if (!license) return "Open license";
  try {
    const url = new URL(license);
    return url.pathname.split("/").filter(Boolean).slice(-2).join(" ").replaceAll("-", " ").toUpperCase();
  } catch {
    return license;
  }
}

function healthLabel(state: SearchProviderHealthState): string {
  switch (state) {
    case "healthy": return "Available";
    case "degraded": return "Degraded";
    case "unavailable": return "Unavailable";
    case "rate_limited": return "Rate limited";
    default: return "Checking";
  }
}

function categoryName(category: string | null): string {
  if (category === "datasets") return "Dataset";
  if (category === "media") return "Media";
  if (category === "software") return "Software";
  return "Open content";
}

function ResultRow({
  result,
  providerName,
  busy,
  error,
  onReview,
}: {
  result: TorrentSearchResult;
  providerName: string;
  busy: boolean;
  error: string;
  onReview: (result: TorrentSearchResult) => void;
}) {
  return (
    <article className="discovery-result">
      <div className="discovery-result__icon" aria-hidden="true"><Archive size={16} strokeWidth={1.8} /></div>
      <div className="discovery-result__main">
        <div className="discovery-result__titleline">
          <h2 title={result.title}>{result.title || result.id}</h2>
          {result.verified === true && <span className="discovery-result__verified" title="Verified by source"><ShieldCheck size={13} /> Verified</span>}
        </div>
        {result.description && <p className="discovery-result__description">{result.description}</p>}
        <div className="discovery-result__metadata">
          <span>{categoryName(result.category)}</span>
          <span>{formatBytes(result.sizeBytes)}</span>
          <span title={result.license ?? undefined}>{licenseName(result.license)}</span>
          <span>{providerName}</span>
          {result.publishedAt && <span>{result.publishedAt}</span>}
        </div>
        {error && <p className="discovery-result__error" role="alert">{error}</p>}
      </div>
      <button
        className="secondary-button discovery-result__action"
        type="button"
        onClick={() => onReview(result)}
        disabled={busy}
        aria-label={`Inspect files for ${result.title}`}
      >
        {busy
          ? <LoaderCircle size={14} className="is-spinning" aria-hidden="true" />
          : <ArrowDownToLine size={14} aria-hidden="true" />}
        {busy ? "Preparing…" : "Inspect files"}
      </button>
    </article>
  );
}

export function DiscoveryView({ enabled, onReviewSource }: DiscoveryViewProps) {
  const search = useTorrentSearch(enabled);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [category, setCategory] = useState<SearchCategory | null>(null);
  const [activeResult, setActiveResult] = useState("");
  const [resultErrors, setResultErrors] = useState<Record<string, string>>({});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (!term || search.loading) return;
    setSubmittedQuery(term);
    setResultErrors({});
    void search.runSearch(term, category);
  }

  async function inspectResult(result: TorrentSearchResult) {
    const key = `${result.provider}:${result.id}`;
    setActiveResult(key);
    setResultErrors((current) => ({ ...current, [key]: "" }));
    try {
      const source = await getTorrentSearchSource(result.provider, result.id);
      onReviewSource(source);
    } catch (cause) {
      setResultErrors((current) => ({ ...current, [key]: describeError(cause) }));
    } finally {
      setActiveResult("");
    }
  }

  const providerById = new Map(search.providers.map((provider) => [provider.id, provider.name]));

  return (
    <section className="discovery-view" aria-label="Authorized content discovery">
      <form className="discovery-search" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="discovery-query">Search open-licensed content</label>
        <Search size={17} aria-hidden="true" />
        <input
          id="discovery-query"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search open software, datasets, and media"
          autoComplete="off"
          maxLength={160}
          disabled={search.loading}
        />
        <label className="visually-hidden" htmlFor="discovery-category">Content category</label>
        <span className="discovery-search__select-wrap">
          <select
            id="discovery-category"
            value={category ?? "all"}
            onChange={(event) => setCategory(event.target.value === "all" ? null : event.target.value as SearchCategory)}
            disabled={search.loading}
          >
            {categories.map((option) => <option key={option.value ?? "all"} value={option.value ?? "all"}>{option.label}</option>)}
          </select>
          <ChevronDown size={13} aria-hidden="true" />
        </span>
        {search.loading ? (
          <button className="secondary-button discovery-search__submit" type="button" onClick={() => void search.cancelSearch()}>
            <X size={14} aria-hidden="true" /> Cancel
          </button>
        ) : (
          <button className="primary-button discovery-search__submit" type="submit" disabled={!query.trim()}>
            <Search size={14} aria-hidden="true" /> Search
          </button>
        )}
      </form>

      <div className="discovery-source-strip" aria-label="Search sources">
        <div className="discovery-source-strip__label"><span /> Authorized sources</div>
        <div className="discovery-provider-list">
          {search.providers.map((provider) => (
            <span className={`discovery-provider discovery-provider--${provider.health.state}`} key={provider.id} title={provider.health.message ?? provider.name}>
              <Archive size={13} aria-hidden="true" />
              {provider.name}
              <span className="discovery-provider__health">{healthLabel(provider.health.state)}</span>
            </span>
          ))}
          {search.providers.length === 0 && <span className="discovery-provider-list__loading">Checking available catalogs…</span>}
        </div>
        <p>Your query is sent to Internet Archive. Only explicitly open-licensed items are listed; check each item’s terms before downloading.</p>
      </div>

      {search.error && <div className="discovery-error" role="alert"><CircleAlert size={15} />{search.error}</div>}
      {search.providerStatuses.some(({ health }) => health.state !== "healthy") && search.providerStatuses.length > 0 && (
        <div className="discovery-provider-warning" role="status">
          {search.providerStatuses
            .filter(({ health }) => health.state !== "healthy")
            .map(({ providerId, health }) => `${providerById.get(providerId) ?? providerId}: ${health.message ?? healthLabel(health.state)}`)
            .join(" · ")}
        </div>
      )}

      <div className="discovery-results-heading">
        <h2>{submittedQuery ? `Results for “${submittedQuery}”` : "Discover content"}</h2>
        {submittedQuery && <span>{search.results.length} {search.results.length === 1 ? "result" : "results"}</span>}
      </div>

      {search.loading && search.results.length === 0 ? (
        <div className="discovery-state" role="status"><LoaderCircle className="is-spinning" size={19} /><span>Searching authorized catalogs…</span></div>
      ) : search.results.length > 0 ? (
        <div className="discovery-results" aria-live="polite">
          {search.results.map((result) => {
            const key = `${result.provider}:${result.id}`;
            return (
              <ResultRow
                key={key}
                result={result}
                providerName={providerById.get(result.provider) ?? result.provider}
                busy={activeResult === key}
                error={resultErrors[key] ?? ""}
                onReview={(item) => void inspectResult(item)}
              />
            );
          })}
          {search.hasMore && (
            <button
              className="secondary-button discovery-load-more"
              type="button"
              disabled={search.loading}
              onClick={() => search.loadMore(submittedQuery, category)}
            >
              {search.loading ? <LoaderCircle className="is-spinning" size={14} /> : null}
              {search.loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      ) : submittedQuery && !search.loading ? (
        <div className="discovery-state discovery-state--empty">
          <div className="discovery-state__icon"><Archive size={19} /></div>
          <strong>No openly licensed results found</strong>
          <span>Try a broader term or choose a different category.</span>
        </div>
      ) : (
        <div className="discovery-state discovery-state--empty">
          <div className="discovery-state__icon"><Search size={18} /></div>
          <strong>Find something worth sharing</strong>
          <span>Search the connected catalog for open software, datasets, and licensed media.</span>
        </div>
      )}
    </section>
  );
}
