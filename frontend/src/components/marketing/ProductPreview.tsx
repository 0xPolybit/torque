import { useState } from "react";
import { Activity, Archive, ArrowDown, ArrowUp, Check, CircleHelp, Clock3, Download, FileText, Folder, FolderDown, HardDrive, ListMusic, MoreHorizontal, Pause, Play, Search, Settings2, Users } from "lucide-react";
import { formatRate } from "../../lib/site";

type PreviewTab = "downloads" | "files";

const transfers = [
  { name: "Ubuntu 26.04 LTS Desktop", detail: "ubuntu-26.04-desktop-amd64.iso", progress: 82, value: "3.8 GB", total: "4.6 GB", down: 18_400_000, up: 1_200_000, peers: 24, eta: "3m left", color: "lime" },
  { name: "Open Dataset Collection", detail: "public climate data · 12 files", progress: 48, value: "8.7 GB", total: "18.2 GB", down: 4_200_000, up: 160_000, peers: 11, eta: "34m left", color: "blue" },
  { name: "Public-domain film archive", detail: "The General · 1926 · 1 file", progress: 0, value: "—", total: "2.4 GB", down: 0, up: 0, peers: 0, eta: "Queued", color: "amber" },
];

export function ProductPreview() {
  const [tab, setTab] = useState<PreviewTab>("downloads");
  return <div className="preview-stage" aria-label="Illustrative Torque desktop interface">
    <div className="preview-stage__frame">
      <div className="preview-window">
        <div className="preview-window__titlebar">
          <div className="window-dots" aria-hidden="true"><span /><span /><span /></div>
          <div className="preview-window__app"><img src="/favicon.svg" alt="" /> Torque <span>·</span> Downloads</div>
          <span className="preview-window__live"><i /> Desktop preview</span>
        </div>
        <div className="preview-window__body">
          <aside className="preview-sidebar">
            <div className="preview-sidebar__brand"><Activity size={14} /> Torque</div>
            <div className="preview-sidebar__section">LIBRARY</div>
            <div className="preview-sidebar__item is-active"><ListMusic size={13} /> Downloads <span>3</span></div>
            <div className="preview-sidebar__item"><Search size={13} /> Browse</div>
            <div className="preview-sidebar__item"><Archive size={13} /> History</div>
            <div className="preview-sidebar__section preview-sidebar__section--bottom">PREFERENCES</div>
            <div className="preview-sidebar__item"><Settings2 size={13} /> Settings</div>
          </aside>
          <div className="preview-workspace">
            <div className="preview-workspace__toolbar">
              <div><span>TORRENT LIBRARY</span><h3>Downloads</h3></div>
              <button className="preview-add" type="button" aria-label="Illustrative Add Torrent button"><span>＋</span> Add Torrent</button>
            </div>
            <div className="preview-tabs" role="tablist" aria-label="Sample preview panels">
              <button type="button" role="tab" aria-selected={tab === "downloads"} onClick={() => setTab("downloads")}>All downloads <span>3</span></button>
              <button type="button" role="tab" aria-selected={tab === "files"} onClick={() => setTab("files")}>Selected torrent · Files</button>
              <button className="preview-tabs__more" type="button" aria-label="More sample options"><MoreHorizontal size={15} /></button>
            </div>
            {tab === "downloads" ? <div className="preview-transfer-list">
              {transfers.map((transfer) => <div className="preview-transfer" key={transfer.name}>
                <div className="preview-transfer__top"><div className={`preview-transfer__file-icon is-${transfer.color}`}><Download size={13} /></div><div className="preview-transfer__identity"><strong>{transfer.name}</strong><span>{transfer.detail}</span></div><span className={`preview-state preview-state--${transfer.progress ? "downloading" : "queued"}`}>{transfer.progress ? "Downloading" : "Queued"}</span><button className="preview-row-action" aria-label={`Sample pause action for ${transfer.name}`} type="button">{transfer.progress ? <Pause size={13} /> : <Play size={13} />}</button></div>
                <div className="preview-transfer__progress-copy"><span>{transfer.value} <em>of</em> {transfer.total}</span><span>{transfer.eta} <b>{transfer.progress}%</b></span></div>
                <div className="preview-progress"><i style={{ transform: `scaleX(${transfer.progress / 100})` }} /></div>
                <div className="preview-transfer__stats"><span><ArrowDown size={11} /> {formatRate(transfer.down)}</span><span><ArrowUp size={11} /> {formatRate(transfer.up)}</span><span><Users size={11} /> {transfer.peers} peers</span></div>
              </div>)}
            </div> : <div className="preview-file-pane">
              <div className="preview-file-heading"><Folder size={13} /> Ubuntu 26.04 LTS Desktop <span>4.6 GB total</span></div>
              {[["ubuntu-26.04-desktop-amd64.iso", "4.6 GB", true], ["SHA256SUMS", "146 B", true], ["README.txt", "3 KB", false]].map(([name, size, selected]) => <div className="preview-file-row" key={String(name)}><span className={`preview-check${selected ? " is-checked" : ""}`}>{selected ? <Check size={10} /> : null}</span><FileText size={12} /><span>{String(name)}</span><small>{String(size)}</small></div>)}
              <div className="preview-file-summary"><span>2 of 3 files selected</span><strong>4.6 GB / 4.6 GB</strong></div>
            </div>}
            <div className="preview-statusbar"><span><Download size={11} /> 22.6 MB/s</span><span><ArrowUp size={11} /> 1.4 MB/s</span><span><Users size={11} /> Peers 35</span><span><Activity size={11} /> Active 2</span><span className="preview-statusbar__queued">Queued 1</span></div>
          </div>
        </div>
      </div>
    </div>
    <div className="preview-caption"><span><span className="preview-caption__dot" /> Interface preview</span><span>Illustrative sample data · not a screenshot</span></div>
  </div>;
}

type SampleFile = { id: string; name: string; size: string; folder?: string };
const sampleFiles: SampleFile[] = [
  { id: "feature-01", name: "Feature 01.mkv", size: "4.8 GB", folder: "Feature films" },
  { id: "feature-02", name: "Feature 02.mkv", size: "5.2 GB", folder: "Feature films" },
  { id: "interview", name: "Bonus interview.mkv", size: "86 MB", folder: "Extras" },
  { id: "subtitle", name: "feature01.srt", size: "82 KB", folder: "Subtitles" },
  { id: "poster", name: "cover.jpg", size: "1.2 MB" },
];

export function FileSelectionMockup() {
  const [selected, setSelected] = useState(() => new Set(["feature-01", "feature-02", "subtitle"]));
  const selectedCount = selected.size;
  const summaries: Record<number, string> = { 0: "0 B", 1: "4.8 GB", 2: "10.0 GB", 3: "10.0 GB", 4: "10.1 GB", 5: "10.1 GB" };
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleFolder = (folder: string) => setSelected((current) => {
    const ids = sampleFiles.filter((file) => file.folder === folder).map((file) => file.id);
    const next = new Set(current);
    const allSelected = ids.every((id) => current.has(id));
    ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
    return next;
  });
  const selectedIn = (folder: string) => sampleFiles.filter((file) => file.folder === folder && selected.has(file.id)).length;

  return <div className="selection-mock" aria-label="Interactive illustrative torrent file selection">
    <div className="selection-mock__header"><div><span className="mock-label">TORRENT PREVIEW</span><h3>Open Cinema Collection</h3></div><span className="mock-hash">a0c4…92e1</span></div>
    <div className="selection-mock__toolbar"><button type="button" onClick={() => setSelected(new Set(sampleFiles.map((file) => file.id)))}>Select all</button><button type="button" onClick={() => setSelected(new Set())}>Select none</button><span>5 files · 10.1 GB</span></div>
    <div className="selection-tree">
      {(["Feature films", "Extras", "Subtitles"] as const).map((folder) => {
        const files = sampleFiles.filter((file) => file.folder === folder);
        const folderSelectedCount = selectedIn(folder);
        return <div className="selection-folder" key={folder}>
          <div className="selection-folder__row"><button type="button" role="checkbox" aria-checked={folderSelectedCount === files.length ? "true" : folderSelectedCount ? "mixed" : "false"} className={`mock-check${folderSelectedCount === files.length ? " is-checked" : ""}${folderSelectedCount > 0 && folderSelectedCount < files.length ? " is-mixed" : ""}`} onClick={() => toggleFolder(folder)}>{folderSelectedCount === files.length ? <Check size={11} /> : folderSelectedCount > 0 ? <span /> : null}</button><Folder size={13} /><button className="selection-folder__name" type="button" onClick={() => toggleFolder(folder)}>{folder}</button><span>{files.length} files</span></div>
          {files.map((file) => <FileTreeRow key={file.id} file={file} checked={selected.has(file.id)} onToggle={() => toggle(file.id)} />)}
        </div>;
      })}
      {sampleFiles.filter((file) => !file.folder).map((file) => <FileTreeRow key={file.id} file={file} checked={selected.has(file.id)} onToggle={() => toggle(file.id)} />)}
    </div>
    <div className="selection-mock__footer"><div><span>Selected</span><strong>{selectedCount} of 5 files</strong></div><div><span>Selected size</span><strong>{summaries[selectedCount]} <i>/ 10.1 GB</i></strong></div><button type="button" aria-label="Sample Start Download action">Start Download <Download size={13} /></button></div>
    <div className="mock-disclaimer"><CircleHelp size={12} /> Example contents and sizes for illustration</div>
  </div>;
}

function FileTreeRow({ file, checked, onToggle }: { file: SampleFile; checked: boolean; onToggle: () => void }) {
  return <div className={`selection-file-row${file.folder ? " is-nested" : ""}`}><button type="button" role="checkbox" aria-checked={checked} className={`mock-check${checked ? " is-checked" : ""}`} onClick={onToggle}>{checked && <Check size={11} />}</button><FileText size={12} /><button className="selection-file-row__name" type="button" onClick={onToggle}>{file.name}</button><span>{file.size}</span></div>;
}

const searchSamples = [
  { title: "Ubuntu 26.04 Desktop", category: "Linux", size: "5.3 GB", peers: "4,812 seeders" },
  { title: "Debian 14 netinst", category: "Linux", size: "3.9 GB", peers: "2,932 seeders" },
  { title: "Open climate dataset", category: "Dataset", size: "18.2 GB", peers: "412 seeders" },
];

export function BrowseMockup() {
  const [query, setQuery] = useState("linux");
  const [provider, setProvider] = useState("All Sources");
  const results = searchSamples.filter((item) => !query || item.title.toLowerCase().includes(query.toLowerCase()) || item.category.toLowerCase().includes(query.toLowerCase()));
  return <div className="browse-mock" aria-label="Interactive illustrative Browse search interface">
    <div className="browse-mock__top"><span className="mock-label">AUTHORIZED SOURCES</span><span className="mock-source-status"><i /> Internet Archive</span></div>
    <label className="browse-mock__search"><Search size={16} /><input aria-label="Example content search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /><button type="button" aria-label="Search example results"><span>Search</span></button></label>
    <div className="browse-mock__filters"><label><span>PROVIDER</span><select value={provider} onChange={(event) => setProvider(event.currentTarget.value)}><option>All Sources</option><option>Internet Archive</option></select></label><label><span>CATEGORY</span><select defaultValue="All categories"><option>All categories</option><option>Linux</option><option>Dataset</option></select></label><label><span>SORT BY</span><select defaultValue="Seeders"><option>Relevance</option><option>Newest</option><option>Size</option><option>Seeders</option></select></label></div>
    <div className="browse-mock__results"><div className="browse-mock__results-heading"><strong>Example results</strong><span>{results.length} open items</span></div>{results.map((item) => <div className="browse-result" key={item.title}><div className="browse-result__icon"><HardDrive size={14} /></div><div className="browse-result__title"><strong>{item.title}</strong><span>{item.category} <b>·</b> Internet Archive</span></div><span className="browse-result__size">{item.size}</span><span className="browse-result__peers"><i />{item.peers}</span><button type="button" className="browse-result__inspect">Inspect torrent</button></div>)}{!results.length && <div className="browse-mock__empty">No sample items match that search.</div>}</div>
    <div className="mock-disclaimer"><CircleHelp size={12} /> Illustrative results and peer counts</div>
  </div>;
}

type DetailTab = "Overview" | "Files" | "Peers" | "Trackers" | "Info";
const detailTabs: DetailTab[] = ["Overview", "Files", "Peers", "Trackers", "Info"];

export function DetailsMockup() {
  const [tab, setTab] = useState<DetailTab>("Overview");
  return <div className="details-mock" aria-label="Illustrative torrent details panel">
    <div className="details-mock__title"><div className="details-mock__symbol"><Download size={15} /></div><div><h3>Ubuntu 26.04 Desktop</h3><span>Downloading · Added today</span></div><button type="button" aria-label="Sample more torrent details"><MoreHorizontal size={17} /></button></div>
    <div className="details-mock__tabs" role="tablist" aria-label="Example torrent detail tabs">{detailTabs.map((name) => <button type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)} key={name}>{name}</button>)}</div>
    {tab === "Overview" && <div className="details-overview"><div className="details-overview__progress"><div><span>Overall progress</span><strong>82%</strong></div><div className="preview-progress"><i style={{ transform: "scaleX(.82)" }} /></div><span>3.8 GB <em>of</em> 4.6 GB selected</span></div><div className="details-kpis"><div><span><ArrowDown size={12} /> Download</span><strong>18.4 MB/s</strong></div><div><span><ArrowUp size={12} /> Upload</span><strong>1.2 MB/s</strong></div><div><span><Users size={12} /> Peers</span><strong>24 connected</strong></div><div><span><Clock3 size={12} /> ETA</span><strong>3m 12s</strong></div><div><span>Share ratio</span><strong>0.08</strong></div><div><span>Save location</span><strong title="D:\Downloads\Ubuntu">…/Downloads/Ubuntu</strong></div></div><div className="details-hash"><span>INFO HASH</span><code>9d4d83c1b7…1da82fe4</code><button type="button" aria-label="Copy sample info hash">Copy</button></div></div>}
    {tab === "Files" && <div className="details-tab-content"><div className="detail-file"><Check size={13} /> ubuntu-26.04-desktop-amd64.iso <span>82%</span></div><div className="detail-file"><Check size={13} /> SHA256SUMS <span>100%</span></div><div className="detail-file is-skipped"><FileText size={13} /> README.txt <span>Skipped</span></div></div>}
    {tab === "Peers" && <div className="details-tab-content"><div className="detail-table-row detail-table-head"><span>PEER</span><span>CLIENT</span><span>STATE</span></div><div className="detail-table-row"><span>192.0.2.••</span><span>rqbit</span><span>Connected</span></div><div className="detail-table-row"><span>198.51.100.••</span><span>Transmission</span><span>Connected</span></div><small>Sample peer details · addresses shown with reduced precision</small></div>}
    {tab === "Trackers" && <div className="details-tab-content"><div className="detail-tracker"><span className="status-led" /> udp://tracker.example.org:6969/announce <b>Working</b></div><div className="detail-tracker"><span className="status-led is-quiet" /> https://tracker.example.net/announce <b>Waiting</b></div><small>Example hostnames only; tracker state is illustrative.</small></div>}
    {tab === "Info" && <div className="details-tab-content details-info"><span>Info hash</span><code>9d4d83c1b7…1da82fe4</code><span>Piece length</span><strong>4 MiB</strong><span>Piece count</span><strong>1,176</strong><span>Visibility</span><strong>Public</strong></div>}
    <div className="mock-disclaimer"><CircleHelp size={12} /> Example details · some engine fields may be unavailable</div>
  </div>;
}

export function QueueMockup() {
  const [items, setItems] = useState(["Open-source data archive", "Public-domain film set", "Linux test image"]);
  const [running, setRunning] = useState(true);
  function move(index: number, offset: number) {
    setItems((current) => {
      const nextIndex = Math.max(0, Math.min(current.length - 1, index + offset));
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }
  return <div className="queue-mock" aria-label="Interactive illustrative download queue">
    <div className="queue-mock__head"><div><span className="mock-label">DOWNLOAD QUEUE</span><h3>In the right order.</h3></div><div className="queue-cap"><span>ACTIVE LIMIT</span><strong>2 at a time</strong></div></div>
    {items.map((name, index) => <div className="queue-item" key={name}><span className="queue-item__number">{index + 1}</span><div className="queue-item__icon"><FolderDown size={14} /></div><div className="queue-item__name"><strong>{name}</strong><span>{index === 0 && running ? "Downloading" : "Queued"}</span></div>{index === 0 && <div className="queue-item__meter"><span style={{ width: "64%" }} /></div>}<div className="queue-item__controls"><button type="button" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`Move ${name} down`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>↓</button></div></div>)}
    <div className="queue-mock__bottom"><span><Activity size={13} /> 2 active · 1 queued</span><button type="button" onClick={() => setRunning((value) => !value)}>{running ? <Pause size={13} /> : <Play size={13} />}{running ? "Pause sample" : "Resume sample"}</button></div>
    <div className="mock-disclaimer"><CircleHelp size={12} /> Example queue and transfer state</div>
  </div>;
}
