import type { TorrentStatus } from "../../lib/desktop";
import { getTorrentStatePresentation } from "./torrentPresentation";

interface TorrentStateBadgeProps {
  torrent: TorrentStatus;
}

export function TorrentStateBadge({ torrent }: TorrentStateBadgeProps) {
  const state = getTorrentStatePresentation(torrent);

  return (
    <span className={`torrent-state torrent-state--${state.filter}`}>
      <span className="torrent-state__dot" aria-hidden="true" />
      {state.label}
    </span>
  );
}
