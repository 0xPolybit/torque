import {
  AlertCircle,
  ChevronDown,
  Clock3,
  Download,
  FileDown,
  FolderDown,
  Upload,
  Users,
} from "lucide-react";
import type { TorrentStatus } from "../../lib/desktop";
import { TorrentStateBadge } from "./TorrentStateBadge";
import {
  estimateTimeRemaining,
  formatBytes,
  formatSpeed,
  getTorrentStatePresentation,
} from "./torrentPresentation";

interface TorrentRowProps {
  torrent: TorrentStatus;
}

export function TorrentRow({ torrent }: TorrentRowProps) {
  const title = torrent.name?.trim() || "Waiting for torrent metadata";
  const progress = Number.isFinite(torrent.progressPercent)
    ? Math.max(0, Math.min(100, torrent.progressPercent))
    : 0;
  const roundedProgress = Math.round(progress);
  const presentation = getTorrentStatePresentation(torrent);
  const eta = estimateTimeRemaining(torrent);

  return (
    <article className={`torrent-row torrent-row--${presentation.filter}`} role="listitem">
      <div className="torrent-row__header">
        <div className="torrent-row__identity">
          <div className="torrent-row__icon" aria-hidden="true">
            <FileDown size={17} strokeWidth={1.8} />
          </div>
          <div className="torrent-row__title-group">
            <h2 title={title}>{title}</h2>
            <span title={torrent.outputDirectory} className="torrent-row__destination">
              <FolderDown size={12} aria-hidden="true" />
              <span>{torrent.outputDirectory}</span>
            </span>
          </div>
        </div>
        <TorrentStateBadge torrent={torrent} />
      </div>

      {torrent.error && (
        <p className="torrent-row__error" role="alert">
          <AlertCircle size={13} aria-hidden="true" />
          <span>{torrent.error}</span>
        </p>
      )}

      <div className="torrent-row__progress-head">
        <span className="torrent-row__amount">
          {formatBytes(torrent.downloadedBytes)} <span>of</span> {formatBytes(torrent.totalBytes)}
        </span>
        <span className="torrent-row__progress-meta">
          {eta && <span className="torrent-row__eta"><Clock3 size={12} aria-hidden="true" /> {eta} left</span>}
          <span>{roundedProgress}%</span>
        </span>
      </div>

      <div
        className="torrent-progress"
        role="progressbar"
        aria-label={`${title} download progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={roundedProgress}
      >
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>

      <div className="torrent-row__stats" aria-label="Transfer statistics">
        <span className="torrent-row__stat">
          <Download size={13} aria-hidden="true" />
          <span className="torrent-row__stat-label">Down</span>
          <strong>{formatSpeed(torrent.downloadSpeedBytesPerSecond)}</strong>
        </span>
        <span className="torrent-row__stat">
          <Upload size={13} aria-hidden="true" />
          <span className="torrent-row__stat-label">Up</span>
          <strong>{formatSpeed(torrent.uploadSpeedBytesPerSecond)}</strong>
        </span>
        <span className="torrent-row__stat">
          <Users size={13} aria-hidden="true" />
          <span className="torrent-row__stat-label">Peers</span>
          <strong>{torrent.connectedPeers === null ? "—" : torrent.connectedPeers}</strong>
        </span>
      </div>

      {torrent.files.length > 0 && (
        <details className="torrent-row__files">
          <summary>
            <span>{torrent.files.length} files <span aria-hidden="true">·</span> {torrent.totalPieces} pieces</span>
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <ul>
            {torrent.files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span title={file.name}>{file.name}</span>
                <span>{formatBytes(file.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
