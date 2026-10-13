import { useEffect, useMemo, useRef, useState, type CSSProperties, type UIEvent } from "react";
import {
  Check, ChevronDown, ChevronRight, File, Folder, FolderOpen,
  ListChecks, ListX, Maximize2, Minimize2, Search,
} from "lucide-react";
import type {
  TorrentFile, TorrentFilePriority, TorrentFilePriorityUpdate, TorrentStatus,
} from "../../lib/desktop";
import { buildTorrentPreviewTree, type TorrentTreeDirectory, type TorrentTreeNode } from "./torrentPreviewTree";
import { formatExactBytes } from "./torrentPresentation";

const ROW_HEIGHT = 34;
const OVERSCAN = 8;

type FileSort = "name" | "size" | "progress";
type PriorityChoice = TorrentFilePriority | "mixed";

interface TorrentFilesPanelProps {
  torrent: TorrentStatus;
  busy: boolean;
  saving: boolean;
  onSave: (torrentId: number, updates: TorrentFilePriorityUpdate[]) => Promise<boolean>;
}

interface VisibleRow {
  node: TorrentTreeNode;
  level: number;
}

export function TorrentFilesPanel({ torrent, busy, saving, onSave }: TorrentFilesPanelProps) {
  const [priorities, setPriorities] = useState<Map<number, TorrentFilePriority>>(() =>
    new Map(torrent.files.map((file) => [file.index, file.priority])),
  );
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<FileSort>("name");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dirty) {
      setPriorities(new Map(torrent.files.map((file) => [file.index, file.priority])));
    }
  }, [torrent.files, dirty]);

  const selected = useMemo(() => new Set(
    torrent.files
      .filter((file) => (priorities.get(file.index) ?? file.priority) !== "skip")
      .map((file) => file.index),
  ), [torrent.files, priorities]);
  const filteredFiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return torrent.files
      .filter((file) => !query || file.path.toLocaleLowerCase().includes(query))
      .map((file) => ({
        index: file.index,
        path: file.path,
        filename: file.path.split("/").at(-1) ?? file.name,
        sizeBytes: file.sizeBytes,
        extension: null,
        selected: selected.has(file.index),
      }));
  }, [torrent.files, search, selected]);
  const fileByIndex = useMemo(() => new Map(torrent.files.map((file) => [file.index, file])), [torrent.files]);
  const tree = useMemo(() => {
    const next = buildTorrentPreviewTree(filteredFiles);
    sortNodes(next.roots, sortBy, fileByIndex);
    return next;
  }, [filteredFiles, sortBy, fileByIndex]);
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
  const selectionTotals = useMemo(() => {
    let selectedBytes = 0n;
    let totalBytes = 0n;
    let selectedFiles = 0;
    for (const file of torrent.files) {
      const size = BigInt(file.sizeBytes);
      totalBytes += size;
      if (selected.has(file.index)) {
        selectedFiles += 1;
        selectedBytes += size;
      }
    }
    return { selectedBytes, totalBytes, selectedFiles };
  }, [torrent.files, selected]);

  const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(280 / ROW_HEIGHT) + OVERSCAN * 2;
  const visibleRows = rows.slice(firstVisible, firstVisible + visibleCount);
  const canChange = torrent.engineAvailable && torrent.fileSelectionEditable && torrent.files.length > 0;
  const hasFolders = tree.directories.length > 0;
  const visibleSelectedIndices = filteredFiles
    .filter((file) => selected.has(file.index))
    .map((file) => file.index);

  function updatePriorities(update: (current: Map<number, TorrentFilePriority>) => Map<number, TorrentFilePriority>) {
    setPriorities(update);
    setDirty(true);
  }

  function setPriority(index: number, priority: TorrentFilePriority) {
    updatePriorities((current) => {
      const next = new Map(current);
      next.set(index, priority);
      return next;
    });
  }

  function toggleFile(index: number) {
    const currentPriority = priorities.get(index) ?? fileByIndex.get(index)?.priority ?? "normal";
    setPriority(index, currentPriority === "skip" ? "normal" : "skip");
  }

  function toggleFolder(folder: TorrentTreeDirectory) {
    const count = selectedCounts.get(folder.id) ?? 0;
    const shouldSelect = count !== folder.totalFiles;
    updatePriorities((current) => {
      const next = new Map(current);
      for (const index of folder.fileIndices) {
        const existing = next.get(index) ?? fileByIndex.get(index)?.priority ?? "normal";
        next.set(index, shouldSelect ? (existing === "skip" ? "normal" : existing) : "skip");
      }
      return next;
    });
  }

  function applyPriorityToIncluded(priority: TorrentFilePriority) {
    if (visibleSelectedIndices.length === 0) return;
    updatePriorities((current) => {
      const next = new Map(current);
      for (const index of visibleSelectedIndices) next.set(index, priority);
      return next;
    });
  }

  function setFolderPriority(folder: TorrentTreeDirectory, priority: TorrentFilePriority) {
    updatePriorities((current) => {
      const next = new Map(current);
      for (const index of folder.fileIndices) next.set(index, priority);
      return next;
    });
  }

  async function savePriorities() {
    if (busy || !dirty || !canChange) return;
    const updates: TorrentFilePriorityUpdate[] = torrent.files.flatMap((file) => {
      const priority = priorities.get(file.index) ?? file.priority;
      return priority === file.priority ? [] : [{ index: file.index, priority }];
    });
    if (updates.length === 0) {
      setDirty(false);
      return;
    }
    const succeeded = await onSave(torrent.id, updates);
    if (succeeded) setDirty(false);
  }

  function updateScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop);
  }

  return (
    <section className="torrent-files" aria-label={`Files in ${torrent.name ?? "torrent"}`}>
      <div className="torrent-files__toolbar">
        <div className="torrent-files__selection-actions" aria-label="Bulk file priorities">
          <button
            type="button"
            onClick={() => updatePriorities((current) => new Map<number, TorrentFilePriority>(torrent.files.map((file) => [
              file.index,
              (current.get(file.index) ?? file.priority) === "skip" ? "normal" : current.get(file.index) ?? file.priority,
            ])))}
            disabled={!canChange || busy || selectionTotals.selectedFiles === torrent.files.length}
            aria-label="Include all files"
            title="Include all files"
          ><ListChecks size={13} aria-hidden="true" /> All</button>
          <button
            type="button"
            onClick={() => updatePriorities(() => new Map<number, TorrentFilePriority>(torrent.files.map((file) => [file.index, "skip"])))}
            disabled={!canChange || busy || selectionTotals.selectedFiles === 0}
            aria-label="Skip all files"
            title="Skip all files"
          ><ListX size={13} aria-hidden="true" /> None</button>
          <span className="torrent-files__action-divider" aria-hidden="true" />
          <button type="button" onClick={() => applyPriorityToIncluded("high")} disabled={!canChange || busy || visibleSelectedIndices.length === 0} aria-label="Set High priority">High</button>
          <button type="button" onClick={() => applyPriorityToIncluded("normal")} disabled={!canChange || busy || visibleSelectedIndices.length === 0} aria-label="Set Normal priority">Normal</button>
          <button type="button" onClick={() => applyPriorityToIncluded("low")} disabled={!canChange || busy || visibleSelectedIndices.length === 0} aria-label="Set Low priority">Low</button>
          <button type="button" onClick={() => applyPriorityToIncluded("skip")} disabled={!canChange || busy || visibleSelectedIndices.length === 0} aria-label="Skip included files">Skip</button>
          <button
            type="button"
            onClick={() => updatePriorities(() => new Map<number, TorrentFilePriority>(torrent.files.map((file) => [file.index, "normal"])))}
            disabled={!canChange || busy || torrent.files.every((file) => (priorities.get(file.index) ?? file.priority) === "normal")}
            aria-label="Reset priorities to Normal"
            title="Reset priorities to Normal"
          >Reset</button>
        </div>
        {hasFolders && (
          <div className="torrent-files__tree-actions">
            <button type="button" onClick={() => setExpanded(new Set(tree.directories.map((directory) => directory.id)))} disabled={busy || expanded.size === tree.directories.length} aria-label="Expand all folders" title="Expand all folders">
              <Maximize2 size={13} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setExpanded(new Set())} disabled={busy || expanded.size === 0} aria-label="Collapse all folders" title="Collapse all folders">
              <Minimize2 size={13} aria-hidden="true" />
            </button>
          </div>
        )}
        <label className="torrent-files__search">
          <Search size={13} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a file" aria-label="Search torrent files" />
        </label>
        <label className="torrent-files__sort">
          <span>Sort</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as FileSort)} aria-label="Sort files by">
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="progress">Progress</option>
          </select>
        </label>
      </div>
      <p className="torrent-files__priority-note">High files are requested first. Normal and Low stay eligible; Skip opts out.</p>

      <div className="torrent-files__table" role="treegrid" aria-label="Torrent file priorities" aria-rowcount={rows.length + 1}>
        <div className="torrent-files__head" role="row">
          <span role="columnheader">Name</span>
          <span role="columnheader">Size</span>
          <span role="columnheader">Priority</span>
          <span role="columnheader">Downloaded</span>
          <span role="columnheader">Progress</span>
          <span role="columnheader">Status</span>
        </div>
        {torrent.files.length === 0 ? (
          <p className="torrent-files__message" role="status">
            {torrent.engineAvailable ? "File metadata is not available yet." : "File controls are unavailable because this torrent is not in the engine."}
          </p>
        ) : rows.length === 0 ? (
          <p className="torrent-files__message" role="status">No files match “{search}”.</p>
        ) : (
          <div className="torrent-files__viewport" ref={viewportRef} onScroll={updateScroll} role="rowgroup">
            <div className="torrent-files__spacer" style={{ height: rows.length * ROW_HEIGHT }}>
              {visibleRows.map(({ node, level }, offset) => {
                const rowIndex = firstVisible + offset;
                const rowStyle: CSSProperties = {
                  top: rowIndex * ROW_HEIGHT,
                  height: ROW_HEIGHT,
                  paddingLeft: 9 + (level - 1) * 16,
                };
                if (node.type === "directory") {
                  const count = selectedCounts.get(node.id) ?? 0;
                  const checked = count === node.totalFiles && node.totalFiles > 0;
                  const indeterminate = count > 0 && !checked;
                  const isExpanded = expanded.has(node.id);
                  const aggregate = aggregateFolder(node, fileByIndex);
                  const folderPriority = aggregatePriority(node.fileIndices, priorities, fileByIndex);
                  return (
                    <div className="torrent-files__row torrent-files__row--folder" key={node.id} role="row" aria-level={level} aria-expanded={isExpanded} style={rowStyle}>
                      <span className="torrent-files__name-cell" role="gridcell">
                        <input type="checkbox" checked={checked} ref={(element) => { if (element) element.indeterminate = indeterminate; }} onChange={() => toggleFolder(node)} disabled={!canChange || busy} aria-label={`${indeterminate ? "Partially select" : checked ? "Deselect" : "Select"} folder ${node.name}`} />
                        <button className="torrent-files__expand" type="button" onClick={() => setExpanded((current) => toggleSet(current, node.id))} aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`} aria-expanded={isExpanded}>
                          {isExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                        </button>
                        {isExpanded ? <FolderOpen size={14} aria-hidden="true" /> : <Folder size={14} aria-hidden="true" />}
                        <span className="torrent-files__name" title={node.name}>{node.name}</span>
                      </span>
                      <span role="gridcell">{formatExactBytes(node.totalSize)}</span>
                      <span role="gridcell">
                        <PrioritySelect value={folderPriority} disabled={!canChange || busy} label={`Priority for folder ${node.name}`} onChange={(priority) => setFolderPriority(node, priority)} />
                      </span>
                      <span role="gridcell">{formatExactBytes(aggregate.downloadedBytes)}</span>
                      <span role="gridcell">{formatPercent(aggregate.progressPercent)}</span>
                      <span role="gridcell">{count === 0 ? "Skipped" : count === node.totalFiles ? "Selected" : "Mixed"}</span>
                    </div>
                  );
                }

                const file = fileByIndex.get(node.file.index);
                if (!file) return null;
                const priority = priorities.get(file.index) ?? file.priority;
                const checked = priority !== "skip";
                return (
                  <div className="torrent-files__row" key={node.id} role="row" aria-level={level} aria-selected={checked} style={rowStyle}>
                    <span className="torrent-files__name-cell" role="gridcell">
                      <input type="checkbox" checked={checked} onChange={() => toggleFile(file.index)} disabled={!canChange || busy} aria-label={`${checked ? "Skip" : "Include"} ${file.path}`} />
                      <span className="torrent-files__leaf-spacer" aria-hidden="true" />
                      <File size={13} aria-hidden="true" />
                      <span className="torrent-files__name" title={file.path}>{node.name}</span>
                    </span>
                    <span role="gridcell">{formatExactBytes(file.sizeBytes)}</span>
                    <span role="gridcell">
                      <PrioritySelect value={priority} disabled={!canChange || busy} label={`Priority for ${file.path}`} onChange={(next) => setPriority(file.index, next)} />
                    </span>
                    <span role="gridcell">{formatExactBytes(file.downloadedBytes)}</span>
                    <span role="gridcell">{formatPercent(file.progressPercent)}</span>
                    <span role="gridcell" className={`torrent-files__state torrent-files__state--${file.state}`}>{fileStateLabel(file.state)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="torrent-files__footer" aria-live="polite">
        <span><Check size={13} aria-hidden="true" /> {selectionTotals.selectedFiles.toLocaleString()} of {torrent.files.length.toLocaleString()} files</span>
        <strong>{formatExactBytes(selectionTotals.selectedBytes)} <span>/ {formatExactBytes(selectionTotals.totalBytes)}</span></strong>
        <button type="button" className="torrent-files__save" onClick={() => void savePriorities()} disabled={!canChange || !dirty || busy || selectionTotals.selectedFiles === 0}>
          {saving ? "Saving…" : "Save priorities"}
        </button>
      </div>
      {!canChange && torrent.engineAvailable && torrent.state === "error" && (
        <p className="torrent-files__notice" role="status">Retry this torrent before changing file priorities.</p>
      )}
      {!canChange && torrent.engineAvailable && torrent.state !== "error" && torrent.files.length > 0 && (
        <p className="torrent-files__notice" role="status">File priorities can be changed when the torrent is active or paused.</p>
      )}
      {canChange && dirty && selectionTotals.selectedFiles === 0 && (
        <p className="torrent-files__notice" role="status">Select at least one file to save. Pause the torrent to stop all transfer activity.</p>
      )}
    </section>
  );
}

function PrioritySelect({
  value,
  disabled,
  label,
  onChange,
}: {
  value: PriorityChoice;
  disabled: boolean;
  label: string;
  onChange: (priority: TorrentFilePriority) => void;
}) {
  return (
    <select
      className={`torrent-files__priority torrent-files__priority--${value}`}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.value as TorrentFilePriority)}
    >
      {value === "mixed" && <option value="mixed" disabled>Mixed</option>}
      <option value="high">High</option>
      <option value="normal">Normal</option>
      <option value="low">Low</option>
      <option value="skip">Skip</option>
    </select>
  );
}

function aggregatePriority(
  indices: number[],
  priorities: Map<number, TorrentFilePriority>,
  files: Map<number, TorrentFile>,
): PriorityChoice {
  let result: TorrentFilePriority | null = null;
  for (const index of indices) {
    const priority = priorities.get(index) ?? files.get(index)?.priority ?? "normal";
    if (result === null) result = priority;
    else if (result !== priority) return "mixed";
  }
  return result ?? "normal";
}

function sortNodes(nodes: TorrentTreeNode[], sortBy: FileSort, files: Map<number, TorrentFile>) {
  const compareName = (left: TorrentTreeNode, right: TorrentTreeNode) =>
    left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  nodes.sort((left, right) => {
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
    if (sortBy === "name") return compareName(left, right);
    if (sortBy === "size") {
      const leftSize = left.type === "directory"
        ? left.totalSize
        : BigInt(files.get(left.file.index)?.sizeBytes ?? "0");
      const rightSize = right.type === "directory"
        ? right.totalSize
        : BigInt(files.get(right.file.index)?.sizeBytes ?? "0");
      if (leftSize !== rightSize) return leftSize > rightSize ? -1 : 1;
      return compareName(left, right);
    }
    const metric = (node: TorrentTreeNode) => node.type === "file"
      ? files.get(node.file.index)?.progressPercent ?? 0
      : aggregateFolder(node, files).progressPercent;
    const difference = metric(right) - metric(left);
    return Number.isFinite(difference) && difference !== 0 ? difference : compareName(left, right);
  });
  for (const node of nodes) if (node.type === "directory") sortNodes(node.children, sortBy, files);
}

function aggregateFolder(folder: TorrentTreeDirectory, files: Map<number, TorrentFile>) {
  let total = 0n;
  let downloaded = 0n;
  for (const index of folder.fileIndices) {
    const file = files.get(index);
    if (!file) continue;
    total += BigInt(file.sizeBytes);
    downloaded += BigInt(file.downloadedBytes);
  }
  return {
    downloadedBytes: downloaded,
    progressPercent: total === 0n ? 100 : Number(downloaded * 10000n / total) / 100,
  };
}

function formatPercent(progress: number) {
  return `${Math.max(0, Math.min(100, Math.round(progress)))}%`;
}

function fileStateLabel(state: TorrentFile["state"]) {
  return state === "skipped" ? "Skipped" : state === "completed" ? "Complete" : state[0].toUpperCase() + state.slice(1);
}

function toggleSet(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
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
