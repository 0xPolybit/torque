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
  setResumeUnfinishedOnStartup,
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
  const [directories, setDirectories] = useState<DownloadDirectory[]>([]);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectingFile, setSelectingFile] = useState(false);
  const [resumeOnStartup, setResumeOnStartup] = useState(true);
  const [savingPreference, setSavingPreference] = useState(false);
  const [torrentActions, setTorrentActions] = useState<Record<number, TorrentActionState>>({});

  useEffect(() => {
    if (selectedDirectoryId) rememberDirectoryId(selectedDirectoryId);
  }, [selectedDirectoryId]);

  const refreshTorrents = useCallback(async () => {
    try {
      setTorrents(await getTorrents());
      setError("");
    } catch (cause) {
      setError(describeError(cause));
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
        if (active) setResumeOnStartup(preferences.resumeUnfinishedOnStartup);
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause));
      });

    void refreshTorrents();
    const interval = window.setInterval(() => void refreshTorrents(), 2000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [enabled, refreshTorrents]);

  const chooseDirectory = useCallback(async () => {
    setError("");
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
    }
  }, []);

  const updateResumeOnStartup = useCallback(async (enabled: boolean) => {
    setSavingPreference(true);
    setError("");
    try {
      const preferences = await setResumeUnfinishedOnStartup(enabled);
      setResumeOnStartup(preferences.resumeUnfinishedOnStartup);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSavingPreference(false);
    }
  }, []);

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
    directories,
    selectedDirectoryId,
    selectedDirectory: directories.find((item) => item.id === selectedDirectoryId),
    error,
    setError,
    busy,
    selectingFile,
    resumeOnStartup,
    savingPreference,
    updateResumeOnStartup,
    torrentActions,
    refreshTorrents,
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
