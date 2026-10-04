use std::time::Duration;

use async_trait::async_trait;
use reqwest::{header, Client, RequestBuilder, Response, StatusCode};
use serde::Deserialize;
use serde_json::Value;
use tokio_util::sync::CancellationToken;
use url::Url;

use super::{
    ProviderError, SearchFilters, SearchProvider, SearchProviderCapabilities, SearchProviderPage,
    TorrentDownloadSource, TorrentSearchDetails, TorrentSearchResult,
};

const SEARCH_URL: &str = "https://archive.org/advancedsearch.php";
const METADATA_ROOT: &str = "https://archive.org/metadata";
const ITEM_ROOT: &str = "https://archive.org/details";
const PAGE_SIZE_LIMIT: u32 = 24;
const OPEN_LICENSES: [&str; 3] = [
    "creativecommons.org/publicdomain/zero/1.0",
    "creativecommons.org/licenses/by/4.0",
    "creativecommons.org/licenses/by-sa/4.0",
];

pub struct InternetArchiveProvider {
    client: Client,
}

impl InternetArchiveProvider {
    pub fn new() -> Self {
        let user_agent = format!(
            "Torque/{} (+https://github.com/0xPolybit/torque; authorized open-content discovery)",
            env!("CARGO_PKG_VERSION")
        );
        let client = Client::builder()
            .user_agent(user_agent)
            .timeout(Duration::from_secs(12))
            .build()
            .expect("the Internet Archive HTTP client configuration is valid");
        Self { client }
    }

    fn search_query(query: &str, filters: &SearchFilters) -> String {
        let phrase = escape_lucene_phrase(query);
        let media_types = match filters.category.as_deref() {
            Some("software") => "mediatype:software",
            Some("datasets") => "mediatype:data",
            Some("media") => "(mediatype:movies OR mediatype:audio)",
            _ => "(mediatype:software OR mediatype:data OR mediatype:movies OR mediatype:audio)",
        };
        let licenses = OPEN_LICENSES
            .iter()
            .flat_map(|license| {
                ["https", "http"]
                    .into_iter()
                    .map(move |scheme| format!("licenseurl:\"{scheme}://{license}/\""))
            })
            .collect::<Vec<_>>()
            .join(" OR ");
        format!("({phrase}) AND ({media_types}) AND ({licenses})")
    }

    async fn send_json<T: serde::de::DeserializeOwned>(
        &self,
        request: RequestBuilder,
        cancellation: CancellationToken,
    ) -> Result<T, ProviderError> {
        let response = tokio::select! {
            _ = cancellation.cancelled() => return Err(ProviderError::Cancelled),
            response = request.send() => response.map_err(|error| ProviderError::Network(error.to_string()))?,
        };
        let response = check_response(response)?;
        tokio::select! {
            _ = cancellation.cancelled() => Err(ProviderError::Cancelled),
            result = response.json::<T>() => result.map_err(|error| ProviderError::InvalidResponse(error.to_string())),
        }
    }

    async fn item_metadata(
        &self,
        result_id: &str,
        cancellation: CancellationToken,
    ) -> Result<ArchiveMetadataResponse, ProviderError> {
        if !valid_archive_identifier(result_id) {
            return Err(ProviderError::UnsupportedItem(
                "The Archive item identifier is invalid.".to_string(),
            ));
        }
        let mut url = Url::parse(METADATA_ROOT)
            .map_err(|error| ProviderError::InvalidResponse(error.to_string()))?;
        url.path_segments_mut()
            .map_err(|_| ProviderError::InvalidResponse("Invalid metadata endpoint.".to_string()))?
            .push(result_id);
        let response: ArchiveMetadataResponse =
            self.send_json(self.client.get(url), cancellation).await?;
        if let Some(error) = response.error.as_deref() {
            return Err(ProviderError::UnsupportedItem(error.to_string()));
        }
        Ok(response)
    }
}

impl Default for InternetArchiveProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SearchProvider for InternetArchiveProvider {
    fn id(&self) -> &'static str {
        "internet-archive"
    }

    fn name(&self) -> &'static str {
        "Internet Archive · open-licensed"
    }

    fn icon(&self) -> &'static str {
        "archive"
    }

    fn capabilities(&self) -> SearchProviderCapabilities {
        SearchProviderCapabilities {
            search: true,
            pagination: true,
            details: true,
            magnet_links: false,
            torrent_files: true,
            categories: vec![
                "software".to_string(),
                "datasets".to_string(),
                "media".to_string(),
            ],
        }
    }

    async fn search(
        &self,
        query: &str,
        page: u32,
        page_size: u32,
        filters: &SearchFilters,
        cancellation: CancellationToken,
    ) -> Result<SearchProviderPage, ProviderError> {
        let per_page = page_size.clamp(1, PAGE_SIZE_LIMIT);
        let query = Self::search_query(query, filters);
        let fields = [
            "identifier",
            "title",
            "description",
            "mediatype",
            "date",
            "publicdate",
            "licenseurl",
            "item_size",
        ];
        let mut query_params: Vec<(String, String)> = vec![
            ("q".to_string(), query),
            ("output".to_string(), "json".to_string()),
            ("rows".to_string(), per_page.to_string()),
            ("page".to_string(), page.to_string()),
            ("sort[]".to_string(), "downloads desc".to_string()),
        ];
        query_params.extend(
            fields
                .iter()
                .map(|field| ("fl[]".to_string(), (*field).to_string())),
        );

        let response: ArchiveSearchResponse = self
            .send_json(
                self.client.get(SEARCH_URL).query(&query_params),
                cancellation,
            )
            .await?;
        let response = response.response;
        let results = response
            .docs
            .into_iter()
            .filter_map(normalize_search_doc)
            .collect::<Vec<_>>();
        let total = response.num_found;
        let has_more = total
            .map(|count| u64::from(page) * u64::from(per_page) < count)
            .unwrap_or(results.len() == per_page as usize);

        Ok(SearchProviderPage {
            results,
            total_results: total,
            has_more,
        })
    }

    async fn get_details(
        &self,
        result_id: &str,
        cancellation: CancellationToken,
    ) -> Result<TorrentSearchDetails, ProviderError> {
        let metadata = self.item_metadata(result_id, cancellation).await?;
        let license = metadata.metadata.license_url();
        if !is_allowed_license(license.as_deref()) {
            return Err(ProviderError::UnsupportedItem(
                "The item does not declare a supported open license.".to_string(),
            ));
        }
        let media_type = metadata.metadata.text("mediatype");
        let category = category_for_media_type(media_type.as_deref()).ok_or_else(|| {
            ProviderError::UnsupportedItem("Unsupported item category.".to_string())
        })?;
        let torrent_url = metadata
            .archive_torrent_name(result_id)
            .and_then(|name| archive_torrent_url(result_id, &name));
        let result = TorrentSearchResult {
            provider: self.id().to_string(),
            id: result_id.to_string(),
            title: metadata
                .metadata
                .text("title")
                .unwrap_or_else(|| result_id.to_string()),
            description: metadata
                .metadata
                .text("description")
                .map(|text| truncate(text, 500)),
            category: Some(category.to_string()),
            size_bytes: metadata
                .metadata
                .value_u64("item_size")
                .or_else(|| metadata.metadata.value_u64("size")),
            seeders: None,
            leechers: None,
            published_at: metadata
                .metadata
                .text("publicdate")
                .or_else(|| metadata.metadata.text("date")),
            magnet_uri: None,
            torrent_url,
            source_page: archive_item_page(result_id),
            license,
            verified: None,
        };
        let creator = metadata
            .metadata
            .text("creator")
            .map(|text| truncate(text, 180));
        let subjects = metadata.metadata.strings("subject");
        let torrent_available = result.torrent_url.is_some();

        Ok(TorrentSearchDetails {
            result,
            creator,
            subjects,
            torrent_available,
        })
    }

    async fn get_download_source(
        &self,
        result_id: &str,
        cancellation: CancellationToken,
    ) -> Result<TorrentDownloadSource, ProviderError> {
        let details = self.get_details(result_id, cancellation).await?;
        details
            .result
            .torrent_url
            .map(TorrentDownloadSource::TorrentUrl)
            .ok_or_else(|| {
                ProviderError::UnsupportedItem(
                    "The Archive item does not publish a torrent file.".to_string(),
                )
            })
    }

    async fn health_check(&self) -> Result<(), ProviderError> {
        let response = self
            .send_json::<ArchiveSearchResponse>(
                self.client.get(SEARCH_URL).query(&[
                    ("q", "mediatype:software"),
                    ("output", "json"),
                    ("rows", "1"),
                ]),
                CancellationToken::new(),
            )
            .await?;
        if response.response.docs.is_empty() && response.response.num_found.is_none() {
            return Err(ProviderError::InvalidResponse(
                "Search endpoint returned no response metadata.".to_string(),
            ));
        }
        Ok(())
    }
}

fn check_response(response: Response) -> Result<Response, ProviderError> {
    let status = response.status();
    if status == StatusCode::TOO_MANY_REQUESTS {
        let retry_after = response
            .headers()
            .get(header::RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        return Err(ProviderError::RateLimited(retry_after));
    }
    if !status.is_success() {
        return Err(ProviderError::HttpStatus(status.as_u16()));
    }
    Ok(response)
}

fn escape_lucene_phrase(input: &str) -> String {
    let escaped = input
        .chars()
        .filter(|character| !character.is_control())
        .flat_map(|character| match character {
            '\\' | '"' => vec!['\\', character],
            _ => vec![character],
        })
        .collect::<String>();
    format!("\"{escaped}\"")
}

fn normalize_search_doc(doc: ArchiveSearchDoc) -> Option<TorrentSearchResult> {
    let license = doc.license_url.as_ref().and_then(value_text);
    if !is_allowed_license(license.as_deref()) {
        return None;
    }
    let id = doc.identifier?.trim().to_string();
    if !valid_archive_identifier(&id) {
        return None;
    }
    let category = category_for_media_type(doc.media_type.as_deref())?;
    Some(TorrentSearchResult {
        provider: "internet-archive".to_string(),
        source_page: archive_item_page(&id),
        id,
        title: doc.title.as_ref().and_then(value_text).unwrap_or_default(),
        description: doc
            .description
            .as_ref()
            .and_then(value_text)
            .map(|text| truncate(text, 500)),
        category: Some(category.to_string()),
        size_bytes: doc.item_size.and_then(value_u64),
        seeders: None,
        leechers: None,
        published_at: doc
            .public_date
            .as_ref()
            .and_then(value_text)
            .or_else(|| doc.date.as_ref().and_then(value_text)),
        magnet_uri: None,
        // A torrent URL is filled after the item metadata endpoint confirms the
        // source actually publishes its official archive torrent file.
        torrent_url: None,
        license,
        verified: None,
    })
}

fn is_allowed_license(value: Option<&str>) -> bool {
    let Some(value) = value else {
        return false;
    };
    let normalized = value
        .trim()
        .trim_end_matches('/')
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .to_ascii_lowercase();
    OPEN_LICENSES.iter().any(|license| normalized == *license)
}

fn category_for_media_type(value: Option<&str>) -> Option<&'static str> {
    match value?.trim().to_ascii_lowercase().as_str() {
        "software" => Some("software"),
        "data" => Some("datasets"),
        "movies" | "audio" => Some("media"),
        _ => None,
    }
}

fn valid_archive_identifier(identifier: &str) -> bool {
    !identifier.is_empty()
        && identifier.len() <= 200
        && identifier
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        && identifier != "."
        && identifier != ".."
}

fn archive_item_page(identifier: &str) -> String {
    let mut url = Url::parse(ITEM_ROOT).expect("static Internet Archive page URL is valid");
    url.path_segments_mut()
        .expect("Internet Archive page URL can hold a path")
        .push(identifier);
    url.to_string()
}

fn archive_torrent_url(identifier: &str, file_name: &str) -> Option<String> {
    if !valid_archive_identifier(identifier)
        || file_name.contains('/')
        || file_name.contains('\\')
        || !file_name.ends_with("_archive.torrent")
    {
        return None;
    }
    let mut url = Url::parse("https://archive.org/download").ok()?;
    let mut segments = url.path_segments_mut().ok()?;
    segments.push(identifier).push(file_name);
    drop(segments);
    Some(url.to_string())
}

fn truncate(mut value: String, max_chars: usize) -> String {
    if value.chars().count() > max_chars {
        value = value
            .chars()
            .take(max_chars.saturating_sub(1))
            .collect::<String>();
        value.push('…');
    }
    value
}

fn value_u64(value: Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(string) => string.trim().parse().ok(),
        _ => None,
    }
}

fn value_text(value: &Value) -> Option<String> {
    match value {
        Value::String(string) => Some(string.trim().to_string()).filter(|s| !s.is_empty()),
        Value::Number(number) => Some(number.to_string()),
        Value::Array(items) => Some(
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" · "),
        )
        .filter(|s| !s.is_empty()),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
struct ArchiveSearchResponse {
    response: ArchiveSearchPage,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveSearchPage {
    #[serde(default, rename = "numFound")]
    num_found: Option<u64>,
    #[serde(default)]
    docs: Vec<ArchiveSearchDoc>,
}

#[derive(Debug, Deserialize)]
struct ArchiveSearchDoc {
    identifier: Option<String>,
    title: Option<Value>,
    description: Option<Value>,
    #[serde(rename = "mediatype")]
    media_type: Option<String>,
    date: Option<Value>,
    #[serde(rename = "publicdate")]
    public_date: Option<Value>,
    #[serde(rename = "licenseurl")]
    license_url: Option<Value>,
    #[serde(rename = "item_size")]
    item_size: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct ArchiveMetadataResponse {
    #[serde(default)]
    metadata: ArchiveItemMetadata,
    #[serde(default)]
    files: Vec<ArchiveFile>,
    error: Option<String>,
}

impl ArchiveMetadataResponse {
    fn archive_torrent_name(&self, identifier: &str) -> Option<String> {
        let expected = format!("{identifier}_archive.torrent");
        self.files
            .iter()
            .find(|file| file.name.as_deref() == Some(expected.as_str()))
            .and_then(|file| file.name.clone())
    }
}

#[derive(Debug, Default, Deserialize)]
struct ArchiveItemMetadata {
    #[serde(flatten)]
    fields: std::collections::HashMap<String, Value>,
}

impl ArchiveItemMetadata {
    fn text(&self, key: &str) -> Option<String> {
        let value = self.fields.get(key)?;
        match value {
            Value::String(string) => Some(string.trim().to_string()).filter(|s| !s.is_empty()),
            Value::Array(items) => Some(
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
                    .join(", "),
            )
            .filter(|s| !s.is_empty()),
            _ => None,
        }
    }

    fn strings(&self, key: &str) -> Vec<String> {
        let Some(value) = self.fields.get(key) else {
            return Vec::new();
        };
        match value {
            Value::String(string) => vec![string.trim().to_string()],
            Value::Array(items) => items
                .iter()
                .filter_map(Value::as_str)
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .take(20)
                .collect(),
            _ => Vec::new(),
        }
    }

    fn value_u64(&self, key: &str) -> Option<u64> {
        value_u64(self.fields.get(key)?.clone())
    }

    fn license_url(&self) -> Option<String> {
        self.text("licenseurl")
    }
}

#[derive(Debug, Deserialize)]
struct ArchiveFile {
    name: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_ia_results_and_keeps_only_openly_licensed_categories() {
        let open = serde_json::from_value::<ArchiveSearchDoc>(serde_json::json!({
            "identifier": "demo-linux-image",
            "title": "Demo Linux image",
            "description": "A freely licensed distribution image.",
            "mediatype": "software",
            "date": "2025-04-02",
            "licenseurl": "https://creativecommons.org/licenses/by/4.0/",
            "item_size": "1048576"
        }))
        .expect("deserialize provider payload");
        let normalized = normalize_search_doc(open).expect("supported open item");
        assert_eq!(normalized.provider, "internet-archive");
        assert_eq!(normalized.id, "demo-linux-image");
        assert_eq!(normalized.category.as_deref(), Some("software"));
        assert_eq!(normalized.size_bytes, Some(1_048_576));
        assert_eq!(normalized.seeders, None);
        assert_eq!(normalized.verified, None);
        assert_eq!(normalized.torrent_url, None);

        let closed = serde_json::from_value::<ArchiveSearchDoc>(serde_json::json!({
            "identifier": "closed-item",
            "title": "Closed item",
            "mediatype": "movies",
            "licenseurl": "https://example.org/terms"
        }))
        .expect("deserialize provider payload");
        assert!(normalize_search_doc(closed).is_none());
    }

    #[test]
    fn only_confirmed_archive_torrent_assets_become_download_sources() {
        assert_eq!(
            archive_torrent_url("open_dataset", "open_dataset_archive.torrent").as_deref(),
            Some("https://archive.org/download/open_dataset/open_dataset_archive.torrent")
        );
        assert!(archive_torrent_url("open_dataset", "another.torrent").is_none());
        assert!(archive_torrent_url("open_dataset", "../other_archive.torrent").is_none());
        assert!(archive_torrent_url("../open_dataset", "open_dataset_archive.torrent").is_none());
    }

    #[test]
    fn search_query_escapes_input_and_filters_categories_and_licenses() {
        let query = InternetArchiveProvider::search_query(
            "Linux \"image\"",
            &SearchFilters {
                category: Some("software".to_string()),
            },
        );
        assert!(query.contains("\\\"image\\\""));
        assert!(query.contains("mediatype:software"));
        assert!(query.contains("licenseurl:"));
        assert!(query.contains("licenseurl:\"http://creativecommons.org"));
        assert!(!query.contains("licenseurl:\"https://example"));
    }
}
