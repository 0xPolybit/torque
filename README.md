<div align="center">
  <img src="src-tauri/icons/icon.png" alt="Torque app icon" width="112" height="112" />
  <h1>Torque</h1>
  <p>A modern desktop app for managing BitTorrent downloads.</p>
  <p>
    <a href="https://github.com/0xPolybit/torque/releases"><img alt="Latest GitHub release" src="https://img.shields.io/github/v/release/0xPolybit/torque?style=flat-square&color=8bcf6a" /></a>
    <a href="https://v2.tauri.app/"><img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white&style=flat-square" /></a>
    <a href="https://react.dev/"><img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black&style=flat-square" /></a>
    <a href="https://www.rust-lang.org/"><img alt="Rust 1.90 or newer" src="https://img.shields.io/badge/Rust-1.90%2B-orange?logo=rust&logoColor=white&style=flat-square" /></a>
    <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" /></a>
  </p>
</div>

Torque is a cross-platform desktop BitTorrent client built with a Tauri shell, a Rust download service, and a React interface. Choose where downloads are saved, follow transfer progress, and pick up your queue after restarting.

> Only download content you are legally authorized to access.

## Table of contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Tech stack](#tech-stack)
- [Installation](#installation)
  - [Prerequisites](#prerequisites)
  - [Clone and install](#clone-and-install)
- [Development](#development)
- [Build](#build)
  - [Build a Windows `.exe` installer](#build-a-windows-exe-installer)
- [Adding downloads](#adding-downloads)
- [Torrent details](#torrent-details)
- [Integrity verification](#integrity-verification)
- [Browse and search](#browse-and-search)
- [Settings and persistence](#settings-and-persistence)
- [Queue, bandwidth, and shortcuts](#queue-bandwidth-and-shortcuts)
- [Categories, tags, and filters](#categories-tags-and-filters)
- [Architecture](#architecture)
- [Updater architecture](#updater-architecture)
- [GitHub Releases pipeline](#github-releases-pipeline)
- [Release process](#release-process)
- [Security](#security)
- [Project structure](#project-structure)
- [Marketing and documentation website](#marketing-and-documentation-website)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Legal use](#legal-use)
- [License](#license)

## Features

- Add torrents from magnet links, local `.torrent` files, and HTTP/HTTPS torrent URLs.
- Inspect torrent metadata and browse the complete nested file tree before downloading; choose exactly which files to include.
- Review file-type totals, available destination space, and a neutral notice when executable or script files are present.
- Detect torrents already in the active, paused, completed, or saved history library before starting a second session.
- Select whole folders with selected, unselected, and indeterminate checkbox states, or choose files individually.
- Set each file's priority to High, Normal, Low, or Skip before and during a download; folder changes propagate to descendants.
- Change priorities later from a torrent's Files tab; search large file lists and sort by name, size, or progress.
- Choose a destination folder with the native folder picker; Torque remembers it for future downloads.
- Track progress, downloaded and total size, download and upload speeds, peers, ETA, and current state.
- Queue downloads with saved positions, reorder waiting torrents, start the next item automatically, and cap simultaneous downloads.
- Set global download and upload caps, then tighten individual torrents with Unlimited, 256 KB/s, 1, 5, or 10 MB/s presets or custom KB/s and MB/s values.
- Monitor aggregate download/upload rates, peers, active transfers, and queued transfers in the compact status bar.
- Open a five-tab details view for live overview, files, peers, trackers, and torrent metainfo.
- Pause and resume downloads, retry errors, open a completed download's folder, remove torrents while keeping their files, or explicitly delete their downloaded data.
- Force a full piece-hash recheck, watch scan progress, cancel verification safely, and resume damaged pieces when appropriate.
- Filter downloading, seeding, completed, paused, queued, and failed downloads.
- Organize torrents into one primary category and multiple tags, then combine status, category, and tag filters.
- Bulk-select downloads to assign or clear categories, add or remove tags, or replace their tag set.
- Choose a default destination or ask for a folder each time; configure automatic start/resume, concurrent downloads, confirmation behavior, and System, Dark, or Light theme.
- Optionally keep Torque in the system tray when its window is closed.
- Restore the rqbit session and download list across application restarts.
- Browse Internet Archive items explicitly labeled with supported open licenses, with provider filtering, category filtering, sorting, recent searches, and pagination.
- Review provider details, license, source page, info hash when supplied, and available torrent mechanism before inspection.
- Inspect a discovered torrent through the existing metadata and file-selection step; opening a result never starts a transfer directly.
- View completed downloads in History and reach Settings from primary navigation.
- Check for signed stable updates in the background, review release notes and progress, and choose when to install.
- Use keyboard-accessible dialogs, inline validation, loading feedback, and status notifications.
- Use Ctrl/Cmd shortcuts for adding torrents, pasting magnet links, Browse search, selected-download controls, and removal.

## Screenshots

Screenshots are not available yet. They will be added here when captured.

## Tech stack

- Tauri 2 and Rust 1.90+
- [`librqbit` 9.0.1](https://docs.rs/librqbit/9.0.1/librqbit/)
- React 19, TypeScript 5, and Vite 7
- pnpm 11.19.0
- Tauri dialog, opener, updater, and process plugins, Lucide icons, and Inter Variable
- Rust `reqwest` with rustls, `async-trait`, and `tokio-util` for provider HTTP calls and cancellation

## Installation

### Prerequisites

- Node.js 22 or newer, with Corepack available.
- Rust 1.90 or newer and the native toolchain for your operating system.
- Tauri's native build dependencies:
  - **Windows:** Microsoft C++ Build Tools with **Desktop development with C++**, a Windows SDK, and the Edge WebView2 Runtime.
  - **macOS:** Xcode Command Line Tools.
  - **Linux:** WebKitGTK and the system libraries required by Tauri for your distribution.
- Network access to fetch torrent metainfo over HTTP/HTTPS and communicate with trackers and peers.

See [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/) for the current operating-system package list.

### Clone and install

```sh
git clone https://github.com/0xPolybit/torque.git
cd torque
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
```

On Windows, if Node.js is installed under `C:\Program Files`, run `corepack enable` once from an Administrator PowerShell because Corepack writes its command shims beside `node.exe`. Then continue from a regular terminal. Torque uses pnpm; Yarn is not required.

## Development

Run the desktop application with Vite hot reload and the Rust backend:

```sh
pnpm tauri:dev
```

`pnpm dev` starts only the web interface. Native dialogs and torrent commands require the Tauri desktop shell.

Useful verification commands:

```sh
pnpm typecheck
pnpm build
pnpm updater:test
pnpm updater:config
python -m unittest discover -s scripts -p 'test_*.py'
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

There is no standalone frontend lint command or frontend test runner configured yet. TypeScript checking runs in strict mode; Rust tests cover torrent input and lifecycle behavior, persistence recovery, provider normalization, provider isolation, rate limits, and cancellation using mocked sources.

## Build

Build a production frontend and native bundles for the current operating system:

```sh
pnpm tauri:build
```

Tauri runs the frontend production build as part of this command. Frontend assets are written to `dist/`; native binaries and installers are written below `src-tauri/target/`. Build on each target operating system to create its native release packages.

Updater artifact creation is enabled. Release builds need `TAURI_SIGNING_PRIVATE_KEY` configured (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` when the key is password-protected). See [Updater architecture](#updater-architecture) before building releases. Plain frontend builds and development runs do not need signing credentials.

### Build a Windows `.exe` installer

After installing the Windows prerequisites above and completing the setup steps, open PowerShell in the repository and run:

```powershell
pnpm tauri:build
```

The Windows build creates these outputs (the version and architecture in installer filenames change with the build):

- NSIS installer: `src-tauri\target\release\bundle\nsis\Torque_0.2.1_x64-setup.exe`
- MSI installer: `src-tauri\target\release\bundle\msi\Torque_0.2.1_x64_en-US.msi`
- Standalone application binary: `src-tauri\target\release\torque.exe`

Use the NSIS `.exe` installer when sharing the app with Windows users. The standalone executable is useful for local testing; distribute the installer for a normal installation experience.

## Adding downloads

Select **Add torrent**, choose a source type, and set the destination folder. Torque then opens a metadata review stage with the torrent name, info hash, total size, file count, piece count, and available privacy/tracker details. Browse the nested file tree, select individual files or use **Select all** / **Select none**, and check the selected-size total before selecting **Start Download**. Inspection never starts content transfer.

- **Magnet link:** paste a `magnet:?` URI containing a BitTorrent info hash. Torque asks librqbit to resolve metadata first and shows a fetching state while peers or DHT provide it.
- **Torrent file:** select a local `.torrent` file with the native file picker. Its metainfo is parsed locally without adding it to the active session.
- **Torrent URL:** enter an HTTP or HTTPS URL that returns torrent metainfo. The metainfo is fetched and inspected before the download starts.

Torque validates inputs in the interface and again in Rust. Invalid inputs and backend errors remain visible so they can be corrected. The selected folder becomes the remembered default for later downloads. File selection is passed to librqbit when the user confirms, and unselected torrent files are not downloaded.

Before starting, Torque groups inspected files into video, audio, archive, document, and other types, showing their counts and sizes. Executable and script extensions (`.exe`, `.msi`, `.bat`, `.cmd`, `.ps1`, `.scr`, `.js`, and `.vbs`) produce a neutral trust reminder; extensions alone are not treated as evidence of malware. The inspection also compares the selected file size with free space reported for the selected destination. If space appears insufficient, Torque explains the difference and requires an explicit **Start anyway** choice. The backend repeats this check at start time; free-space estimates are volume-level snapshots and may change while a download is running.

Torque checks the inspected info hash against rqbit's active session and persisted library, including paused, completed, and history entries. A match offers **View existing torrent** or **Cancel**; starting also repeats the duplicate check in Rust so the same hash cannot create a second session. Torrent file components are validated as portable relative paths, and existing symlink targets beneath the destination are checked for containment before the engine starts.

### File priorities and selection

Open a torrent's **Files** tab to review each file's size, priority, downloaded bytes, progress, and status. Use the search box and sort menu to narrow or order large lists. Set priorities individually or apply High, Normal, Low, or Skip in bulk to the currently included files. Folder priority controls apply to all descendants, and display **Mixed** when children differ; folder checkboxes show selected, unselected, or indeterminate inclusion states. If a search is active, folder changes apply to matching files in that folder. **Reset** sets every file to Normal. Press **Save priorities** to apply changes. Priority edits are available after rqbit has initialized the torrent and while it is active or paused; completed sessions can also be changed when rqbit keeps them available. At least one file must remain eligible; use **Pause** to stop all transfer activity. Changes are sent as validated file indexes, not paths.

File indexes come from the metainfo's ordered file list and are preserved through preview, rqbit status, live file-progress reporting, and session restoration. Skip maps to librqbit's `only_files` / `update_only_files` selection, so skipped files are not intentionally downloaded except for unavoidable piece-boundary data. High, Normal, and Low files all remain eligible; their priority orders the engine's existing piece requests so higher-priority file pieces are requested first. A BitTorrent piece can overlap multiple files, so the shared piece is requested once and may make progress for each overlapping file. Priorities and selected indexes are stored in Torque's application state and restored onto the engine session after restart.

Librqbit 9.0.1 contains an internal file-priority piece scheduler but has no public setter. Torque applies a small, isolated patch to the vendored 9.0.1 source to expose that existing scheduler through its managed torrent handle. The service layer validates complete file-index order and persists the user-facing priority mapping; Tauri commands and React do not depend on rqbit internals. This local patch is intended to be removed if an upstream librqbit release exposes an equivalent public API.

## Torrent details

Select a torrent's name in Downloads or History to open its details window. The **Overview** tab shows the queue's current progress snapshot, selected bytes, transfer speeds, ETA when it can be calculated, ratio, connected peers, added date, destination, and state. **Files** reuses the same searchable, sortable, virtualized file tree and selection-save action as the download workflow.

The **Peers**, **Trackers**, and **Info** tabs request technical metadata once when the detail window opens. Use the refresh button to request a new peer/tracker snapshot; these fields are not polled in the background. Peer addresses are privacy-masked (IPv4 subnet only, IPv6 `/64`, and no port); client identity and lifetime bytes are shown when rqbit provides them. Tracker URLs are read from the managed torrent metadata. Info includes the info hash with a copy button, piece size/count, creation fields, private/public status, input type, and save location when available.

librqbit 9.0.1 does not expose per-peer download/upload rates or completion percentages, tracker announce times or per-tracker peer counts, or a separate seed count through the APIs Torque uses. These values are labeled as unavailable rather than inferred. Torrent input type is stored as a small category (`magnet`, local file, URL, or unknown); the original magnet or URL is not persisted by this feature.

## Integrity verification

Open a torrent's **More actions** menu and choose **Force recheck**. Torque pauses/replaces that torrent's rqbit session entry without deleting its payload, clears the engine's saved fast-resume bitfield for that entry, then lets librqbit run its normal full piece-hash scan. The row shows **Checking files**, the checked-byte progress, and the remaining scan size. When the scan ends, rqbit's rebuilt piece bitfield drives the completion state; invalid or missing selected pieces return to the normal queue when the torrent had been active, while a torrent that was paused remains paused. Use **Cancel verification** in the same menu to request a safe pause; existing file contents are left in place.

The librqbit 9.0.1 public API has no standalone recheck method. `TorrentService` contains the engine-specific reset/re-add operation and preserves the torrent ID, destination, selected file indexes, trackers, and a temporary metainfo sidecar for restart recovery. The sidecar stores only torrent metadata and is removed when verification is completed, canceled, or the torrent is removed. An interrupted verification resumes on the next launch. The disk scan runs through librqbit's blocking-work spawner rather than the Tauri UI thread.

Verification reads existing payload data and does not overwrite it because a hash fails. librqbit normalizes file lengths after its scan, so Torque refuses to begin a recheck if a selected existing file is larger than the torrent's declared length; the user file is preserved and the row reports why. Missing or shorter files are treated as incomplete data and can be fetched again when the torrent resumes. The displayed scan progress means bytes checked, not bytes already verified; librqbit does not expose a public per-piece result list, but its internal validated bitfield determines which pieces are complete or still needed.

## Browse and search

Choose **Browse** in the navigation rail to search the configured sources. Filter results by source or category and sort by relevance, newest, size, or seeders when the provider supplies those counts. Choosing a source scopes the backend request to that provider. Use **Show more results** to request the next page. Recent searches are kept on this device and remain available beside results; clear them from Browse at any time.

Selecting a result opens its details panel; it does not download or inspect anything. Review the description, metadata, license, and source page, then choose **Inspect Torrent** to fetch the provider’s current download source. For Internet Archive, Torque only returns a torrent URL when item metadata lists its official `_archive.torrent` file. The existing torrent preview then fetches metadata and exact files. Choose a destination and files, and press **Start Download** to begin a transfer.

The normalized search model includes an optional info hash and provider-supplied peer counts; fields absent from the source stay unavailable rather than being estimated. The current Internet Archive catalog does not provide peer counts or info hashes in its search metadata.

The Browse page is composed from provider-backed search state, reusable search controls, result rows, a details panel, and recent-search storage. Provider selection and sorting operate on normalized results in the frontend, while category search, pagination, provider health, and source details use the Rust `SearchProvider` service.

Search runs in the Rust backend and has a 12-second HTTP client timeout, a descriptive user agent, bounded pagination, request cancellation, and per-provider rate-limit handling. Provider failures are returned alongside results from other providers. Search fields and provider response formats remain inside the Rust adapter; the frontend receives normalized DTOs and provider health states.

## Settings and persistence

Settings include a default download folder, **Ask for destination every time**, automatic start and resume behavior, a maximum of 1–64 simultaneous downloads (default 3), global download and upload caps, removal/deletion confirmations, close-to-tray behavior, and System, Dark, or Light theme. Update settings show the installed version and stable channel, control automatic checks and their 6-hour, 12-hour, 24-hour, or weekly interval, and optionally download a verified update in the background. Updates always require an explicit install action. Defaults start new downloads automatically, resume unfinished torrents on launch, use unlimited bandwidth, confirm removals and file deletion, keep tray behavior off, use Dark theme, and check for updates every 24 hours.

Each torrent also has independent download and upload limits in its **More actions** menu. Choose **Unlimited**, a quick preset (256 KB/s, 1 MB/s, 5 MB/s, or 10 MB/s), or **Custom…** and enter KB/s or MB/s. A small Limits indicator appears on torrents with either override. Global limits use librqbit's shared session buckets; per-torrent limits use a separate mutable bucket on that torrent. Traffic passes through both, so the lower configured cap governs each torrent while the global cap continues to constrain aggregate session traffic. Changing a cap updates the existing limiter in place and does not restart the session or torrent. Overrides are saved by info hash and restored for active, paused, completed, and history entries.

When **Ask for destination every time** is enabled, Torque opens the native folder picker before inspecting a new torrent and requires a selection for that add flow. Otherwise it reuses the last chosen folder. Torrent destinations remain attached to their downloads.

Torque stores preferences, the last selected folder, torrent identifiers, destinations, statuses, timestamps, and queue order in `application-state.json` in the Tauri app-data directory. The waiting list is persisted as info hashes. rqbit stores its session snapshot and fast-resume data there as well. Torrent payloads are not copied into application state. At launch Torque restores the engine, reconciles queue order, and starts up to the configured concurrency limit when resume-on-launch is enabled; excess torrents stay queued. If a saved location is unavailable, Torque reports the issue without preventing startup.

Global bandwidth controls update rqbit's `Session.ratelimits` directly and cap aggregate traffic. Per-torrent overrides are stored beside each torrent's application record, keyed by info hash, and use a second mutable librqbit limiter per torrent. Both layers are enforced in the engine transfer path; the lower cap applies without restarting peers or losing progress. Saved overrides are reconciled after session restoration.

When **Keep Torque in the system tray** is enabled, closing the desktop window hides it. Use the tray icon to show the window or quit. The tray icon and menu are available in desktop builds; mobile targets do not use this behavior.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd + O | Open the native picker to add a `.torrent` file |
| Ctrl/Cmd + V | If focus is outside an editable field, detect a magnet link from the clipboard and open Add Torrent |
| Ctrl/Cmd + F | Open Browse and focus its search field |
| Space | Pause or resume the selected/focused download when the queue row has focus |
| Delete | Remove the selected torrent using the configured confirmation behavior |

Shortcuts do not override normal typing or button activation inside form controls and dialogs.

## Queue, bandwidth, and shortcuts

Unfinished downloads are ordered in a persisted queue. The waiting entries show a position and provide move up, move down, move to top, and move to bottom actions. The concurrency scheduler starts waiting torrents automatically as active slots become free. Paused downloads are not treated as waiting entries until the user resumes them; resuming while all slots are occupied places the torrent at the end of the queue.

The **Maximum simultaneous downloads** setting accepts 1–64 and defaults to 3. Lowering the cap pauses the lowest-priority active transfers into the waiting queue; raising it can start waiting downloads immediately. **Start downloads automatically** controls new torrents; when off they are added paused. **Resume on launch** determines whether unfinished transfers are restarted after app startup, still respecting the concurrency cap.

Download and upload caps accept custom KB/s or MB/s values, or Unlimited. These are session-wide librqbit limits shared by all torrents. The global status bar totals current download speed, upload speed, connected peers when reported, active transfers, and waiting downloads. Transfer statistics refresh every two seconds, with unchanged rows retaining their rendered state.

Removing from Torque keeps downloaded files. The row actions menu also offers **Delete downloaded files**; the Rust service asks librqbit to remove only the data associated with that managed torrent, and the UI requires confirmation according to Settings. If rqbit no longer has the torrent session, Torque refuses to delete files because it cannot verify ownership. Closing to the system tray is optional and only applies to desktop builds.

## Categories, tags, and filters

Use the **+** control beside Categories in the sidebar to create, rename, or delete categories and tags. Each torrent can have one category and any number of tags. Names support Unicode, are trimmed, capped at 48 characters, and unique within their type. Deleting a category clears that assignment; deleting a tag removes it from torrents that use it.

Choose **Select** above the download list to reveal row checkboxes. Select one or several torrents, then choose **Edit** to apply a category and tag operation. Category edits can keep each current value, assign one category, or clear the category. Tag edits can keep current tags, add selected tags, remove selected tags, or replace the full tag set. The dialog describes each operation, and reports backend validation and persistence errors.

The sidebar filters by All torrents, Downloading, Seeding, Completed, and Paused, then by category and tag. Status, category, and tag conditions combine, so a category and tag can narrow the chosen status view together. Seeding is reported when librqbit marks a finished torrent live; completed downloads without an active seed session remain in Completed. Row badges show the primary category and up to two tags, with a count for any additional tags.

Categories and tags are Torque library metadata keyed by the torrent info hash. They are stored in the application state JSON separately from torrent metainfo and rqbit's session files. Older state files load with empty category and tag collections, so existing torrents remain available without metadata. Changing a category only changes the library label; it never moves downloaded files or changes their destination.

## Architecture

The React frontend calls typed Tauri command wrappers. Tauri commands adapt native pickers and delegate torrent work to `TorrentService`. The service owns the long-lived `librqbit` session and uses its `list_only` metadata path to inspect local files, torrent URLs, and magnet links without registering or downloading torrent contents. Validated metainfo is held behind a short-lived opaque preview ID in Rust; the frontend receives only torrent/file metadata and file indexes. Preview metadata includes normalized file-type groups, executable/script flags, and any existing library match. Free-space lookup accepts only a registered opaque destination ID. On explicit confirmation, the service repeats hash, directory, path-containment, selection-index, and disk-space checks before starting that inspected metainfo with selected file indexes and destination. For active torrents, the service validates selection indexes against librqbit's metadata before calling `update_only_files`. File status maps the same ordered indexes to inclusion, downloaded bytes, progress, and state; selection is retained by the engine session and app state.

`ApplicationPersistence` stores categories, tags, and a separate info-hash keyed association map in the existing application-state file. `TorrentService` validates taxonomy edits and resolves the app-level associations into the status DTOs; it does not write them into torrent metainfo or change output paths. The frontend uses typed taxonomy commands, a shared `TorrentStatus` snapshot, a sidebar filter model, and `LibraryMetadataDialog` for taxonomy management and bulk edits. Bulk tag operations preserve existing assignments unless the user chooses add, remove, or replace.

Force recheck also stays in `TorrentService`, keeping engine-specific session manipulation out of Tauri commands and React. Because librqbit 9.0.1 exposes no public recheck API, the service uses `Session::delete(id, false)` to remove only the rqbit record and its fast-resume bitfield, then re-adds the same metainfo with the same ID, destination, file selection, and trackers in paused mode. That drives librqbit's normal initial hash validation without starting network transfer during the scan. The service persists the recheck intent and temporary metainfo sidecar before resetting the entry so startup can recover if the app closes mid-operation. After the scan, the engine's piece bitfield is authoritative and the existing queue scheduler resumes missing pieces when appropriate. An oversized-file preflight avoids librqbit's post-scan `set_len` truncation behavior for existing selected files.

The nested file tree is assembled in a dedicated frontend helper and rendered as a flattened, virtualized view for both pre-download inspection and each transfer's Files tab. `TorrentFilesPanel` owns local edits, priority controls, search, sort, folder tri-state, and the save action; transfer rows remain coupled to app-level torrent statuses rather than rqbit types. `TorrentService` maps High/Normal/Low/Skip to a stable file-index priority vector, librqbit's `only_files` selection, and its piece scheduler order. The persisted priority vector is reapplied from application state after the engine restores a session.

The compact transfer row opens `TorrentDetailsDialog` by torrent ID. Overview and Files use the queue's existing two-second `TorrentStatus` snapshots, so progress and file selection do not have a second source of truth. Opening the dialog invokes `get_torrent_details` once for the less-frequently-needed peer snapshot and metainfo fields; a manual refresh repeats only that request. The Rust service maps rqbit models into UI-neutral `TorrentDetails` and masks peer addresses before returning them. Torrent metainfo remains owned by the rqbit session.

`TorrentService` owns a separate persisted queue order and waiting list. Starting a torrent either adds it directly to a free slot or asks rqbit to keep it paused until a slot opens. The scheduler advances waiting items when a transfer is paused, removed, completed, or when settings increase available slots. Queue movement changes only waiting order. The frontend sees `queuePosition` and the normalized `queued` status, never librqbit queue internals.

Status refresh is limited to a two-second snapshot. The hook reuses unchanged torrent objects between snapshots and memoized rows compare only the values they render, so a speed update repaints the affected transfer instead of re-rendering the full list. Long lists also use browser content-visibility containment.

Global rate limits use librqbit's mutable session-wide token buckets. Each managed torrent also has its own mutable download and upload buckets, shared by its paused and live engine states. Incoming and outgoing transfer work is charged to both buckets, enforcing `min(global cap, torrent cap)` without frontend throttling, session rebuilds, or peer reconnections. Application state persists each override by info hash; a routine status refresh only changes engine buckets when the saved value differs.

Content discovery is a separate Rust service beside the torrent service. `SearchProvider` defines source identity, icon, capabilities, paged normalized search, details, download-source lookup, and health checks. `SearchService` registers independent provider implementations and aggregates their results without making one provider failure fail the whole search. The Internet Archive adapter uses its documented Advanced Search and Metadata APIs, filters out items without an explicit supported open license, and validates that the corresponding archive torrent file is listed before returning its URL. Tauri exposes typed search, health, cancellation, details, and source commands; it does not pass provider-specific payloads or filesystem access to React.

To add another authorized source, implement `SearchProvider` in `src-tauri/src/discovery/`, map its response to `TorrentSearchResult`, and register it in `SearchService::new`. Prefer a documented API or published feed over page scraping. Keep source URLs constrained to that provider, set explicit timeouts and a descriptive user agent, propagate the cancellation token, report rate limits and health, and add mocked response tests. A new provider does not need changes to the torrent engine or result components unless it introduces a new normalized capability.

## Security

The frontend does not receive unrestricted filesystem access. Native file and folder pickers are invoked by Rust, and selected folders are represented to the frontend by opaque IDs. The narrow Tauri capability grants only the window theme, updater, and process restart permissions required by app features. Discovery requests are sent by the Rust provider adapter to its fixed official API host; provider data is treated as untrusted text. Search results cannot invoke torrent start commands: they must pass through the existing inspection and explicit-start flow. Before starting, Rust rejects empty, dot, parent, rooted, drive-prefixed, separator-injected, and control-character path components, and checks existing output-path symlinks remain inside the canonical destination. Opening a completed download's folder uses the native opener plugin; arbitrary command execution is not exposed.

## Updater architecture

Torque uses the official Tauri 2 updater plugin (`tauri-plugin-updater` and `@tauri-apps/plugin-updater`). Rust initializes the plugin in the desktop shell; the root desktop frontend wraps its JavaScript API in [`src/lib/updateService.ts`](src/lib/updateService.ts), which returns a normalized `UpdateInfo` model for the current version, release details, availability, download progress, and errors. The service classifies network, GitHub, manifest/version, and signature failures into useful messages and logs only the operation and error category. Raw request errors, URLs, keys, and passwords are not included in updater logs.

The configured static manifest endpoint is:

```text
https://github.com/0xPolybit/torque/releases/latest/download/latest.json
```

The [GitHub Releases pipeline](#github-releases-pipeline) publishes a Tauri `latest.json` manifest, each platform's signed updater artifact, and its `.sig` signature as GitHub Release assets. The public verification key is embedded in `src-tauri/tauri.conf.json`; `requireSignedVersion` is enabled so the artifact signature must bind to the version announced in the manifest. This prevents a manifest from advertising one version while pairing it with a different validly signed artifact. The official updater's default comparator accepts only a strictly newer SemVer; Torque adds a stable-channel guard that also rejects equal, older, malformed, and prerelease candidates. Sign future artifacts with the same private key and a current Tauri CLI that records signed-version metadata.

The public verification key is committed as updater configuration; its matching private key is never committed or required as a local file. Keep the existing private signing identity in a secure maintainer vault: losing it can prevent existing installations from accepting future updates. Do not generate a replacement key for a routine release. `.gitignore` excludes `src-tauri/.private/` for maintainers who temporarily need local key storage. GitHub Actions uses these repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the protected private key contents.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password, or an empty secret if the established key is unencrypted.

Never place private key contents or passwords in source files, tests, `.env` files, or build logs. Production bundling creates updater artifacts because `bundle.createUpdaterArtifacts` is `true`; development and plain Vite runs do not require signing credentials. Update checks explicitly report that they are disabled in development builds. See [docs/RELEASING.md](docs/RELEASING.md) for key provisioning and release instructions.

The Settings dialog's **Updates** section shows the current version and stable channel, the last successful check, automatic-check frequency, automatic download, and the fixed **Ask before installing** behavior. A due check runs a few seconds after desktop startup without blocking the window or opening a dialog. Successful check time is persisted with application preferences. Update settings, deferred version, and skipped version live in `application-state.json` beside the torrent preferences; raw release data and signing credentials are not persisted.

The frontend `useUpdateWorkflow` coordinates startup/manual checks and preferences, while [`src/lib/updateService.ts`](src/lib/updateService.ts) owns the updater plugin resource and publishes normalized snapshots. Update settings use a dedicated `set_update_preferences` command and do not reschedule or otherwise touch the torrent queue. Download progress is delivered to subscribers at a bounded rate. When the manifest provides a size field Torque shows it as an estimate; otherwise the download's reported content length is used once transfer starts. Release notes render as plain text, so manifest HTML is never executed or interpreted. Oversized notes are clipped to a safe display limit.

Before **Restart & Update**, the frontend calls the torrent service's prepare command. The service blocks new torrent and preference mutations, serializes against queue/rate-limit operations, snapshots the latest torrent and queue metadata, flushes the atomic application-state file, and pauses only transfers that were actively downloading or seeding. It does not remove session entries or modify partial files, file selections/priorities, categories/tags, bandwidth limits, or destinations. rqbit's fast-resume persistence remains the source of piece/session restoration. Active seeders receive a one-shot resume marker; on the next launch, Torque resumes them only when **Resume downloads on application launch** is enabled, then clears the marker. If the installer fails, Torque resumes the transfers that were running and reopens the mutation gate; if relaunch fails after installation, it also restores a usable running session where possible. Normal process exit calls rqbit's graceful session stop. On startup, existing resume preferences determine which unfinished torrents start again; no update-specific forced recheck is performed.

Torque stores `last_run_version` with the other application state. On startup it compares that value with the current bundle version and persists the new one. A changed version produces one success toast for that launch; the same version does not repeat the notice. The app has no local release-note catalog, so the toast does not link to local What's New content.

When an update is available, the Settings icon receives a small indicator and the existing in-app toast announces a new or downloaded version. Torque uses that existing toast instead of adding a native notification plugin; background checks do not open a modal. **Later** and **Install Later** defer the same version, suppressing repeat startup notices and automatic downloads for it. **Skip This Version** suppresses that release; the saved skip is cleared when a newer semantic version appears or the skipped version is already installed. A later release can be reviewed and installed from Settings.

Manual checks show an up-to-date version, release version/date/notes and approximate size when available, or a normalized error with a retry path. Update bytes are verified by the official updater plugin during download and again before installation. The UI can install only the opaque update object returned by the plugin; it has no command for supplying an arbitrary URL or signature. Signature failures never offer a bypass or an install-anyway action. Network and GitHub errors are retryable; manifest/version failures, signature failures, disk-space problems, permission errors, interrupted downloads, installation failures, and restart failures are surfaced without terminating the transfer session. On Windows, the official installer handles the restart; other desktop platforms use the official process plugin's relaunch capability after install.

The `default` capability grants the updater permissions needed for explicit check, download, and install calls, plus only `process:allow-restart` for the official relaunch API. It does not grant shell execution or general process permissions.

## GitHub Releases pipeline

The desktop release workflow is [`.github/workflows/release.yml`](.github/workflows/release.yml). It builds the root Tauri application with the official `tauri-apps/tauri-action@v1`; it does not build the separate marketing site in `frontend/`.

Production releases use stable `vMAJOR.MINOR.PATCH` tags, such as `v0.2.2`. Pushing a version tag starts the workflow. A maintainer can also run **Actions → Desktop release → Run workflow** and supply an existing version tag. The workflow checks that the tag matches `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and Torque's entry in `src-tauri/Cargo.lock`. Prerelease tags (for example, `v0.3.0-beta.1`) are rejected. Pushes to `main` do not publish releases.

The workflow builds these supported release targets:

- Windows x64 (`x86_64-pc-windows-msvc`): NSIS `.exe` and MSI `.msi` installers.
- macOS Apple Silicon (`aarch64-apple-darwin`) and Intel (`x86_64-apple-darwin`): `.dmg` and updater `.app.tar.gz` artifacts.
- Linux x64 (`x86_64-unknown-linux-gnu`): Debian `.deb`, RPM, and AppImage packages, including the signed updater artifact.

Each platform job uses `tauri-action` to build and sign its artifacts and update the generated `latest.json`. Jobs run one at a time so the action can safely merge platform entries into the draft manifest. Before publishing, the workflow runs TypeScript and Rust checks/tests, release-tool tests, and mocked manifest-validation tests. Its final release gate requires the candidate to be newer than GitHub's latest stable version, checks the exact supported platform-key set, maps each key to the correct architecture-specific updater bundle, verifies every HTTPS URL resolves to an asset in that exact tagged release, compares each manifest signature with its `.sig` asset, and confirms all human-installable packages exist. If a build or validation fails, any created release stays a draft and is not served as the latest stable update. `uploadUpdaterJson: true` is the current Tauri Action option used to create the manifest from actual signed build artifacts; the repository does not maintain a static updater manifest.

Configure these repository Actions secrets before publishing:

- `TAURI_SIGNING_PRIVATE_KEY`: the private updater signing key that matches the public key embedded in `src-tauri/tauri.conf.json`.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the key password, or an empty secret for an unencrypted key.

The workflow also uses the automatically provided `GITHUB_TOKEN` with `contents: write` permission to create a draft release, upload bundles/signatures/`latest.json`, validate them, and publish the release. Signing secrets are passed only to build steps and are never uploaded as artifacts. Do not rotate the updater key without coordinating a new public key with already installed clients.

No Apple Developer signing or notarization secrets are configured in this repository. The macOS packages are therefore not Apple-notarized; macOS may show its normal first-launch security warning. Windows signing is likewise not configured, so Windows may show its unsigned-publisher warning.

Use [`docs/RELEASING.md`](docs/RELEASING.md) for the full secure release checklist. `pnpm release:preflight` validates the next patch release; `pnpm release:patch`, `pnpm release:minor`, or `pnpm release:major` updates all four version sources, creates a release commit, and tags it locally. The script never pushes. After review, push `main` and the matching `vMAJOR.MINOR.PATCH` tag. Alternatively, dispatch the workflow manually with that already-pushed tag. Review the completed draft release and assets in GitHub; the workflow publishes it only after all four platform targets and the manifest pass validation. Published stable releases are served to installed apps from `https://github.com/0xPolybit/torque/releases/latest/download/latest.json`.

## Release process

The release scripts require a clean main checkout, keep the desktop version in package.json, Tauri config, Cargo manifest, and Cargo lockfile aligned, and validate the updater configuration and prospective tag. They create a local commit and stable version tag, then stop for explicit review and push. See [docs/RELEASING.md](docs/RELEASING.md) for signing-key safety, required GitHub Actions secrets, exact commands, and troubleshooting.

## Project structure

```text
src/
  app/                    App shell, desktop connection, queue, update workflow, taxonomy, and preferences state
    useUpdateWorkflow.ts  Startup cadence, update preference persistence, and user actions
  components/             Sidebar, backend status, and toast notifications
  features/discovery/     Browse controls, results, details, recent searches, and provider state
  features/transfers/     Add/inspection/settings/details/removal dialogs, virtual file tree, filters, and transfer rows
    torrentPreviewTree.ts Build a nested file model from inspected torrent paths
    TorrentFilesPanel.tsx Virtualized file tree with priority, selection, and progress controls
    TorrentLimitMenu.tsx Per-torrent quick presets and custom download/upload limits
    LibraryMetadataDialog.tsx Category/tag management and bulk assignment
  TorrentDetailsDialog.tsx Five-tab details view backed by queue snapshots and an on-demand details command
  SettingsDialog.tsx      Persisted queue, bandwidth, appearance, confirmation, and tray preferences
  RemoveTorrentDialog.tsx Explicit keep-files or delete-files confirmation
  lib/                    Typed Tauri command wrappers and the normalized updater service
    updateService.ts      Signed check/download/install lifecycle and throttled progress snapshots
    semver.js              Stable-channel SemVer guard for update candidates
    updateErrors.js        Safe, normalized updater failure categories
  styles.css              Desktop layout, themes, controls, and responsive rules
src-tauri/
  capabilities/           Narrow Tauri window capability
  icons/                  Cross-platform application icons, including icon.ico
  src/commands.rs         Tauri commands and native picker adapters
  src/discovery/          SearchProvider contract, registry, models, and Internet Archive adapter
  src/torrent/service.rs  rqbit session, queue scheduler, global/per-torrent rate limits, validation, and status mapping
  src/torrent/persistence.rs
                          Versioned preferences including update cadence/skip state, queue, and library metadata
  vendor/librqbit/         Isolated 9.0.1 integration patch for torrent priorities and mutable per-torrent limits
  src/lib.rs              Service setup and command registration
  tauri.conf.json         Product metadata, window, security, and bundle settings
frontend/
  public/                  Website favicon, social graphic, manifest, robots, host rewrites
  src/
    components/            Shared layout, docs UI, marketing previews, and interface primitives
    content/docs.ts        Data-driven documentation catalog
    pages/                 Marketing, download, changelog, and docs routes
    styles.css             Website themes, product mockups, and responsive layouts
  package.json             Independent website development/build scripts
  package-lock.json        Reproducible website dependency lock
README.md                 Project and developer guide
.github/workflows/release.yml
                          Signed cross-platform desktop release pipeline
scripts/                  Version/preflight tools, updater tests, and mocked release-asset validation
frontend/README.md        Standalone marketing and documentation website guide
DESIGN.md                 Visual-system notes
PRODUCT.md                Product context
package.json              Frontend scripts and dependencies
pnpm-lock.yaml            Pinned frontend dependency graph
scripts/
  release.mjs             Version validation, release preflight, and local bump/commit/tag automation
  release.test.mjs        Release tooling tests without signing credentials
docs/RELEASING.md         Signing-key guidance and end-to-end release checklist
CHANGELOG.md              Unreleased notes and release change history
```

## Marketing and documentation website

The independent static site in [`frontend/`](frontend/) contains Torque’s product pages and searchable, data-driven documentation. It uses React, TypeScript, Vite, Tailwind CSS 4, and React Router. The website does not start the Tauri shell or Rust backend. Product-interface examples use labeled sample values, and download buttons lead to the actual GitHub Releases page rather than hosted or simulated installers.

To run or build the website, install Node.js 22.12 or newer, then run these commands from the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Vite serves the site at `http://127.0.0.1:5173`. To check TypeScript, create a production build, and preview it locally:

```sh
npm run typecheck
npm run build
npm run preview
```

The static output is `frontend/dist/`. Static hosts must rewrite clean route requests to `/index.html`; a Netlify rewrite file is included. See [`frontend/README.md`](frontend/README.md) for the pages, source organization, and deployment notes.

## Known limitations

- Rate caps are enforced at transfer-chunk scheduling boundaries, so observed rates can briefly vary around the configured value. When a cap is lower than one BitTorrent block per second, the limiter allows one block through and enforces the configured refill rate over time. The effective torrent cap is the lower of its override and the global session cap.
- Queue concurrency counts active and initializing torrents. A torrent in an engine error state may need a manual retry; failed torrents do not consume a slot.
- Delete downloaded files requires the rqbit session to be available so the engine can safely resolve torrent-owned files. When that session is missing, Torque keeps the files and reports why.
- Close-to-tray depends on a desktop environment that supports system tray icons; mobile targets do not expose it.
- Peer counts and upload speeds are shown when the engine provides them; unavailable values appear as a dash.
- Free-space estimates depend on the mounted filesystem's available-space API and can change after the check. If the platform cannot report space, Torque explains that the estimate is unavailable and lets the user proceed.
- The details screen shows peer lifetime counters and masked addresses, but the current rqbit API does not provide per-peer speeds/progress, tracker announce timestamps or counts, or a seed-only count.
- Discovery currently includes only the Internet Archive adapter and filters for explicit CC0 1.0, CC BY 4.0, and CC BY-SA 4.0 license metadata. It does not independently verify rights claims, and it has no seeder/leech counts from that catalog.
- A dedicated frontend linter and frontend unit-test setup are not configured yet.

## Troubleshooting

- **`corepack enable` reports `EPERM` for `C:\Program Files\nodejs\yarnpkg`:** Corepack is trying to create a package-manager shim in the protected Node.js installation folder. Open PowerShell as Administrator, run `corepack enable` once, then continue from a regular terminal. Torque uses pnpm; Yarn does not need to be installed or run.
- **The desktop backend is unavailable:** start the app with `pnpm tauri:dev` or install and open a Tauri build. `pnpm dev` alone cannot invoke Rust commands.
- **The Windows native build fails:** confirm the C++ desktop workload, Windows SDK, and WebView2 Runtime are installed, then reopen the terminal.
- **A torrent URL or magnet fails:** check that the URL uses HTTP/HTTPS and serves valid metainfo, or that the magnet includes an info hash. Tracker and engine errors are displayed by the app.
- **A saved download folder was moved or disconnected:** choose an available folder in Settings. Existing downloads keep their saved destinations; Torque reports missing locations without crashing at startup.
- **Queue state is corrupted:** Torque moves an unreadable state file aside and starts with defaults. rqbit session recovery runs separately; torrents that cannot be restored remain visible as unavailable/error entries when their metadata is known.
- **Linux reports missing WebKit libraries:** install WebKitGTK and the other Tauri prerequisites for your distribution.

## Legal use

Only download and share content you are legally authorized to access. You are responsible for complying with the laws and rights that apply to your downloads.

## License

Torque is distributed under the MIT License. See [LICENSE](LICENSE).
