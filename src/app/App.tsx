import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { Sidebar, type AppView } from "../components/Sidebar";
import { BackendStatus } from "../components/BackendStatus";
import { ToastRegion } from "../components/ToastRegion";
import { DiscoveryView } from "../features/discovery/DiscoveryView";
import { AddTorrentDialog } from "../features/transfers/AddTorrentDialog";
import { EmptyFilter } from "../features/transfers/EmptyFilter";
import { EmptyQueue } from "../features/transfers/EmptyQueue";
import { SettingsDialog } from "../features/transfers/SettingsDialog";
import { TorrentFilters } from "../features/transfers/TorrentFilters";
import { TorrentList } from "../features/transfers/TorrentList";
import { filterTorrents, type TorrentFilter } from "../features/transfers/torrentPresentation";
import type { TorrentDownloadSource } from "../lib/discovery";
import { useDesktopConnection } from "./useDesktopConnection";
import { useTorrentQueue } from "./useTorrentQueue";

export default function App() {
  const { connection, retry } = useDesktopConnection();
  const isConnected = connection.state === "connected";
  const queue = useTorrentQueue(isConnected);
  const [showAddTorrent, setShowAddTorrent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>("downloads");
  const viewBeforeSettings = useRef<AppView>("downloads");
  const [discoverySource, setDiscoverySource] = useState<TorrentDownloadSource | null>(null);
  const [filter, setFilter] = useState<TorrentFilter>("all");
  const visibleTorrents = useMemo(
    () => filterTorrents(queue.torrents, filter),
    [queue.torrents, filter],
  );
  const activeCount = queue.torrents.filter((torrent) =>
    torrent.state === "queued" || torrent.state === "downloading",
  ).length;
  const completedCount = queue.torrents.filter((torrent) =>
    torrent.state === "completed" || torrent.progressPercent >= 100,
  ).length;
  const historyTorrents = useMemo(
    () => filterTorrents(queue.torrents, "completed"),
    [queue.torrents],
  );

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
              onClick={() => {
                setDiscoverySource(null);
                setShowAddTorrent(true);
              }}
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
                onRemove={queue.removeTorrent}
                onOpenFolder={queue.openTorrentFolder}
                onUpdateFileSelection={queue.updateTorrentFileSelection}
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
            onAdd={() => setShowAddTorrent(true)}
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
                  onRemove={queue.removeTorrent}
                  onOpenFolder={queue.openTorrentFolder}
                  onUpdateFileSelection={queue.updateTorrentFileSelection}
                />
              )
              : <EmptyFilter filter={filter} />}
          </div>
        )}
      </main>

      {showAddTorrent && (
        <AddTorrentDialog
          initialSource={discoverySource}
          selectedDirectory={queue.selectedDirectory}
          error={queue.error}
          busy={queue.busy}
          inspectingMetadata={queue.inspectingMetadata}
          selectingDirectory={queue.selectingDirectory}
          selectingFile={queue.selectingFile}
          onClose={() => {
            setShowAddTorrent(false);
            setDiscoverySource(null);
          }}
          onSelectDirectory={queue.chooseDirectory}
          onChooseTorrentFile={queue.chooseTorrentFile}
          onDiscardTorrentFile={queue.discardTorrentFile}
          onInspectMagnet={queue.inspectMagnet}
          onInspectUrl={queue.inspectTorrentUrl}
          onInspectFile={queue.inspectTorrentFile}
          onDiscardPreview={queue.discardTorrentPreview}
          onStartPreview={queue.startInspectedTorrent}
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

      <ToastRegion toast={queue.toast} onDismiss={queue.dismissToast} />
    </div>
  );
}
