import type { TorrentActionState, TorrentStatus } from "../../lib/desktop";
import { TorrentRow } from "./TorrentRow";

interface TorrentListProps {
  torrents: TorrentStatus[];
  actions: Record<number, TorrentActionState>;
  onPause: (torrentId: number) => Promise<boolean>;
  onResume: (torrentId: number) => Promise<boolean>;
  onRetry: (torrentId: number) => Promise<boolean>;
  onRemove: (torrentId: number) => Promise<boolean>;
  onOpenFolder: (torrentId: number) => Promise<boolean>;
  onUpdateFileSelection: (torrentId: number, selectedIndices: number[]) => Promise<boolean>;
}

export function TorrentList({
  torrents,
  actions,
  onPause,
  onResume,
  onRetry,
  onRemove,
  onOpenFolder,
  onUpdateFileSelection,
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
            onUpdateFileSelection={onUpdateFileSelection}
          />
        ))}
      </div>
    </section>
  );
}
