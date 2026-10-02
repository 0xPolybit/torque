import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";

export interface ToastMessage {
  id: number;
  message: string;
}

interface ToastRegionProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function ToastRegion({ toast, onDismiss }: ToastRegionProps) {
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timeout);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="toast-region" aria-live="polite" aria-relevant="additions text">
      <div className="toast-message" role="status" key={toast.id}>
        <CheckCircle2 size={16} aria-hidden="true" />
        <span>{toast.message}</span>
        <button className="icon-button toast-message__dismiss" type="button" onClick={onDismiss} aria-label="Dismiss notification">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
