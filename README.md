# Torque

Torque is a dark, desktop-first foundation for a modern torrent downloader. This initial version includes the Tauri shell, an empty transfers view, and a working React-to-Rust command bridge. Torrent downloading and queue management are not implemented yet, so **Add torrent** is intentionally disabled.

## Tech stack

- Tauri 2 desktop shell and Rust backend
- React 19 and TypeScript
- Vite 7 for development and frontend builds
- pnpm 11 for package management
- Inter Variable for bundled UI typography and Lucide for icons

## Project structure

```text
src/
  app/                    App shell and desktop connection state
  components/             Sidebar and backend status
  features/transfers/     Empty queue view
  lib/                    Typed Tauri command wrappers
  main.tsx                React entry point
  styles.css              Theme tokens and desktop layout
src-tauri/
  capabilities/           Tauri 2 window permissions
  icons/                  Source SVG and generated platform icons
  src/commands.rs         Rust commands and OS-aware paths
  src/lib.rs              Tauri command registration
  src/main.rs             Native application entry point
  tauri.conf.json         Window, security, and build configuration
  Cargo.toml              Rust dependencies and crate settings
index.html                Vite document
vite.config.ts            Local frontend server configuration
package.json              Frontend scripts and dependencies
pnpm-workspace.yaml       pnpm build-script policy
```

## Installation requirements

- Node.js 22 or newer and pnpm 11.19.0. The package declares its pnpm version for Corepack.
- Rust 1.90 or newer with the native target for your operating system.
- Tauri's platform build dependencies. On Windows, install Microsoft C++ Build Tools with **Desktop development with C++** and the Microsoft Edge WebView2 Runtime. macOS requires Xcode Command Line Tools. Linux requires the WebKitGTK and system build libraries for your distribution.

Building Windows MSI installers also requires the Windows **VBScript** optional feature. It is enabled on most Windows installations.

See the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for the current operating-system package list. Windows 10 and newer usually include WebView2.

## Development

Install the frontend dependencies once:

```sh
pnpm install
```

Run the desktop app with hot reload:

```sh
pnpm tauri:dev
```

Run only the Vite frontend in a browser:

```sh
pnpm dev
```

The frontend runs at `http://127.0.0.1:1420`. Outside Tauri, the interface remains visible and reports that the desktop backend is unavailable; this exercises the frontend's error and retry state.

## Build and checks

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

Build the desktop application and platform bundles:

```sh
pnpm tauri:build
```

Tauri writes native binaries and bundles beneath `src-tauri/target/`.

## Frontend/backend communication

The frontend calls the Rust `get_app_info` command through Tauri's typed `invoke` API. The command returns the app version and platform, and resolves the user's download folder with Tauri's platform-aware path API. The UI reports connection failures with a retry action and keeps rendering if it is opened outside the desktop runtime.

The current backend is only a foundation for the torrent engine; it does not fetch, seed, or manage torrent data yet.
