import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { getAppInfo } from "./desktop";

export interface UpdateInfo {
  currentVersion: string;
  newVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  available: boolean;
  downloading: boolean;
  progress: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
}

export interface UpdateService {
  checkForUpdate(): Promise<UpdateInfo>;
  downloadUpdate(): Promise<UpdateInfo>;
  installUpdate(): Promise<UpdateInfo>;
  downloadAndInstall(): Promise<UpdateInfo>;
  getCurrentVersion(): Promise<string>;
  restartApplication(): Promise<void>;
  getSnapshot(): UpdateInfo;
}

const initialState: UpdateInfo = {
  currentVersion: "unknown",
  newVersion: null,
  releaseNotes: null,
  releaseDate: null,
  available: false,
  downloading: false,
  progress: null,
  downloadedBytes: 0,
  totalBytes: null,
  error: null,
};

const semverPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

type ErrorCategory = "network" | "github" | "manifest" | "version" | "signature" | "other";

function classifyError(error: unknown): { category: ErrorCategory; message: string } {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  if (/minisign|signature|signedversion|signed version/i.test(detail)) {
    return {
      category: "signature",
      message: "The update could not be verified. Torque did not install it.",
    };
  }
  if (/semver|invalid version|malformed version/i.test(detail)) {
    return {
      category: "version",
      message: "GitHub Releases returned an invalid update version.",
    };
  }
  if (/dns|offline|network|connection|timed? ?out|timeout|failed to connect|resolve host/i.test(detail)) {
    return {
      category: "network",
      message: "Torque could not reach the update service. Check your internet connection and try again.",
    };
  }
  if (/404|403|429|5\d\d|http status|status code|rate.?limit|release not found|targetnotfound|github/i.test(detail)) {
    return {
      category: "github",
      message: "GitHub Releases could not provide an update for this build.",
    };
  }
  if (/json|manifest|serialization|deserialize|parse|invalidupdaterformat/i.test(detail)) {
    return {
      category: "manifest",
      message: "GitHub Releases returned an invalid update manifest.",
    };
  }
  return {
    category: "other",
    message: "The update operation failed. Try again later.",
  };
}

class TauriUpdateService implements UpdateService {
  private state: UpdateInfo = { ...initialState };
  private pendingUpdate: Update | null = null;
  private isDownloaded = false;
  private busy = false;

  getSnapshot(): UpdateInfo {
    return { ...this.state };
  }

  async getCurrentVersion(): Promise<string> {
    if (!isTauri()) return "unknown";
    return getVersion();
  }

  async checkForUpdate(): Promise<UpdateInfo> {
    if (!isTauri()) {
      this.state = {
        ...initialState,
        error: "Update checks are available inside the Torque desktop application.",
      };
      return this.getSnapshot();
    }
    if (this.busy) return this.fail("check", new Error("An update operation is already running."));

    this.busy = true;
    try {
      const currentVersion = await this.getCurrentVersion();
      this.state = { ...initialState, currentVersion };

      if (import.meta.env.DEV) {
        this.state.error = "Update checks are disabled in development builds.";
        return this.getSnapshot();
      }

      await this.closePendingUpdate();
      const update = await check({ timeout: 20_000 });

      if (!update) {
        console.info("[Torque updater] no update available");
        this.state = { ...initialState, currentVersion };
        return this.getSnapshot();
      }

      if (!semverPattern.test(update.version)) {
        await update.close();
        throw new Error("The update manifest contains an invalid version.");
      }

      this.pendingUpdate = update;
      this.isDownloaded = false;
      this.state = {
        currentVersion,
        newVersion: update.version.replace(/^v/, ""),
        releaseNotes: update.body ?? null,
        releaseDate: update.date ?? null,
        available: true,
        downloading: false,
        progress: null,
        downloadedBytes: 0,
        totalBytes: null,
        error: null,
      };
      console.info("[Torque updater] update available", { version: update.version });
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
    this.state = { ...this.state, downloading: true, progress: 0, downloadedBytes: 0, error: null };
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
      });
      this.isDownloaded = true;
      this.state = {
        ...this.state,
        downloading: false,
        progress: 100,
        downloadedBytes,
        totalBytes,
        error: null,
      };
      console.info("[Torque updater] update downloaded and signature verified");
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
    try {
      await this.pendingUpdate.install();
      await this.closePendingUpdate();
      this.state = { ...this.state, available: false, downloading: false, error: null };
      console.info("[Torque updater] update installed");
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

  private fail(operation: string, error: unknown): UpdateInfo {
    const failure = classifyError(error);
    this.state = { ...this.state, downloading: false, error: failure.message };
    // Only log the category; raw errors can contain remote URLs or other request details.
    console.warn(`[Torque updater] ${operation} failed (${failure.category})`);
    return this.getSnapshot();
  }
}

export const updateService: UpdateService = new TauriUpdateService();
