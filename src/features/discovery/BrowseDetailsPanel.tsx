import { Archive, ArrowDownToLine, CircleAlert, ExternalLink, FileText, LoaderCircle, ShieldCheck, X } from "lucide-react";
import type { TorrentSearchDetails, TorrentSearchResult } from "../../lib/discovery";
import { describeError } from "../../lib/desktop";

interface BrowseDetailsPanelProps {
  result: TorrentSearchResult | null;
  details: TorrentSearchDetails | null;
  providerName: string;
  loading: boolean;
  error: string;
  inspecting: boolean;
  onClose: () => void;
  onRetry: () => void;
  onInspect: (details: TorrentSearchDetails) => void;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "Not supplied";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** unit;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: amount >= 100 ? 0 : 1 })} ${units[unit]}`;
}

function safeSourcePage(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function SourceMechanism({ details }: { details: TorrentSearchDetails }) {
  const modes = [
    ...(details.result.magnetUri ? ["Magnet link"] : []),
    ...(details.result.torrentUrl ? ["Torrent file"] : []),
    ...(details.torrentAvailable && !details.result.magnetUri && !details.result.torrentUrl ? ["Torrent source"] : []),
  ];
  return <span className={`browse-detail__availability${modes.length === 0 ? " is-unavailable" : ""}`}>
    {modes.length ? modes.join(" · ") : "No torrent source supplied"}
  </span>;
}

export function BrowseDetailsPanel({
  result,
  details,
  providerName,
  loading,
  error,
  inspecting,
  onClose,
  onRetry,
  onInspect,
}: BrowseDetailsPanelProps) {
  if (!result) return null;
  const record = details?.result ?? result;
  const title = record.title || record.id;
  const sourcePage = safeSourcePage(record.sourcePage);
  const metadata = [
    ["Category", record.category ?? "Open content"],
    ["Size", formatBytes(record.sizeBytes)],
    ["Published", record.publishedAt ?? "Not supplied"],
    ["License", record.license ?? "Not supplied"],
    ...(record.infoHash ? [["Info hash", record.infoHash] as [string, string]] : []),
    ...(details?.creator ? [["Creator", details.creator] as [string, string]] : []),
    ...(record.seeders !== null ? [["Seeders", String(record.seeders)] as [string, string]] : []),
    ...(record.leechers !== null ? [["Peers", String(record.leechers)] as [string, string]] : []),
  ];
  const sourceAvailable = Boolean(details && (
    details.torrentAvailable || details.result.magnetUri || details.result.torrentUrl
  ));

  return (
    <aside className="browse-details" aria-labelledby="browse-details-title" aria-busy={loading || inspecting}>
      <header className="browse-details__header">
        <div className="browse-details__provider"><Archive size={14} aria-hidden="true" /> {providerName}</div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close details">
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="browse-details__scroll">
        <h2 id="browse-details-title" title={title}>{title}</h2>
        {record.verified === true && <span className="browse-details__verified"><ShieldCheck size={13} aria-hidden="true" /> Provider verified</span>}

        {loading ? (
          <div className="browse-details__loading" role="status">
            <span className="browse-detail-skeleton browse-detail-skeleton--title" />
            <span className="browse-detail-skeleton" />
            <span className="browse-detail-skeleton" />
            <span className="browse-detail-skeleton browse-detail-skeleton--short" />
            <span>Loading source details…</span>
          </div>
        ) : (
          <>
            <p className="browse-details__description">
              {record.description || "This provider has not supplied a description for the item."}
            </p>
            {error && (
              <div className="browse-details__error" role="alert">
                <CircleAlert size={14} aria-hidden="true" />
                <span>{describeError(error)}</span>
                <button type="button" onClick={onRetry}>Retry</button>
              </div>
            )}

            <dl className="browse-details__metadata">
              {metadata.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd title={value}>{value}</dd>
                </div>
              ))}
              {details?.subjects.map((subject, index) => (
                <div key={`subject-${index}`}>
                  <dt>{index === 0 ? "Subjects" : ""}</dt>
                  <dd title={subject}>{subject}</dd>
                </div>
              ))}
            </dl>

            {details && (
              <section className="browse-details__source" aria-label="Download source">
                <h3><FileText size={14} aria-hidden="true" /> Available download mechanism</h3>
                <SourceMechanism details={details} />
              </section>
            )}

            {sourcePage && (
              <a className="browse-details__source-link" href={sourcePage} target="_blank" rel="noreferrer">
                <ExternalLink size={13} aria-hidden="true" /> Open source page
              </a>
            )}
          </>
        )}
      </div>

      <footer className="browse-details__footer">
        <button
          className="primary-button"
          type="button"
          disabled={loading || inspecting || !sourceAvailable}
          onClick={() => details && onInspect(details)}
        >
          {inspecting ? <LoaderCircle className="is-spinning" size={14} aria-hidden="true" /> : <ArrowDownToLine size={14} aria-hidden="true" />}
          {inspecting ? "Preparing inspection…" : "Inspect Torrent"}
        </button>
      </footer>
    </aside>
  );
}
