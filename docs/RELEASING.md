# Secure updater releases

Torque uses the official Tauri 2 updater plugin and publishes stable desktop updates through GitHub Releases. The checked-in public key and its matching private signing identity establish a long-lived trust relationship with installed copies. There is no key-rotation migration: losing the private key can block future in-app updates for existing users. Never replace or regenerate the key during a normal release.

## Signing key and GitHub secrets

The existing public verification key is embedded in `src-tauri/tauri.conf.json`. Updater artifact creation and `requireSignedVersion` are enabled. The official updater verifies the downloaded artifact against that public key and verifies that the signed version matches `latest.json` before installation. Torque installs only the update object returned by the official plugin; there is no frontend override or "install anyway" path.

For a new application identity only, provision keys with the official Tauri CLI:

```sh
mkdir -p "$HOME/.tauri"
pnpm tauri signer generate -w "$HOME/.tauri/torque-updater.key"
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.tauri" | Out-Null
pnpm tauri signer generate -w "$env:USERPROFILE\.tauri\torque-updater.key"
```

The CLI writes a private key and a matching `.pub` file. The public key can be embedded in the app; store the private key and password in an access-controlled maintainer vault and back them up securely. Do not run key generation for Torque's routine releases and do not use `--force`. The existing Torque public key must keep using its corresponding private key. `.gitignore` excludes `src-tauri/.private/` for temporary local use.

Configure these GitHub repository Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the existing private key contents.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password; an empty secret is valid only for an unencrypted key.

The workflow uses the automatically provided `GITHUB_TOKEN` with `contents: write` only on build and publish jobs. It checks key presence without echoing the value. Private keys, passwords, tokens, and code-signing certificates must never be checked in, placed in `.env` files, logged, or uploaded as build artifacts. Local preflight does not read GitHub secrets.

See the official [Tauri updater documentation](https://v2.tauri.app/plugin/updater/) for signing key generation and updater configuration.

## Version authority

The desktop version must agree across all four locations:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- Torque's package entry in `src-tauri/Cargo.lock`

The `/frontend` marketing/documentation site is a separate Vite project and is not part of desktop release versioning. `scripts/release.mjs` changes the four desktop files together, creates a release commit and a stable `vMAJOR.MINOR.PATCH` tag locally, and never pushes or force-pushes.

The updater uses the stable channel. The GitHub workflow rejects prerelease tags, and the app rejects prerelease, equal, malformed, and older candidates before showing them. The official updater also uses its default strict SemVer comparator, which accepts only a version newer than the installed app.

## Release checklist

1. Make changes on `main`, update `CHANGELOG.md` and proposed release notes, then commit the work.
2. Run the local checks:

   ```sh
   pnpm install --frozen-lockfile
   pnpm release:test
   pnpm updater:test
   pnpm updater:config
   pnpm typecheck
   pnpm build
   python -m unittest discover -s scripts -p 'test_*.py'
   cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
   cargo check --manifest-path src-tauri/Cargo.toml
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

   The Python manifest tests use only the standard library. The version tests cover stable patch/minor/major advances, equal versions, downgrade rejection, SemVer prerelease ordering, and the stable-only channel policy. Release-manifest tests use mocked GitHub assets and reject missing platforms, wrong architecture mappings, insecure or wrong-tag URLs, missing/changed signatures, missing installers, and draft/prerelease mismatches.

3. Run updater configuration validation, then preflight on a clean `main` checkout. Configuration validation checks the embedded minisign public key, `createUpdaterArtifacts`, `requireSignedVersion`, disabled downgrades, HTTPS GitHub endpoints derived from `origin`, the narrow Tauri capability permission set, and the local signing-key ignore rule. Preflight also checks aligned versions, stable SemVer, and an unused prospective tag:

   ```sh
   pnpm updater:config
   pnpm release:preflight
   ```

   For minor or major releases:

   ```sh
   node scripts/release.mjs preflight --kind minor
   node scripts/release.mjs preflight --kind major
   ```

   Preflight checks local and remote tags. If offline, `--local-only` skips only the remote tag lookup; independently verify the tag is unused before proceeding.

4. Choose one version bump command. Each updates the four desktop version files, makes a `chore(release): vX.Y.Z` commit, and creates the matching local tag:

   ```sh
   pnpm release:patch
   pnpm release:minor
   pnpm release:major
   ```

   The working tree must be clean and the current branch must be `main`. `--allow-non-main` is an explicit override for a deliberate branch release.

5. Review the commit and tag. Push explicitly; the script does not push:

   ```sh
   git push origin main
   git push origin vX.Y.Z
   ```

   Never force-push a release tag.

6. The `v*` tag starts `.github/workflows/release.yml`. The workflow first checks out the tagged source, validates versions, runs the frontend/Rust checks and tests, then Tauri production builds for Windows x64, macOS Apple Silicon, macOS Intel, and Linux x64. Each build signs its updater bundle and uses `tauri-apps/tauri-action@v1` with the current `uploadUpdaterJson: true` option to merge generated artifacts into `latest.json`.

7. The release begins as a draft. Before publishing, `scripts/validate_release.py` checks that the candidate is newer than GitHub's current stable release, then checks the exact `windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`, and `linux-x86_64` key set; architecture markers and updater bundle types; HTTPS asset URLs from this repository and tag; matching `.sig` sidecars and manifest signatures; stable version/tag; and human-installable Windows, macOS, and Linux packages. A failed build or check leaves the release as a draft. Only after the gate passes does the workflow publish it as a stable latest release.

8. Published stable releases expose `latest.json` at:

   ```text
   https://github.com/0xPolybit/torque/releases/latest/download/latest.json
   ```

   Existing installations check this URL according to their update preferences. Pushes to `main` alone do not publish a release. A manual workflow dispatch can publish only an existing pushed stable tag.

## Testing and recovery

- Use `pnpm updater:test` to exercise version ordering and normalized network, manifest, signature, disk-space, permission, download, install, and restart errors. Release asset tests run with `python -m unittest discover -s scripts -p 'test_*.py'`.
- The Tauri updater's own Rust tests include a controlled bad-signature case and assert that `Update::install` rejects tampered bytes, plus signed-version mismatch checks. Torque uses the same locked `tauri-plugin-updater` version and does not wrap or replace its verifier.
- Inspect the GitHub draft before publishing. The gate refuses a missing or malformed `latest.json`, a missing platform bundle or signature, a URL to another release, and a mismatch between the embedded manifest signature and the `.sig` sidecar.
- If CI cannot access signing secrets or a build fails, it does not publish. Fix the secret/build issue and rerun the workflow against the same draft/tag; do not create a new signing key.
- If an installed client reports a signature or signed-version error, do not bypass verification. Keep the release unpublished, verify the existing signing identity and generated `.sig`/manifest pairing, then rebuild and validate the draft.
- If the updater private key is lost, preserve existing app installations and publish manual installers only after an explicit migration plan. Replacing the key without a supported migration breaks the current updater trust chain.

No Apple Developer signing/notarization or Windows code-signing credentials are configured here. GitHub builds are updater-signed, but platform installers may still show the normal unsigned publisher or first-launch security warnings.
