import { Clock3, Search, Trash2 } from "lucide-react";

interface BrowseSearchHistoryProps {
  searches: string[];
  onChoose: (query: string) => void;
  onClear: () => void;
}

export function BrowseSearchHistory({ searches, onChoose, onClear }: BrowseSearchHistoryProps) {
  if (searches.length === 0) return null;

  return (
    <section className="browse-recents" aria-labelledby="browse-recents-title">
      <div className="browse-recents__heading">
        <h2 id="browse-recents-title"><Clock3 size={14} aria-hidden="true" /> Recent searches</h2>
        <button type="button" onClick={onClear} aria-label="Clear search history">
          <Trash2 size={13} aria-hidden="true" /> Clear history
        </button>
      </div>
      <div className="browse-recents__list">
        {searches.map((query) => (
          <button className="browse-recent" type="button" key={query} onClick={() => onChoose(query)}>
            <Search size={12} aria-hidden="true" />
            <span title={query}>{query}</span>
          </button>
        ))}
      </div>
      <p>Recent searches are stored on this device.</p>
    </section>
  );
}
