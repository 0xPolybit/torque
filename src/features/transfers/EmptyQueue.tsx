import { Plus, Waypoints } from "lucide-react";

export function EmptyQueue() {
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
          Torrent transfers will appear here once download support is available.
        </p>

        <button
          className="empty-queue__action"
          type="button"
          disabled
          aria-describedby="add-torrent-note"
          title="Download support is not available yet"
        >
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
          <span>Add torrent</span>
        </button>
        <span id="add-torrent-note" className="empty-queue__note">
          Not available in this initial version
        </span>
      </div>
    </section>
  );
}
