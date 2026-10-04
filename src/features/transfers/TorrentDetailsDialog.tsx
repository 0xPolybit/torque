import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Activity,
  Check,
  Copy,
  FileText,
  Files,
  Info,
  Network,
  RadioTower,
  RefreshCw,
  X,
} from "lucide-react";
import { describeError, getTorrentDetails, type TorrentActionState, type TorrentDetails, type TorrentStatus } from "../../lib/desktop";
import { TorrentStateBadge } from "./TorrentStateBadge";
import { TorrentFilesPanel } from "./TorrentFilesPanel";
import { estimateTimeRemaining, formatBytes, formatExactBytes, formatSpeed } from "./torrentPresentation";

type DetailsTab = "overview" | "files" | "peers" | "trackers" | "info";

const tabs: { id: DetailsTab; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "files", label: "Files", icon: Files },
  { id: "peers", label: "Peers", icon: Network },
  { id: "trackers", label: "Trackers", icon: RadioTower },
  { id: "info", label: "Info", icon: Info },
];

interface TorrentDetailsDialogProps {
  torrent: TorrentStatus;
  action: TorrentActionState;
  onClose: () => void;
  onUpdateFileSelection: (torrentId: number, selectedIndices: number[]) => Promise<boolean>;
}

export function TorrentDetailsDialog({
  torrent,
  action,
  onClose,
  onUpdateFileSelection,
}: TorrentDetailsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeTab, setActiveTab] = useState<DetailsTab>("overview");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [details, setDetails] = useState<TorrentDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState("");
  const [detailsRevision, setDetailsRevision] = useState(0);
  const title = torrent.name?.trim() || "Waiting for torrent metadata";
  const eta = estimateTimeRemaining(torrent);
  const selectedSize = torrent.files.length > 0
    ? torrent.files.reduce(
      (total, file) => total + (file.included ? BigInt(file.sizeBytes) : 0n),
      0n,
    )
    : BigInt(Math.max(0, Math.floor(torrent.totalBytes)));
  const ratio = torrent.downloadedBytes > 0
    ? (torrent.uploadedBytes / torrent.downloadedBytes).toFixed(2)
    : "—";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let active = true;
    setDetailsLoading(true);
    setDetailsError("");
    getTorrentDetails(torrent.id)
      .then((result) => {
        if (active) setDetails(result);
      })
      .catch((cause: unknown) => {
        if (active) setDetailsError(describeError(cause));
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });
    return () => { active = false; };
  }, [torrent.id, detailsRevision]);

  function closeDialog() {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  }

  async function copyInfoHash() {
    try {
      await navigator.clipboard.writeText(torrent.infoHash);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index + tabs.length - 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <dialog
      ref={dialogRef}
      className="torrent-details"
      aria-labelledby="torrent-details-title"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) closeDialog();
      }}
    >
      <header className="torrent-details__header">
        <div className="torrent-details__heading">
          <div className="torrent-details__icon" aria-hidden="true"><FileText size={16} /></div>
          <div className="torrent-details__title-block">
            <h2 id="torrent-details-title" title={title}>{title}</h2>
            <span title={torrent.infoHash}>{torrent.infoHash}</span>
          </div>
          <TorrentStateBadge torrent={torrent} />
        </div>
        <div className="torrent-details__header-actions">
          <button
            className="icon-button torrent-details__refresh"
            type="button"
            onClick={() => setDetailsRevision((revision) => revision + 1)}
            disabled={detailsLoading}
            aria-label="Refresh peer and tracker details"
            title="Refresh details"
          >
            <RefreshCw size={14} className={detailsLoading ? "torrent-details__refreshing" : undefined} aria-hidden="true" />
          </button>
          <button className="icon-button torrent-details__close" type="button" onClick={closeDialog} aria-label="Close torrent details" title="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="torrent-details__tabbar" role="tablist" aria-label="Torrent details">
        {tabs.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            ref={(element) => { tabRefs.current[index] = element; }}
            className="torrent-details__tab"
            id={`torrent-details-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`torrent-details-panel-${id}`}
            tabIndex={activeTab === id ? 0 : -1}
            onClick={() => setActiveTab(id)}
            onKeyDown={(event) => moveTab(event, index)}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
            {id === "files" && <span>{torrent.files.length.toLocaleString()}</span>}
            {id === "peers" && torrent.connectedPeers !== null && <span>{torrent.connectedPeers}</span>}
          </button>
        ))}
      </div>

      <div className="torrent-details__content">
        {detailsError && (
          <div className="torrent-details__error" role="alert">
            <span>{detailsError}</span>
            <button type="button" onClick={() => setDetailsRevision((revision) => revision + 1)}>Try again</button>
          </div>
        )}
        <section
          className="torrent-details__panel"
          id="torrent-details-panel-overview"
          role="tabpanel"
          aria-labelledby="torrent-details-tab-overview"
          hidden={activeTab !== "overview"}
        >
          <div className="torrent-details__progress-heading">
            <div>
              <strong>{Math.round(Math.max(0, Math.min(100, torrent.progressPercent)))}%</strong>
              <span>{formatBytes(torrent.downloadedBytes)} of {formatExactBytes(selectedSize)} selected</span>
            </div>
            <TorrentStateBadge torrent={torrent} />
          </div>
          <div className="torrent-progress torrent-details__progress" role="progressbar" aria-label={`${title} overall progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(torrent.progressPercent)}>
            <span style={{ transform: `scaleX(${Math.max(0, Math.min(100, torrent.progressPercent)) / 100})` }} />
          </div>
          <div className="torrent-details__metrics">
            <Metric label="Download speed" value={formatSpeed(torrent.downloadSpeedBytesPerSecond)} />
            <Metric label="Upload speed" value={formatSpeed(torrent.uploadSpeedBytesPerSecond)} />
            <Metric label="Time remaining" value={eta ?? (torrent.state === "completed" ? "Complete" : "—")} />
            <Metric label="Ratio" value={ratio} />
            <Metric label="Connected peers" value={torrent.connectedPeers === null ? "—" : torrent.connectedPeers.toLocaleString()} />
            <Metric label="Seeds" value="Not reported" />
            <Metric label="Added" value={formatDate(torrent.addedAt)} />
            <Metric label="Status" value={torrent.state.replaceAll("_", " ")} />
          </div>
          <DetailLine label="Download directory" value={details?.outputDirectory || torrent.outputDirectory || "Unavailable"} />
        </section>

        <section
          className="torrent-details__panel torrent-details__files-panel"
          id="torrent-details-panel-files"
          role="tabpanel"
          aria-labelledby="torrent-details-tab-files"
          hidden={activeTab !== "files"}
        >
          {torrent.files.length > 0 ? (
            <TorrentFilesPanel
              torrent={torrent}
              busy={action.pending !== null}
              saving={action.pending === "update-files"}
              onSave={onUpdateFileSelection}
            />
          ) : (
            <UnavailableMessage>File details are unavailable for this saved torrent.</UnavailableMessage>
          )}
        </section>

        <section
          className="torrent-details__panel"
          id="torrent-details-panel-peers"
          role="tabpanel"
          aria-labelledby="torrent-details-tab-peers"
          hidden={activeTab !== "peers"}
        >
          {detailsLoading ? <DetailLoading /> : detailsError ? <UnavailableMessage>Peer details could not be loaded. Try again to refresh them.</UnavailableMessage> : details?.peers === null || !details ? (
            <UnavailableMessage>Peer details are unavailable for this torrent state.</UnavailableMessage>
          ) : details.peers.length > 0 ? (
            <>
              <p className="torrent-details__note">Peer addresses are masked. rqbit reports client state and lifetime byte counters; per-peer speed and completion are not available.</p>
              <div className="torrent-details__table-wrap">
                <table className="torrent-details__table">
                  <thead><tr><th>Peer address</th><th>Client</th><th>Downloaded</th><th>Uploaded</th><th>Connection</th></tr></thead>
                  <tbody>{details.peers.map((peer, index) => (
                    <tr key={`${peer.address}-${index}`}>
                      <td><code>{peer.address}</code></td>
                      <td>{peer.client || "Unknown client"}</td>
                      <td>{formatBytes(peer.downloadedBytes)}</td>
                      <td>{formatBytes(peer.uploadedBytes)}</td>
                      <td><span className="torrent-details__connection">{peer.connectionState}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          ) : (
            <UnavailableMessage>No peers are connected right now.</UnavailableMessage>
          )}
        </section>

        <section
          className="torrent-details__panel"
          id="torrent-details-panel-trackers"
          role="tabpanel"
          aria-labelledby="torrent-details-tab-trackers"
          hidden={activeTab !== "trackers"}
        >
          {detailsLoading ? <DetailLoading /> : detailsError ? <UnavailableMessage>Tracker details could not be loaded. Try again to refresh them.</UnavailableMessage> : details?.trackers.length ? (
            <>
              <p className="torrent-details__note">These announce URLs are listed by the torrent session. rqbit does not currently expose announce timing or per-tracker peer counts here.</p>
              <div className="torrent-details__table-wrap">
                <table className="torrent-details__table">
                  <thead><tr><th>Tracker URL</th><th>Status</th><th>Peers returned</th><th>Last announce</th><th>Next announce</th></tr></thead>
                  <tbody>{details.trackers.map((tracker) => (
                    <tr key={tracker}>
                      <td className="torrent-details__tracker-url">{tracker}</td>
                      <td>Listed in metadata</td><td>—</td><td>—</td><td>—</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          ) : !details ? (
            <UnavailableMessage>Tracker details are unavailable.</UnavailableMessage>
          ) : (
            <UnavailableMessage>No tracker URLs are available for this torrent.</UnavailableMessage>
          )}
        </section>

        <section
          className="torrent-details__panel"
          id="torrent-details-panel-info"
          role="tabpanel"
          aria-labelledby="torrent-details-tab-info"
          hidden={activeTab !== "info"}
        >
          {detailsLoading ? <DetailLoading /> : detailsError ? <UnavailableMessage>Torrent metadata could not be loaded. Try again to refresh it.</UnavailableMessage> : !details ? <UnavailableMessage>Torrent metadata is unavailable.</UnavailableMessage> : <div className="torrent-details__info-list">
            <div className="torrent-details__info-row">
              <span>Info hash</span>
              <div className="torrent-details__copy-value">
                <code title={torrent.infoHash}>{torrent.infoHash}</code>
                <button className="torrent-details__copy" type="button" onClick={() => void copyInfoHash()} aria-label="Copy info hash" title="Copy info hash">
                  {copyState === "copied" ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {copyState !== "idle" && <p className={`torrent-details__copy-feedback torrent-details__copy-feedback--${copyState}`} role="status">{copyState === "copied" ? "Info hash copied." : "Could not copy. Select the hash to copy it manually."}</p>}
            <DetailLine label="Piece size" value={details.pieceSizeBytes === null ? "Not reported" : formatBytes(details.pieceSizeBytes)} />
            <DetailLine label="Piece count" value={torrent.totalPieces > 0 ? torrent.totalPieces.toLocaleString() : "Not reported"} />
            <DetailLine label="Created" value={formatDate(details.torrentCreatedAt)} />
            <DetailLine label="Created by" value={details.createdBy || "Not reported"} />
            <DetailLine label="Comment" value={details.comment || "Not reported"} />
            <DetailLine label="Privacy" value={details.isPrivate === null ? "Not reported" : details.isPrivate ? "Private torrent" : "Public torrent"} />
            <DetailLine label="Source type" value={sourceLabel(details.sourceType)} />
            <DetailLine label="Save location" value={details.outputDirectory || torrent.outputDirectory || "Unavailable"} />
          </div>}
        </section>
      </div>
    </dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="torrent-details__metric"><span>{label}</span><strong title={value}>{value}</strong></div>;
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return <div className="torrent-details__info-row"><span>{label}</span><strong title={value}>{value}</strong></div>;
}

function UnavailableMessage({ children }: { children: string }) {
  return <div className="torrent-details__unavailable"><p>{children}</p></div>;
}

function DetailLoading() {
  return <div className="torrent-details__unavailable" role="status"><p>Fetching torrent details…</p></div>;
}

function sourceLabel(source: TorrentDetails["sourceType"]): string {
  switch (source) {
    case "magnet": return "Magnet link";
    case "torrent_file": return "Local .torrent file";
    case "torrent_url": return "Torrent URL";
    default: return "Unknown / restored session";
  }
}

function formatDate(timestamp: number | null): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "Not reported";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}
