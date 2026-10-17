# Secure updater releases

This repository publishes stable Torque desktop releases from version tags. The checked-in updater public key and its matching private signing identity form one long-lived trust relationship with installed copies of Torque. This project has no key-rotation migration: replacing or losing the private key can prevent existing users from accepting future updates. Never generate a replacement key as part of a normal release.

## Signing key setup

Use the official Tauri CLI when provisioning a new updater identity for a new application. The current Tauri 2 command is:

```sh
mkdir -p "$HOME/.tauri"
pnpm tauri signer generate -w "$HOME/.tauri/torque-updater.key"
```

In PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.tauri" | Out-Null
pnpm tauri signer generate -w "$env:USERPROFILE\.tauri\torque-updater.key"
```

The CLI prompts for a password and writes a private key plus a corresponding `.pub` file. Keep both in a secure maintainer vault, outside the repository. The public key may be embedded in `src-tauri/tauri.conf.json`; the private key and its password must remain secret. Do not pass `--force`, and do not run key generation for routine releases. The existing Torque public key is already configured; release maintainers must use its matching existing private key.

If a local private key is temporarily needed, `.gitignore` excludes `src-tauri/.private/`. The release workflow does not need a committed key file. Provision the GitHub repository Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the private key contents accepted by the Tauri CLI.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password for that key; use an empty secret only if the established key is unencrypted.

GitHub Actions also provides `GITHUB_TOKEN`; the workflow grants it only the `contents: write` permission required to create and publish the release. Never put private key contents or passwords in source files, tests, `.env` files, build logs, or artifacts. No local preflight attempts to read or verify CI secrets.

The official CLI documentation describes signing key generation and the public/private key roles: [Tauri updater signing](https://v2.tauri.app/plugin/updater/).

## Version authority

The desktop application version must match in all four locations:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- Torque's own package entry in `src-tauri/Cargo.lock`

The `/frontend` marketing site is a separate Vite project and is not part of the desktop release version. The release script updates the four desktop files together and creates a stable `vMAJOR.MINOR.PATCH` tag. It commits and tags locally, but never pushes or force-pushes.

## Release process

1. Make application changes, update `CHANGELOG.md`, and commit both to `main`. Prepare the release notes that should appear on GitHub.
3. Run the project checks, for example:

   ```sh
   pnpm release:test
   pnpm typecheck
   pnpm build
   cargo fmt --check --manifest-path src-tauri/Cargo.toml
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

4. Run release preflight. It checks all version locations, stable SemVer, a clean `main` worktree, that the next tag is unused, and the updater public-key/configuration/endpoint settings. By default it checks the next patch version:

   ```sh
   pnpm release:preflight
   ```

   For a minor or major release, pass the explicit kind:

   ```sh
   node scripts/release.mjs preflight --kind minor
   node scripts/release.mjs preflight --kind major
   ```

   Preflight checks both local tags and `origin`. If offline, `--local-only` skips only the remote tag lookup; independently confirm the tag does not exist remotely before continuing.

5. Bump, commit, and tag the release. Choose exactly one:

   ```sh
   pnpm release:patch
   pnpm release:minor
   pnpm release:major
   ```

   The script requires a clean worktree on `main`, validates the current configuration and prospective tag, updates all four version files, creates a `chore(release): vX.Y.Z` commit, and creates `vX.Y.Z`. It does not push. `--allow-non-main` is an explicit override for an intentional branch release; use it only when the repository's release process calls for one.

6. Review the commit and tag, then push them explicitly:

   ```sh
   git push origin main
   git push origin vX.Y.Z
   ```

   Replace `vX.Y.Z` with the tag printed by the script. Never force-push a release tag.

7. The `v*` tag starts `.github/workflows/release.yml`. It builds Windows x64, macOS Apple Silicon, macOS Intel, and Linux x64, signs updater artifacts, creates a draft GitHub Release, and uploads installers, signatures, and a `latest.json` assembled from generated artifacts. The final workflow job checks all supported entries and assets before publishing it as a stable release. A failed build or validation leaves the release unpublished.

8. Existing installations check `https://github.com/0xPolybit/torque/releases/latest/download/latest.json` and can discover the newly published stable release.

The workflow can also be dispatched manually for an existing pushed stable tag. Pushes to `main` alone do not create releases. Drafts and prereleases are not published as stable updater releases.

## Preflight and version commands

```sh
pnpm release:preflight          # Check the next patch tag
pnpm release:preflight -- --kind minor
pnpm release:patch              # Update versions, commit, and tag locally
pnpm release:minor
pnpm release:major
pnpm release:test
```

`release:preflight` does not attempt to authenticate to GitHub Actions or inspect secret values. Signing secret presence is checked by CI before Tauri builds.
