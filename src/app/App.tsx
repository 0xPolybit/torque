import { useMemo, useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { BackendStatus } from "../components/BackendStatus";
import { AddTorrentDialog } from "../features/transfers/AddTorrentDialog";
import { EmptyFilter } from "../features/transfers/EmptyFilter";
import { EmptyQueue } from "../features/transfers/EmptyQueue";
import { SettingsDialog } from "../features/transfers/SettingsDialog";
import { TorrentFilters } from "../features/transfers/TorrentFilters";
import { TorrentList } from "../features/transfers/TorrentList";
import { filterTorrents, type TorrentFilter } from "../features/transfers/torrentPresentation";
import { useDesktopConnection } from "./useDesktopConnection";
import { useTorrentQueue } from "./useTorrentQueue";

export default function App() {
  const { connection, retry } = useDesktopConnection();
  const isConnected = connection.state === "connected";
  const queue = useTorrentQueue(isConnected);
  const [showAddTorrent, setShowAddTorrent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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

  return (
    <div className="app-shell">
      <Sidebar connection={connection} torrentCount={queue.torrents.length} />

      <main className="workspace">
        <header className="workspace__header">
          <div>
            <h1>Downloads</h1>
            <p>
              {queue.torrents.length === 0
                ? "Your local transfer library"
                : `${activeCount} active · ${completedCount} completed`}
            </p>
          </div>
          <div className="workspace__actions">
            <BackendStatus connection={connection} onRetry={retry} />
            <button
              className="primary-button workspace__add"
              type="button"
              onClick={() => setShowAddTorrent(true)}
              disabled={!isConnected}
            >
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              <span>Add torrent</span>
            </button>
            <button
              className="icon-button workspace__settings"
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Open settings"
              title="Settings"
            >
              <Settings2 size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </header>

        {queue.error && !showAddTorrent && !showSettings && (
          <div className="queue-error" role="alert">{queue.error}</div>
        )}

        {queue.torrents.length === 0 ? (
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
                />
              )
              : <EmptyFilter filter={filter} />}
          </div>
        )}
      </main>

      {showAddTorrent && (
        <AddTorrentDialog
          selectedDirectory={queue.selectedDirectory}
          error={queue.error}
          busy={queue.busy}
          selectingFile={queue.selectingFile}
          onClose={() => setShowAddTorrent(false)}
          onSelectDirectory={queue.chooseDirectory}
          onChooseTorrentFile={queue.chooseTorrentFile}
          onDiscardTorrentFile={queue.discardTorrentFile}
          onAddMagnet={queue.addMagnet}
          onAddUrl={queue.addTorrentUrl}
          onAddFile={queue.addTorrentFile}
        />
      )}

      {showSettings && (
        <SettingsDialog
          appInfo={connection.state === "connected" ? connection.info : null}
          downloadDirectoryName={queue.selectedDirectory?.name}
          error={queue.error}
          onChooseDirectory={queue.chooseDirectory}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
