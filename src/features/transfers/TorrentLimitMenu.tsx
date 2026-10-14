import { useEffect, useState } from "react";
import { ChevronDown, Gauge, Upload } from "lucide-react";
import type { TorrentBandwidthDirection } from "../../lib/desktop";

const KIB = 1024;
const MIB = 1024 * 1024;
const QUICK_LIMITS = [
  { label: "Unlimited", value: null },
  { label: "256 KB/s", value: 256 * KIB },
  { label: "1 MB/s", value: MIB },
  { label: "5 MB/s", value: 5 * MIB },
  { label: "10 MB/s", value: 10 * MIB },
] as const;

function limitLabel(value: number | null): string {
  if (value === null) return "Unlimited";
  const quick = QUICK_LIMITS.find((option) => option.value === value);
  if (quick) return quick.label;
  const amount = value >= MIB ? value / MIB : value / KIB;
  return `${Number(amount.toFixed(2))} ${value >= MIB ? "MB/s" : "KB/s"}`;
}

function customRate(value: number | null): { amount: string; unit: "kb" | "mb" } {
  if (value !== null && value >= MIB) return { amount: String(Number((value / MIB).toFixed(3))), unit: "mb" };
  return { amount: value === null ? "1" : String(Number((value / KIB).toFixed(3))), unit: "kb" };
}

export function TorrentLimitMenu({
  direction,
  torrentId,
  value,
  disabled,
  onSetLimit,
}: {
  direction: TorrentBandwidthDirection;
  torrentId: number;
  value: number | null;
  disabled: boolean;
  onSetLimit: (torrentId: number, direction: TorrentBandwidthDirection, value: number | null) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const initial = customRate(value);
  const [amount, setAmount] = useState(initial.amount);
  const [unit, setUnit] = useState<"kb" | "mb">(initial.unit);
  const isCustom = value !== null && !QUICK_LIMITS.some((option) => option.value === value);
  const title = direction === "download" ? "Download limit" : "Upload limit";
  const Icon = direction === "download" ? Gauge : Upload;
  const customBytes = Math.round(Number(amount) * (unit === "mb" ? MIB : KIB));
  const customError = !Number.isFinite(customBytes) || customBytes <= 0
    ? "Enter a positive speed."
    : customBytes > 0xffff_ffff
      ? "The maximum supported rate is about 4,096 MB/s."
      : null;

  useEffect(() => {
    const next = customRate(value);
    setAmount(next.amount);
    setUnit(next.unit);
  }, [value]);

  async function choose(nextValue: number | null) {
    if (await onSetLimit(torrentId, direction, nextValue)) {
      setExpanded(false);
      setCustomOpen(false);
    }
  }

  async function applyCustom() {
    if (customError) return;
    await choose(customBytes);
  }

  return (
    <div className="torrent-limit-menu">
      <button
        type="button"
        role="menuitem"
        aria-expanded={expanded}
        disabled={disabled}
        onClick={() => setExpanded((open) => !open)}
      >
        <Icon size={13} aria-hidden="true" />
        <span>{title}<small>{limitLabel(value)}</small></span>
        <ChevronDown className="torrent-limit-menu__chevron" size={13} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="torrent-limit-menu__options" role="group" aria-label={title}>
          {QUICK_LIMITS.map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              disabled={disabled}
              onClick={() => void choose(option.value)}
            >
              <span>{option.label}</span>
              {value === option.value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={isCustom}
            disabled={disabled}
            onClick={() => setCustomOpen((open) => !open)}
          >
            <span>Custom…</span>
            {isCustom && <span aria-hidden="true">✓</span>}
          </button>
          {customOpen && (
            <div className="torrent-limit-menu__custom">
              <input
                type="number"
                min="0.01"
                step="any"
                value={amount}
                aria-label={`${title} custom amount`}
                disabled={disabled}
                onChange={(event) => setAmount(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void applyCustom();
                }}
              />
              <select value={unit} aria-label={`${title} custom unit`} disabled={disabled} onChange={(event) => setUnit(event.currentTarget.value as "kb" | "mb")}>
                <option value="kb">KB/s</option>
                <option value="mb">MB/s</option>
              </select>
              <button type="button" disabled={disabled || Boolean(customError)} onClick={() => void applyCustom()}>
                Apply
              </button>
              {customError && <small className="torrent-limit-menu__error" role="alert">{customError}</small>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
