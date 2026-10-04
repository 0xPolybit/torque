import type { QueueMove, TorrentActionState, TorrentStatus } from "../../lib/desktop";
import { TorrentRow } from "./TorrentRow";

interface TorrentListProps {
  torrents: TorrentStatus[];
  actions: Record<number, TorrentActionState>;
  onPause: (torrentId: number) => Promise<boolean>;
  onResume: (torrentId: number) => Promise<boolean>;
  onRetry: (torrentId: number) => Promise<boolean>;
  onRemove: (torrentId: number, deleteFiles?: boolean) => Promise<boolean>;
  onOpenFolder: (torrentId: number) => Promise<boolean>;
  onOpenDetails: (torrentId: number) => void;
  onMove: (torrentId: number, movement: QueueMove) => Promise<boolean>;
  selectedTorrentId: number | null;
  onSelectTorrent: (torrentId: number) => void;
}

export function TorrentList({
  torrents,
  actions,
  onPause,
  onResume,
  onRetry,
  onRemove,
  onOpenFolder,
  onOpenDetails,
  onMove,
  selectedTorrentId,
  onSelectTorrent,
}: TorrentListProps) {
  return (
    <section className="queue-panel queue-panel--populated" aria-label="Torrent transfers">
      <div className="torrent-list" role="list">
        {torrents.map((torrent) => (
          <TorrentRow
            key={torrent.id}
            torrent={torrent}
            pendingAction={actions[torrent.id]?.pending}
            actionError={actions[torrent.id]?.error}
            onPause={onPause}
            onResume={onResume}
            onRetry={onRetry}
            onRemove={onRemove}
            onOpenFolder={onOpenFolder}
            onOpenDetails={onOpenDetails}
            onMove={onMove}
            selected={selectedTorrentId === torrent.id}
            onSelect={onSelectTorrent}
          />
        ))}
      </div>
    </section>
  );
}
