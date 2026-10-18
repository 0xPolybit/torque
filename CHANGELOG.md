# Changelog

Notable changes to Torque are documented here for each release.

## [Unreleased]

- Add user-facing changes here before preparing the next release.

## [0.3.1] - 2026-10-18

- Wait for resolved torrent initialization before applying file priorities or restoring unfinished downloads.
- Pause active torrents that are still initializing before updater installation.
- Fix lifecycle test fixtures for pre-existing download files and asynchronous torrent initialization.
