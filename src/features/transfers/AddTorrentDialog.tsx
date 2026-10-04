import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileUp, Folder, Link2, LoaderCircle, Magnet, Plus, X } from "lucide-react";
import type { TorrentDownloadSource } from "../../lib/discovery";
import type { DownloadDirectory, TorrentFileSelection, TorrentPreview } from "../../lib/desktop";
import { validateMagnetUri, validateTorrentUrl } from "./torrentInput";
import { TorrentInspection } from "./TorrentInspection";

type InputKind = "magnet" | "url" | "file";

interface AddTorrentDialogProps {
  selectedDirectory?: DownloadDirectory;
  error: string;
  busy: boolean;
  inspectingMetadata: boolean;
  selectingDirectory: boolean;
  selectingFile: boolean;
  onClose: () => void;
  onSelectDirectory: () => Promise<void>;
  onChooseTorrentFile: () => Promise<TorrentFileSelection | null>;
  onDiscardTorrentFile: (id: string) => Promise<void>;
  onInspectMagnet: (link: string) => Promise<TorrentPreview | null>;
  onInspectUrl: (url: string) => Promise<TorrentPreview | null>;
  onInspectFile: (selectionId: string) => Promise<TorrentPreview | null>;
  onDiscardPreview: (previewId: string) => Promise<void>;
  onStartPreview: (previewId: string, fileIndices: number[]) => Promise<boolean>;
  initialSource?: TorrentDownloadSource | null;
}

export function AddTorrentDialog({
  selectedDirectory,
  error,
  busy,
  inspectingMetadata,
  selectingDirectory,
  selectingFile,
  onClose,
  onSelectDirectory,
  onChooseTorrentFile,
  onDiscardTorrentFile,
  onInspectMagnet,
  onInspectUrl,
  onInspectFile,
  onDiscardPreview,
  onStartPreview,
  initialSource,
}: AddTorrentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<InputKind>(() => initialSource?.kind === "torrentUrl" ? "url" : "magnet");
  const [magnetLink, setMagnetLink] = useState(() => initialSource?.kind === "magnet" ? initialSource.value : "");
  const [torrentUrl, setTorrentUrl] = useState(() => initialSource?.kind === "torrentUrl" ? initialSource.value : "");
  const [fileSelection, setFileSelection] = useState<TorrentFileSelection | null>(null);
  const [preview, setPreview] = useState<TorrentPreview | null>(null);
  const [validationError, setValidationError] = useState("");
  const [directoryError, setDirectoryError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const locked = busy || inspectingMetadata || selectingFile || selectingDirectory;

  async function discardCurrentPreview() {
    if (preview) {
      await onDiscardPreview(preview.previewId);
      setPreview(null);
    }
  }

  async function close() {
    if (locked) return;
    await discardCurrentPreview();
    if (fileSelection) {
      await onDiscardTorrentFile(fileSelection.id);
      setFileSelection(null);
    }
    onClose();
  }

  async function backToSource() {
    if (busy) return;
    await discardCurrentPreview();
    setValidationError("");
    if (kind === "file") setFileSelection(null);
  }

  async function chooseFile() {
    setValidationError("");
    const next = await onChooseTorrentFile();
    if (!next) return;
    if (fileSelection) await onDiscardTorrentFile(fileSelection.id);
    setFileSelection(next);
  }

  async function inspect() {
    setValidationError("");
    setDirectoryError("");
    if (!selectedDirectory?.id) {
      setDirectoryError("Choose a destination folder before inspecting this torrent.");
      return;
    }

    let next: TorrentPreview | null = null;
    if (kind === "magnet") {
      const message = validateMagnetUri(magnetLink);
      if (message) {
        setValidationError(message);
        return;
      }
      next = await onInspectMagnet(magnetLink.trim());
    } else if (kind === "url") {
      const message = validateTorrentUrl(torrentUrl);
      if (message) {
        setValidationError(message);
        return;
      }
      next = await onInspectUrl(torrentUrl.trim());
    } else {
      if (!fileSelection) {
        setValidationError("Choose a .torrent file to inspect.");
        return;
      }
      next = await onInspectFile(fileSelection.id);
      if (next) setFileSelection(null);
    }
    if (next) setPreview(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locked && !preview) await inspect();
  }

  function changeKind(next: InputKind) {
    setKind(next);
    setValidationError("");
    setDirectoryError("");
  }

  return (
    <dialog
      className={`add-dialog${preview ? " add-dialog--inspection" : ""}`}
      ref={dialogRef}
      aria-labelledby="add-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        void close();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) void close();
      }}
    >
      <form className="add-dialog__content" onSubmit={(event) => void submit(event)} noValidate aria-busy={locked}>
        <div className="add-dialog__header">
          <div>
            <h2 id="add-dialog-title">{preview ? "Review torrent contents" : "Add a torrent"}</h2>
            <p>{preview ? "Choose the files to include before starting the download." : "Inspect a source before choosing what to download."}</p>
          </div>
          <button className="icon-button" type="button" onClick={() => void close()} aria-label="Close" disabled={locked}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        {preview ? (
          <TorrentInspection
            key={preview.previewId}
            preview={preview}
            selectedDirectory={selectedDirectory}
            selectingDirectory={selectingDirectory}
            busy={busy}
            error={error}
            onBack={() => void backToSource()}
            onSelectDirectory={onSelectDirectory}
            onStart={async (previewId, fileIndices) => {
              const started = await onStartPreview(previewId, fileIndices);
              if (started) {
                setPreview(null);
                onClose();
              }
              return started;
            }}
          />
        ) : (
          <>
            <div className="add-dialog__tabs" role="group" aria-label="Torrent source">
              <button className={kind === "magnet" ? "is-selected" : ""} aria-pressed={kind === "magnet"} type="button" disabled={locked} onClick={() => changeKind("magnet")}>
                <Magnet size={15} aria-hidden="true" /> Magnet link
              </button>
              <button className={kind === "file" ? "is-selected" : ""} aria-pressed={kind === "file"} type="button" disabled={locked} onClick={() => changeKind("file")}>
                <FileUp size={15} aria-hidden="true" /> Torrent file
              </button>
              <button className={kind === "url" ? "is-selected" : ""} aria-pressed={kind === "url"} type="button" disabled={locked} onClick={() => changeKind("url")}>
                <Link2 size={15} aria-hidden="true" /> Torrent URL
              </button>
            </div>

            <section className="add-dialog__source" aria-label={`${kind} source`}>
              {kind === "magnet" && (
                <>
                  <label className="field-label" htmlFor="torrent-magnet">Magnet link</label>
                  <textarea
                    id="torrent-magnet"
                    autoFocus
                    rows={3}
                    spellCheck={false}
                    placeholder="magnet:?xt=urn:btih:…"
                    value={magnetLink}
                    aria-invalid={Boolean(validationError)}
                    aria-describedby={validationError ? "torrent-input-error" : undefined}
                    disabled={locked}
                    onChange={(event) => { setMagnetLink(event.target.value); setValidationError(""); }}
                  />
                  <p className="add-dialog__hint">Metadata is fetched first. No content downloads until you start.</p>
                </>
              )}

              {kind === "url" && (
                <>
                  <label className="field-label" htmlFor="torrent-url">Torrent URL</label>
                  <input
                    id="torrent-url"
                    autoFocus
                    type="url"
                    spellCheck={false}
                    placeholder="https://example.com/file.torrent"
                    value={torrentUrl}
                    aria-invalid={Boolean(validationError)}
                    aria-describedby={validationError ? "torrent-input-error" : undefined}
                    disabled={locked}
                    onChange={(event) => { setTorrentUrl(event.target.value); setValidationError(""); }}
                  />
                  <p className="add-dialog__hint">Use an HTTP or HTTPS link to a .torrent file.</p>
                </>
              )}

              {kind === "file" && (
                <div className={`add-dialog__file-select${fileSelection ? " has-file" : ""}`}>
                  <div className="add-dialog__file-icon" aria-hidden="true"><FileUp size={20} strokeWidth={1.7} /></div>
                  <div className="add-dialog__file-info">
                    <strong title={fileSelection?.fileName}>{fileSelection?.fileName ?? "Select a torrent file"}</strong>
                    <span>{fileSelection ? "Ready to inspect" : "Choose a .torrent file from your computer"}</span>
                  </div>
                  <button className="secondary-button" type="button" disabled={locked} onClick={() => void chooseFile()}>
                    {selectingFile ? "Opening…" : fileSelection ? "Choose another" : "Choose file"}
                  </button>
                </div>
              )}
            </section>

            {validationError && <p id="torrent-input-error" className="add-dialog__field-error" role="alert">{validationError}</p>}
            {error && <p className="add-dialog__error" role="alert">{error}</p>}

            <div className={`add-dialog__destination${directoryError ? " has-error" : ""}`}>
              <div className="add-dialog__destination-icon" aria-hidden="true"><Folder size={15} /></div>
              <div className="add-dialog__destination-content">
                <label>Download location</label>
                <span className="add-dialog__destination-path" title={selectedDirectory?.displayPath}>
                  {selectedDirectory?.displayPath ?? "Choose a destination folder"}
                </span>
              </div>
              <button className="text-button" type="button" disabled={locked} onClick={() => { setDirectoryError(""); void onSelectDirectory(); }}>
                {selectingDirectory ? "Choosing…" : "Change folder"}
              </button>
            </div>
            {directoryError && <p className="add-dialog__field-error add-dialog__directory-error" role="alert">{directoryError}</p>}

            <div className="add-dialog__footer">
              <p className="add-dialog__legal-note">Only download content you have permission to access.</p>
              <div className="add-dialog__footer-actions">
                <button className="secondary-button" type="button" onClick={() => void close()} disabled={locked}>Cancel</button>
                <button className="primary-button" type="submit" disabled={locked}>
                  {inspectingMetadata ? <LoaderCircle size={15} className="is-spinning" aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
                  {inspectingMetadata ? "Fetching metadata…" : "Inspect torrent"}
                </button>
              </div>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
