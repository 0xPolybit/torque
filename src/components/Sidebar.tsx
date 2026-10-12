import { useMemo } from "react";
import {
  Activity,
  Archive,
  Check,
  CircleDashed,
  Compass,
  Download,
  FolderDown,
  ListMusic,
  Pause,
  Plus,
  Settings2,
  Tag,
  CircleAlert,
  Upload,
  ListEnd,
} from "lucide-react";
import type { DesktopConnection } from "../app/useDesktopConnection";
import type { TorrentCategory, TorrentStatus, TorrentTag } from "../lib/desktop";
import { countTorrents, filterTorrents, type TorrentFilter } from "../features/transfers/torrentPresentation";

export type AppView = "downloads" | "browse" | "history" | "settings";

interface SidebarProps {
  connection: DesktopConnection;
  torrentCount: number;
  completedCount: number;
  settingsEnabled: boolean;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  torrents: TorrentStatus[];
  filter: TorrentFilter;
  categoryId: string | null;
  tagId: string | null;
  categories: TorrentCategory[];
  tags: TorrentTag[];
  onFilterChange: (filter: TorrentFilter) => void;
  onCategoryChange: (categoryId: string | null) => void;
  onTagChange: (tagId: string | null) => void;
  onManageLibrary: () => void;
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || path;
}

export function Sidebar({
  connection,
  torrentCount,
  completedCount,
  settingsEnabled,
  currentView,
  onNavigate,
  torrents,
  filter,
  categoryId,
  tagId,
  categories,
  tags,
  onFilterChange,
  onCategoryChange,
  onTagChange,
  onManageLibrary,
}: SidebarProps) {
  const info = connection.state === "connected" ? connection.info : null;
  const sortedCategories = useMemo(
    () => [...categories].sort((left, right) => left.name.localeCompare(right.name)),
    [categories],
  );
  const sortedTags = useMemo(
    () => [...tags].sort((left, right) => left.name.localeCompare(right.name)),
    [tags],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const torrent of filterTorrents(torrents, { state: filter, tagId })) {
      if (torrent.category) counts.set(torrent.category.id, (counts.get(torrent.category.id) ?? 0) + 1);
    }
    return counts;
  }, [filter, tagId, torrents]);
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const torrent of filterTorrents(torrents, { state: filter, categoryId })) {
      for (const tag of torrent.tags) counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
    }
    return counts;
  }, [filter, categoryId, torrents]);
  const statusFilters: { id: TorrentFilter; label: string; icon: typeof ListMusic }[] = [
    { id: "all", label: "All torrents", icon: ListMusic },
    { id: "downloading", label: "Downloading", icon: Download },
    { id: "seeding", label: "Seeding", icon: Upload },
    { id: "completed", label: "Completed", icon: Check },
    { id: "paused", label: "Paused", icon: Pause },
    { id: "queued", label: "Queued", icon: ListEnd },
    { id: "checking", label: "Checking", icon: CircleDashed },
    { id: "error", label: "Errors", icon: CircleAlert },
  ];

  const selectStatus = (next: TorrentFilter) => {
    onNavigate("downloads");
    onFilterChange(next);
  };

  const selectCategory = (next: string | null) => {
    onNavigate("downloads");
    onCategoryChange(next);
  };

  const selectTag = (next: string | null) => {
    onNavigate("downloads");
    onTagChange(next);
  };

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

      <div className="sidebar__library-filters" aria-label="Torrent filters">
        <div className="sidebar__filter-section">
          <span className="sidebar__section-label">Downloads</span>
          {statusFilters.map(({ id, label, icon: Icon }) => (
            <button
              className={`sidebar__nav-item sidebar__filter-item${filter === id ? " is-current" : ""}`}
              type="button"
              key={id}
              aria-pressed={filter === id}
              onClick={() => selectStatus(id)}
            >
              <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
              <span className="sidebar__count">{countTorrents(torrents, id)}</span>
            </button>
          ))}
        </div>

        <div className="sidebar__filter-section">
          <div className="sidebar__filter-heading">
            <span className="sidebar__section-label">Categories</span>
            <button className="sidebar__manage" type="button" aria-label="Manage categories and tags" title="Manage categories and tags" disabled={!settingsEnabled} onClick={onManageLibrary}>
              <Plus size={14} aria-hidden="true" />
            </button>
          </div>
          {categories.length === 0 ? (
            <span className="sidebar__empty-taxonomy">No categories</span>
          ) : sortedCategories.map((category) => (
            <button
              className={`sidebar__nav-item sidebar__filter-item${categoryId === category.id ? " is-current" : ""}`}
              type="button"
              key={category.id}
              title={category.name}
              aria-pressed={categoryId === category.id}
              onClick={() => selectCategory(categoryId === category.id ? null : category.id)}
            >
              <span className="sidebar__category-mark" aria-hidden="true" />
              <span>{category.name}</span>
              <span className="sidebar__count">
                {categoryCounts.get(category.id) ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="sidebar__filter-section">
          <div className="sidebar__filter-heading">
            <span className="sidebar__section-label">Tags</span>
            {tags.length === 0 && <Tag size={13} className="sidebar__tag-section-icon" aria-hidden="true" />}
          </div>
          {tags.length === 0 ? (
            <span className="sidebar__empty-taxonomy">No tags</span>
          ) : sortedTags.map((tag: TorrentTag) => (
            <button
              className={`sidebar__nav-item sidebar__filter-item${tagId === tag.id ? " is-current" : ""}`}
              type="button"
              key={tag.id}
              title={tag.name}
              aria-pressed={tagId === tag.id}
              onClick={() => selectTag(tagId === tag.id ? null : tag.id)}
            >
              <Tag size={14} strokeWidth={1.7} aria-hidden="true" />
              <span>{tag.name}</span>
              <span className="sidebar__count">
                {tagCounts.get(tag.id) ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

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
