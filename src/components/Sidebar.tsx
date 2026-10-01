import { Activity, FolderDown, ListMusic } from "lucide-react";
import type { DesktopConnection } from "../app/useDesktopConnection";

interface SidebarProps {
  connection: DesktopConnection;
  torrentCount: number;
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || path;
}

export function Sidebar({ connection, torrentCount }: SidebarProps) {
  const info = connection.state === "connected" ? connection.info : null;

  return (
    <aside className="sidebar" aria-label="Application navigation">
      <div className="sidebar__brand">
        <Activity size={19} strokeWidth={1.8} aria-hidden="true" />
        <span>Torque</span>
      </div>

      <nav className="sidebar__navigation" aria-label="Library">
        <span className="sidebar__section-label">Library</span>
        <span className="sidebar__nav-item" aria-current="page">
          <ListMusic size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>All torrents</span>
          <span className="sidebar__count" aria-label={`${torrentCount} torrents`}>
            {torrentCount}
          </span>
        </span>
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
