import type { TorrentStatus } from "../../lib/desktop";

export type TorrentFilter = "all" | "downloading" | "queued" | "paused" | "completed" | "error";

export interface TorrentStatePresentation {
  filter: Exclude<TorrentFilter, "all">;
  label: string;
}

export function getTorrentStatePresentation(torrent: TorrentStatus): TorrentStatePresentation {
  if (torrent.state === "error") return { filter: "error", label: "Error" };
  if (torrent.state === "paused") return { filter: "paused", label: "Paused" };
  if (torrent.state === "completed" || torrent.progressPercent >= 100) {
    return { filter: "completed", label: "Completed" };
  }
  if (torrent.state === "queued") return { filter: "queued", label: "Queued" };
  return { filter: "downloading", label: "Downloading" };
}

export function filterTorrents(torrents: TorrentStatus[], filter: TorrentFilter): TorrentStatus[] {
  if (filter === "all") return torrents;
  return torrents.filter((torrent) => getTorrentStatePresentation(torrent).filter === filter);
}

export function countTorrents(torrents: TorrentStatus[], filter: TorrentFilter): number {
  return filterTorrents(torrents, filter).length;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function formatSpeed(bytesPerSecond: number | null): string {
  return bytesPerSecond === null || !Number.isFinite(bytesPerSecond) || bytesPerSecond < 0
    ? "—"
    : `${formatBytes(bytesPerSecond)}/s`;
}

export function estimateTimeRemaining(torrent: TorrentStatus): string | null {
  const speed = torrent.downloadSpeedBytesPerSecond;
  if (torrent.state !== "downloading" || !Number.isFinite(speed) || speed <= 0) return null;
  const remaining = Math.max(0, torrent.totalBytes - torrent.downloadedBytes);
  if (!Number.isFinite(remaining) || remaining === 0) return null;

  const seconds = Math.ceil(remaining / speed);
  const years = Math.floor(seconds / 31_536_000);
  const days = Math.floor((seconds % 31_536_000) / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (years > 0) return `${years}y ${days}d`;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "< 1m";
}
