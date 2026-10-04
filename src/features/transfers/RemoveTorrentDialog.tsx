import { useEffect, useRef } from "react";
import { FileX2, Trash2, X } from "lucide-react";

interface RemoveTorrentDialogProps {
  torrentName: string;
  deleteFiles: boolean;
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function RemoveTorrentDialog({
  torrentName,
  deleteFiles,
  busy,
  error,
  onConfirm,
  onClose,
}: RemoveTorrentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog
      className="remove-dialog"
      ref={dialogRef}
      aria-labelledby="remove-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current && !busy) onClose(); }}
    >
      <header className="remove-dialog__header">
        <div className="remove-dialog__icon" aria-hidden="true">{deleteFiles ? <FileX2 size={17} /> : <Trash2 size={17} />}</div>
        <button className="icon-button" type="button" aria-label="Cancel removal" disabled={busy} onClick={onClose}><X size={16} /></button>
      </header>
      <h2 id="remove-dialog-title">{deleteFiles ? "Delete downloaded files?" : "Remove this torrent?"}</h2>
      <p className="remove-dialog__name" title={torrentName}>{torrentName}</p>
      <p>{deleteFiles
        ? "Torque will remove this torrent and its downloaded files from the destination folder. This cannot be undone."
        : "The torrent will be removed from Torque. Any downloaded files will stay in the destination folder."}</p>
      {error && <p className="remove-dialog__error" role="alert">{error}</p>}
      <footer className="remove-dialog__actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className={deleteFiles ? "danger-button" : "primary-button"} type="button" disabled={busy} onClick={onConfirm}>
          {busy ? "Removing…" : deleteFiles ? "Delete files" : "Remove, keep files"}
        </button>
      </footer>
    </dialog>
  );
}
