# Torque

Torque is a cross-platform desktop torrent downloader built with Tauri 2. It accepts magnet links, local `.torrent` files, and HTTP/HTTPS links to torrent metainfo, then downloads into a user-selected folder. Use it only for content you are legally authorized to access.

## Tech stack

- Tauri 2 desktop shell and Rust backend
- [`librqbit`](https://docs.rs/librqbit/latest/librqbit/) BitTorrent engine
- Tauri dialog plugin for native torrent-file and download-folder pickers
- React 19 and TypeScript
- Vite 7 and pnpm 11
- Inter Variable typography and Lucide icons

## Project structure

```text
src/
  app/                    App shell, desktop connection, and transfer queue hooks
  components/             Sidebar and backend status
  features/transfers/     Queue filters, transfer rows, empty states, settings, and add dialog
  lib/                    Typed wrappers for Tauri commands and transfer DTOs
  main.tsx                React entry point
  styles.css              Theme tokens and desktop layout
src-tauri/
  capabilities/           Tauri 2 window permissions
  icons/                  Platform application icons
  src/
    commands.rs           Thin Tauri command and native-picker adapters
    torrent/
      mod.rs              Torrent service exports
      service.rs          rqbit session, validation, directory grants, and status mapping
    lib.rs                Service setup and command registration
    main.rs               Native application entry point
  tauri.conf.json         Window, security, and build configuration
  Cargo.toml              Rust dependencies and crate settings
  Cargo.lock              Reproducible Rust dependency versions
index.html                Vite document
vite.config.ts            Local frontend server configuration
package.json              Frontend scripts and dependencies
pnpm-workspace.yaml       pnpm build-script policy
```

## Installation requirements

- Node.js 22 or newer and pnpm 11.19.0. The package declares its pnpm version for Corepack.
- Rust 1.90 or newer with the native target for your operating system.
- Tauri's platform build dependencies. On Windows, install Microsoft C++ Build Tools with **Desktop development with C++** and the Microsoft Edge WebView2 Runtime. macOS requires Xcode Command Line Tools. Linux requires WebKitGTK and the system libraries listed by Tauri for your distribution.
- An internet connection for downloading torrent metainfo from URLs and communicating with trackers, DHT, and peers.

See the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for the current operating-system package list.

## Development

Install frontend dependencies once:

```sh
pnpm install
```

Start the desktop app with Vite hot reload and the Rust backend:

```sh
pnpm tauri:dev
```

Run only the frontend in a browser:

```sh
pnpm dev
```

The frontend runs at `http://127.0.0.1:1420`. Tauri commands are available only in the desktop runtime; the browser view remains visible and reports when the desktop backend cannot be reached.

## Torrent inputs and download folders

- **Magnet link:** paste a `magnet:?` link. Torque validates it with rqbit before adding it to the session.
- **Local torrent file:** choose a `.torrent` file from the native file picker. Torque checks the extension, size, and metainfo before starting it.
- **HTTP/HTTPS torrent URL:** enter an `http://` or `https://` address. Other URL schemes and credential-bearing URLs are rejected.
- **Output folder:** use the system Downloads folder by default, or choose another folder with the native folder picker. The app revalidates the selected folder when adding a torrent.

The frontend receives opaque download-folder IDs and display names. It does not receive a filesystem API or submit arbitrary local paths. Torrent-file access stays in the Rust command layer after an explicit native picker selection.

## Torrent engine architecture

`TorrentService` in `src-tauri/src/torrent/service.rs` owns a long-lived rqbit `Session` and its serializable `Api` facade. Tauri creates the service once at startup, enables rqbit fast resume and JSON session persistence under the app-data directory, then manages it as application state. Each add operation passes its validated output folder through rqbit's per-torrent `AddTorrentOptions`.

`src-tauri/src/commands.rs` contains thin commands for folder selection, adding each input type, listing torrents, and retrieving one torrent's status. The service returns app-owned DTOs with the metadata name, info hash, file list, state, progress, downloaded and total bytes, transfer rates, connected peers when rqbit reports them, and a display-only output-folder name. The React queue polls the list and invokes status through the typed bridge in `src/lib/desktop.ts`.

The frontend keeps polling and add-operation state in `src/app/useTorrentQueue.ts`. `TorrentFilters` derives All, Downloading, Queued, Completed, Paused, and Errors views from live rqbit status. Shared presentation helpers format byte and speed values and calculate ETA only when a download rate is available. `TorrentRow` renders progress, the expanded file list, status, peers, and transfer rates. The settings dialog uses the existing native folder picker and notes that its selected location applies for the current session.

rqbit also exposes pause, resume, removal, and file-selection operations through its session/API. These stay behind the Rust service boundary for future controls; the current interface focuses on adding and monitoring transfers.

## Commands and checks

Type-check the frontend:

```sh
pnpm typecheck
```

Build the frontend assets to `dist/`:

```sh
pnpm build
```

Check the Rust backend:

```sh
cargo check --manifest-path src-tauri/Cargo.toml
```

Run service validation and local engine tests:

```sh
cargo test --manifest-path src-tauri/Cargo.toml
```

Build the desktop application and platform bundles:

```sh
pnpm tauri:build
```

Tauri writes native binaries and bundles beneath `src-tauri/target/`.
