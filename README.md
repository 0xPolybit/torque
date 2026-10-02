# Torque

Torque is a cross-platform desktop torrent downloader built with Tauri 2. It accepts magnet links, local `.torrent` files, and HTTP/HTTPS links to torrent metainfo, then downloads into a user-selected folder. Use it only for content you are legally authorized to access.

## Tech stack

- Tauri 2 desktop shell and Rust backend
- [`librqbit`](https://docs.rs/librqbit/latest/librqbit/) BitTorrent engine
- Tauri dialog plugin for native torrent-file and download-folder pickers
- Tauri opener plugin for opening a torrent's download folder in the system file manager
- React 19 and TypeScript
- Vite 7 and pnpm 11
- Inter Variable typography and Lucide icons

## Project structure

```text
src/
  app/                    App shell, desktop connection, and transfer queue hooks
  components/             Sidebar and backend status
  features/transfers/     Queue filters, transfer rows, empty states, settings, add dialog, and input validation
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
      service.rs          rqbit session, validation, directory grants, restoration, and status mapping
      persistence.rs      Versioned app state, download timestamps, folder, and preferences
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

- Select **Add torrent** and choose Magnet link, Torrent file, or Torrent URL in the dialog. Each method is validated before the final action; the Rust service validates inputs again before passing them to rqbit.
- **Magnet link:** paste a `magnet:?` URI with a supported BitTorrent info hash. Torque checks the URI shape and hash before asking rqbit to add it.
- **Local torrent file:** choose a `.torrent` file from the native file picker. Torque checks the extension, size, and metainfo and shows the selected filename. The file is staged without starting a transfer; **Start Download** submits its opaque, single-use selection ID to Rust.
- **HTTP/HTTPS torrent URL:** enter an `http://` or `https://` address. Malformed URLs, other schemes, and credential-bearing URLs are rejected with an inline message.
- **Output folder:** Torque uses the system Downloads folder by default. **Change folder** opens the native directory picker, and the dialog displays the selected folder path. **Start Download** passes only a directory ID to Rust, which verifies the ID and path before use.

The frontend does not receive filesystem APIs or submit arbitrary local paths. Rust retains paths granted by the native pickers and returns opaque IDs plus display-only folder information. The last folder selected in the native picker is saved by Rust and restored as the default for new downloads on the next launch. If that folder is unavailable, Torque falls back to the system Downloads folder (then an app-data Downloads folder) and clears the stale selection. Paths and torrent-file selections are not persisted in browser storage.

After a successful submission the dialog closes and the new torrent appears immediately in the queue, then the queue refreshes from rqbit. Failed submissions remain in the dialog so the user can correct the source, choose another folder, or retry; the error is shown instead of being discarded.

## Torrent engine architecture

`TorrentService` in `src-tauri/src/torrent/service.rs` owns a long-lived rqbit `Session` and its serializable `Api` facade. Tauri creates the service once at startup, enables rqbit fast resume and JSON session persistence under the app-data directory, then manages it as application state. Each add operation passes its validated output folder through rqbit's per-torrent `AddTorrentOptions`.

`src-tauri/src/torrent/persistence.rs` stores a small versioned `application-state.json` beside the rqbit folder. It keeps info hashes, destination paths, last known states and progress, added/completed timestamps, the last selected output folder, and the `Resume unfinished downloads on launch` preference. Torrent payloads, magnets, and torrent file contents are not copied into this file. rqbit owns the session record, cached metainfo, and fast-resume bitfields; downloaded payload remains in the chosen download folder. The data directory is resolved by Tauri's `app_data_dir` for the current platform. The app-state JSON is therefore in that directory and rqbit data is under its `rqbit/` child.

On startup rqbit restores its session before Torque reconciles app metadata by info hash. With the default resume preference enabled, paused unfinished torrents are started; when disabled, unfinished active torrents are paused. Completed status and completion timestamps are retained. If rqbit's session JSON is unreadable, Torque keeps a timestamped copy and attempts to restore known hashes from cached metainfo or a hash-only magnet. A torrent that still cannot be restored remains visible as an error row (or completed row when it was completed before) and can be removed from the list. An unavailable remembered folder falls back safely for new downloads; a missing per-torrent folder is recreated when possible, otherwise that torrent remains visible with its saved location and an error.

`src-tauri/src/commands.rs` contains thin commands for folder selection, adding each input type, listing torrents, retrieving status and preferences, controlling lifecycle, and opening a torrent's folder. The service maps rqbit states into Torque's app-owned `queued`, `downloading`, `paused`, `completed`, and `error` states. Its DTOs also carry the metadata name, info hash, file list, progress, byte counts, transfer rates, connected peers when rqbit reports them, addition/completion timestamps, engine availability, and a display-only output-folder name. The React queue polls the list and invokes actions through the typed bridge in `src/lib/desktop.ts`.

The frontend keeps polling, add-operation state, the startup-resume preference, and per-torrent action feedback in `src/app/useTorrentQueue.ts`. `TorrentFilters` derives All, Downloading, Queued, Completed, Paused, and Errors views from the app-owned status. `TorrentRow` renders progress, the expanded file list, status, peers, transfer rates, and state-appropriate controls: pause, resume, retry, open folder, and remove.

Pause, resume, retry, and remove call rqbit only inside `TorrentService`; pause/resume/retry commands return refreshed status DTOs. Remove forgets the torrent in the session and keeps all downloaded files. Torque does not currently expose a delete-files action. Open folder accepts only a torrent ID; Rust resolves and validates that torrent's output directory before passing it to the Tauri opener plugin, so the frontend cannot ask the native opener to run an arbitrary command or open an arbitrary path.

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

The Rust tests include persistence recovery and an rqbit session restart with both unfinished and completed torrent entries.

Build the desktop application and platform bundles:

```sh
pnpm tauri:build
```

Tauri writes native binaries and bundles beneath `src-tauri/target/`.
