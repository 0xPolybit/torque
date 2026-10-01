import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileUp, Folder, Link2, Magnet, Plus, X } from "lucide-react";
import type { DownloadDirectory } from "../../lib/desktop";

type InputKind = "magnet" | "url" | "file";

interface AddTorrentDialogProps {
  directories: DownloadDirectory[];
  selectedDirectoryId: string;
  selectedDirectoryName?: string;
  error: string;
  busy: boolean;
  onClose: () => void;
  onSelectDirectory: () => Promise<void>;
  onSelectedDirectoryChange: (id: string) => void;
  onAddMagnet: (link: string) => Promise<boolean>;
  onAddUrl: (url: string) => Promise<boolean>;
  onAddFile: () => Promise<boolean>;
}

export function AddTorrentDialog({
  directories,
  selectedDirectoryId,
  selectedDirectoryName,
  error,
  busy,
  onClose,
  onSelectDirectory,
  onSelectedDirectoryChange,
  onAddMagnet,
  onAddUrl,
  onAddFile,
}: AddTorrentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<InputKind>("magnet");
  const [magnetLink, setMagnetLink] = useState("");
  const [torrentUrl, setTorrentUrl] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const added = kind === "magnet"
      ? await onAddMagnet(magnetLink)
      : await onAddUrl(torrentUrl);
    if (added) onClose();
  }

  return (
    <dialog
      className="add-dialog"
      ref={dialogRef}
      aria-labelledby="add-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="add-dialog__header">
        <div>
          <h2 id="add-dialog-title">Add a torrent</h2>
          <p>Start a transfer from a magnet link or torrent file.</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
          <X size={17} aria-hidden="true" />
        </button>
      </div>

      <div className="add-dialog__tabs" role="tablist" aria-label="Torrent source">
        <button
          className={kind === "magnet" ? "is-selected" : ""}
          role="tab"
          aria-selected={kind === "magnet"}
          type="button"
          onClick={() => setKind("magnet")}
        >
          <Magnet size={15} aria-hidden="true" /> Magnet
        </button>
        <button
          className={kind === "url" ? "is-selected" : ""}
          role="tab"
          aria-selected={kind === "url"}
          type="button"
          onClick={() => setKind("url")}
        >
          <Link2 size={15} aria-hidden="true" /> URL
        </button>
        <button
          className={kind === "file" ? "is-selected" : ""}
          role="tab"
          aria-selected={kind === "file"}
          type="button"
          onClick={() => setKind("file")}
        >
          <FileUp size={15} aria-hidden="true" /> File
        </button>
      </div>

      {kind === "file" ? (
        <div className="add-dialog__file-prompt">
          <div className="add-dialog__file-icon" aria-hidden="true">
            <FileUp size={21} strokeWidth={1.7} />
          </div>
          <p>Choose a .torrent file from your computer.</p>
          <button
            className="primary-button"
            type="button"
            disabled={busy || !selectedDirectoryId}
            onClick={() => void onAddFile().then((added) => added && onClose())}
          >
            {busy ? "Adding torrent…" : "Choose .torrent file"}
          </button>
        </div>
      ) : (
        <form className="add-dialog__form" onSubmit={submit}>
          <label className="field-label" htmlFor="torrent-input">
            {kind === "magnet" ? "Magnet link" : "Torrent URL"}
          </label>
          {kind === "magnet" ? (
            <textarea
              id="torrent-input"
              autoFocus
              required
              rows={3}
              placeholder="magnet:?xt=urn:btih:…"
              value={magnetLink}
              onChange={(event) => setMagnetLink(event.target.value)}
            />
          ) : (
            <input
              id="torrent-input"
              autoFocus
              required
              type="url"
              placeholder="https://example.com/file.torrent"
              value={torrentUrl}
              onChange={(event) => setTorrentUrl(event.target.value)}
            />
          )}
          <button
            className="primary-button add-dialog__submit"
            type="submit"
            disabled={busy || !selectedDirectoryId}
          >
            <Plus size={15} aria-hidden="true" />
            {busy ? "Starting download…" : "Add torrent"}
          </button>
        </form>
      )}

      <div className="add-dialog__destination">
        <div className="add-dialog__destination-icon" aria-hidden="true">
          <Folder size={15} />
        </div>
        <div className="add-dialog__destination-content">
          <label htmlFor="download-directory">Save to</label>
          <select
            id="download-directory"
            value={selectedDirectoryId}
            disabled={directories.length === 0}
            onChange={(event) => onSelectedDirectoryChange(event.target.value)}
          >
            {directories.map((directory) => (
              <option key={directory.id} value={directory.id}>{directory.name}</option>
            ))}
            {directories.length === 0 && <option value="">No folder selected</option>}
          </select>
          <span>{selectedDirectoryName || "Choose a download folder"}</span>
        </div>
        <button className="text-button" type="button" onClick={() => void onSelectDirectory()}>
          Browse…
        </button>
      </div>

      {error && (
        <p className="add-dialog__error" role="alert">
          {error}
        </p>
      )}
      <p className="add-dialog__legal-note">
        Only download content you have permission to access.
      </p>
    </dialog>
  );
}
