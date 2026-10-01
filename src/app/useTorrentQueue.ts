import { useCallback, useEffect, useState } from "react";
import {
  addMagnet,
  addTorrentFile,
  addTorrentUrl,
  describeError,
  getDownloadDirectories,
  getTorrents,
  selectDownloadDirectory,
  type DownloadDirectory,
  type TorrentStatus,
} from "../lib/desktop";

export function useTorrentQueue(enabled: boolean) {
  const [torrents, setTorrents] = useState<TorrentStatus[]>([]);
  const [directories, setDirectories] = useState<DownloadDirectory[]>([]);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
        setSelectedDirectoryId((selected) => selected || defaultId);
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

  return {
    torrents,
    directories,
    selectedDirectoryId,
    setSelectedDirectoryId,
    selectedDirectory: directories.find((item) => item.id === selectedDirectoryId),
    error,
    setError,
    busy,
    refreshTorrents,
    chooseDirectory,
    addMagnet: (link: string) =>
      add(() => addMagnet(link, selectedDirectoryId)),
    addTorrentUrl: (url: string) =>
      add(() => addTorrentUrl(url, selectedDirectoryId)),
    addTorrentFile: () =>
      add(() => addTorrentFile(selectedDirectoryId)),
  };
}
