import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type ToastTone = "success" | "info" | "error";

export interface ToastMessage {
  id: number;
  message: string;
  tone?: ToastTone;
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
  const Icon = toast.tone === "error" ? AlertCircle : toast.tone === "info" ? Info : CheckCircle2;

  return (
    <div className="toast-region" aria-live="polite" aria-relevant="additions text">
      <div className={`toast-message${toast.tone ? ` toast-message--${toast.tone}` : ""}`} role={toast.tone === "error" ? "alert" : "status"} key={toast.id}>
        <Icon size={16} aria-hidden="true" />
        <span>{toast.message}</span>
        <button className="icon-button toast-message__dismiss" type="button" onClick={onDismiss} aria-label="Dismiss notification">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
