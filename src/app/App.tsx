import { useState } from "react";
import { Plus } from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { BackendStatus } from "../components/BackendStatus";
import { AddTorrentDialog } from "../features/transfers/AddTorrentDialog";
import { EmptyQueue } from "../features/transfers/EmptyQueue";
import { TorrentList } from "../features/transfers/TorrentList";
import { useDesktopConnection } from "./useDesktopConnection";
import { useTorrentQueue } from "./useTorrentQueue";

export default function App() {
  const { connection, retry } = useDesktopConnection();
  const isConnected = connection.state === "connected";
  const queue = useTorrentQueue(isConnected);
  const [showAddTorrent, setShowAddTorrent] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar connection={connection} torrentCount={queue.torrents.length} />

      <main className="workspace">
        <header className="workspace__header">
          <div>
            <h1>All torrents</h1>
            <p>
              {queue.torrents.length === 0
                ? "Your local transfer queue"
                : `${queue.torrents.length} ${queue.torrents.length === 1 ? "transfer" : "transfers"}`}
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
          </div>
        </header>

        {queue.error && !showAddTorrent && (
          <div className="queue-error" role="alert">{queue.error}</div>
        )}

        {queue.torrents.length === 0 ? (
          <EmptyQueue
            onAdd={() => setShowAddTorrent(true)}
            disabled={!isConnected || !queue.selectedDirectoryId}
          />
        ) : (
          <TorrentList torrents={queue.torrents} />
        )}
      </main>

      {showAddTorrent && (
        <AddTorrentDialog
          directories={queue.directories}
          selectedDirectoryId={queue.selectedDirectoryId}
          selectedDirectoryName={queue.selectedDirectory?.name}
          error={queue.error}
          busy={queue.busy}
          onClose={() => setShowAddTorrent(false)}
          onSelectDirectory={queue.chooseDirectory}
          onSelectedDirectoryChange={queue.setSelectedDirectoryId}
          onAddMagnet={queue.addMagnet}
          onAddUrl={queue.addTorrentUrl}
          onAddFile={queue.addTorrentFile}
        />
      )}
    </div>
  );
}
