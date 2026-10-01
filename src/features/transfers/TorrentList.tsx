import type { TorrentStatus } from "../../lib/desktop";
import { TorrentRow } from "./TorrentRow";

interface TorrentListProps {
  torrents: TorrentStatus[];
}

export function TorrentList({ torrents }: TorrentListProps) {
  return (
    <section className="queue-panel queue-panel--populated" aria-label="Torrent transfers">
      <div className="torrent-list" role="list">
        {torrents.map((torrent) => <TorrentRow key={torrent.id} torrent={torrent} />)}
      </div>
    </section>
  );
}
