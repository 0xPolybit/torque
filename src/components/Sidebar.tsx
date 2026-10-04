import { Activity, Archive, Compass, FolderDown, ListMusic, Settings2 } from "lucide-react";
import type { DesktopConnection } from "../app/useDesktopConnection";

export type AppView = "downloads" | "browse" | "history" | "settings";

interface SidebarProps {
  connection: DesktopConnection;
  torrentCount: number;
  completedCount: number;
  settingsEnabled: boolean;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || path;
}

export function Sidebar({ connection, torrentCount, completedCount, settingsEnabled, currentView, onNavigate }: SidebarProps) {
  const info = connection.state === "connected" ? connection.info : null;

  return (
    <aside className="sidebar" aria-label="Application navigation">
      <div className="sidebar__brand">
        <Activity size={19} strokeWidth={1.8} aria-hidden="true" />
        <span>Torque</span>
      </div>

      <nav className="sidebar__navigation" aria-label="Library">
        <span className="sidebar__section-label">Library</span>
        <button
          className={`sidebar__nav-item${currentView === "downloads" ? " is-current" : ""}`}
          type="button"
          aria-label={`Downloads, ${torrentCount} torrents`}
          aria-current={currentView === "downloads" ? "page" : undefined}
          title="Downloads"
          onClick={() => onNavigate("downloads")}
        >
          <ListMusic size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>Downloads</span>
          <span className="sidebar__count" aria-label={`${torrentCount} torrents`}>
            {torrentCount}
          </span>
        </button>
        <button
          className={`sidebar__nav-item${currentView === "browse" ? " is-current" : ""}`}
          type="button"
          aria-current={currentView === "browse" ? "page" : undefined}
          title="Browse"
          onClick={() => onNavigate("browse")}
        >
          <Compass size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>Browse</span>
        </button>
        <button
          className={`sidebar__nav-item${currentView === "history" ? " is-current" : ""}`}
          type="button"
          aria-label={`History, ${completedCount} completed downloads`}
          aria-current={currentView === "history" ? "page" : undefined}
          title="History"
          onClick={() => onNavigate("history")}
        >
          <Archive size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>History</span>
          <span className="sidebar__count" aria-label={`${completedCount} completed downloads`}>
            {completedCount}
          </span>
        </button>
      </nav>

      <nav className="sidebar__navigation sidebar__navigation--preferences" aria-label="Preferences">
        <span className="sidebar__section-label">Preferences</span>
        <button
          className={`sidebar__nav-item${currentView === "settings" ? " is-current" : ""}`}
          type="button"
          aria-current={currentView === "settings" ? "page" : undefined}
          disabled={!settingsEnabled}
          title="Settings"
          onClick={() => onNavigate("settings")}
        >
          <Settings2 size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>Settings</span>
        </button>
      </nav>

      <div className="sidebar__bottom">
        <div className="sidebar__location">
          <span className="sidebar__section-label">Download folder</span>
          {info?.defaultDownloadDirectory ? (
            <div
              className="sidebar__folder"
              title={info.defaultDownloadDirectory}
              aria-label={`System download folder: ${info.defaultDownloadDirectory}`}
            >
              <FolderDown size={15} strokeWidth={1.8} aria-hidden="true" />
              <span>{folderName(info.defaultDownloadDirectory)}</span>
            </div>
          ) : (
            <div className="sidebar__folder sidebar__folder--muted">
              <FolderDown size={15} strokeWidth={1.8} aria-hidden="true" />
              <span>System default</span>
            </div>
          )}
        </div>

        <div className="sidebar__build">
          <span className="sidebar__build-mark" aria-hidden="true" />
          <span>
            {info ? `${info.version} · ${info.platform}` : "Desktop shell"}
          </span>
        </div>
      </div>
    </aside>
  );
}
