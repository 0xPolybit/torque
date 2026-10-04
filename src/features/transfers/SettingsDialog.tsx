import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  FolderDown,
  HardDrive,
  Monitor,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";
import type { AppInfo, AppPreferences, ThemePreference } from "../../lib/desktop";

interface SettingsDialogProps {
  appInfo: AppInfo | null;
  downloadDirectoryPath?: string;
  error?: string;
  preferences: AppPreferences;
  savingPreference: boolean;
  selectingDirectory: boolean;
  onChooseDirectory: () => Promise<boolean>;
  onPreferencesChange: (changes: Partial<AppPreferences>) => Promise<void>;
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

  const update = (change: Partial<AppPreferences>) => void onPreferencesChange(change);

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
          <p>Set how Torque schedules and handles your downloads.</p>
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
        <p className="settings-section__note">Limits use librqbit’s session-wide rate limiter and apply to all torrents together.</p>
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
