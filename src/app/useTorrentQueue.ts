import { useCallback, useEffect, useState } from "react";
import {
  addMagnet,
  addTorrentFile,
  addTorrentUrl,
  discardTorrentFileSelection,
  describeError,
  getDownloadDirectories,
  getAppPreferences,
  getTorrents,
  openTorrentFolder as openDesktopTorrentFolder,
  pauseTorrent as pauseDesktopTorrent,
  removeTorrent as removeDesktopTorrent,
  resumeTorrent as resumeDesktopTorrent,
  retryTorrent as retryDesktopTorrent,
  selectDownloadDirectory,
  selectTorrentFile as selectNativeTorrentFile,
  setAppPreferences,
  setWindowTheme,
  type AppPreferences,
  type TorrentActionState,
  type TorrentControlAction,
  type DownloadDirectory,
  type TorrentFileSelection,
  type TorrentStatus,
} from "../lib/desktop";

const LAST_DOWNLOAD_DIRECTORY_KEY = "torque:last-download-directory-id";

function rememberedDirectoryId(): string {
  try {
    return window.sessionStorage.getItem(LAST_DOWNLOAD_DIRECTORY_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberDirectoryId(id: string): void {
  try {
    window.sessionStorage.setItem(LAST_DOWNLOAD_DIRECTORY_KEY, id);
  } catch {
    // The opaque grant remains selected in React state for this app session.
  }
}

export function useTorrentQueue(enabled: boolean) {
  const [torrents, setTorrents] = useState<TorrentStatus[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [directories, setDirectories] = useState<DownloadDirectory[]>([]);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectingDirectory, setSelectingDirectory] = useState(false);
  const [selectingFile, setSelectingFile] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences>({
    resumeUnfinishedOnStartup: true,
    startDownloadsAutomatically: true,
    theme: "dark",
  });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [torrentActions, setTorrentActions] = useState<Record<number, TorrentActionState>>({});
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (selectedDirectoryId) rememberDirectoryId(selectedDirectoryId);
  }, [selectedDirectoryId]);

  const refreshTorrents = useCallback(async () => {
    try {
      setTorrents(await getTorrents());
      setError("");
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    getDownloadDirectories()
      .then(({ directories: available, defaultId }) => {
        if (!active) return;
        setDirectories(available);
        const remembered = available.find((directory) => directory.id === rememberedDirectoryId());
        setSelectedDirectoryId((current) => {
          if (available.some((directory) => directory.id === current)) return current;
          return remembered?.id ?? defaultId;
        });
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause));
      });

    getAppPreferences()
      .then((preferences) => {
        if (!active) return;
        setPreferences(preferences);
        return setWindowTheme(preferences.theme).catch((cause: unknown) => {
          if (active) setError(`Could not apply the saved theme: ${describeError(cause)}`);
        });
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause));
      })
      .finally(() => {
        if (active) setPreferencesLoaded(true);
      });

    void refreshTorrents();
    const interval = window.setInterval(() => void refreshTorrents(), 2000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [enabled, refreshTorrents]);

  const chooseDirectory = useCallback(async () => {
    if (selectingDirectory) return;
    setError("");
    setSelectingDirectory(true);
    try {
      const directory = await selectDownloadDirectory();
      if (!directory) return;
      setDirectories((current) => [
        ...current.filter((item) => item.id !== directory.id),
        directory,
      ]);
      setSelectedDirectoryId(directory.id);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSelectingDirectory(false);
    }
  }, [selectingDirectory]);

  const updatePreferences = useCallback(async (changes: Partial<AppPreferences>) => {
    setSavingPreference(true);
    setError("");
    try {
      const saved = await setAppPreferences({ ...preferences, ...changes });
      setPreferences(saved);
      try {
        await setWindowTheme(saved.theme);
      } catch (cause) {
        setError(`Settings were saved, but the window could not apply the theme: ${describeError(cause)}`);
      }
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSavingPreference(false);
    }
  }, [preferences]);

  const chooseTorrentFile = useCallback(async (): Promise<TorrentFileSelection | null> => {
    setError("");
    setSelectingFile(true);
    try {
      return await selectNativeTorrentFile();
    } catch (cause) {
      setError(describeError(cause));
      return null;
    } finally {
      setSelectingFile(false);
    }
  }, []);

  const discardTorrentFile = useCallback(async (id: string) => {
    try {
      await discardTorrentFileSelection(id);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, []);

  const add = useCallback(
    async (operation: () => Promise<TorrentStatus | null>) => {
      if (!selectedDirectoryId) {
        setError("Choose a download folder before adding a torrent.");
        return false;
      }
      setBusy(true);
      setError("");
      try {
        const added = await operation();
        if (added) {
          setTorrents((current) => [
            added,
            ...current.filter((torrent) => torrent.id !== added.id),
          ]);
          setToast({ id: Date.now(), message: "Torrent added to your downloads." });
        }
        await refreshTorrents();
        return Boolean(added);
      } catch (cause) {
        setError(describeError(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refreshTorrents, selectedDirectoryId],
  );

  const runTorrentAction = useCallback(
    async (
      torrentId: number,
      action: TorrentControlAction,
      operation: () => Promise<TorrentStatus | void>,
    ): Promise<boolean> => {
      setTorrentActions((current) => ({
        ...current,
        [torrentId]: { pending: action, error: null },
      }));
      try {
        const updated = await operation();
        if (updated && "state" in updated) {
          setTorrents((current) => current.map((torrent) =>
            torrent.id === torrentId ? updated : torrent,
          ));
        }
        if (action === "remove") {
          setTorrents((current) => current.filter((torrent) => torrent.id !== torrentId));
          await refreshTorrents();
        }
        const successMessages: Partial<Record<TorrentControlAction, string>> = {
          pause: "Download paused.",
          resume: "Download resumed.",
          retry: "Retry started.",
          remove: "Removed from Torque. Downloaded files were kept.",
        };
        if (successMessages[action]) {
          setToast({ id: Date.now(), message: successMessages[action]! });
        }
        return true;
      } catch (cause) {
        setTorrentActions((current) => ({
          ...current,
          [torrentId]: { pending: null, error: describeError(cause) },
        }));
        return false;
      } finally {
        setTorrentActions((current) => ({
          ...current,
          [torrentId]: {
            pending: null,
            error: current[torrentId]?.error ?? null,
          },
        }));
      }
    },
    [refreshTorrents],
  );

  return {
    torrents,
    initialLoading,
    directories,
    selectedDirectoryId,
    selectedDirectory: directories.find((item) => item.id === selectedDirectoryId),
    error,
    setError,
    busy,
    selectingDirectory,
    selectingFile,
    preferences,
    preferencesLoaded,
    savingPreference,
    updatePreferences,
    torrentActions,
    refreshTorrents,
    toast,
    dismissToast,
    chooseDirectory,
    chooseTorrentFile,
    discardTorrentFile,
    pauseTorrent: (torrentId: number) =>
      runTorrentAction(torrentId, "pause", () => pauseDesktopTorrent(torrentId)),
    resumeTorrent: (torrentId: number) =>
      runTorrentAction(torrentId, "resume", () => resumeDesktopTorrent(torrentId)),
    retryTorrent: (torrentId: number) =>
      runTorrentAction(torrentId, "retry", () => retryDesktopTorrent(torrentId)),
    removeTorrent: (torrentId: number) =>
      runTorrentAction(torrentId, "remove", () => removeDesktopTorrent(torrentId)),
    openTorrentFolder: (torrentId: number) =>
      runTorrentAction(torrentId, "open-folder", () => openDesktopTorrentFolder(torrentId)),
    addMagnet: (link: string) =>
      add(() => addMagnet(link, selectedDirectoryId)),
    addTorrentUrl: (url: string) =>
      add(() => addTorrentUrl(url, selectedDirectoryId)),
    addTorrentFile: (torrentFileId: string) =>
      add(() => addTorrentFile(torrentFileId, selectedDirectoryId)),
  };
}
