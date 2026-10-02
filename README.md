# Torque

Torque is a small cross-platform desktop app for adding and managing BitTorrent downloads. It uses a native Tauri shell, a Rust download service, and a React interface. Torrent data is written to a folder you choose; the app remembers the queue and selected folder across launches.

Only download content you are legally authorized to access.

## Screenshots

Screenshots are not available yet.

## Features

- Add torrents from magnet links, local `.torrent` files, and HTTP/HTTPS torrent URLs.
- Choose a destination with the native folder picker. The last selected folder becomes the default for future downloads.
- Track progress, downloaded and total size, download and upload rates, peers, ETA, and torrent state.
- Pause, resume, retry errors, open a completed download's folder, or remove a torrent while keeping its files.
- View completed, paused, queued, active, and failed downloads with filters.
- Choose whether new torrents start immediately, whether unfinished torrents resume at launch, and whether the app follows the system, dark, or light theme.
- Restore the rqbit session and reconcile it with a small application-state file after restart.
- Use keyboard-accessible dialogs, inline validation, loading feedback, and status notifications.

## Architecture

The React frontend calls a narrow set of Tauri commands through typed wrappers. The Tauri command module adapts the native file and folder pickers and delegates download work to `TorrentService`; it does not expose general filesystem access to the frontend. The service owns the long-lived `librqbit` session, validates sources and directory selections, maps engine state into app-owned transfer statuses, and persists queue metadata.

`librqbit` keeps its session snapshot and fast-resume data in the app-data directory. Torque stores preferences, the last selected download folder, info hashes, destination paths, last known status, and timestamps in `application-state.json` in that same directory. It does not copy torrent payloads into the app state. Missing session entries remain visible with an explanatory error where possible; unavailable output folders do not prevent the app from starting.

The default preferences start new downloads immediately, resume unfinished downloads on launch, and use the dark theme. Choose System in Settings to follow the operating-system theme. Changing the download folder uses the native folder picker, then Rust retains its path and returns an opaque directory ID to the frontend.

The default Tauri capability grants only `core:window:allow-set-theme`, which the appearance setting needs. Dialog and opener operations are invoked by Rust through their plugins; the frontend cannot open arbitrary paths or execute system commands.

## Tech stack

- Tauri 2 and Rust 1.90+
- [`librqbit` 9.0.1](https://docs.rs/librqbit/9.0.1/librqbit/)
- React 19, TypeScript 5, and Vite 7
- pnpm 11.19.0
- Tauri dialog and opener plugins, Lucide icons, and Inter Variable

## Prerequisites

- Node.js 22 or newer.
- Corepack and pnpm 11.19.0.
- Rust 1.90 or newer, with the native target for your operating system.
- Tauri's operating-system build dependencies. On Windows, install Microsoft C++ Build Tools with **Desktop development with C++** and the Edge WebView2 Runtime. On macOS, install Xcode Command Line Tools. On Linux, install WebKitGTK and the system libraries for your distribution.
- Network access to download torrent metainfo from URLs and communicate with trackers and peers.

See [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/) for the current package list.

## Installation

Clone the repository, install the pinned pnpm version, then install the frontend dependencies:

```sh
git clone https://github.com/0xPolybit/torque.git
cd torque
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
```

Install the Rust toolchain and platform dependencies listed above before building or running the desktop shell.

## Development setup

Run the complete desktop application with Vite hot reload and the Rust backend:

```sh
pnpm tauri:dev
```

That is the exact command to launch Torque during development. To run only the web interface in a browser, use `pnpm dev`; native dialogs and torrent commands are available only inside the desktop app.

Useful checks:

```sh
pnpm typecheck
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

There is no standalone frontend lint command or frontend test runner configured yet. TypeScript checking runs in strict mode, including unused-local and unused-parameter checks; Rust unit and service tests cover input validation, persistence recovery, and session restoration.

## Adding a download

Choose **Add torrent**, select one of the three source tabs, choose a destination folder, and select **Start Download**.

- **Magnet link:** paste a `magnet:?` URI containing a BitTorrent info hash.
- **Torrent file:** open a local `.torrent` file in the native picker. The app checks the file before accepting it.
- **Torrent URL:** enter an HTTP or HTTPS URL that returns `.torrent` metainfo.

Torque validates the input in the interface and again in Rust. Invalid input or backend errors stay visible so they can be corrected. The chosen folder is shown before submission and becomes the remembered default for later downloads. Rust passes only native-picker-backed directory IDs to the service, not frontend-provided paths.

## Production build

Build the frontend and native application bundles for the current platform:

```sh
pnpm tauri:build
```

The frontend output is written to `dist/`; native binaries and platform bundles are written below `src-tauri/target/`. Tauri's bundle configuration includes the Windows, macOS, and Linux icon assets.

## Project structure

```text
src/
  app/                    App shell, desktop connection, queue and preferences state
  components/             Sidebar, backend status, and toast notifications
  features/transfers/     Add/settings dialogs, filters, transfer rows, and formatting
  lib/                    Typed Tauri command wrappers and frontend DTOs
  styles.css              Desktop layout, themes, controls, and responsive rules
src-tauri/
  capabilities/           Narrow Tauri window capability
  icons/                  Cross-platform application icons
  src/commands.rs         Tauri command and native picker adapters
  src/torrent/service.rs  rqbit session, validation, restoration, and status mapping
  src/torrent/persistence.rs
                          Versioned application preferences and queue metadata
  src/lib.rs              Service setup and command registration
  tauri.conf.json         Product metadata, window, security, and bundle settings
README.md                 Developer and user setup guide
DESIGN.md                 Existing visual-system notes
PRODUCT.md                Product context
package.json              Frontend scripts and dependencies
pnpm-lock.yaml            Pinned frontend dependency graph
```

## Known limitations

- Download and upload speed caps are not exposed in Settings. Although rqbit accepts per-torrent rate-limit options, Torque does not have a clean runtime-wide control for already-running downloads yet; adding a partial cap would make the preference misleading. See [`AddTorrentOptions`](https://docs.rs/librqbit/9.0.1/librqbit/struct.AddTorrentOptions.html).
- Torque has no system-tray mode or custom close-to-tray behavior. The native window can be minimized normally; closing the app exits it, and session state is restored on the next launch.
- Downloaded data is not deleted when a torrent is removed. A separate delete-files workflow and file selection are not implemented.
- The engine supplies peer and upload information when available; unavailable values are displayed as a dash.
- There is no dedicated frontend linter or frontend unit-test setup yet.

## Troubleshooting

- **The window reports that the desktop backend is unavailable:** launch with `pnpm tauri:dev` or install and open a Tauri build. `pnpm dev` alone cannot invoke Rust commands.
- **The native window fails to build on Windows:** install the C++ desktop workload and WebView2 Runtime, then reopen the terminal.
- **A torrent URL or magnet fails:** check that the URL uses HTTP/HTTPS and serves valid metainfo, or that the magnet contains an info hash. The service will show the backend error for tracker or engine failures.
- **A saved download folder was moved or disconnected:** open Settings and choose an available folder. Existing downloads retain their own saved paths; Torque reports a missing location without crashing at startup.
- **Queue state was corrupted:** Torque moves an unreadable state file aside and starts with defaults. rqbit session recovery runs separately; torrents that cannot be restored remain visible as unavailable/error entries when their metadata is known.
- **Linux reports missing WebKit libraries:** install the WebKitGTK development packages and other Tauri prerequisites for your distribution.

## License

See [LICENSE](LICENSE).
