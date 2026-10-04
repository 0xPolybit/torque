mod persistence;
mod service;

pub use persistence::AppPreferences;
pub use service::{
    DownloadDirectory, TorrentDetails, TorrentFileSelection, TorrentPreview, TorrentService,
    TorrentStatus,
};
