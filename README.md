<div align="center">
  <img src="src-tauri/icons/icon.png" alt="Torque app icon" width="112" height="112" />
  <h1>Torque</h1>
  <p>A modern desktop app for managing BitTorrent downloads.</p>
  <p>
    <a href="https://github.com/0xPolybit/torque/releases"><img alt="Version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-8bcf6a?style=flat-square" /></a>
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
- [Browse and search](#browse-and-search)
- [Settings and persistence](#settings-and-persistence)
- [Architecture](#architecture)
- [Security](#security)
- [Project structure](#project-structure)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Legal use](#legal-use)
- [License](#license)

## Features

- Add torrents from magnet links, local `.torrent` files, and HTTP/HTTPS torrent URLs.
- Inspect torrent metadata and browse the complete nested file tree before downloading; choose exactly which files to include.
- Select whole folders with selected, unselected, and indeterminate checkbox states, or choose files individually.
- Change a torrent's file selection later from its Files tab; search large file lists and sort by name, size, or progress.
- Choose a destination folder with the native folder picker; Torque remembers it for future downloads.
- Track progress, downloaded and total size, download and upload speeds, peers, ETA, and current state.
- Open a five-tab details view for live overview, files, peers, trackers, and torrent metainfo.
- Pause and resume downloads, retry errors, open a completed download's folder, and remove torrents while keeping their files.
- Filter active, queued, paused, completed, and failed downloads.
- Set the default download location, choose whether downloads start and resume automatically, and select System, Dark, or Light theme.
- Restore the rqbit session and download list across application restarts.
- Browse Internet Archive items explicitly labeled with supported open licenses, with provider filtering, category filtering, sorting, recent searches, and pagination.
- Review provider details, license, source page, info hash when supplied, and available torrent mechanism before inspection.
- Inspect a discovered torrent through the existing metadata and file-selection step; opening a result never starts a transfer directly.
- View completed downloads in History and reach Settings from primary navigation.
- Use keyboard-accessible dialogs, inline validation, loading feedback, and status notifications.

## Screenshots

Screenshots are not available yet. They will be added here when captured.

## Tech stack

- Tauri 2 and Rust 1.90+
- [`librqbit` 9.0.1](https://docs.rs/librqbit/9.0.1/librqbit/)
- React 19, TypeScript 5, and Vite 7
- pnpm 11.19.0
- Tauri dialog and opener plugins, Lucide icons, and Inter Variable
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

### Build a Windows `.exe` installer

After installing the Windows prerequisites above and completing the setup steps, open PowerShell in the repository and run:

```powershell
pnpm tauri:build
```

The Windows build creates these outputs (the version and architecture in installer filenames change with the build):

- NSIS installer: `src-tauri\target\release\bundle\nsis\Torque_0.1.0_x64-setup.exe`
- MSI installer: `src-tauri\target\release\bundle\msi\Torque_0.1.0_x64_en-US.msi`
- Standalone application binary: `src-tauri\target\release\torque.exe`

Use the NSIS `.exe` installer when sharing the app with Windows users. The standalone executable is useful for local testing; distribute the installer for a normal installation experience.

## Adding downloads

Select **Add torrent**, choose a source type, and set the destination folder. Torque then opens a metadata review stage with the torrent name, info hash, total size, file count, piece count, and available privacy/tracker details. Browse the nested file tree, select individual files or use **Select all** / **Select none**, and check the selected-size total before selecting **Start Download**. Inspection never starts content transfer.

- **Magnet link:** paste a `magnet:?` URI containing a BitTorrent info hash. Torque asks librqbit to resolve metadata first and shows a fetching state while peers or DHT provide it.
- **Torrent file:** select a local `.torrent` file with the native file picker. Its metainfo is parsed locally without adding it to the active session.
- **Torrent URL:** enter an HTTP or HTTPS URL that returns torrent metainfo. The metainfo is fetched and inspected before the download starts.

Torque validates inputs in the interface and again in Rust. Invalid inputs and backend errors remain visible so they can be corrected. The selected folder becomes the remembered default for later downloads. File selection is passed to librqbit when the user confirms, and unselected torrent files are not downloaded.

### Changing file selection

Open a torrent's **Files** tab to review every file's size, selected/skipped state, downloaded bytes, progress, and status. Use the search box and sort menu to narrow or order large lists. Folder checkboxes select or skip their files together; a partially selected folder displays an indeterminate checkbox. If a search is active, a folder checkbox acts on matching files in that folder. Press **Save selection** to apply changes. Selection edits are available after rqbit has initialized the torrent and while it is active or paused; completed sessions can also be changed when rqbit keeps them available. At least one file must remain selected; use **Pause** to stop all transfer activity. Changes are sent as validated file indexes, not paths.

File indexes come from the metainfo's ordered file list and are preserved through preview, rqbit status, live file-progress reporting, and session restoration. Torque uses librqbit's `only_files` when starting and `update_only_files` for later edits, so non-selected files are skipped except for unavoidable piece-boundary data. Selected file indexes are also stored with Torque's lightweight application state and rqbit's session snapshot.

## Torrent details

Select a torrent's name in Downloads or History to open its details window. The **Overview** tab shows the queue's current progress snapshot, selected bytes, transfer speeds, ETA when it can be calculated, ratio, connected peers, added date, destination, and state. **Files** reuses the same searchable, sortable, virtualized file tree and selection-save action as the download workflow.

The **Peers**, **Trackers**, and **Info** tabs request technical metadata once when the detail window opens. Use the refresh button to request a new peer/tracker snapshot; these fields are not polled in the background. Peer addresses are privacy-masked (IPv4 subnet only, IPv6 `/64`, and no port); client identity and lifetime bytes are shown when rqbit provides them. Tracker URLs are read from the managed torrent metadata. Info includes the info hash with a copy button, piece size/count, creation fields, private/public status, input type, and save location when available.

librqbit 9.0.1 does not expose per-peer download/upload rates or completion percentages, tracker announce times or per-tracker peer counts, or a separate seed count through the APIs Torque uses. These values are labeled as unavailable rather than inferred. Torrent input type is stored as a small category (`magnet`, local file, URL, or unknown); the original magnet or URL is not persisted by this feature.

## Browse and search

Choose **Browse** in the navigation rail to search the configured sources. Filter results by source or category and sort by relevance, newest, size, or seeders when the provider supplies those counts. Choosing a source scopes the backend request to that provider. Use **Show more results** to request the next page. Recent searches are kept on this device and remain available beside results; clear them from Browse at any time.

Selecting a result opens its details panel; it does not download or inspect anything. Review the description, metadata, license, and source page, then choose **Inspect Torrent** to fetch the provider’s current download source. For Internet Archive, Torque only returns a torrent URL when item metadata lists its official `_archive.torrent` file. The existing torrent preview then fetches metadata and exact files. Choose a destination and files, and press **Start Download** to begin a transfer.

The normalized search model includes an optional info hash and provider-supplied peer counts; fields absent from the source stay unavailable rather than being estimated. The current Internet Archive catalog does not provide peer counts or info hashes in its search metadata.

The Browse page is composed from provider-backed search state, reusable search controls, result rows, a details panel, and recent-search storage. Provider selection and sorting operate on normalized results in the frontend, while category search, pagination, provider health, and source details use the Rust `SearchProvider` service.

Search runs in the Rust backend and has a 12-second HTTP client timeout, a descriptive user agent, bounded pagination, request cancellation, and per-provider rate-limit handling. Provider failures are returned alongside results from other providers. Search fields and provider response formats remain inside the Rust adapter; the frontend receives normalized DTOs and provider health states.

## Settings and persistence

Settings include the default download folder, automatic start and resume behavior, and System, Dark, or Light theme. The default preferences start new downloads immediately, resume unfinished torrents on launch, and use Dark theme.

Torque stores preferences, the last selected folder, torrent identifiers, destinations, statuses, and timestamps in `application-state.json` in the Tauri app-data directory. rqbit stores its session snapshot and fast-resume data there as well. Torrent payloads are not copied into application state. If a saved location is unavailable, Torque reports the issue without preventing startup.

## Architecture

The React frontend calls typed Tauri command wrappers. Tauri commands adapt native pickers and delegate torrent work to `TorrentService`. The service owns the long-lived `librqbit` session and uses its `list_only` metadata path to inspect local files, torrent URLs, and magnet links without registering or downloading torrent contents. Validated metainfo is held behind a short-lived opaque preview ID in Rust; the frontend receives only torrent/file metadata and file indexes. On explicit confirmation, the service starts that inspected metainfo with selected file indexes and destination. For active torrents, the service validates selection indexes against librqbit's metadata before calling `update_only_files`. File status maps the same ordered indexes to inclusion, downloaded bytes, progress, and state; selection is retained by the engine session and app state.

The nested file tree is assembled in a dedicated frontend helper and rendered as a flattened, virtualized view for both pre-download inspection and each transfer's Files tab. `TorrentFilesPanel` owns local edits, search, sort, folder tri-state, and the save action; transfer rows remain coupled to app-level torrent statuses rather than rqbit types.

The compact transfer row opens `TorrentDetailsDialog` by torrent ID. Overview and Files use the queue's existing two-second `TorrentStatus` snapshots, so progress and file selection do not have a second source of truth. Opening the dialog invokes `get_torrent_details` once for the less-frequently-needed peer snapshot and metainfo fields; a manual refresh repeats only that request. The Rust service maps rqbit models into UI-neutral `TorrentDetails` and masks peer addresses before returning them. Static source type is the only added application-state metadata; torrent metainfo remains owned by the rqbit session.

Content discovery is a separate Rust service beside the torrent service. `SearchProvider` defines source identity, icon, capabilities, paged normalized search, details, download-source lookup, and health checks. `SearchService` registers independent provider implementations and aggregates their results without making one provider failure fail the whole search. The Internet Archive adapter uses its documented Advanced Search and Metadata APIs, filters out items without an explicit supported open license, and validates that the corresponding archive torrent file is listed before returning its URL. Tauri exposes typed search, health, cancellation, details, and source commands; it does not pass provider-specific payloads or filesystem access to React.

To add another authorized source, implement `SearchProvider` in `src-tauri/src/discovery/`, map its response to `TorrentSearchResult`, and register it in `SearchService::new`. Prefer a documented API or published feed over page scraping. Keep source URLs constrained to that provider, set explicit timeouts and a descriptive user agent, propagate the cancellation token, report rate limits and health, and add mocked response tests. A new provider does not need changes to the torrent engine or result components unless it introduces a new normalized capability.

## Security

The frontend does not receive unrestricted filesystem access. Native file and folder pickers are invoked by Rust, and selected folders are represented to the frontend by opaque IDs. The narrow Tauri capability grants only the window theme permission required by the appearance setting. Discovery requests are sent by the Rust provider adapter to its fixed official API host; provider data is treated as untrusted text. Search results cannot invoke torrent start commands: they must pass through the existing inspection and explicit-start flow. Opening a completed download's folder uses the native opener plugin; arbitrary command execution is not exposed.

## Project structure

```text
src/
  app/                    App shell, desktop connection, queue and preferences state
  components/             Sidebar, backend status, and toast notifications
  features/discovery/     Browse controls, results, details, recent searches, and provider state
  features/transfers/     Add/inspection/settings/details dialogs, virtual file tree, filters, and transfer rows
    torrentPreviewTree.ts Build a nested file model from inspected torrent paths
    TorrentFilesPanel.tsx Searchable, sortable per-torrent file selection and progress
    TorrentDetailsDialog.tsx Five-tab details view backed by queue snapshots and an on-demand details command
  lib/                    Typed Tauri transfer, discovery, and preference command wrappers
  styles.css              Desktop layout, themes, controls, and responsive rules
src-tauri/
  capabilities/           Narrow Tauri window capability
  icons/                  Cross-platform application icons, including icon.ico
  src/commands.rs         Tauri commands and native picker adapters
  src/discovery/          SearchProvider contract, registry, models, and Internet Archive adapter
  src/torrent/service.rs  rqbit session, validation, restoration, and status mapping
  src/torrent/persistence.rs
                          Versioned application preferences and queue metadata
  src/lib.rs              Service setup and command registration
  tauri.conf.json         Product metadata, window, security, and bundle settings
README.md                 Project and developer guide
DESIGN.md                 Visual-system notes
PRODUCT.md                Product context
package.json              Frontend scripts and dependencies
pnpm-lock.yaml            Pinned frontend dependency graph
```

## Known limitations

- Download and upload speed caps are not exposed in Settings. rqbit supports per-torrent rate options, but the app does not yet provide clean runtime-wide controls for active downloads. See [`AddTorrentOptions`](https://docs.rs/librqbit/9.0.1/librqbit/struct.AddTorrentOptions.html).
- There is no system tray or close-to-tray behavior. Closing the window exits the app; the session is restored on the next launch.
- Removing a torrent keeps its downloaded files. A separate delete-payload action is not implemented.
- Peer counts and upload speeds are shown when the engine provides them; unavailable values appear as a dash.
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
