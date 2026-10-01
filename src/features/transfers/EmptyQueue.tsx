import { Waypoints } from "lucide-react";

interface EmptyQueueProps {
  onAdd: () => void;
  disabled: boolean;
}

export function EmptyQueue({ onAdd, disabled }: EmptyQueueProps) {
  return (
    <section className="queue-panel" aria-labelledby="queue-empty-title">
      <div className="empty-queue">
        <div className="empty-queue__signal" aria-hidden="true">
          <span className="empty-queue__signal-node" />
          <span className="empty-queue__signal-line" />
          <Waypoints size={31} strokeWidth={1.45} />
          <span className="empty-queue__signal-line empty-queue__signal-line--short" />
          <span className="empty-queue__signal-node empty-queue__signal-node--end" />
        </div>

        <h2 id="queue-empty-title">Your queue is clear.</h2>
        <p className="empty-queue__description">
          Add a magnet link, a .torrent file, or a torrent URL to start a transfer.
        </p>

        <button
          className="empty-queue__action"
          type="button"
          disabled={disabled}
          onClick={onAdd}
        >
          <span>Add a torrent</span>
        </button>
      </div>
    </section>
  );
}
