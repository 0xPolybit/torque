import { ChevronDown, Search, X } from "lucide-react";
import type { FormEvent } from "react";
import type { SearchCategory, SearchProviderInfo } from "../../lib/discovery";

export type BrowseSort = "relevance" | "newest" | "size" | "seeders";

interface BrowseSearchBarProps {
  query: string;
  category: SearchCategory | null;
  providerId: string;
  sort: BrowseSort;
  providers: SearchProviderInfo[];
  hasSeederData: boolean;
  enabled: boolean;
  loading: boolean;
  onQueryChange: (query: string) => void;
  onCategoryChange: (category: SearchCategory | null) => void;
  onProviderChange: (providerId: string) => void;
  onSortChange: (sort: BrowseSort) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

const categories: { value: SearchCategory | "all"; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "software", label: "Software" },
  { value: "datasets", label: "Datasets" },
  { value: "media", label: "Media" },
];

const sortOptions: { value: BrowseSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "size", label: "Size" },
  { value: "seeders", label: "Seeders" },
];

export function BrowseSearchBar({
  query,
  category,
  providerId,
  sort,
  providers,
  hasSeederData,
  enabled,
  loading,
  onQueryChange,
  onCategoryChange,
  onProviderChange,
  onSortChange,
  onSubmit,
  onCancel,
}: BrowseSearchBarProps) {
  return (
    <form className="browse-toolbar" onSubmit={onSubmit} role="search" aria-label="Browse content">
      <div className="browse-search">
        <Search size={19} strokeWidth={1.8} aria-hidden="true" />
        <label className="visually-hidden" htmlFor="browse-query">Search open content</label>
        <input
          id="browse-query"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search software, datasets, and media"
          autoComplete="off"
          maxLength={160}
          disabled={loading || !enabled}
        />
        {loading ? (
          <button className="secondary-button browse-search__action" type="button" onClick={onCancel}>
            <X size={14} aria-hidden="true" /> Cancel
          </button>
        ) : (
          <button className="primary-button browse-search__action" type="submit" disabled={!enabled || !query.trim()}>
            <Search size={14} aria-hidden="true" /> Search
          </button>
        )}
      </div>

      <div className="browse-filters">
        <label className="browse-select">
          <span>Source</span>
          <span className="browse-select__control">
            <select value={providerId} onChange={(event) => onProviderChange(event.target.value)} disabled={!enabled}>
              <option value="">All sources</option>
              {providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </span>
        </label>

        <label className="browse-select">
          <span>Category</span>
          <span className="browse-select__control">
            <select
              value={category ?? "all"}
              onChange={(event) => onCategoryChange(event.target.value === "all" ? null : event.target.value as SearchCategory)}
              disabled={loading || !enabled}
            >
              {categories.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </span>
        </label>

        <label className="browse-select browse-select--sort">
          <span>Sort by</span>
          <span className="browse-select__control">
            <select value={sort} onChange={(event) => onSortChange(event.target.value as BrowseSort)} disabled={!enabled}>
              {sortOptions.map((option) => (
                <option value={option.value} key={option.value} disabled={option.value === "seeders" && !hasSeederData}>
                  {option.label}{option.value === "seeders" && !hasSeederData ? " · unavailable" : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </span>
        </label>
      </div>
    </form>
  );
}
