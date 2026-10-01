const MAX_MAGNET_LENGTH = 8_192;
const MAX_URL_LENGTH = 4_096;

function isSupportedInfoHash(value: string): boolean {
  const normalized = value.toLowerCase();
  return /^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/.test(normalized)
    || /^urn:btmh:1220[a-f0-9]{64}$/.test(normalized);
}

export function validateMagnetUri(input: string): string | null {
  const value = input.trim();
  if (!value) return "Paste a magnet link to continue.";
  if (value.length > MAX_MAGNET_LENGTH) return "This magnet link is too long.";
  if (!value.startsWith("magnet:?")) return "A magnet link must start with magnet:?.";

  const infoHashes = new URLSearchParams(value.slice(value.indexOf("?") + 1)).getAll("xt");
  if (!infoHashes.some(isSupportedInfoHash)) {
    return "This magnet link needs a valid BitTorrent info hash (xt=urn:btih:…).";
  }
  return null;
}

export function validateTorrentUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return "Enter an HTTP or HTTPS link to a .torrent file.";
  if (value.length > MAX_URL_LENGTH) return "This torrent URL is too long.";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a complete, valid URL.";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Torrent URLs must use HTTP or HTTPS.";
  }
  if (!url.hostname) return "Include a host name in the torrent URL.";
  if (url.username || url.password) {
    return "Remove the username and password from the torrent URL.";
  }
  return null;
}
