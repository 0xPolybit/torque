import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  defaultDownloadDirectory: string | null;
}

export interface DownloadDirectory {
  id: string;
  name: string;
}

export interface DownloadDirectoryList {
  defaultId: string;
  directories: DownloadDirectory[];
}

export interface TorrentFile {
  name: string;
  sizeBytes: number;
  included: boolean;
}

export interface TorrentStatus {
  id: number;
  infoHash: string;
  name: string | null;
  totalPieces: number;
  files: TorrentFile[];
  outputDirectory: string;
  state: "initializing" | "downloading" | "paused" | "seeding" | "error";
  error: string | null;
  progressPercent: number;
  downloadedBytes: number;
  totalBytes: number;
  uploadedBytes: number;
  downloadSpeedBytesPerSecond: number;
  uploadSpeedBytesPerSecond: number | null;
  connectedPeers: number | null;
}

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("get_app_info");
}

export function getDownloadDirectories(): Promise<DownloadDirectoryList> {
  return invoke<DownloadDirectoryList>("get_download_directories");
}

export function selectDownloadDirectory(): Promise<DownloadDirectory | null> {
  return invoke<DownloadDirectory | null>("select_download_directory");
}

export function getTorrents(): Promise<TorrentStatus[]> {
  return invoke<TorrentStatus[]>("get_torrents");
}

export function getTorrentStatus(torrentId: number): Promise<TorrentStatus> {
  return invoke<TorrentStatus>("get_torrent_status", { torrentId });
}

export function addMagnet(
  magnetLink: string,
  outputDirectoryId: string,
): Promise<TorrentStatus> {
  return invoke<TorrentStatus>("add_magnet", { magnetLink, outputDirectoryId });
}

export function addTorrentUrl(
  torrentUrl: string,
  outputDirectoryId: string,
): Promise<TorrentStatus> {
  return invoke<TorrentStatus>("add_torrent_url", { torrentUrl, outputDirectoryId });
}

export function addTorrentFile(
  outputDirectoryId: string,
): Promise<TorrentStatus | null> {
  return invoke<TorrentStatus | null>("add_torrent_file", { outputDirectoryId });
}

export function describeError(error: unknown): string {
  const message = error instanceof Error
    ? error.message.trim()
    : typeof error === "string"
      ? error.trim()
      : "";

  if (/Cannot read properties of undefined.*invoke|__TAURI_INTERNALS__/i.test(message)) {
    return "Open Torque in the desktop app to connect to the download engine.";
  }

  if (message) return message;

  return "The desktop core could not be reached.";
}
