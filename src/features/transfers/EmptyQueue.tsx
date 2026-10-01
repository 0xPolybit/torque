import { Download } from "lucide-react";

interface EmptyQueueProps {
  onAdd: () => void;
  disabled: boolean;
}

export function EmptyQueue({ onAdd, disabled }: EmptyQueueProps) {
  return (
    <section className="queue-panel" aria-labelledby="queue-empty-title">
      <div className="empty-queue">
        <div className="empty-queue__illustration" aria-hidden="true">
          <span className="empty-queue__orbit empty-queue__orbit--left" />
          <span className="empty-queue__orbit empty-queue__orbit--right" />
          <Download size={22} strokeWidth={1.8} />
        </div>

        <h2 id="queue-empty-title">No downloads yet</h2>
        <p className="empty-queue__description">
          Add a magnet link, torrent file, or URL to start your first download.
        </p>

        <button
          className="empty-queue__action"
          type="button"
          disabled={disabled}
          onClick={onAdd}
        >
          <span>Add torrent</span>
        </button>
      </div>
    </section>
  );
}
