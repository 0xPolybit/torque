import { RefreshCw } from "lucide-react";
import type { DesktopConnection } from "../app/useDesktopConnection";

interface BackendStatusProps {
  connection: DesktopConnection;
  onRetry: () => void;
}

export function BackendStatus({ connection, onRetry }: BackendStatusProps) {
  if (connection.state === "error") {
    return (
      <div className="backend-status backend-status--error" role="alert">
        <span className="backend-status__dot" aria-hidden="true" />
        <span className="backend-status__message" title={connection.message}>
          <span className="backend-status__label">Desktop core unavailable</span>
          <span className="backend-status__detail">{connection.message}</span>
        </span>
        <button
          className="backend-status__retry"
          type="button"
          onClick={onRetry}
          aria-label="Retry desktop connection"
          aria-describedby="backend-error-detail"
          title="Retry connection"
        >
          <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <span id="backend-error-detail" className="visually-hidden">
          {connection.message}
        </span>
      </div>
    );
  }

  const isConnected = connection.state === "connected";

  return (
    <div
      className={`backend-status${isConnected ? " backend-status--ready" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="backend-status__dot" aria-hidden="true" />
      <span className="backend-status__label">
        {isConnected ? "Desktop core connected" : "Connecting to desktop core"}
      </span>
    </div>
  );
}
