import { useCallback, useEffect, useState } from "react";
import {
  discardTorrentPreview as discardDesktopTorrentPreview,
  discardTorrentFileSelection,
  describeError,
  getDownloadDirectories,
  getAppPreferences,
  getTorrents,
  inspectMagnet as inspectDesktopMagnet,
  inspectTorrentFile as inspectDesktopTorrentFile,
  inspectTorrentUrl as inspectDesktopTorrentUrl,
  moveQueuedTorrent as moveDesktopQueuedTorrent,
  openTorrentFolder as openDesktopTorrentFolder,
  pauseTorrent as pauseDesktopTorrent,
  removeTorrent as removeDesktopTorrent,
  resumeTorrent as resumeDesktopTorrent,
  retryTorrent as retryDesktopTorrent,
  selectDownloadDirectory,
  selectTorrentFile as selectNativeTorrentFile,
  setAppPreferences,
  setWindowTheme,
  updateTorrentFileSelection as updateDesktopTorrentFileSelection,
  startInspectedTorrent as startDesktopInspectedTorrent,
  type AppPreferences,
  type TorrentActionState,
  type TorrentControlAction,
  type DownloadDirectory,
  type TorrentFileSelection,
  type TorrentStatus,
  type TorrentPreview,
  type QueueMove,
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

function sameTorrentStatus(left: TorrentStatus, right: TorrentStatus): boolean {
  return left.id === right.id
    && left.infoHash === right.infoHash
    && left.name === right.name
    && left.totalPieces === right.totalPieces
    && left.outputDirectory === right.outputDirectory
    && left.state === right.state
    && left.error === right.error
    && left.progressPercent === right.progressPercent
    && left.downloadedBytes === right.downloadedBytes
    && left.totalBytes === right.totalBytes
    && left.uploadedBytes === right.uploadedBytes
    && left.downloadSpeedBytesPerSecond === right.downloadSpeedBytesPerSecond
    && left.uploadSpeedBytesPerSecond === right.uploadSpeedBytesPerSecond
    && left.connectedPeers === right.connectedPeers
    && left.addedAt === right.addedAt
    && left.completedAt === right.completedAt
    && left.engineAvailable === right.engineAvailable
    && left.fileSelectionEditable === right.fileSelectionEditable
    && left.queuePosition === right.queuePosition
    && left.files.length === right.files.length
    && left.files.every((file, index) => {
      const other = right.files[index];
      return file.index === other.index
        && file.path === other.path
        && file.name === other.name
        && file.sizeBytes === other.sizeBytes
        && file.downloadedBytes === other.downloadedBytes
        && file.progressPercent === other.progressPercent
        && file.included === other.included
        && file.state === other.state;
    });
}

function reuseTorrentSnapshots(previous: TorrentStatus[], next: TorrentStatus[]): TorrentStatus[] {
  const previousById = new Map(previous.map((torrent) => [torrent.id, torrent]));
  let changed = previous.length !== next.length;
  const merged = next.map((torrent, index) => {
    if (previous[index]?.id !== torrent.id) changed = true;
    const old = previousById.get(torrent.id);
    if (old && sameTorrentStatus(old, torrent)) return old;
    changed = true;
    return torrent;
  });
  return changed ? merged : previous;
}

export function useTorrentQueue(enabled: boolean) {
  const [torrents, setTorrents] = useState<TorrentStatus[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [directories, setDirectories] = useState<DownloadDirectory[]>([]);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [inspectingMetadata, setInspectingMetadata] = useState(false);
  const [selectingDirectory, setSelectingDirectory] = useState(false);
  const [selectingFile, setSelectingFile] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences>({
    resumeUnfinishedOnStartup: true,
    startDownloadsAutomatically: true,
    askForDestinationEveryTime: false,
    maximumSimultaneousDownloads: 3,
    downloadLimitBytesPerSecond: null,
    uploadLimitBytesPerSecond: null,
    minimizeToTray: false,
    confirmBeforeRemovingTorrent: true,
    confirmBeforeDeletingFiles: true,
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
      const next = await getTorrents();
      setTorrents((current) => reuseTorrentSnapshots(current, next));
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

  const chooseDirectory = useCallback(async (): Promise<boolean> => {
    if (selectingDirectory) return false;
    setError("");
    setSelectingDirectory(true);
    try {
      const directory = await selectDownloadDirectory();
      if (!directory) return false;
      setDirectories((current) => [
        ...current.filter((item) => item.id !== directory.id),
        directory,
      ]);
      setSelectedDirectoryId(directory.id);
      return true;
    } catch (cause) {
      setError(describeError(cause));
      return false;
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
      await refreshTorrents();
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
  }, [preferences, refreshTorrents]);

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

  const inspect = useCallback(async (
    operation: () => Promise<TorrentPreview>,
  ): Promise<TorrentPreview | null> => {
    if (!selectedDirectoryId) {
      setError("Choose a download folder before inspecting a torrent.");
      return null;
    }
    setInspectingMetadata(true);
    setError("");
    try {
      return await operation();
    } catch (cause) {
      setError(describeError(cause));
      return null;
    } finally {
      setInspectingMetadata(false);
    }
  }, [selectedDirectoryId]);

  const discardPreview = useCallback(async (previewId: string) => {
    try {
      await discardDesktopTorrentPreview(previewId);
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
          setTorrents((current) => reuseTorrentSnapshots(current, [added, ...current.filter((torrent) => torrent.id !== added.id)]));
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
          setTorrents((current) => reuseTorrentSnapshots(current, current.map((torrent) =>
            torrent.id === torrentId ? updated : torrent,
          )));
        }
        if (action === "remove") {
          setTorrents((current) => current.filter((torrent) => torrent.id !== torrentId));
          await refreshTorrents();
        } else if (action === "move-queue") {
          await refreshTorrents();
        }
        const successMessages: Partial<Record<TorrentControlAction, string>> = {
          pause: "Download paused.",
          resume: "Download resumed.",
          retry: "Retry started.",
    remove: "Torrent removed from Torque.",
    "move-queue": "Queue order updated.",
          "update-files": "File selection updated.",
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
    inspectingMetadata,
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
    pauseTorrent: useCallback((torrentId: number) =>
      runTorrentAction(torrentId, "pause", () => pauseDesktopTorrent(torrentId)), [runTorrentAction]),
    resumeTorrent: useCallback((torrentId: number) =>
      runTorrentAction(torrentId, "resume", () => resumeDesktopTorrent(torrentId)), [runTorrentAction]),
    retryTorrent: useCallback((torrentId: number) =>
      runTorrentAction(torrentId, "retry", () => retryDesktopTorrent(torrentId)), [runTorrentAction]),
    removeTorrent: useCallback((torrentId: number, deleteFiles = false) =>
      runTorrentAction(torrentId, "remove", () => removeDesktopTorrent(torrentId, deleteFiles)), [runTorrentAction]),
    openTorrentFolder: useCallback((torrentId: number) =>
      runTorrentAction(torrentId, "open-folder", () => openDesktopTorrentFolder(torrentId)), [runTorrentAction]),
    moveTorrent: useCallback((torrentId: number, movement: QueueMove) =>
      runTorrentAction(torrentId, "move-queue", () => moveDesktopQueuedTorrent(torrentId, movement)), [runTorrentAction]),
    updateTorrentFileSelection: useCallback((torrentId: number, selectedFileIndices: number[]) =>
      runTorrentAction(torrentId, "update-files", () =>
        updateDesktopTorrentFileSelection(torrentId, selectedFileIndices),
      ), [runTorrentAction]),
    inspectMagnet: (link: string) =>
      inspect(() => inspectDesktopMagnet(link, selectedDirectoryId)),
    inspectTorrentUrl: (url: string) =>
      inspect(() => inspectDesktopTorrentUrl(url, selectedDirectoryId)),
    inspectTorrentFile: (torrentFileId: string) =>
      inspect(() => inspectDesktopTorrentFile(torrentFileId, selectedDirectoryId)),
    discardTorrentPreview: discardPreview,
    startInspectedTorrent: (
      previewId: string,
      fileIndices: number[],
      allowInsufficientSpace = false,
    ) => add(() => startDesktopInspectedTorrent(
      previewId,
      selectedDirectoryId,
      fileIndices,
      allowInsufficientSpace,
    )),
  };
}
