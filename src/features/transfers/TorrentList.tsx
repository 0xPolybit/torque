import { ChevronDown, Download, HardDriveDownload, Upload, Users } from "lucide-react";
import type { TorrentStatus } from "../../lib/desktop";

interface TorrentListProps {
  torrents: TorrentStatus[];
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

function formatSpeed(bytesPerSecond: number | null): string {
  return bytesPerSecond === null ? "—" : `${formatBytes(bytesPerSecond)}/s`;
}

function stateLabel(state: string): string {
  switch (state) {
    case "initializing":
      return "Getting metadata";
    case "downloading":
      return "Downloading";
    case "seeding":
      return "Seeding";
    case "paused":
      return "Paused";
    case "error":
      return "Error";
    default:
      return state;
  }
}

export function TorrentList({ torrents }: TorrentListProps) {
  return (
    <section className="queue-panel queue-panel--populated" aria-label="Torrent transfers">
      <div className="torrent-list" role="list">
        {torrents.map((torrent) => {
          const title = torrent.name || "Waiting for torrent metadata";
          const transferProgress = Math.max(0, Math.min(100, torrent.progressPercent));

          return (
            <article className="torrent-item" key={torrent.id} role="listitem">
              <div className="torrent-item__topline">
                <div className="torrent-item__identity">
                  <div className="torrent-item__icon" aria-hidden="true">
                    <HardDriveDownload size={17} strokeWidth={1.8} />
                  </div>
                  <div className="torrent-item__title-group">
                    <h2 title={title}>{title}</h2>
                    <span className="torrent-item__hash" title={torrent.infoHash}>
                      {torrent.infoHash}
                    </span>
                  </div>
                </div>
                <span className={`torrent-state torrent-state--${torrent.state}`}>
                  <span className="torrent-state__dot" aria-hidden="true" />
                  {stateLabel(torrent.state)}
                </span>
              </div>

              {torrent.error && (
                <p className="torrent-item__error" role="alert">
                  {torrent.error}
                </p>
              )}

              <div
                className="torrent-progress"
                role="progressbar"
                aria-label={`${title} download progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={transferProgress}
              >
                <span style={{ transform: `scaleX(${transferProgress / 100})` }} />
              </div>

              <div className="torrent-item__metrics">
                <span className="torrent-item__downloaded">
                  {formatBytes(torrent.downloadedBytes)} of {formatBytes(torrent.totalBytes)}
                </span>
                <span>
                  <Download size={13} aria-hidden="true" />
                  {formatSpeed(torrent.downloadSpeedBytesPerSecond)}
                </span>
                <span>
                  <Upload size={13} aria-hidden="true" />
                  {formatSpeed(torrent.uploadSpeedBytesPerSecond)}
                </span>
                <span>
                  <Users size={13} aria-hidden="true" />
                  {torrent.connectedPeers === null ? "— peers" : `${torrent.connectedPeers} peers`}
                </span>
                <span className="torrent-item__folder">{torrent.outputDirectory}</span>
              </div>

              {torrent.files.length > 0 && (
                <details className="torrent-item__details">
                  <summary>
                    <span>{torrent.files.length} files · {torrent.totalPieces} pieces</span>
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
        })}
      </div>
    </section>
  );
}
