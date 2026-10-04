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
- [Queue, bandwidth, and shortcuts](#queue-bandwidth-and-shortcuts)
- [Architecture](#architecture)
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
- Change a torrent's file selection later from its Files tab; search large file lists and sort by name, size, or progress.
- Choose a destination folder with the native folder picker; Torque remembers it for future downloads.
- Track progress, downloaded and total size, download and upload speeds, peers, ETA, and current state.
- Queue downloads with saved positions, reorder waiting torrents, start the next item automatically, and cap simultaneous downloads.
- Set global download and upload speed limits using librqbit's session limiter; per-torrent runtime limits are not exposed by the current engine API.
- Monitor aggregate download/upload rates, peers, active transfers, and queued transfers in the compact status bar.
- Open a five-tab details view for live overview, files, peers, trackers, and torrent metainfo.
- Pause and resume downloads, retry errors, open a completed download's folder, remove torrents while keeping their files, or explicitly delete their downloaded data.
- Filter active, queued, paused, completed, and failed downloads.
- Choose a default destination or ask for a folder each time; configure automatic start/resume, concurrent downloads, confirmation behavior, and System, Dark, or Light theme.
- Optionally keep Torque in the system tray when its window is closed.
- Restore the rqbit session and download list across application restarts.
- Browse Internet Archive items explicitly labeled with supported open licenses, with provider filtering, category filtering, sorting, recent searches, and pagination.
- Review provider details, license, source page, info hash when supplied, and available torrent mechanism before inspection.
- Inspect a discovered torrent through the existing metadata and file-selection step; opening a result never starts a transfer directly.
- View completed downloads in History and reach Settings from primary navigation.
- Use keyboard-accessible dialogs, inline validation, loading feedback, and status notifications.
- Use Ctrl/Cmd shortcuts for adding torrents, pasting magnet links, Browse search, selected-download controls, and removal.

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

Before starting, Torque groups inspected files into video, audio, archive, document, and other types, showing their counts and sizes. Executable and script extensions (`.exe`, `.msi`, `.bat`, `.cmd`, `.ps1`, `.scr`, `.js`, and `.vbs`) produce a neutral trust reminder; extensions alone are not treated as evidence of malware. The inspection also compares the selected file size with free space reported for the selected destination. If space appears insufficient, Torque explains the difference and requires an explicit **Start anyway** choice. The backend repeats this check at start time; free-space estimates are volume-level snapshots and may change while a download is running.

Torque checks the inspected info hash against rqbit's active session and persisted library, including paused, completed, and history entries. A match offers **View existing torrent** or **Cancel**; starting also repeats the duplicate check in Rust so the same hash cannot create a second session. Torrent file components are validated as portable relative paths, and existing symlink targets beneath the destination are checked for containment before the engine starts.

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

Settings include a default download folder, **Ask for destination every time**, automatic start and resume behavior, a maximum of 1–64 simultaneous downloads (default 3), session-wide download and upload caps, removal/deletion confirmations, close-to-tray behavior, and System, Dark, or Light theme. Defaults start new downloads automatically, resume unfinished torrents on launch, use unlimited bandwidth, confirm removals and file deletion, keep tray behavior off, and use Dark theme.

When **Ask for destination every time** is enabled, Torque opens the native folder picker before inspecting a new torrent and requires a selection for that add flow. Otherwise it reuses the last chosen folder. Torrent destinations remain attached to their downloads.

Torque stores preferences, the last selected folder, torrent identifiers, destinations, statuses, timestamps, and queue order in `application-state.json` in the Tauri app-data directory. The waiting list is persisted as info hashes. rqbit stores its session snapshot and fast-resume data there as well. Torrent payloads are not copied into application state. At launch Torque restores the engine, reconciles queue order, and starts up to the configured concurrency limit when resume-on-launch is enabled; excess torrents stay queued. If a saved location is unavailable, Torque reports the issue without preventing startup.

The session-wide bandwidth controls update rqbit's `Session.ratelimits` directly and take effect for all managed torrents. A per-torrent runtime cap is not exposed by librqbit's current API, so Torque does not emulate one.

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

## Architecture

The React frontend calls typed Tauri command wrappers. Tauri commands adapt native pickers and delegate torrent work to `TorrentService`. The service owns the long-lived `librqbit` session and uses its `list_only` metadata path to inspect local files, torrent URLs, and magnet links without registering or downloading torrent contents. Validated metainfo is held behind a short-lived opaque preview ID in Rust; the frontend receives only torrent/file metadata and file indexes. Preview metadata includes normalized file-type groups, executable/script flags, and any existing library match. Free-space lookup accepts only a registered opaque destination ID. On explicit confirmation, the service repeats hash, directory, path-containment, selection-index, and disk-space checks before starting that inspected metainfo with selected file indexes and destination. For active torrents, the service validates selection indexes against librqbit's metadata before calling `update_only_files`. File status maps the same ordered indexes to inclusion, downloaded bytes, progress, and state; selection is retained by the engine session and app state.

The nested file tree is assembled in a dedicated frontend helper and rendered as a flattened, virtualized view for both pre-download inspection and each transfer's Files tab. `TorrentFilesPanel` owns local edits, search, sort, folder tri-state, and the save action; transfer rows remain coupled to app-level torrent statuses rather than rqbit types.

The compact transfer row opens `TorrentDetailsDialog` by torrent ID. Overview and Files use the queue's existing two-second `TorrentStatus` snapshots, so progress and file selection do not have a second source of truth. Opening the dialog invokes `get_torrent_details` once for the less-frequently-needed peer snapshot and metainfo fields; a manual refresh repeats only that request. The Rust service maps rqbit models into UI-neutral `TorrentDetails` and masks peer addresses before returning them. Torrent metainfo remains owned by the rqbit session.

`TorrentService` owns a separate persisted queue order and waiting list. Starting a torrent either adds it directly to a free slot or asks rqbit to keep it paused until a slot opens. The scheduler advances waiting items when a transfer is paused, removed, completed, or when settings increase available slots. Queue movement changes only waiting order. The frontend sees `queuePosition` and the normalized `queued` status, never librqbit queue internals.

Status refresh is limited to a two-second snapshot. The hook reuses unchanged torrent objects between snapshots and memoized rows compare only the values they render, so a speed update repaints the affected transfer instead of re-rendering the full list. Long lists also use browser content-visibility containment.

Content discovery is a separate Rust service beside the torrent service. `SearchProvider` defines source identity, icon, capabilities, paged normalized search, details, download-source lookup, and health checks. `SearchService` registers independent provider implementations and aggregates their results without making one provider failure fail the whole search. The Internet Archive adapter uses its documented Advanced Search and Metadata APIs, filters out items without an explicit supported open license, and validates that the corresponding archive torrent file is listed before returning its URL. Tauri exposes typed search, health, cancellation, details, and source commands; it does not pass provider-specific payloads or filesystem access to React.

To add another authorized source, implement `SearchProvider` in `src-tauri/src/discovery/`, map its response to `TorrentSearchResult`, and register it in `SearchService::new`. Prefer a documented API or published feed over page scraping. Keep source URLs constrained to that provider, set explicit timeouts and a descriptive user agent, propagate the cancellation token, report rate limits and health, and add mocked response tests. A new provider does not need changes to the torrent engine or result components unless it introduces a new normalized capability.

## Security

The frontend does not receive unrestricted filesystem access. Native file and folder pickers are invoked by Rust, and selected folders are represented to the frontend by opaque IDs. The narrow Tauri capability grants only the window theme permission required by the appearance setting. Discovery requests are sent by the Rust provider adapter to its fixed official API host; provider data is treated as untrusted text. Search results cannot invoke torrent start commands: they must pass through the existing inspection and explicit-start flow. Before starting, Rust rejects empty, dot, parent, rooted, drive-prefixed, separator-injected, and control-character path components, and checks existing output-path symlinks remain inside the canonical destination. Opening a completed download's folder uses the native opener plugin; arbitrary command execution is not exposed.

## Project structure

```text
src/
  app/                    App shell, desktop connection, queue and preferences state
  components/             Sidebar, backend status, and toast notifications
  features/discovery/     Browse controls, results, details, recent searches, and provider state
  features/transfers/     Add/inspection/settings/details/removal dialogs, virtual file tree, filters, and transfer rows
    torrentPreviewTree.ts Build a nested file model from inspected torrent paths
    TorrentFilesPanel.tsx Searchable, sortable per-torrent file selection and progress
  TorrentDetailsDialog.tsx Five-tab details view backed by queue snapshots and an on-demand details command
  SettingsDialog.tsx      Persisted queue, bandwidth, appearance, confirmation, and tray preferences
  RemoveTorrentDialog.tsx Explicit keep-files or delete-files confirmation
  lib/                    Typed Tauri transfer, discovery, and preference command wrappers
  styles.css              Desktop layout, themes, controls, and responsive rules
src-tauri/
  capabilities/           Narrow Tauri window capability
  icons/                  Cross-platform application icons, including icon.ico
  src/commands.rs         Tauri commands and native picker adapters
  src/discovery/          SearchProvider contract, registry, models, and Internet Archive adapter
  src/torrent/service.rs  rqbit session, scheduler, rate limits, validation, restoration, and status mapping
  src/torrent/persistence.rs
                          Versioned application preferences and queue metadata
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
frontend/README.md        Standalone marketing and documentation website guide
DESIGN.md                 Visual-system notes
PRODUCT.md                Product context
package.json              Frontend scripts and dependencies
pnpm-lock.yaml            Pinned frontend dependency graph
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

- Download and upload limits are global to the librqbit session. The current librqbit API does not expose clean per-torrent runtime rate caps.
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
