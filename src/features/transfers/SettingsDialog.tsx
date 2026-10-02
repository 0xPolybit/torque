import { useEffect, useRef } from "react";
import { Check, FolderDown, HardDrive, Monitor, Play, Sparkles, X } from "lucide-react";
import type { AppInfo, AppPreferences, ThemePreference } from "../../lib/desktop";

interface SettingsDialogProps {
  appInfo: AppInfo | null;
  downloadDirectoryPath?: string;
  error?: string;
  preferences: AppPreferences;
  savingPreference: boolean;
  selectingDirectory: boolean;
  onChooseDirectory: () => Promise<void>;
  onPreferencesChange: (changes: Partial<AppPreferences>) => Promise<void>;
  onClose: () => void;
}

export function SettingsDialog({
  appInfo,
  downloadDirectoryPath,
  error,
  preferences,
  savingPreference,
  selectingDirectory,
  onChooseDirectory,
  onPreferencesChange,
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
          <p>Set how Torque handles your downloads.</p>
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
            <span title={downloadDirectoryPath ?? appInfo?.defaultDownloadDirectory ?? undefined}>
              {downloadDirectoryPath || appInfo?.defaultDownloadDirectory || "System Downloads"}
            </span>
          </div>
          <button className="text-button" type="button" disabled={selectingDirectory} onClick={() => void onChooseDirectory()}>
            {selectingDirectory ? "Choosing…" : "Change"}
          </button>
        </div>
        <p className="settings-section__note">
          New downloads use this folder. Your most recently selected folder is used again the next time Torque opens.
        </p>
        <label className="settings-row settings-row--preference">
          <span className="settings-row__icon" aria-hidden="true"><Play size={16} /></span>
          <span className="settings-row__copy">
            <strong>Resume unfinished on launch</strong>
            <span>Start unfinished torrents automatically when Torque opens.</span>
          </span>
          <input
            className="settings-row__toggle"
            type="checkbox"
            checked={preferences.resumeUnfinishedOnStartup}
            disabled={savingPreference}
            onChange={(event) => void onPreferencesChange({ resumeUnfinishedOnStartup: event.currentTarget.checked })}
            aria-label="Resume unfinished downloads on launch"
          />
        </label>
        <label className="settings-row settings-row--preference">
          <span className="settings-row__icon" aria-hidden="true"><Sparkles size={16} /></span>
          <span className="settings-row__copy">
            <strong>Start downloads automatically</strong>
            <span>New torrents enter the queue ready to download.</span>
          </span>
          <input
            className="settings-row__toggle"
            type="checkbox"
            checked={preferences.startDownloadsAutomatically}
            disabled={savingPreference}
            onChange={(event) => void onPreferencesChange({ startDownloadsAutomatically: event.currentTarget.checked })}
            aria-label="Start downloads automatically"
          />
        </label>
        {error && <p className="settings-dialog__error" role="alert">{error}</p>}
        {savingPreference && <p className="settings-dialog__saving" role="status">Saving preferences…</p>}
      </section>

      <section className="settings-section" aria-labelledby="settings-appearance-heading">
        <h3 id="settings-appearance-heading">Appearance</h3>
        <div className="settings-row">
          <span className="settings-row__icon" aria-hidden="true"><Monitor size={16} /></span>
          <label className="settings-row__copy" htmlFor="settings-theme">
            <strong>Theme</strong>
            <span>Choose how Torque looks on this device.</span>
          </label>
          <select
            id="settings-theme"
            className="settings-theme-select"
            value={preferences.theme}
            disabled={savingPreference}
            onChange={(event) => void onPreferencesChange({ theme: event.currentTarget.value as ThemePreference })}
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
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
