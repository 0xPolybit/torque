# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

React, TypeScript, Vite, Tauri 2, Rust, and librqbit for BitTorrent transfers.

## Users

People who want a desktop application for managing torrent downloads. This audience is inferred from the product name and request.

## Product Purpose

Torque downloads and monitors torrents in a cross-platform desktop application. It accepts magnet links, local `.torrent` files, and HTTP/HTTPS torrent URLs, and reports progress and transfer stats from the Rust engine.

## Positioning

No differentiated product position has been established yet.

## Operating Context

The application runs locally on a desktop operating system. Filesystem locations must be resolved with platform-aware APIs.

## Capabilities and Constraints

- The Rust service owns the rqbit session, torrent file reads, and selected output paths.
- The frontend can request native file/folder pickers and use opaque output-directory IDs; it does not receive unrestricted filesystem access.
- The service reports metadata, state, progress, speeds, and connected peers when available.
- Pause, resume, removal, file selection, and additional queue controls can be added through the service layer.
- The frontend must handle backend invocation failures without preventing the interface from rendering.

## Brand Commitments

- Product name: Torque.
- Interface direction: dark by default, minimal, rounded panels, subtle borders, compact desktop-first spacing, clear typography, native-feeling window chrome, and no unnecessary visual clutter.

## Evidence on Hand

The repository began as a Tauri shell and gained its first rqbit-backed transfer flow in this implementation. Displayed download activity and statistics must come from the engine; do not invent transfer data or imply authorization for a torrent's contents.

## Product Principles

- Keep the transfer list and statistics tied to rqbit state.
- Use operating-system-aware filesystem APIs.
- Keep frontend/backend boundaries clear and command failures understandable.
- Support downloading only content the user is legally authorized to access.
