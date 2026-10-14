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
  Gauge,
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Play,
  RotateCw,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { QueueMove, TorrentBandwidthDirection, TorrentControlAction, TorrentStatus } from "../../lib/desktop";
import { TorrentStateBadge } from "./TorrentStateBadge";
import { TorrentLimitMenu } from "./TorrentLimitMenu";
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
  onForceRecheck: (torrentId: number) => Promise<boolean>;
  onCancelRecheck: (torrentId: number) => Promise<boolean>;
  onRemove: (torrentId: number, deleteFiles?: boolean) => Promise<boolean>;
  onOpenFolder: (torrentId: number) => Promise<boolean>;
  onOpenDetails: (torrentId: number) => void;
  onMove: (torrentId: number, movement: QueueMove) => Promise<boolean>;
  onSetBandwidthLimit: (torrentId: number, direction: TorrentBandwidthDirection, value: number | null) => Promise<boolean>;
  selected: boolean;
  onSelect: (torrentId: number) => void;
  bulkSelectionMode: boolean;
  bulkSelected: boolean;
  onToggleBulkSelection?: (torrentId: number) => void;
}

function TorrentRowComponent({
  torrent,
  pendingAction = null,
  actionError = null,
  onPause,
  onResume,
  onRetry,
  onForceRecheck,
  onCancelRecheck,
  onRemove,
  onOpenFolder,
  onOpenDetails,
  onMove,
  onSetBandwidthLimit,
  selected,
  onSelect,
  bulkSelectionMode,
  bulkSelected,
  onToggleBulkSelection,
}: TorrentRowProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const title = torrent.name?.trim() || "Waiting for torrent metadata";
  const progress = Number.isFinite(torrent.progressPercent)
    ? Math.max(0, Math.min(100, torrent.progressPercent))
    : 0;
  const roundedProgress = Math.round(progress);
  const isChecking = torrent.state === "checking";
  const checkedBytes = Math.min(torrent.downloadedBytes, torrent.totalBytes);
  const remainingCheckBytes = Math.max(0, torrent.totalBytes - checkedBytes);
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
            : pendingAction === "force-recheck"
              ? "Starting check…"
              : pendingAction === "cancel-recheck"
                ? "Canceling check…"
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
          {bulkSelectionMode && (
            <input
              className="torrent-row__bulk-check"
              type="checkbox"
              checked={bulkSelected}
              aria-label={`Select ${title} for bulk editing`}
              onChange={() => onToggleBulkSelection?.(torrent.id)}
            />
          )}
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
            {(torrent.category || torrent.tags.length > 0) && (
              <div className="torrent-row__library-badges" aria-label="Torrent category and tags">
                {torrent.category && <span className="torrent-row__category-badge">{torrent.category.name}</span>}
                {torrent.tags.slice(0, 2).map((tag) => (
                  <span className="torrent-row__tag-badge" key={tag.id}>{tag.name}</span>
                ))}
                {torrent.tags.length > 2 && (
                  <span className="torrent-row__more-tags" title={torrent.tags.slice(2).map((tag) => tag.name).join(", ")}>
                    +{torrent.tags.length - 2}
                  </span>
                )}
              </div>
            )}
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
          {(torrent.downloadLimitBytesPerSecond !== null || torrent.uploadLimitBytesPerSecond !== null) && (
            <span
              className="torrent-row__limit-indicator"
              title={`Custom limits · ↓ ${torrent.downloadLimitBytesPerSecond === null ? "Unlimited" : formatSpeed(torrent.downloadLimitBytesPerSecond)} · ↑ ${torrent.uploadLimitBytesPerSecond === null ? "Unlimited" : formatSpeed(torrent.uploadLimitBytesPerSecond)}`}
              aria-label="Custom torrent bandwidth limits are set"
            >
              <Gauge size={12} aria-hidden="true" />
              <span>Limits</span>
            </span>
          )}
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
                <TorrentLimitMenu
                  direction="download"
                  torrentId={torrent.id}
                  value={torrent.downloadLimitBytesPerSecond}
                  disabled={actionBusy}
                  onSetLimit={onSetBandwidthLimit}
                />
                <TorrentLimitMenu
                  direction="upload"
                  torrentId={torrent.id}
                  value={torrent.uploadLimitBytesPerSecond}
                  disabled={actionBusy}
                  onSetLimit={onSetBandwidthLimit}
                />
                {isChecking ? (
                  <button type="button" role="menuitem" disabled={actionBusy} onClick={() => { setActionsOpen(false); void onCancelRecheck(torrent.id); }}>
                    <X size={13} aria-hidden="true" />
                    <span>Cancel verification<small>Leave downloaded files unchanged</small></span>
                  </button>
                ) : torrent.engineAvailable && (
                  <button type="button" role="menuitem" disabled={actionBusy} onClick={() => { setActionsOpen(false); void onForceRecheck(torrent.id); }}>
                    <RotateCw size={13} aria-hidden="true" />
                    <span>Force recheck<small>Verify files against piece hashes</small></span>
                  </button>
                )}
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
        {isChecking ? (
          <span className="torrent-row__amount torrent-row__check-summary">
            <strong>Checking files</strong>
            <span>Checked {formatBytes(checkedBytes)}</span>
          </span>
        ) : (
          <span className="torrent-row__amount">
            {formatBytes(torrent.downloadedBytes)} <span>of</span> {formatBytes(torrent.totalBytes)}
          </span>
        )}
        <span className="torrent-row__progress-meta">
          {isChecking
            ? <span className="torrent-row__eta">{formatBytes(remainingCheckBytes)} to check</span>
            : eta && <span className="torrent-row__eta"><Clock3 size={12} aria-hidden="true" /> {eta} left</span>}
          <span>{roundedProgress}%</span>
        </span>
      </div>

      <div
        className="torrent-progress"
        role="progressbar"
        aria-label={isChecking ? `${title} integrity verification progress` : `${title} download progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={roundedProgress}
      >
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>

      {!isChecking && <div className="torrent-row__stats" aria-label="Transfer statistics">
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
      </div>}

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
    && left.downloadLimitBytesPerSecond === right.downloadLimitBytesPerSecond
    && left.uploadLimitBytesPerSecond === right.uploadLimitBytesPerSecond
    && left.engineAvailable === right.engineAvailable
    && left.isSeeding === right.isSeeding
    && left.category?.id === right.category?.id
    && left.category?.name === right.category?.name
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag.id === right.tags[index]?.id && tag.name === right.tags[index]?.name);
}

export const TorrentRow = memo(TorrentRowComponent, (previous, next) =>
  sameVisibleStatus(previous.torrent, next.torrent)
  && previous.pendingAction === next.pendingAction
  && previous.actionError === next.actionError
  && previous.selected === next.selected
  && previous.bulkSelectionMode === next.bulkSelectionMode
  && previous.bulkSelected === next.bulkSelected
  && previous.onPause === next.onPause
  && previous.onResume === next.onResume
  && previous.onRetry === next.onRetry
  && previous.onForceRecheck === next.onForceRecheck
  && previous.onCancelRecheck === next.onCancelRecheck
  && previous.onRemove === next.onRemove
  && previous.onOpenFolder === next.onOpenFolder
  && previous.onOpenDetails === next.onOpenDetails
  && previous.onMove === next.onMove
  && previous.onSetBandwidthLimit === next.onSetBandwidthLimit
  && previous.onSelect === next.onSelect
  && previous.onToggleBulkSelection === next.onToggleBulkSelection,
);
