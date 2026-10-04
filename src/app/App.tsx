import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Plus, Settings2, Users, Upload, Download } from "lucide-react";
import { Sidebar, type AppView } from "../components/Sidebar";
import { BackendStatus } from "../components/BackendStatus";
import { ToastRegion } from "../components/ToastRegion";
import { DiscoveryView } from "../features/discovery/DiscoveryView";
import { AddTorrentDialog } from "../features/transfers/AddTorrentDialog";
import { EmptyFilter } from "../features/transfers/EmptyFilter";
import { EmptyQueue } from "../features/transfers/EmptyQueue";
import { SettingsDialog } from "../features/transfers/SettingsDialog";
import { RemoveTorrentDialog } from "../features/transfers/RemoveTorrentDialog";
import { TorrentFilters } from "../features/transfers/TorrentFilters";
import { TorrentDetailsDialog } from "../features/transfers/TorrentDetailsDialog";
import { TorrentList } from "../features/transfers/TorrentList";
import { filterTorrents, formatSpeed, type TorrentFilter } from "../features/transfers/torrentPresentation";
import type { TorrentDownloadSource } from "../lib/discovery";
import { useDesktopConnection } from "./useDesktopConnection";
import { useTorrentQueue } from "./useTorrentQueue";

export default function App() {
  const { connection, retry } = useDesktopConnection();
  const isConnected = connection.state === "connected";
  const queue = useTorrentQueue(isConnected);
  const { pauseTorrent, resumeTorrent, setError } = queue;
  const [showAddTorrent, setShowAddTorrent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [detailsTorrentId, setDetailsTorrentId] = useState<number | null>(null);
  const [selectedTorrentId, setSelectedTorrentId] = useState<number | null>(null);
  const [removal, setRemoval] = useState<{ torrentId: number; deleteFiles: boolean } | null>(null);
  const [fileChooserRequest, setFileChooserRequest] = useState(0);
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const [currentView, setCurrentView] = useState<AppView>("downloads");
  const viewBeforeSettings = useRef<AppView>("downloads");
  const [discoverySource, setDiscoverySource] = useState<TorrentDownloadSource | null>(null);
  const [filter, setFilter] = useState<TorrentFilter>("all");
  const visibleTorrents = useMemo(
    () => filterTorrents(queue.torrents, filter),
    [queue.torrents, filter],
  );
  const activeCount = queue.torrents.filter((torrent) => torrent.state === "downloading").length;
  const queuedCount = queue.torrents.filter((torrent) => torrent.state === "queued").length;
  const completedCount = queue.torrents.filter((torrent) =>
    torrent.state === "completed" || torrent.progressPercent >= 100,
  ).length;
  const historyTorrents = useMemo(
    () => filterTorrents(queue.torrents, "completed"),
    [queue.torrents],
  );
  const detailsTorrent = detailsTorrentId === null
    ? null
    : queue.torrents.find((torrent) => torrent.id === detailsTorrentId) ?? null;
  const selectedTorrent = selectedTorrentId === null
    ? null
    : queue.torrents.find((torrent) => torrent.id === selectedTorrentId) ?? null;
  const selectedTorrentRef = useRef(selectedTorrent);
  useEffect(() => { selectedTorrentRef.current = selectedTorrent; }, [selectedTorrent]);
  const transferSummary = useMemo(() => ({
    downloadSpeed: queue.torrents.reduce((total, torrent) => total + torrent.downloadSpeedBytesPerSecond, 0),
    uploadSpeed: queue.torrents.reduce((total, torrent) => total + (torrent.uploadSpeedBytesPerSecond ?? 0), 0),
    peers: queue.torrents.reduce((total, torrent) => total + (torrent.connectedPeers ?? 0), 0),
  }), [queue.torrents]);
  const shortcutModifier = connection.state === "connected" && connection.info.platform === "macos" ? "⌘" : "Ctrl";

  const openAddDialog = useCallback(() => {
    setDiscoverySource(null);
    setShowAddTorrent(true);
  }, []);

  const openTorrentDetails = useCallback((torrentId: number) => {
    setSelectedTorrentId(torrentId);
    setDetailsTorrentId(torrentId);
  }, []);

  const requestRemoval = useCallback((torrentId: number, deleteFiles = false): Promise<boolean> => {
    const needsConfirmation = deleteFiles
      ? queue.preferences.confirmBeforeDeletingFiles
      : queue.preferences.confirmBeforeRemovingTorrent;
    if (needsConfirmation) {
      setRemoval({ torrentId, deleteFiles });
      return Promise.resolve(true);
    }
    return queue.removeTorrent(torrentId, deleteFiles);
  }, [queue.preferences.confirmBeforeDeletingFiles, queue.preferences.confirmBeforeRemovingTorrent, queue.removeTorrent]);

  useEffect(() => {
    if (detailsTorrentId !== null && !detailsTorrent) setDetailsTorrentId(null);
  }, [detailsTorrentId, detailsTorrent]);

  function openSettings() {
    if (currentView !== "settings") viewBeforeSettings.current = currentView;
    setCurrentView("settings");
    setShowSettings(true);
  }

  function navigate(view: AppView) {
    if (view === "settings") {
      openSettings();
      return;
    }
    setCurrentView(view);
  }

  useEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      document.documentElement.dataset.colorScheme = queue.preferences.theme === "system"
        ? (systemTheme.matches ? "light" : "dark")
        : queue.preferences.theme;
    };
    apply();
    if (queue.preferences.theme !== "system") return;
    systemTheme.addEventListener("change", apply);
    return () => systemTheme.removeEventListener("change", apply);
  }, [queue.preferences.theme]);

  useEffect(() => {
    function isEditable(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
        || target.getAttribute("role") === "textbox";
    }

    async function onKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      const editable = isEditable(event.target);
      const onControl = event.target instanceof HTMLElement
        && Boolean(event.target.closest("button, a, [role='menuitem'], [role='menu']"));
      const key = event.key.toLowerCase();

      if (modifier && key === "o") {
        event.preventDefault();
        setCurrentView("downloads");
        setShowSettings(false);
        setDiscoverySource(null);
        setShowAddTorrent(true);
        setFileChooserRequest((request) => request + 1);
        return;
      }
      if (modifier && key === "f" && !editable) {
        event.preventDefault();
        setShowAddTorrent(false);
        setShowSettings(false);
        setCurrentView("browse");
        setSearchFocusRequest((request) => request + 1);
        return;
      }
      if (modifier && key === "v" && !editable) {
        event.preventDefault();
        try {
          const text = await navigator.clipboard.readText();
          if (/^\s*magnet:\?/i.test(text)) {
            setCurrentView("downloads");
            setShowSettings(false);
            setDiscoverySource({ kind: "magnet", value: text.trim() });
            setShowAddTorrent(true);
          }
        } catch {
          setError("Clipboard access is unavailable. Paste the magnet link into Add Torrent instead.");
        }
        return;
      }

      const selected = selectedTorrentRef.current;
      if (modifier || editable || onControl || showAddTorrent || showSettings || detailsTorrentId !== null) return;
      if (event.key === " " && selected) {
        if (selected.state === "downloading") {
          event.preventDefault();
          void pauseTorrent(selected.id);
        } else if (selected.state === "paused") {
          event.preventDefault();
          void resumeTorrent(selected.id);
        }
      } else if (event.key === "Delete" && selected) {
        event.preventDefault();
        void requestRemoval(selected.id, false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailsTorrentId, pauseTorrent, requestRemoval, resumeTorrent, setError, showAddTorrent, showSettings]);

  return (
    <div className="app-shell" aria-busy={queue.initialLoading}>
      <Sidebar
        connection={connection}
        torrentCount={queue.torrents.length}
        completedCount={completedCount}
        settingsEnabled={isConnected && queue.preferencesLoaded}
        currentView={currentView}
        onNavigate={navigate}
      />

      <main className="workspace">
        <header className="workspace__header">
          <div>
            <h1>{currentView === "browse" ? "Browse" : currentView === "history" ? "History" : currentView === "settings" ? "Settings" : "Downloads"}</h1>
            <p>{currentView === "browse"
              ? "Find open-licensed content to inspect"
              : currentView === "history"
                ? `${completedCount} completed ${completedCount === 1 ? "download" : "downloads"}`
                : currentView === "settings"
                  ? "Application preferences"
                  : queue.torrents.length === 0
                ? "Your local transfer library"
                : `${activeCount} active · ${completedCount} completed`}</p>
          </div>
          <div className="workspace__actions">
            <BackendStatus connection={connection} onRetry={retry} />
            <button
              className="primary-button workspace__add"
              type="button"
              onClick={openAddDialog}
              disabled={!isConnected}
            >
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              <span>Add torrent</span>
            </button>
            <button
              className="icon-button workspace__settings"
              type="button"
              onClick={openSettings}
              aria-label="Open settings"
              title="Settings"
              disabled={!isConnected || !queue.preferencesLoaded}
            >
              <Settings2 size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </header>

        {queue.error && !showAddTorrent && !showSettings && (
          <div className="queue-error" role="alert">{queue.error}</div>
        )}

        {currentView === "browse" ? (
          <DiscoveryView
            enabled={isConnected}
            focusRequest={searchFocusRequest}
            onReviewSource={(source) => {
              setDiscoverySource(source);
              setCurrentView("downloads");
              setShowAddTorrent(true);
            }}
          />
        ) : currentView === "history" ? (
          queue.initialLoading && isConnected && historyTorrents.length === 0 ? (
            <section className="queue-panel queue-loading" role="status" aria-live="polite">
              <span className="queue-loading__spinner" aria-hidden="true" />
              <span>Loading download history…</span>
            </section>
          ) : historyTorrents.length > 0 ? (
            <div className="workspace__library workspace__library--history">
              <TorrentList
                torrents={historyTorrents}
                actions={queue.torrentActions}
                onPause={queue.pauseTorrent}
                onResume={queue.resumeTorrent}
                onRetry={queue.retryTorrent}
                onRemove={requestRemoval}
                onOpenFolder={queue.openTorrentFolder}
                onOpenDetails={openTorrentDetails}
                onMove={queue.moveTorrent}
                selectedTorrentId={selectedTorrentId}
                onSelectTorrent={setSelectedTorrentId}
              />
            </div>
          ) : (
            <EmptyFilter filter="completed" />
          )
        ) : currentView === "settings" ? (
          <section className="queue-panel queue-loading" aria-hidden="true" />
        ) : queue.initialLoading && isConnected && queue.torrents.length === 0 ? (
          <section className="queue-panel queue-loading" role="status" aria-live="polite">
            <span className="queue-loading__spinner" aria-hidden="true" />
            <span>Loading your downloads…</span>
          </section>
        ) : queue.torrents.length === 0 ? (
          <EmptyQueue
            onAdd={openAddDialog}
            disabled={!isConnected || !queue.selectedDirectoryId}
          />
        ) : (
          <div className="workspace__library">
            <div className="workspace__queue-toolbar">
              <TorrentFilters torrents={queue.torrents} value={filter} onChange={setFilter} />
              <span className="workspace__visible-count">
                {visibleTorrents.length} {visibleTorrents.length === 1 ? "download" : "downloads"}
              </span>
            </div>
            {visibleTorrents.length > 0
              ? (
                <TorrentList
                  torrents={visibleTorrents}
                  actions={queue.torrentActions}
                  onPause={queue.pauseTorrent}
                  onResume={queue.resumeTorrent}
                  onRetry={queue.retryTorrent}
                  onRemove={requestRemoval}
                  onOpenFolder={queue.openTorrentFolder}
                  onOpenDetails={openTorrentDetails}
                  onMove={queue.moveTorrent}
                  selectedTorrentId={selectedTorrentId}
                  onSelectTorrent={setSelectedTorrentId}
                />
              )
              : <EmptyFilter filter={filter} />}
          </div>
        )}

        <footer className="global-status-bar" aria-label="Transfer status">
          <span><Download size={13} aria-hidden="true" /><strong>{formatSpeed(transferSummary.downloadSpeed)}</strong></span>
          <span><Upload size={13} aria-hidden="true" /><strong>{formatSpeed(transferSummary.uploadSpeed)}</strong></span>
          <span><Users size={13} aria-hidden="true" /><span>Peers</span><strong>{transferSummary.peers}</strong></span>
          <span><Activity size={13} aria-hidden="true" /><span>Active</span><strong>{activeCount}</strong></span>
          <span className="global-status-bar__queue"><span>Queued</span><strong>{queuedCount}</strong></span>
          <div className="global-status-bar__shortcuts"><kbd>{shortcutModifier}</kbd><kbd>O</kbd><span>Add file</span><kbd>{shortcutModifier}</kbd><kbd>V</kbd><span>Magnet</span><kbd>{shortcutModifier}</kbd><kbd>F</kbd><span>Search</span></div>
        </footer>
      </main>

      {showAddTorrent && (
        <AddTorrentDialog
          initialSource={discoverySource}
          fileChooserRequest={fileChooserRequest}
          askForDestinationEveryTime={queue.preferences.askForDestinationEveryTime}
          selectedDirectory={queue.selectedDirectory}
          error={queue.error}
          busy={queue.busy}
          inspectingMetadata={queue.inspectingMetadata}
          selectingDirectory={queue.selectingDirectory}
          selectingFile={queue.selectingFile}
          onClose={() => {
            setShowAddTorrent(false);
            setDiscoverySource(null);
            setFileChooserRequest(0);
          }}
          onSelectDirectory={queue.chooseDirectory}
          onChooseTorrentFile={queue.chooseTorrentFile}
          onDiscardTorrentFile={queue.discardTorrentFile}
          onInspectMagnet={queue.inspectMagnet}
          onInspectUrl={queue.inspectTorrentUrl}
          onInspectFile={queue.inspectTorrentFile}
          onDiscardPreview={queue.discardTorrentPreview}
          onStartPreview={queue.startInspectedTorrent}
          onViewExistingTorrent={(torrentId) => {
            setShowAddTorrent(false);
            setDiscoverySource(null);
            setDetailsTorrentId(torrentId);
          }}
        />
      )}

      {detailsTorrent && (
        <TorrentDetailsDialog
          torrent={detailsTorrent}
          action={queue.torrentActions[detailsTorrent.id] ?? { pending: null, error: null }}
          onClose={() => setDetailsTorrentId(null)}
          onUpdateFileSelection={queue.updateTorrentFileSelection}
        />
      )}

      {showSettings && (
        <SettingsDialog
          appInfo={connection.state === "connected" ? connection.info : null}
          downloadDirectoryPath={queue.selectedDirectory?.displayPath}
          error={queue.error}
          preferences={queue.preferences}
          savingPreference={queue.savingPreference}
          selectingDirectory={queue.selectingDirectory}
          onChooseDirectory={queue.chooseDirectory}
          onPreferencesChange={queue.updatePreferences}
          onClose={() => {
            setShowSettings(false);
            setCurrentView(viewBeforeSettings.current);
          }}
        />
      )}

      {removal && (
        <RemoveTorrentDialog
          torrentName={queue.torrents.find((torrent) => torrent.id === removal.torrentId)?.name ?? "This torrent"}
          deleteFiles={removal.deleteFiles}
          busy={queue.torrentActions[removal.torrentId]?.pending === "remove"}
          error={queue.torrentActions[removal.torrentId]?.error}
          onClose={() => setRemoval(null)}
          onConfirm={() => {
            void queue.removeTorrent(removal.torrentId, removal.deleteFiles).then((removed) => {
              if (removed) {
                setRemoval(null);
                setSelectedTorrentId(null);
                if (detailsTorrentId === removal.torrentId) setDetailsTorrentId(null);
              }
            });
          }}
        />
      )}

      <ToastRegion toast={queue.toast} onDismiss={queue.dismissToast} />
    </div>
  );
}
