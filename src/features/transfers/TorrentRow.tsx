import {
  ArrowUpRight,
  AlertCircle,
  Clock3,
  Download,
  FileDown,
  FolderDown,
  FolderOpen,
  LoaderCircle,
  Pause,
  Play,
  RotateCw,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type { TorrentControlAction, TorrentStatus } from "../../lib/desktop";
import { TorrentStateBadge } from "./TorrentStateBadge";
import {
  estimateTimeRemaining,
  formatBytes,
  formatSpeed,
  getTorrentStatePresentation,
} from "./torrentPresentation";

interface TorrentRowProps {
  torrent: TorrentStatus;
  pendingAction?: TorrentControlAction | null;
  actionError?: string | null;
  onPause: (torrentId: number) => Promise<boolean>;
  onResume: (torrentId: number) => Promise<boolean>;
  onRetry: (torrentId: number) => Promise<boolean>;
  onRemove: (torrentId: number) => Promise<boolean>;
  onOpenFolder: (torrentId: number) => Promise<boolean>;
  onOpenDetails: (torrentId: number) => void;
}

export function TorrentRow({
  torrent,
  pendingAction = null,
  actionError = null,
  onPause,
  onResume,
  onRetry,
  onRemove,
  onOpenFolder,
  onOpenDetails,
}: TorrentRowProps) {
  const title = torrent.name?.trim() || "Waiting for torrent metadata";
  const progress = Number.isFinite(torrent.progressPercent)
    ? Math.max(0, Math.min(100, torrent.progressPercent))
    : 0;
  const roundedProgress = Math.round(progress);
  const presentation = getTorrentStatePresentation(torrent);
  const eta = estimateTimeRemaining(torrent);
  const actionBusy = pendingAction !== null;

  let primaryAction: { kind: TorrentControlAction; label: string; icon: typeof Pause; invoke: (id: number) => Promise<boolean> } | null = null;
  if (!torrent.engineAvailable) {
    primaryAction = null;
  } else if (torrent.state === "downloading") {
    primaryAction = { kind: "pause", label: "Pause", icon: Pause, invoke: onPause };
  } else if (torrent.state === "paused") {
    primaryAction = { kind: "resume", label: "Resume", icon: Play, invoke: onResume };
  } else if (torrent.state === "completed") {
    primaryAction = { kind: "open-folder", label: "Open folder", icon: FolderOpen, invoke: onOpenFolder };
  } else if (torrent.state === "error") {
    primaryAction = { kind: "retry", label: "Retry", icon: RotateCw, invoke: onRetry };
  }

  const actionLabel = pendingAction === "pause"
    ? "Pausing…"
    : pendingAction === "resume"
      ? "Resuming…"
      : pendingAction === "retry"
        ? "Retrying…"
        : pendingAction === "remove"
          ? "Removing…"
          : pendingAction === "open-folder"
            ? "Opening…"
            : null;
  const PrimaryIcon = primaryAction?.icon;

  return (
    <article className={`torrent-row torrent-row--${presentation.filter}`} role="listitem" aria-busy={actionBusy}>
      <div className="torrent-row__header">
        <div className="torrent-row__identity">
          <div className="torrent-row__icon" aria-hidden="true">
            <FileDown size={17} strokeWidth={1.8} />
          </div>
          <div className="torrent-row__title-group">
            <h2 title={title}>
              <button
                className="torrent-row__title-button"
                type="button"
                aria-label={`Open details for ${title}`}
                onClick={() => onOpenDetails(torrent.id)}
              >
                <span>{title}</span>
                <ArrowUpRight size={13} aria-hidden="true" />
              </button>
            </h2>
            <span title={torrent.outputDirectory} className="torrent-row__destination">
              <FolderDown size={12} aria-hidden="true" />
              <span>{torrent.outputDirectory}</span>
            </span>
          </div>
        </div>
        <div className="torrent-row__header-side">
          <TorrentStateBadge torrent={torrent} />
          {primaryAction && (
            <button
              className={`torrent-row__action torrent-row__action--${primaryAction.kind}`}
              type="button"
              aria-label={actionLabel ?? primaryAction.label}
              title={primaryAction.kind === "open-folder" ? "Open this torrent’s download folder" : primaryAction.label}
              disabled={actionBusy}
              onClick={() => void primaryAction.invoke(torrent.id)}
            >
              {actionBusy && pendingAction === primaryAction.kind
                ? <LoaderCircle size={13} className="torrent-row__action-spinner" aria-hidden="true" />
                : PrimaryIcon && <PrimaryIcon size={13} aria-hidden="true" />}
              <span>{actionLabel && pendingAction === primaryAction.kind ? actionLabel : primaryAction.label}</span>
            </button>
          )}
          <button
            className="torrent-row__remove"
            type="button"
            aria-label={torrent.state === "completed" ? "Remove from list, keep downloaded files" : "Remove torrent, keep downloaded files"}
            title={torrent.state === "completed" ? "Remove from list · keep files" : "Remove · keep downloaded files"}
            disabled={actionBusy}
            onClick={() => void onRemove(torrent.id)}
          >
            {pendingAction === "remove"
              ? <LoaderCircle size={14} className="torrent-row__action-spinner" aria-hidden="true" />
              : <Trash2 size={14} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {torrent.error && (
        <p className="torrent-row__error" role="alert">
          <AlertCircle size={13} aria-hidden="true" />
          <span>{torrent.error}</span>
        </p>
      )}
      {actionError && (
        <p className="torrent-row__action-error" role="alert">
          <AlertCircle size={13} aria-hidden="true" />
          <span>{actionError}</span>
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

    </article>
  );
}
