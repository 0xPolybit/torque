import type { TorrentStatus } from "../../lib/desktop";
import { countTorrents, type TorrentFilter } from "./torrentPresentation";

interface TorrentFiltersProps {
  torrents: TorrentStatus[];
  value: TorrentFilter;
  onChange: (filter: TorrentFilter) => void;
}

const FILTERS: { id: TorrentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "downloading", label: "Downloading" },
  { id: "queued", label: "Queued" },
  { id: "completed", label: "Completed" },
  { id: "paused", label: "Paused" },
  { id: "error", label: "Errors" },
];

export function TorrentFilters({ torrents, value, onChange }: TorrentFiltersProps) {
  return (
    <nav className="torrent-filters" aria-label="Filter downloads">
      {FILTERS.map((filter) => {
        const count = countTorrents(torrents, filter.id);
        return (
          <button
            className={`torrent-filter${value === filter.id ? " is-selected" : ""}`}
            key={filter.id}
            type="button"
            aria-pressed={value === filter.id}
            onClick={() => onChange(filter.id)}
          >
            <span>{filter.label}</span>
            <span className="torrent-filter__count">{count}</span>
          </button>
        );
      })}
    </nav>
  );
}
