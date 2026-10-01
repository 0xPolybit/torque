import { ListFilter } from "lucide-react";
import type { TorrentFilter } from "./torrentPresentation";

interface EmptyFilterProps {
  filter: TorrentFilter;
}

const EMPTY_COPY: Record<TorrentFilter, string> = {
  all: "No downloads yet",
  downloading: "No active downloads",
  queued: "Nothing in the queue",
  completed: "No completed downloads",
  paused: "No paused downloads",
  error: "No downloads with errors",
};

export function EmptyFilter({ filter }: EmptyFilterProps) {
  return (
    <section className="queue-panel queue-panel--empty-filter" aria-live="polite">
      <div className="empty-filter__icon" aria-hidden="true"><ListFilter size={19} /></div>
      <h2>{EMPTY_COPY[filter]}</h2>
      <p>Downloads in this view will show up here.</p>
    </section>
  );
}
