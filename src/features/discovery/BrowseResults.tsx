import { Archive, ArrowDown, ArrowUp, ShieldCheck } from "lucide-react";
import type { TorrentSearchResult } from "../../lib/discovery";

interface BrowseResultsProps {
  results: TorrentSearchResult[];
  selectedKey: string | null;
  providers: Map<string, string>;
  onSelect: (result: TorrentSearchResult) => void;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "Size unavailable";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** unit;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: amount >= 100 ? 0 : 1 })} ${units[unit]}`;
}

function categoryName(category: string | null): string {
  if (category === "datasets") return "Dataset";
  if (category === "media") return "Media";
  if (category === "software") return "Software";
  return "Open content";
}

function licenseName(license: string | null): string | null {
  if (!license) return null;
  try {
    const url = new URL(license);
    return url.pathname.split("/").filter(Boolean).slice(-2).join(" ").replaceAll("-", " ").toUpperCase();
  } catch {
    return license;
  }
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function ResultSkeleton() {
  return (
    <div className="browse-result browse-result--skeleton" aria-hidden="true">
      <span className="browse-result__skeleton-icon" />
      <span className="browse-result__skeleton-copy">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

export function BrowseResults({ results, selectedKey, providers, onSelect }: BrowseResultsProps) {
  return (
    <section className="browse-results" aria-label="Search results" aria-live="polite">
      {results.map((result) => {
        const key = `${result.provider}:${result.id}`;
        const license = licenseName(result.license);
        const date = formatDate(result.publishedAt);
        const title = result.title || result.id;
        return (
          <button
            className={`browse-result${selectedKey === key ? " is-selected" : ""}`}
            type="button"
            key={key}
            aria-pressed={selectedKey === key}
            aria-label={`View details for ${title}`}
            onClick={() => onSelect(result)}
          >
            <span className="browse-result__icon" aria-hidden="true"><Archive size={16} strokeWidth={1.8} /></span>
            <span className="browse-result__body">
              <span className="browse-result__titleline">
                <strong title={title}>{title}</strong>
                {result.verified === true && <span className="browse-result__verified"><ShieldCheck size={12} aria-hidden="true" /> Verified</span>}
              </span>
              {result.description && <span className="browse-result__description">{result.description}</span>}
              <span className="browse-result__metadata">
                <span>{categoryName(result.category)}</span>
                <span>{formatBytes(result.sizeBytes)}</span>
                <span>{providers.get(result.provider) ?? result.provider}</span>
                {license && <span title={result.license ?? undefined}>{license}</span>}
                {date && <span>{date}</span>}
                {(result.seeders !== null || result.leechers !== null) && (
                  <span className="browse-result__peers">
                    <ArrowDown size={11} aria-hidden="true" /> {result.seeders ?? "—"}
                    <ArrowUp size={11} aria-hidden="true" /> {result.leechers ?? "—"} peers
                  </span>
                )}
              </span>
            </span>
            <span className="browse-result__chevron" aria-hidden="true">›</span>
          </button>
        );
      })}
    </section>
  );
}

export function BrowseResultsSkeleton() {
  return (
    <section className="browse-results browse-results--loading" role="status" aria-label="Loading search results">
      <span className="visually-hidden">Searching authorized sources…</span>
      {Array.from({ length: 5 }, (_, index) => <ResultSkeleton key={index} />)}
    </section>
  );
}
