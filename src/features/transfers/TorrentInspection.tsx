import { useMemo, useRef, useState, type CSSProperties, type UIEvent } from "react";
import { Check, ChevronDown, ChevronRight, File, Folder, FolderOpen, ListChecks, ListX, Maximize2, Minimize2 } from "lucide-react";
import type { DownloadDirectory, TorrentPreview } from "../../lib/desktop";
import { formatExactBytes } from "./torrentPresentation";
import {
  buildTorrentPreviewTree,
  type TorrentTreeDirectory,
  type TorrentTreeNode,
} from "./torrentPreviewTree";

const ROW_HEIGHT = 31;
const OVERSCAN = 8;

interface VisibleRow {
  node: TorrentTreeNode;
  level: number;
}

interface TorrentInspectionProps {
  preview: TorrentPreview;
  selectedDirectory?: DownloadDirectory;
  selectingDirectory: boolean;
  busy: boolean;
  error: string;
  onBack: () => void;
  onSelectDirectory: () => Promise<void>;
  onStart: (previewId: string, fileIndices: number[]) => Promise<boolean>;
}

export function TorrentInspection({
  preview,
  selectedDirectory,
  selectingDirectory,
  busy,
  error,
  onBack,
  onSelectDirectory,
  onStart,
}: TorrentInspectionProps) {
  const tree = useMemo(() => buildTorrentPreviewTree(preview.files), [preview.files]);
  const [selected, setSelected] = useState(() =>
    new Set(preview.files.filter((file) => file.selected).map((file) => file.index)),
  );
  const [expanded, setExpanded] = useState(() => new Set(
    tree.roots
      .filter((node): node is TorrentTreeDirectory => node.type === "directory")
      .map((node) => node.id),
  ));
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => flattenVisible(tree.roots, expanded), [tree.roots, expanded]);
  const selectedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const index of selected) {
      for (const directoryId of tree.ancestorsByFile.get(index) ?? []) {
        counts.set(directoryId, (counts.get(directoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [selected, tree.ancestorsByFile]);
  const selectedBytes = useMemo(() => {
    let total = 0n;
    for (const file of preview.files) {
      if (selected.has(file.index)) total += BigInt(file.sizeBytes);
    }
    return total;
  }, [preview.files, selected]);

  const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(310 / ROW_HEIGHT) + OVERSCAN * 2;
  const visibleRows = rows.slice(firstVisible, firstVisible + visibleCount);

  function updateScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop);
  }

  function toggleFile(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleDirectory(directory: TorrentTreeDirectory) {
    const selectedCount = selectedCounts.get(directory.id) ?? 0;
    const shouldSelect = selectedCount !== directory.totalFiles;
    setSelected((current) => {
      const next = new Set(current);
      for (const index of directory.fileIndices) {
        if (shouldSelect) next.add(index);
        else next.delete(index);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(preview.files.map((file) => file.index)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  function expandAll() {
    setExpanded(new Set(tree.directories.map((directory) => directory.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  const hasDirectories = tree.directories.length > 0;
  const allSelected = selected.size === preview.files.length && preview.files.length > 0;

  return (
    <section className="torrent-inspection" aria-labelledby="torrent-inspection-title">
      <div className="torrent-inspection__heading">
        <div className="torrent-inspection__title">
          <h3 id="torrent-inspection-title" title={preview.name}>{preview.name}</h3>
          <span className="torrent-inspection__hash" title={preview.infoHash}>{preview.infoHash}</span>
        </div>
        <div className="torrent-inspection__badges" aria-label="Torrent details">
          <span>{formatExactBytes(preview.totalSize)} total</span>
          <span>{preview.files.length.toLocaleString()} {preview.files.length === 1 ? "file" : "files"}</span>
          {preview.pieceCount > 0 && <span>{preview.pieceCount.toLocaleString()} pieces</span>}
          {preview.trackers.length > 0 && (
            <span title={preview.trackers.join("\n")}>{preview.trackers.length} {preview.trackers.length === 1 ? "tracker" : "trackers"}</span>
          )}
          {preview.isPrivate && <span>Private</span>}
        </div>
      </div>

      <div className="torrent-inspection__file-toolbar">
        <div className="torrent-inspection__selection-actions">
          <button type="button" onClick={selectAll} disabled={busy || allSelected}>
            <ListChecks size={14} aria-hidden="true" /> Select all
          </button>
          <button type="button" onClick={selectNone} disabled={busy || selected.size === 0}>
            <ListX size={14} aria-hidden="true" /> Select none
          </button>
        </div>
        {hasDirectories && (
          <div className="torrent-inspection__tree-actions">
            <button type="button" onClick={expandAll} disabled={busy || expanded.size === tree.directories.length} aria-label="Expand all folders" title="Expand all">
              <Maximize2 size={13} aria-hidden="true" />
            </button>
            <button type="button" onClick={collapseAll} disabled={busy || expanded.size === 0} aria-label="Collapse all folders" title="Collapse all">
              <Minimize2 size={13} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {preview.files.length === 0 ? (
        <div className="torrent-inspection__empty" role="status">This torrent contains no downloadable files.</div>
      ) : (
        <div
          className="torrent-inspection__tree"
          ref={viewportRef}
          role="tree"
          aria-label="Torrent files"
          aria-multiselectable="true"
          onScroll={updateScroll}
        >
          <div className="torrent-inspection__tree-spacer" style={{ height: rows.length * ROW_HEIGHT }}>
            {visibleRows.map(({ node, level }, index) => {
              const rowIndex = firstVisible + index;
              const rowStyle: CSSProperties = {
                top: rowIndex * ROW_HEIGHT,
                height: ROW_HEIGHT,
                paddingLeft: 11 + (level - 1) * 18,
              };
              if (node.type === "directory") {
                const count = selectedCounts.get(node.id) ?? 0;
                const checked = count === node.totalFiles && node.totalFiles > 0;
                const indeterminate = count > 0 && !checked;
                const isExpanded = expanded.has(node.id);
                return (
                  <div
                    className="torrent-inspection__row torrent-inspection__row--directory"
                    key={node.id}
                    role="treeitem"
                    aria-level={level}
                    aria-expanded={isExpanded}
                    style={rowStyle}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      ref={(element) => { if (element) element.indeterminate = indeterminate; }}
                      onChange={() => toggleDirectory(node)}
                      disabled={busy}
                      aria-label={`Select folder ${node.name}`}
                    />
                    <button
                      className="torrent-inspection__expand"
                      type="button"
                      onClick={() => setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(node.id)) next.delete(node.id);
                        else next.add(node.id);
                        return next;
                      })}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded
                        ? <ChevronDown size={13} aria-hidden="true" />
                        : <ChevronRight size={13} aria-hidden="true" />}
                    </button>
                    {isExpanded
                      ? <FolderOpen size={15} className="torrent-inspection__folder-icon" aria-hidden="true" />
                      : <Folder size={15} className="torrent-inspection__folder-icon" aria-hidden="true" />}
                    <span className="torrent-inspection__name" title={node.name}>{node.name}</span>
                    <span className="torrent-inspection__file-count">{node.totalFiles.toLocaleString()} files</span>
                    <span className="torrent-inspection__size">{formatExactBytes(node.totalSize)}</span>
                  </div>
                );
              }

              const checked = selected.has(node.file.index);
              return (
                <div
                  className="torrent-inspection__row"
                  key={node.id}
                  role="treeitem"
                  aria-level={level}
                  aria-selected={checked}
                  style={rowStyle}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFile(node.file.index)}
                    disabled={busy}
                    aria-label={`Select ${node.file.path}`}
                  />
                  <span className="torrent-inspection__leaf-spacer" aria-hidden="true" />
                  <File size={14} className="torrent-inspection__file-icon" aria-hidden="true" />
                  <span className="torrent-inspection__name" title={node.file.path}>{node.name}</span>
                  <span className="torrent-inspection__size">{formatExactBytes(node.file.sizeBytes)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="torrent-inspection__selected" aria-live="polite">
        <span><Check size={14} aria-hidden="true" /> {selected.size.toLocaleString()} of {preview.files.length.toLocaleString()} selected</span>
        <strong>{formatExactBytes(selectedBytes)} selected</strong>
      </div>

      <div className="add-dialog__destination">
        <div className="add-dialog__destination-icon" aria-hidden="true"><Folder size={15} /></div>
        <div className="add-dialog__destination-content">
          <label>Download location</label>
          <span className="add-dialog__destination-path" title={selectedDirectory?.displayPath}>
            {selectedDirectory?.displayPath ?? "Choose a destination folder"}
          </span>
        </div>
        <button className="text-button" type="button" disabled={busy || selectingDirectory} onClick={() => void onSelectDirectory()}>
          {selectingDirectory ? "Choosing…" : "Change folder"}
        </button>
      </div>

      {error && <p className="add-dialog__error" role="alert">{error}</p>}

      <div className="torrent-inspection__actions">
        <button className="secondary-button" type="button" onClick={onBack} disabled={busy}>Back</button>
        <button
          className="primary-button"
          type="button"
          disabled={busy || selected.size === 0 || !selectedDirectory?.id}
          onClick={() => void onStart(preview.previewId, [...selected])}
        >
          {busy ? "Starting download…" : "Start Download"}
        </button>
      </div>
    </section>
  );
}

function flattenVisible(nodes: TorrentTreeNode[], expanded: Set<string>): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const stack: VisibleRow[] = nodes.slice().reverse().map((node) => ({ node, level: 1 }));
  while (stack.length > 0) {
    const row = stack.pop()!;
    rows.push(row);
    if (row.node.type === "directory" && expanded.has(row.node.id)) {
      for (let index = row.node.children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: row.node.children[index], level: row.level + 1 });
      }
    }
  }
  return rows;
}
