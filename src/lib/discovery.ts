import { invoke } from "@tauri-apps/api/core";

export type SearchProviderHealthState =
  | "unknown"
  | "healthy"
  | "degraded"
  | "unavailable"
  | "rate_limited";

export interface SearchProviderHealth {
  state: SearchProviderHealthState;
  message: string | null;
  retryAfterSeconds: number | null;
}

export interface SearchProviderCapabilities {
  search: boolean;
  pagination: boolean;
  details: boolean;
  magnetLinks: boolean;
  torrentFiles: boolean;
  categories: string[];
}

export interface SearchProviderInfo {
  id: string;
  name: string;
  icon: string;
  capabilities: SearchProviderCapabilities;
  health: SearchProviderHealth;
}

export type SearchCategory = "software" | "datasets" | "media";

export interface SearchFilters {
  category: SearchCategory | null;
}

export interface TorrentSearchResult {
  provider: string;
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  sizeBytes: number | null;
  seeders: number | null;
  leechers: number | null;
  publishedAt: string | null;
  magnetUri: string | null;
  torrentUrl: string | null;
  sourcePage: string;
  license: string | null;
  verified: boolean | null;
}

export interface TorrentSearchDetails {
  result: TorrentSearchResult;
  creator: string | null;
  subjects: string[];
  torrentAvailable: boolean;
}

export type TorrentDownloadSource =
  | { kind: "magnet"; value: string }
  | { kind: "torrentUrl"; value: string };

export interface SearchProviderStatus {
  providerId: string;
  health: SearchProviderHealth;
}

export interface TorrentSearchResponse {
  query: string;
  page: number;
  pageSize: number;
  results: TorrentSearchResult[];
  providers: SearchProviderStatus[];
  hasMore: boolean;
  cancelled: boolean;
}

export function getSearchProviders(): Promise<SearchProviderInfo[]> {
  return invoke<SearchProviderInfo[]>("get_search_providers");
}

export function refreshSearchProviderHealth(): Promise<SearchProviderInfo[]> {
  return invoke<SearchProviderInfo[]>("refresh_search_provider_health");
}

export function searchTorrents(
  searchId: string,
  query: string,
  page: number,
  filters: SearchFilters,
): Promise<TorrentSearchResponse> {
  return invoke<TorrentSearchResponse>("search_torrents", {
    searchId,
    query,
    page,
    filters,
  });
}

export function cancelTorrentSearch(searchId: string): Promise<boolean> {
  return invoke<boolean>("cancel_torrent_search", { searchId });
}

export function getTorrentSearchDetails(
  providerId: string,
  resultId: string,
): Promise<TorrentSearchDetails> {
  return invoke<TorrentSearchDetails>("get_torrent_search_details", {
    providerId,
    resultId,
  });
}

export function getTorrentSearchSource(
  providerId: string,
  resultId: string,
): Promise<TorrentDownloadSource> {
  return invoke<TorrentDownloadSource>("get_torrent_search_source", {
    providerId,
    resultId,
  });
}
