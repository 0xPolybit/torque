import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  defaultDownloadDirectory: string | null;
}

export type ThemePreference = "system" | "dark" | "light";

export interface AppPreferences {
  resumeUnfinishedOnStartup: boolean;
  startDownloadsAutomatically: boolean;
  theme: ThemePreference;
}

export interface DownloadDirectory {
  id: string;
  name: string;
  displayPath: string;
}

export interface TorrentFileSelection {
  id: string;
  fileName: string;
}

export interface TorrentPreviewFile {
  index: number;
  path: string;
  filename: string;
  sizeBytes: string;
  extension: string | null;
  selected: boolean;
}

export interface TorrentPreview {
  previewId: string;
  name: string;
  infoHash: string;
  totalSize: string;
  pieceCount: number;
  trackers: string[];
  isPrivate: boolean;
  files: TorrentPreviewFile[];
}

export interface DownloadDirectoryList {
  defaultId: string;
  directories: DownloadDirectory[];
}

export interface TorrentFile {
  index: number;
  name: string;
  path: string;
  sizeBytes: string;
  downloadedBytes: string;
  progressPercent: number;
  included: boolean;
  state: "skipped" | "queued" | "downloading" | "paused" | "completed" | "error";
}

export type TorrentState = "queued" | "downloading" | "paused" | "completed" | "error";
export type TorrentSourceType = "magnet" | "torrent_file" | "torrent_url" | "unknown";
export type TorrentControlAction = "pause" | "resume" | "retry" | "remove" | "open-folder" | "update-files";

export interface TorrentPeerStatus {
  address: string;
  client: string | null;
  connectionState: string;
  downloadedBytes: number;
  uploadedBytes: number;
}

export interface TorrentDetails {
  peers: TorrentPeerStatus[] | null;
  trackers: string[];
  outputDirectory: string | null;
  pieceSizeBytes: number | null;
  torrentCreatedAt: number | null;
  createdBy: string | null;
  comment: string | null;
  isPrivate: boolean | null;
  sourceType: TorrentSourceType;
}

export interface TorrentActionState {
  pending: TorrentControlAction | null;
  error: string | null;
}

export interface TorrentStatus {
  id: number;
  infoHash: string;
  name: string | null;
  totalPieces: number;
  files: TorrentFile[];
  outputDirectory: string;
  state: TorrentState;
  error: string | null;
  progressPercent: number;
  downloadedBytes: number;
  totalBytes: number;
  uploadedBytes: number;
  downloadSpeedBytesPerSecond: number;
  uploadSpeedBytesPerSecond: number | null;
  connectedPeers: number | null;
  addedAt: number;
  completedAt: number | null;
  engineAvailable: boolean;
  fileSelectionEditable: boolean;
}

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("get_app_info");
}

export function getAppPreferences(): Promise<AppPreferences> {
  return invoke<AppPreferences>("get_app_preferences");
}

export function setAppPreferences(preferences: AppPreferences): Promise<AppPreferences> {
  return invoke<AppPreferences>("set_app_preferences", { preferences });
}

export function setWindowTheme(theme: ThemePreference): Promise<void> {
  return getCurrentWindow().setTheme(theme === "system" ? null : theme);
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

export function getTorrentDetails(torrentId: number): Promise<TorrentDetails> {
  return invoke<TorrentDetails>("get_torrent_details", { torrentId });
}

export function updateTorrentFileSelection(
  torrentId: number,
  selectedFileIndices: number[],
): Promise<TorrentStatus> {
  return invoke<TorrentStatus>("update_torrent_file_selection", {
    torrentId,
    selectedFileIndices,
  });
}

export function pauseTorrent(torrentId: number): Promise<TorrentStatus> {
  return invoke<TorrentStatus>("pause_torrent", { torrentId });
}

export function resumeTorrent(torrentId: number): Promise<TorrentStatus> {
  return invoke<TorrentStatus>("resume_torrent", { torrentId });
}

export function retryTorrent(torrentId: number): Promise<TorrentStatus> {
  return invoke<TorrentStatus>("retry_torrent", { torrentId });
}

export function removeTorrent(torrentId: number): Promise<void> {
  return invoke<void>("remove_torrent", { torrentId });
}

export function openTorrentFolder(torrentId: number): Promise<void> {
  return invoke<void>("open_torrent_folder", { torrentId });
}

export function inspectMagnet(
  magnetLink: string,
  outputDirectoryId: string,
): Promise<TorrentPreview> {
  return invoke<TorrentPreview>("inspect_magnet", { magnetLink, outputDirectoryId });
}

export function inspectTorrentUrl(
  torrentUrl: string,
  outputDirectoryId: string,
): Promise<TorrentPreview> {
  return invoke<TorrentPreview>("inspect_torrent_url", { torrentUrl, outputDirectoryId });
}

export function selectTorrentFile(): Promise<TorrentFileSelection | null> {
  return invoke<TorrentFileSelection | null>("select_torrent_file");
}

export function inspectTorrentFile(
  torrentFileId: string,
  outputDirectoryId: string,
): Promise<TorrentPreview> {
  return invoke<TorrentPreview>("inspect_torrent_file", { torrentFileId, outputDirectoryId });
}

export function startInspectedTorrent(
  previewId: string,
  outputDirectoryId: string,
  selectedFileIndices: number[],
): Promise<TorrentStatus> {
  return invoke<TorrentStatus>("start_inspected_torrent", {
    previewId,
    outputDirectoryId,
    selectedFileIndices,
  });
}

export function discardTorrentPreview(previewId: string): Promise<void> {
  return invoke<void>("discard_torrent_preview", { previewId });
}

export function discardTorrentFileSelection(torrentFileId: string): Promise<void> {
  return invoke<void>("discard_torrent_file_selection", { torrentFileId });
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
