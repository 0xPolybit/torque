import { useEffect, useRef } from "react";
import { Check, FolderDown, HardDrive, Monitor, Play, X } from "lucide-react";
import type { AppInfo } from "../../lib/desktop";

interface SettingsDialogProps {
  appInfo: AppInfo | null;
  downloadDirectoryName?: string;
  error?: string;
  resumeOnStartup: boolean;
  savingPreference: boolean;
  onChooseDirectory: () => Promise<void>;
  onResumeOnStartupChange: (enabled: boolean) => Promise<void>;
  onClose: () => void;
}

export function SettingsDialog({
  appInfo,
  downloadDirectoryName,
  error,
  resumeOnStartup,
  savingPreference,
  onChooseDirectory,
  onResumeOnStartupChange,
  onClose,
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      className="settings-dialog"
      ref={dialogRef}
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <header className="settings-dialog__header">
        <div>
          <h2 id="settings-title">Settings</h2>
          <p>Choose where new downloads are saved.</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close settings">
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <section className="settings-section" aria-labelledby="settings-downloads-heading">
        <h3 id="settings-downloads-heading">Downloads</h3>
        <div className="settings-row">
          <span className="settings-row__icon" aria-hidden="true"><FolderDown size={16} /></span>
          <div className="settings-row__copy">
            <strong>Save new downloads to</strong>
            <span title={appInfo?.defaultDownloadDirectory ?? undefined}>
              {downloadDirectoryName || "System Downloads"}
            </span>
          </div>
          <button className="text-button" type="button" onClick={() => void onChooseDirectory()}>
            Change
          </button>
        </div>
        <p className="settings-section__note">
          New downloads use this folder. Your most recently selected folder is used again the next time Torque opens.
        </p>
        <label className="settings-row settings-row--preference">
          <span className="settings-row__icon" aria-hidden="true"><Play size={16} /></span>
          <span className="settings-row__copy">
            <strong>Resume unfinished downloads on launch</strong>
            <span>Start unfinished torrents automatically when Torque opens.</span>
          </span>
          <input
            className="settings-row__toggle"
            type="checkbox"
            checked={resumeOnStartup}
            disabled={savingPreference}
            onChange={(event) => void onResumeOnStartupChange(event.currentTarget.checked)}
            aria-label="Resume unfinished downloads on launch"
          />
        </label>
        {error && <p className="settings-dialog__error" role="alert">{error}</p>}
      </section>

      <section className="settings-section" aria-labelledby="settings-app-heading">
        <h3 id="settings-app-heading">Application</h3>
        <div className="settings-row">
          <span className="settings-row__icon" aria-hidden="true"><Monitor size={16} /></span>
          <div className="settings-row__copy">
            <strong>Torque desktop</strong>
            <span>{appInfo ? `Version ${appInfo.version} · ${appInfo.platform}` : "Desktop runtime unavailable"}</span>
          </div>
          {appInfo && <Check className="settings-row__ready" size={15} aria-label="Connected" />}
          {!appInfo && <HardDrive className="settings-row__offline" size={15} aria-hidden="true" />}
        </div>
      </section>
    </dialog>
  );
}
