import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { getAppInfo } from "./desktop";

export type UpdateErrorCategory =
  | "network"
  | "github"
  | "manifest"
  | "version"
  | "signature"
  | "disk-space"
  | "permission"
  | "download"
  | "install"
  | "restart"
  | "other";

export interface UpdateInfo {
  currentVersion: string;
  newVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  approximateDownloadBytes: number | null;
  available: boolean;
  checking: boolean;
  downloading: boolean;
  installing: boolean;
  downloaded: boolean;
  restartRequired: boolean;
  progress: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
  errorCategory: UpdateErrorCategory | null;
}

export interface UpdateService {
  checkForUpdate(): Promise<UpdateInfo>;
  downloadUpdate(): Promise<UpdateInfo>;
  installUpdate(): Promise<UpdateInfo>;
  downloadAndInstall(): Promise<UpdateInfo>;
  dismissAvailableUpdate(): Promise<void>;
  getCurrentVersion(): Promise<string>;
  restartApplication(): Promise<void>;
  getSnapshot(): UpdateInfo;
  subscribe(listener: (info: UpdateInfo) => void): () => void;
}

const initialState: UpdateInfo = {
  currentVersion: "unknown",
  newVersion: null,
  releaseNotes: null,
  releaseDate: null,
  approximateDownloadBytes: null,
  available: false,
  checking: false,
  downloading: false,
  installing: false,
  downloaded: false,
  restartRequired: false,
  progress: null,
  downloadedBytes: 0,
  totalBytes: null,
  error: null,
  errorCategory: null,
};

const semverPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const releaseNotesLimit = 64 * 1024;

function classifyError(error: unknown, operation: "check" | "download" | "install" | "restart"): { category: UpdateErrorCategory; message: string } {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  if (/minisign|signature|signedversion|signed version/i.test(detail)) {
    return { category: "signature", message: "The update could not be verified. Torque did not install it." };
  }
  if (/no space|disk full|insufficient space|not enough space/i.test(detail)) {
    return { category: "disk-space", message: "There is not enough disk space to download or install the update. Free space and try again." };
  }
  if (/permission denied|access is denied|unauthorized|operation not permitted/i.test(detail)) {
    return { category: "permission", message: "Torque could not write the update. Check application-folder permissions and try again." };
  }
  if (/semver|invalid version|malformed version/i.test(detail)) {
    return { category: "version", message: "GitHub Releases returned an invalid update version." };
  }
  if (/json|manifest|serialization|deserialize|parse|invalidupdaterformat/i.test(detail)) {
    return { category: "manifest", message: "GitHub Releases returned an invalid update manifest." };
  }
  if (/dns|offline|network|connection|timed? ?out|timeout|failed to connect|resolve host/i.test(detail)) {
    return { category: "network", message: "Torque could not reach the update service. Check your internet connection and try again." };
  }
  if (/404|403|429|5\d\d|http status|status code|rate.?limit|release not found|targetnotfound|github/i.test(detail)) {
    return { category: "github", message: "GitHub Releases could not provide an update for this build." };
  }
  if (operation === "download") {
    return { category: "download", message: "The update download was interrupted. Check your connection and try again." };
  }
  if (operation === "install") {
    return { category: "install", message: "The verified update could not be installed. Close other Torque processes and try again." };
  }
  if (operation === "restart") {
    return { category: "restart", message: "The update is installed, but Torque could not restart. Restart the application to finish applying it." };
  }
  return { category: "other", message: "The update operation failed. Try again later." };
}

function getApproximateDownloadBytes(raw: Record<string, unknown>): number | null {
  const sizeKeys = new Set(["size", "downloadSize", "download_size", "contentLength", "content_length"]);
  const visit = (value: unknown, depth: number): number | null => {
    if (depth > 5 || !value || typeof value !== "object") return null;
    for (const [key, item] of Object.entries(value)) {
      if (sizeKeys.has(key)) {
        const size = typeof item === "number" ? item : typeof item === "string" ? Number(item) : NaN;
        if (Number.isSafeInteger(size) && size > 0) return size;
      }
      const nested = visit(item, depth + 1);
      if (nested !== null) return nested;
    }
    return null;
  };
  return visit(raw, 0);
}

function safeReleaseNotes(value: string | undefined): string | null {
  if (!value) return null;
  return value.length > releaseNotesLimit
    ? `${value.slice(0, releaseNotesLimit)}\n\n[Release notes truncated]`
    : value;
}

class TauriUpdateService implements UpdateService {
  private state: UpdateInfo = { ...initialState };
  private pendingUpdate: Update | null = null;
  private isDownloaded = false;
  private busy = false;
  private listeners = new Set<(info: UpdateInfo) => void>();
  private lastPublishedAt = 0;

  getSnapshot(): UpdateInfo {
    return { ...this.state };
  }

  subscribe(listener: (info: UpdateInfo) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async getCurrentVersion(): Promise<string> {
    if (!isTauri()) return "unknown";
    return getVersion();
  }

  async checkForUpdate(): Promise<UpdateInfo> {
    if (!isTauri()) {
      this.state = { ...initialState, error: "Update checks are available inside the Torque desktop application.", errorCategory: "other" };
      this.publish(true);
      return this.getSnapshot();
    }
    if (this.busy) return this.fail("check", new Error("An update operation is already running."));

    this.busy = true;
    try {
      const currentVersion = await this.getCurrentVersion();
      this.state = { ...initialState, currentVersion, checking: true };
      this.publish(true);
      if (import.meta.env.DEV) {
        this.state = { ...this.state, checking: false, error: "Update checks are disabled in development builds.", errorCategory: "other" };
        this.publish(true);
        return this.getSnapshot();
      }

      await this.closePendingUpdate();
      const update = await check({ timeout: 20_000 });
      if (!update) {
        console.info("[Torque updater] no update available");
        this.state = { ...initialState, currentVersion };
        this.publish(true);
        return this.getSnapshot();
      }

      if (!semverPattern.test(update.version)) {
        await update.close();
        throw new Error("The update manifest contains an invalid version.");
      }

      this.pendingUpdate = update;
      this.isDownloaded = false;
      this.state = {
        ...initialState,
        currentVersion,
        newVersion: update.version.replace(/^v/, ""),
        releaseNotes: safeReleaseNotes(update.body),
        releaseDate: update.date ?? null,
        approximateDownloadBytes: getApproximateDownloadBytes(update.rawJson),
        available: true,
      };
      console.info("[Torque updater] update available", { version: update.version });
      this.publish(true);
      return this.getSnapshot();
    } catch (error) {
      return this.fail("check", error);
    } finally {
      this.busy = false;
    }
  }

  async downloadUpdate(): Promise<UpdateInfo> {
    if (!isTauri()) return this.fail("download", new Error("Updater is unavailable outside the desktop app."));
    if (this.busy) return this.fail("download", new Error("An update operation is already running."));
    if (!this.pendingUpdate) return this.fail("download", new Error("No update is ready to download."));

    this.busy = true;
    this.isDownloaded = false;
    this.state = { ...this.state, checking: false, downloading: true, installing: false, downloaded: false, progress: 0, downloadedBytes: 0, totalBytes: null, error: null, errorCategory: null };
    this.publish(true);
    let downloadedBytes = 0;
    let totalBytes: number | null = null;

    try {
      await this.pendingUpdate.download((event: DownloadEvent) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength ?? null;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
        } else if (event.event === "Finished") {
          this.state = { ...this.state, progress: 100 };
        }

        this.state = {
          ...this.state,
          downloadedBytes,
          totalBytes,
          progress: totalBytes && totalBytes > 0
            ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
            : null,
        };
        this.publish(event.event !== "Progress");
      });
      this.isDownloaded = true;
      this.state = {
        ...this.state,
        downloading: false,
        downloaded: true,
        progress: 100,
        downloadedBytes,
        totalBytes,
        error: null,
        errorCategory: null,
      };
      console.info("[Torque updater] update downloaded and signature verified");
      this.publish(true);
      return this.getSnapshot();
    } catch (error) {
      return this.fail("download", error);
    } finally {
      this.busy = false;
    }
  }

  async installUpdate(): Promise<UpdateInfo> {
    if (!isTauri()) return this.fail("install", new Error("Updater is unavailable outside the desktop app."));
    if (this.busy) return this.fail("install", new Error("An update operation is already running."));
    if (!this.pendingUpdate || !this.isDownloaded) {
      return this.fail("install", new Error("Download and verify the update before installing it."));
    }

    this.busy = true;
    this.state = { ...this.state, installing: true, error: null, errorCategory: null };
    this.publish(true);
    try {
      await this.pendingUpdate.install();
      await this.closePendingUpdate();
      this.state = { ...this.state, available: false, checking: false, downloading: false, installing: false, downloaded: false, restartRequired: true, error: null, errorCategory: null };
      console.info("[Torque updater] update installed");
      this.publish(true);
      return this.getSnapshot();
    } catch (error) {
      return this.fail("install", error);
    } finally {
      this.busy = false;
    }
  }

  async downloadAndInstall(): Promise<UpdateInfo> {
    const downloaded = await this.downloadUpdate();
    if (downloaded.error) return downloaded;
    const installed = await this.installUpdate();
    if (installed.error) return installed;
    try {
      if ((await getAppInfo()).platform !== "windows") await this.restartApplication();
      return this.getSnapshot();
    } catch (error) {
      return this.fail("restart", error);
    }
  }

  async dismissAvailableUpdate(): Promise<void> {
    await this.closePendingUpdate();
    this.state = { ...initialState, currentVersion: this.state.currentVersion };
    this.publish(true);
  }

  async restartApplication(): Promise<void> {
    if (!isTauri()) throw new Error("Application restart is available inside Torque desktop only.");
    try {
      await relaunch();
    } catch (error) {
      const failure = this.fail("restart", error);
      throw new Error(failure.error ?? "Torque could not restart.");
    }
  }

  private async closePendingUpdate(): Promise<void> {
    const update = this.pendingUpdate;
    this.pendingUpdate = null;
    this.isDownloaded = false;
    if (update) await update.close();
  }

  private fail(operation: "check" | "download" | "install" | "restart", error: unknown): UpdateInfo {
    const failure = classifyError(error, operation);
    this.state = {
      ...this.state,
      checking: false,
      downloading: false,
      installing: false,
      error: failure.message,
      errorCategory: failure.category,
    };
    // Only log the category; raw errors can contain remote URLs or other request details.
    console.warn(`[Torque updater] ${operation} failed (${failure.category})`);
    this.publish(true);
    return this.getSnapshot();
  }

  private publish(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastPublishedAt < 120) return;
    this.lastPublishedAt = now;
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const updateService: UpdateService = new TauriUpdateService();
