import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getAppInfo, type UpdatePreferences } from "../lib/desktop";
import { compareSemVer } from "../lib/semver";
import { updateService, type UpdateInfo } from "../lib/updateService";
import type { ToastTone } from "../components/ToastRegion";

type CheckResult = "idle" | "up-to-date" | "available" | "skipped";

interface UpdateWorkflowOptions {
  enabled: boolean;
  preferences: UpdatePreferences;
  onPreferencesChange: (changes: Partial<UpdatePreferences>) => Promise<void>;
  notify: (message: string, tone?: ToastTone) => void;
}

const meaningfulStartupErrors = new Set(["manifest", "version", "signature", "disk-space", "permission", "install", "restart"]);
export function useUpdateWorkflow({ enabled, preferences, onPreferencesChange, notify }: UpdateWorkflowOptions) {
  const [info, setInfo] = useState<UpdateInfo>(() => updateService.getSnapshot());
  const [checkResult, setCheckResult] = useState<CheckResult>("idle");
  const preferencesRef = useRef(preferences);
  const persistRef = useRef(onPreferencesChange);
  const notifyRef = useRef(notify);
  const startupCheckStarted = useRef(false);
  preferencesRef.current = preferences;
  persistRef.current = onPreferencesChange;
  notifyRef.current = notify;

  useEffect(() => updateService.subscribe(setInfo), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void updateService.getCurrentVersion().then((currentVersion) => {
      if (active && currentVersion !== "unknown") {
        setInfo((current) => current.currentVersion === "unknown" ? { ...current, currentVersion } : current);
      }
    }).catch(() => {
      // The version is already available from the app metadata in the settings view.
    });
    return () => { active = false; };
  }, [enabled]);

  const persistUpdatePreferences = useCallback(async (changes: Partial<UpdatePreferences>) => {
    const next = { ...preferencesRef.current, ...changes };
    preferencesRef.current = next;
    await persistRef.current(next);
  }, []);

  const checkForUpdate = useCallback(async (automatic = false): Promise<UpdateInfo> => {
    const result = await updateService.checkForUpdate();
    setInfo(result);
    if (result.error) {
      setCheckResult("idle");
      if (automatic && result.errorCategory && meaningfulStartupErrors.has(result.errorCategory)) {
        notifyRef.current(`Update check needs attention: ${result.error}`, "error");
      }
      return result;
    }

    const current = preferencesRef.current;
    const timestamp = Math.floor(Date.now() / 1000);
    const updates: Partial<UpdatePreferences> = { lastSuccessfulCheckAt: timestamp };
    let shouldDownloadAutomatically = false;
    let shouldNotifyAvailable = false;
    if (result.available && result.newVersion) {
      if (current.skippedVersion && compareSemVer(result.newVersion, current.skippedVersion) > 0) updates.skippedVersion = null;
      if (current.deferredVersion && compareSemVer(result.newVersion, current.deferredVersion) > 0) updates.deferredVersion = null;
      const skippedVersion = Object.hasOwn(updates, "skippedVersion") ? updates.skippedVersion : current.skippedVersion;
      const deferredVersion = Object.hasOwn(updates, "deferredVersion") ? updates.deferredVersion : current.deferredVersion;
      const isSkipped = skippedVersion === result.newVersion;
      const isDeferred = deferredVersion === result.newVersion;

      if (isSkipped) {
        setCheckResult("skipped");
        await updateService.dismissAvailableUpdate();
        setInfo(updateService.getSnapshot());
      } else {
        setCheckResult("available");
        if (!isDeferred) {
          if (automatic && current.automaticDownload) shouldDownloadAutomatically = true;
          else if (automatic) shouldNotifyAvailable = true;
        }
      }
    } else {
      setCheckResult("up-to-date");
      if (current.skippedVersion && compareSemVer(result.currentVersion, current.skippedVersion) >= 0) updates.skippedVersion = null;
      if (current.deferredVersion && compareSemVer(result.currentVersion, current.deferredVersion) >= 0) updates.deferredVersion = null;
    }
    await persistUpdatePreferences(updates);
    const latestPreferences = preferencesRef.current;
    const versionStillEligible = result.newVersion !== null
      && latestPreferences.skippedVersion !== result.newVersion
      && latestPreferences.deferredVersion !== result.newVersion;
    if (automatic && shouldNotifyAvailable && result.newVersion && versionStillEligible) {
      notifyRef.current(`Update available · v${result.newVersion} is ready to download.`, "info");
    }
    if (shouldDownloadAutomatically && result.newVersion && versionStillEligible) {
      const download = await updateService.downloadUpdate();
      setInfo(download);
      if (download.error) {
        notifyRef.current(`Update download failed: ${download.error}`, "error");
      } else {
        notifyRef.current(`Update ready to install · v${result.newVersion}`, "info");
      }
    }
    return result;
  }, [persistUpdatePreferences]);

  useEffect(() => {
    if (!enabled || !isTauri() || import.meta.env.DEV || !preferences.automaticCheckEnabled) return;
    if (startupCheckStarted.current) return;
    const elapsedSeconds = preferences.lastSuccessfulCheckAt === null
      ? Number.POSITIVE_INFINITY
      : Math.floor(Date.now() / 1000) - preferences.lastSuccessfulCheckAt;
    const intervalSeconds = preferences.checkFrequencyHours * 60 * 60;
    if (elapsedSeconds < intervalSeconds) {
      startupCheckStarted.current = true;
      return;
    }

    const timeout = window.setTimeout(() => {
      if (startupCheckStarted.current) return;
      startupCheckStarted.current = true;
      if (preferencesRef.current.automaticCheckEnabled) void checkForUpdate(true);
    }, 4200);
    return () => window.clearTimeout(timeout);
  }, [enabled, preferences.automaticCheckEnabled, preferences.checkFrequencyHours, preferences.lastSuccessfulCheckAt, checkForUpdate]);

  const downloadUpdate = useCallback(() => updateService.downloadUpdate().then((result) => {
    setInfo(result);
    return result;
  }), []);

  const installUpdate = useCallback(async () => {
    const installed = await updateService.installUpdate();
    setInfo(installed);
    if (installed.error) return installed;
    try {
      if ((await getAppInfo()).platform !== "windows") await updateService.restartApplication();
    } catch {
      // restartApplication records the normalized error on the subscribed service state.
    }
    setInfo(updateService.getSnapshot());
    return updateService.getSnapshot();
  }, []);

  const restartApplication = useCallback(() => updateService.restartApplication(), []);

  const deferUpdate = useCallback(async () => {
    if (!info.newVersion) return;
    await persistUpdatePreferences({ deferredVersion: info.newVersion });
  }, [info.newVersion, persistUpdatePreferences]);

  const skipUpdate = useCallback(async () => {
    if (!info.newVersion) return;
    await persistUpdatePreferences({ skippedVersion: info.newVersion, deferredVersion: null });
    await updateService.dismissAvailableUpdate();
    setInfo(updateService.getSnapshot());
    setCheckResult("skipped");
  }, [info.newVersion, persistUpdatePreferences]);

  const manualCheckForUpdate = useCallback(() => {
    startupCheckStarted.current = true;
    return checkForUpdate(false);
  }, [checkForUpdate]);

  return {
    info,
    checkResult,
    manualCheckForUpdate,
    downloadUpdate,
    installUpdate,
    restartApplication,
    deferUpdate,
    skipUpdate,
  };
}
