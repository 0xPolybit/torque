export const SITE_NAME = "Torque";
export const SITE_DESCRIPTION = "A thoughtful desktop BitTorrent client. Inspect every file before you download.";
export const GITHUB_REPOSITORY = "https://github.com/0xPolybit/torque";
export const GITHUB_RELEASES = `${GITHUB_REPOSITORY}/releases`;

export const ROUTES = {
  home: "/",
  features: "/features",
  download: "/download",
  docs: "/docs",
  changelog: "/changelog",
  about: "/about",
} as const;

export function slugifyHeading(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do { value /= 1000; unit += 1; } while (value >= 1000 && unit < units.length - 1);
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: value >= 10 ? 0 : 1 }).format(value)} ${units[unit]}`;
}

export function formatRate(value: number): string {
  return `${formatBytes(value)}/s`;
}
