import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  Download,
  FolderDown,
  HardDrive,
  Monitor,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Upload,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import type { AppInfo, AppPreferences, ThemePreference, UpdatePreferences } from "../../lib/desktop";
import type { UpdateInfo } from "../../lib/updateService";

interface SettingsDialogProps {
  appInfo: AppInfo | null;
  downloadDirectoryPath?: string;
  error?: string;
  preferences: AppPreferences;
  savingPreference: boolean;
  selectingDirectory: boolean;
  onChooseDirectory: () => Promise<boolean>;
  onPreferencesChange: (changes: Partial<AppPreferences>) => Promise<void>;
  onUpdatePreferencesChange: (changes: Partial<UpdatePreferences>) => Promise<void>;
  updateInfo: UpdateInfo;
  updateCheckResult: "idle" | "up-to-date" | "available" | "skipped";
  onCheckForUpdates: () => Promise<UpdateInfo>;
  onDownloadUpdate: () => Promise<UpdateInfo>;
  onInstallUpdate: () => Promise<UpdateInfo>;
  onRestartApplication: () => Promise<void>;
  onDeferUpdate: () => Promise<void>;
  onSkipUpdate: () => Promise<void>;
  onClose: () => void;
}

type RateUnit = "kb" | "mb";

function currentRate(value: number | null): { amount: string; unit: RateUnit } {
  if (value === null) return { amount: "", unit: "kb" };
  if (value >= 1024 * 1024 && value % (1024 * 1024) === 0) {
    return { amount: String(value / (1024 * 1024)), unit: "mb" };
  }
  return { amount: String(value / 1024), unit: "kb" };
}

function RateLimitSetting({
  label,
  icon,
  value,
  disabled,
  onChange,
}: {
  label: string;
  icon: "download" | "upload";
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => Promise<void>;
}) {
  const initial = currentRate(value);
  const [amount, setAmount] = useState(initial.amount);
  const [unit, setUnit] = useState<RateUnit>(initial.unit);
  const [mode, setMode] = useState(value === null ? "unlimited" : "custom");
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const next = currentRate(value);
    setAmount(next.amount);
    setUnit(next.unit);
    setMode(value === null ? "unlimited" : "custom");
  }, [value]);

  async function commit(nextAmount = amount, nextUnit = unit) {
    setInvalid(false);
    const parsed = Number(nextAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setInvalid(true);
      return;
    }
    const multiplier = nextUnit === "mb" ? 1024 * 1024 : 1024;
    const bytesPerSecond = Math.round(parsed * multiplier);
    if (bytesPerSecond > 0xffff_ffff) {
      setInvalid(true);
      return;
    }
    await onChange(bytesPerSecond);
  }

  const Icon = icon === "download" ? Zap : Upload;

  return (
    <div className="settings-rate-row">
      <span className="settings-row__icon" aria-hidden="true"><Icon size={16} /></span>
      <div className="settings-row__copy">
        <strong>{label} limit</strong>
        <span>Applies across the torrent session.</span>
      </div>
      <div className="settings-rate-control">
        <select
          className="settings-theme-select"
          value={mode}
          disabled={disabled}
          aria-label={`${label} limit mode`}
          onChange={(event) => {
            const nextMode = event.currentTarget.value;
            setMode(nextMode);
            if (nextMode === "unlimited") void onChange(null);
            else if (!amount) {
              setAmount("1");
              void commit("1", unit);
            }
          }}
        >
          <option value="unlimited">Unlimited</option>
          <option value="custom">Custom</option>
        </select>
        {mode === "custom" && (
          <>
            <input
              className={`settings-number-input${invalid ? " is-invalid" : ""}`}
              type="number"
              min="0.01"
              step="any"
              value={amount}
              disabled={disabled}
              aria-label={`${label} limit amount`}
              aria-invalid={invalid}
              onChange={(event) => setAmount(event.currentTarget.value)}
              onBlur={() => void commit()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <select
              className="settings-unit-select"
              value={unit}
              disabled={disabled}
              aria-label={`${label} limit unit`}
              onChange={(event) => {
                const nextUnit = event.currentTarget.value as RateUnit;
                setUnit(nextUnit);
                void commit(amount, nextUnit);
              }}
            >
              <option value="kb">KB/s</option>
              <option value="mb">MB/s</option>
            </select>
          </>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** unitIndex;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: amount >= 100 ? 0 : 1 })} ${units[unitIndex]}`;
}

function publishDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function lastCheckDate(value: number | null): string {
  if (value === null) return "Never";
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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
  onUpdatePreferencesChange,
  updateInfo,
  updateCheckResult,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onRestartApplication,
  onDeferUpdate,
  onSkipUpdate,
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

  const update = (change: Partial<AppPreferences>) => void onPreferencesChange(change);
  const updateSettings = (change: Partial<UpdatePreferences>) => void onUpdatePreferencesChange(change);
  const approximateBytes = updateInfo.totalBytes ?? updateInfo.approximateDownloadBytes;
  const shownProgress = updateInfo.progress ?? (
    updateInfo.totalBytes && updateInfo.totalBytes > 0
      ? Math.min(100, Math.round((updateInfo.downloadedBytes / updateInfo.totalBytes) * 100))
      : null
  );
  const isSkipped = updateInfo.newVersion !== null && preferences.updates.skippedVersion === updateInfo.newVersion;
  const isDeferred = updateInfo.newVersion !== null && preferences.updates.deferredVersion === updateInfo.newVersion;

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
          <p>Manage downloads, appearance, and application updates.</p>
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
            <strong>Default download location</strong>
            <span title={downloadDirectoryPath ?? appInfo?.defaultDownloadDirectory ?? undefined}>
              {downloadDirectoryPath || appInfo?.defaultDownloadDirectory || "System Downloads"}
            </span>
          </div>
          <button className="text-button" type="button" disabled={selectingDirectory} onClick={() => void onChooseDirectory()}>
            {selectingDirectory ? "Choosing…" : "Change"}
          </button>
        </div>
        <ToggleRow icon={<FolderDown size={16} />} title="Ask for destination every time" description="Choose a folder before inspecting each new torrent." checked={preferences.askForDestinationEveryTime} disabled={savingPreference} onChange={(checked) => update({ askForDestinationEveryTime: checked })} />
        <ToggleRow icon={<Play size={16} />} title="Start downloads automatically" description="Start new torrents when a download slot is available." checked={preferences.startDownloadsAutomatically} disabled={savingPreference} onChange={(checked) => update({ startDownloadsAutomatically: checked })} />
        <ToggleRow icon={<Pause size={16} />} title="Resume on launch" description="Continue unfinished downloads when Torque opens." checked={preferences.resumeUnfinishedOnStartup} disabled={savingPreference} onChange={(checked) => update({ resumeUnfinishedOnStartup: checked })} />
        <NumberRow title="Maximum simultaneous downloads" description="Additional torrents wait in the queue." value={preferences.maximumSimultaneousDownloads} min={1} max={64} disabled={savingPreference} onCommit={(value) => update({ maximumSimultaneousDownloads: value })} />
        <ToggleRow icon={<ShieldCheck size={16} />} title="Confirm before removing" description="Ask before removing a torrent from Torque." checked={preferences.confirmBeforeRemovingTorrent} disabled={savingPreference} onChange={(checked) => update({ confirmBeforeRemovingTorrent: checked })} />
        <ToggleRow icon={<ShieldCheck size={16} />} title="Confirm before deleting files" description="Require an extra confirmation before removing downloaded data." checked={preferences.confirmBeforeDeletingFiles} disabled={savingPreference} onChange={(checked) => update({ confirmBeforeDeletingFiles: checked })} />
        <ToggleRow icon={<Sparkles size={16} />} title="Keep Torque in the system tray" description="Closing the window hides Torque; use the tray menu to show or quit." checked={preferences.minimizeToTray} disabled={savingPreference} onChange={(checked) => update({ minimizeToTray: checked })} />
      </section>

      <section className="settings-section" aria-labelledby="settings-bandwidth-heading">
        <h3 id="settings-bandwidth-heading">Bandwidth</h3>
        <RateLimitSetting label="Download" icon="download" value={preferences.downloadLimitBytesPerSecond} disabled={savingPreference} onChange={(value) => onPreferencesChange({ downloadLimitBytesPerSecond: value })} />
        <RateLimitSetting label="Upload" icon="upload" value={preferences.uploadLimitBytesPerSecond} disabled={savingPreference} onChange={(value) => onPreferencesChange({ uploadLimitBytesPerSecond: value })} />
        <p className="settings-section__note">Global limits cap all torrents together. Per-torrent limits can tighten an individual transfer; the stricter cap governs its speed.</p>
      </section>

      {error && <p className="settings-dialog__error" role="alert">{error}</p>}
      {savingPreference && <p className="settings-dialog__saving" role="status">Saving preferences…</p>}

      <section className="settings-section" aria-labelledby="settings-appearance-heading">
        <h3 id="settings-appearance-heading">Appearance</h3>
        <div className="settings-row">
          <span className="settings-row__icon" aria-hidden="true"><Monitor size={16} /></span>
          <label className="settings-row__copy" htmlFor="settings-theme">
            <strong>Theme</strong>
            <span>Choose how Torque looks on this device.</span>
          </label>
          <select id="settings-theme" className="settings-theme-select" value={preferences.theme} disabled={savingPreference} onChange={(event) => update({ theme: event.currentTarget.value as ThemePreference })}>
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
      </section>

      <section className="settings-section settings-update-section" aria-labelledby="settings-updates-heading">
        <h3 id="settings-updates-heading">Updates</h3>
        <div className="settings-row">
          <span className="settings-row__icon" aria-hidden="true"><RefreshCw size={16} /></span>
          <div className="settings-row__copy">
            <strong>Current version</strong>
            <span>v{appInfo?.version ?? updateInfo.currentVersion}</span>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-row__icon" aria-hidden="true"><Sparkles size={16} /></span>
          <div className="settings-row__copy">
            <strong>Update channel</strong>
            <span>Updates are provided from Torque’s stable GitHub Releases channel.</span>
          </div>
          <span className="settings-update__badge">Stable</span>
        </div>
        <ToggleRow icon={<RefreshCw size={16} />} title="Check automatically" description="Check shortly after launch when the interval is due." checked={preferences.updates.automaticCheckEnabled} disabled={savingPreference} onChange={(checked) => updateSettings({ automaticCheckEnabled: checked })} />
        <div className="settings-row">
          <span className="settings-row__icon" aria-hidden="true"><Monitor size={16} /></span>
          <label className="settings-row__copy" htmlFor="settings-update-frequency">
            <strong>Check frequency</strong>
            <span>Last successful check: {lastCheckDate(preferences.updates.lastSuccessfulCheckAt)}</span>
          </label>
          <select
            id="settings-update-frequency"
            className="settings-theme-select"
            value={preferences.updates.checkFrequencyHours}
            disabled={savingPreference}
            onChange={(event) => updateSettings({ checkFrequencyHours: Number(event.currentTarget.value) })}
          >
            <option value={6}>Every 6 hours</option>
            <option value={12}>Every 12 hours</option>
            <option value={24}>Every 24 hours</option>
            <option value={168}>Every week</option>
          </select>
        </div>
        <ToggleRow icon={<Download size={16} />} title="Automatic download" description="Download verified updates in the background when available." checked={preferences.updates.automaticDownload} disabled={savingPreference} onChange={(checked) => updateSettings({ automaticDownload: checked })} />
        <div className="settings-row">
          <span className="settings-row__icon" aria-hidden="true"><ShieldCheck size={16} /></span>
          <div className="settings-row__copy">
            <strong>Install behavior</strong>
            <span>Torque always asks before installing an update.</span>
          </div>
          <select className="settings-theme-select" aria-label="Install behavior" defaultValue="ask" disabled title="Torque always asks before installing an update.">
            <option value="ask">Ask before installing</option>
          </select>
        </div>

        <div className="settings-update__check-row">
          <button
            className="text-button settings-update__check"
            type="button"
            disabled={updateInfo.checking || updateInfo.downloading || updateInfo.installing || savingPreference}
            onClick={() => void onCheckForUpdates()}
          >
            <RefreshCw size={14} className={updateInfo.checking ? "settings-update__spin" : undefined} aria-hidden="true" />
            {updateInfo.checking ? "Checking for updates…" : "Check for Updates"}
          </button>
          {preferences.updates.lastSuccessfulCheckAt !== null && <span className="settings-update__last-check">Checked {lastCheckDate(preferences.updates.lastSuccessfulCheckAt)}</span>}
        </div>

        {updateInfo.error && (
          <p className={`settings-update__error${updateInfo.errorCategory === "signature" ? " is-critical" : ""}`} role="alert">
            <strong>{updateInfo.errorCategory === "signature" ? "Verification failed" : "Update unavailable"}</strong>
            <span>{updateInfo.error}</span>
            {updateInfo.errorCategory === "signature" && <span>The update remains blocked. There is no option to bypass signature verification.</span>}
          </p>
        )}

        {!updateInfo.error && updateCheckResult === "up-to-date" && !updateInfo.available && (
          <p className="settings-update__result" role="status"><CheckCircle2 size={15} aria-hidden="true" />You’re up to date · Version {appInfo?.version ?? updateInfo.currentVersion}</p>
        )}
        {!updateInfo.error && updateCheckResult === "skipped" && (
          <p className="settings-update__result" role="status">Version {preferences.updates.skippedVersion} is skipped. A newer release will be checked automatically.</p>
        )}

        {(updateInfo.available || updateInfo.restartRequired) && updateInfo.newVersion && (
          <div className="settings-update__details" aria-live="polite">
            <div className="settings-update__heading">
              <strong>{updateInfo.restartRequired ? "Update installed" : "Update Available"}</strong>
              {isDeferred && <span className="settings-update__badge">Deferred</span>}
            </div>
            <p className="settings-update__version">v{updateInfo.currentVersion} <span aria-hidden="true">→</span> v{updateInfo.newVersion}</p>
            <div className="settings-update__metadata">
              {publishDate(updateInfo.releaseDate) && <span>Published {publishDate(updateInfo.releaseDate)}</span>}
              {approximateBytes !== null && <span>Approx. {formatBytes(approximateBytes)}</span>}
            </div>
            {updateInfo.releaseNotes && (
              <div className="settings-update__notes">
                <span>Release notes</span>
                <pre>{updateInfo.releaseNotes}</pre>
              </div>
            )}

            {updateInfo.installing && <p className="settings-update__installing" role="status">Installing update…</p>}
            {updateInfo.downloading && (
              <div className="settings-update__download" role="status" aria-live="polite">
                <div className="settings-update__download-heading">
                  <span>Downloading update…</span>
                  {shownProgress !== null && <strong>{shownProgress}%</strong>}
                </div>
                <div className="settings-update__progress" role="progressbar" aria-label="Update download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shownProgress ?? undefined}>
                  <span style={shownProgress === null ? undefined : { width: `${shownProgress}%` }} />
                </div>
                <span className="settings-update__download-size">{formatBytes(updateInfo.downloadedBytes)} / {approximateBytes === null ? "Size unknown" : formatBytes(approximateBytes)}</span>
              </div>
            )}

            {updateInfo.downloaded && updateInfo.errorCategory !== "signature" && !updateInfo.restartRequired && !updateInfo.installing && (
              <div className="settings-update__ready" role="status">
                <strong>Update ready to install</strong>
                <div className="settings-update__actions">
                  <button className="primary-button" type="button" disabled={savingPreference} onClick={() => void onInstallUpdate()}>Restart &amp; Update</button>
                  <button className="text-button" type="button" onClick={() => void onDeferUpdate()}>Install Later</button>
                </div>
              </div>
            )}

            {!updateInfo.downloaded && !updateInfo.downloading && !updateInfo.installing && !updateInfo.restartRequired && (
              <div className="settings-update__actions">
                <button className="primary-button" type="button" disabled={updateInfo.checking || savingPreference} onClick={() => void onDownloadUpdate()}>
                  <Download size={14} aria-hidden="true" /> Download Update
                </button>
                <button className="text-button" type="button" onClick={() => void onDeferUpdate()}>Later</button>
              </div>
            )}
            {updateInfo.restartRequired && (
              <div className="settings-update__ready" role="status">
                <strong>Update installed. Restart Torque to finish applying it.</strong>
                <button className="primary-button" type="button" onClick={() => void onRestartApplication()}>Restart Torque</button>
              </div>
            )}
            {!isSkipped && !updateInfo.downloading && !updateInfo.downloaded && !updateInfo.restartRequired && (
              <button className="text-button settings-update__skip" type="button" onClick={() => void onSkipUpdate()}>Skip This Version</button>
            )}
          </div>
        )}
        <p className="settings-section__note">Updates are verified with Torque’s embedded signing key before installation. Release notes are shown as plain text.</p>
      </section>

      <section className="settings-section" aria-labelledby="settings-app-heading">
        <h3 id="settings-app-heading">Application</h3>
        <div className="settings-row">
          <span className="settings-row__icon" aria-hidden="true"><Monitor size={16} /></span>
          <div className="settings-row__copy">
            <strong>Torque desktop</strong>
            <span>{appInfo ? `Version ${appInfo.version} · ${appInfo.platform}` : "Desktop runtime unavailable"}</span>
          </div>
          {appInfo ? <Check className="settings-row__ready" size={15} aria-label="Connected" /> : <HardDrive className="settings-row__offline" size={15} aria-hidden="true" />}
        </div>
      </section>
    </dialog>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-row settings-row--preference">
      <span className="settings-row__icon" aria-hidden="true">{icon}</span>
      <span className="settings-row__copy"><strong>{title}</strong><span>{description}</span></span>
      <input className="settings-row__toggle" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} aria-label={title} />
    </label>
  );
}

function NumberRow({
  title,
  description,
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <div className="settings-row">
      <span className="settings-row__icon" aria-hidden="true"><Zap size={16} /></span>
      <div className="settings-row__copy"><strong>{title}</strong><span>{description}</span></div>
      <input className="settings-number-input settings-number-input--compact" type="number" min={min} max={max} value={draft} disabled={disabled} aria-label={title} onChange={(event) => setDraft(event.currentTarget.value)} onBlur={() => {
        const parsed = Number(draft);
        if (Number.isInteger(parsed) && parsed >= min && parsed <= max) onCommit(parsed);
        else setDraft(String(value));
      }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    </div>
  );
}
