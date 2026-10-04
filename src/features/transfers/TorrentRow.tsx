import { memo, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownToLine,
  ArrowUpToLine,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  FileDown,
  FileX2,
  FolderDown,
  FolderOpen,
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Play,
  RotateCw,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type { QueueMove, TorrentControlAction, TorrentStatus } from "../../lib/desktop";
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
  onRemove: (torrentId: number, deleteFiles?: boolean) => Promise<boolean>;
  onOpenFolder: (torrentId: number) => Promise<boolean>;
  onOpenDetails: (torrentId: number) => void;
  onMove: (torrentId: number, movement: QueueMove) => Promise<boolean>;
  selected: boolean;
  onSelect: (torrentId: number) => void;
}

function TorrentRowComponent({
  torrent,
  pendingAction = null,
  actionError = null,
  onPause,
  onResume,
  onRetry,
  onRemove,
  onOpenFolder,
  onOpenDetails,
  onMove,
  selected,
  onSelect,
}: TorrentRowProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
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
          : pendingAction === "move-queue"
            ? "Moving…"
            : null;
  const PrimaryIcon = primaryAction?.icon;

  return (
    <article
      className={`torrent-row torrent-row--${presentation.filter}${selected ? " is-selected" : ""}`}
      role="listitem"
      aria-busy={actionBusy}
      aria-selected={selected}
      tabIndex={0}
      onFocusCapture={() => onSelect(torrent.id)}
    >
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
          {torrent.state === "queued" && torrent.queuePosition !== null && (
            <div className="torrent-row__queue-controls" aria-label={`Queue position ${torrent.queuePosition}`}>
              <span>#{torrent.queuePosition}</span>
              <button type="button" title="Move to top" aria-label="Move to top of queue" disabled={actionBusy || torrent.queuePosition === 1} onClick={() => void onMove(torrent.id, "top")}><ArrowUpToLine size={13} /></button>
              <button type="button" title="Move up" aria-label="Move up in queue" disabled={actionBusy || torrent.queuePosition === 1} onClick={() => void onMove(torrent.id, "up")}><ChevronUp size={14} /></button>
              <button type="button" title="Move down" aria-label="Move down in queue" disabled={actionBusy} onClick={() => void onMove(torrent.id, "down")}><ChevronDown size={14} /></button>
              <button type="button" title="Move to bottom" aria-label="Move to bottom of queue" disabled={actionBusy} onClick={() => void onMove(torrent.id, "bottom")}><ArrowDownToLine size={13} /></button>
            </div>
          )}
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
          <div className="torrent-row__menu-wrap">
            <button
              className="torrent-row__remove"
              type="button"
              aria-label="More torrent actions"
              aria-expanded={actionsOpen}
              title="More actions"
              disabled={actionBusy}
              onClick={() => setActionsOpen((open) => !open)}
            >
              {pendingAction === "remove"
                ? <LoaderCircle size={14} className="torrent-row__action-spinner" aria-hidden="true" />
                : <MoreHorizontal size={15} aria-hidden="true" />}
            </button>
            {actionsOpen && (
              <div className="torrent-row__menu" role="menu" aria-label="Torrent actions">
                <button type="button" role="menuitem" onClick={() => { setActionsOpen(false); void onRemove(torrent.id, false); }}>
                  <Trash2 size={13} aria-hidden="true" />
                  <span>{torrent.state === "completed" ? "Remove from list" : "Remove torrent"}<small>Keep downloaded files</small></span>
                </button>
                <button className="torrent-row__menu-delete" type="button" role="menuitem" onClick={() => { setActionsOpen(false); void onRemove(torrent.id, true); }}>
                  <FileX2 size={13} aria-hidden="true" />
                  <span>Delete downloaded files<small>Remove data from disk</small></span>
                </button>
              </div>
            )}
          </div>
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

function sameVisibleStatus(left: TorrentStatus, right: TorrentStatus): boolean {
  return left.id === right.id
    && left.name === right.name
    && left.outputDirectory === right.outputDirectory
    && left.state === right.state
    && left.error === right.error
    && left.progressPercent === right.progressPercent
    && left.downloadedBytes === right.downloadedBytes
    && left.totalBytes === right.totalBytes
    && left.downloadSpeedBytesPerSecond === right.downloadSpeedBytesPerSecond
    && left.uploadSpeedBytesPerSecond === right.uploadSpeedBytesPerSecond
    && left.connectedPeers === right.connectedPeers
    && left.queuePosition === right.queuePosition
    && left.engineAvailable === right.engineAvailable;
}

export const TorrentRow = memo(TorrentRowComponent, (previous, next) =>
  sameVisibleStatus(previous.torrent, next.torrent)
  && previous.pendingAction === next.pendingAction
  && previous.actionError === next.actionError
  && previous.selected === next.selected
  && previous.onPause === next.onPause
  && previous.onResume === next.onResume
  && previous.onRetry === next.onRetry
  && previous.onRemove === next.onRemove
  && previous.onOpenFolder === next.onOpenFolder
  && previous.onOpenDetails === next.onOpenDetails
  && previous.onMove === next.onMove
  && previous.onSelect === next.onSelect,
);
