# Product

<!-- impeccable:product-schema 1 -->

## Platform

Cross-platform desktop (Tauri 2).

## Stack

React, TypeScript, Vite, Tauri 2, and Rust, as specified for the initial build.

## Users

People who want a desktop application for managing torrent downloads. This audience is inferred from the product name and request.

## Product Purpose

Torque is intended to download and manage torrents in a desktop application. The first version establishes the desktop shell, frontend-to-Rust communication, and an empty downloads view. It succeeds when the app launches and its frontend and backend build reliably.

## Positioning

No differentiated product position has been established yet.

## Operating Context

The application runs locally on a desktop operating system. Filesystem locations must be resolved with platform-aware APIs.

## Capabilities and Constraints

- The initial version is application scaffolding with a working Tauri command; torrent downloading, queue management, and a torrent engine are not in scope yet.
- The empty state has a disabled “Add torrent” action until download support exists.
- The frontend must handle backend invocation failures without preventing the interface from rendering.

## Brand Commitments

- Product name: Torque.
- Explicit interface constraints for the initial application: dark by default, minimal, rounded panels, subtle borders, compact desktop-first spacing, clear typography, native-feeling window chrome, and no unnecessary visual clutter.

## Evidence on Hand

The repository began with a short product README and no application code, product assets, or torrent-engine implementation. Do not invent download activity, user data, or product claims.

## Product Principles

- Keep the first version honest about which download features are not yet available.
- Use operating-system-aware filesystem APIs.
- Keep frontend/backend boundaries clear and command failures understandable.
