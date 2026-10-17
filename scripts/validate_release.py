#!/usr/bin/env python3
"""Validate a draft Torque release and its tauri-action updater manifest."""

from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.error
import urllib.request


EXPECTED_PLATFORMS = {
    "windows-x86_64": (".nsis.zip", ("x64", "x86_64", "amd64")),
    "darwin-x86_64": (".app.tar.gz", ("x64", "x86_64", "amd64")),
    "darwin-aarch64": (".app.tar.gz", ("aarch64", "arm64")),
    "linux-x86_64": (".AppImage.tar.gz", ("amd64", "x86_64", "x64")),
}
STABLE_VERSION = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _asset_name(url: str, repository: str, tag: str) -> str:
    parsed = urllib.parse.urlparse(url)
    _require(parsed.scheme == "https" and parsed.hostname == "github.com", "Updater URLs must use HTTPS GitHub Release assets.")
    _require(not parsed.query and not parsed.fragment, "Updater URLs must not include query strings or fragments.")
    asset_path = urllib.parse.unquote(parsed.path)
    expected_prefix = f"/{repository}/releases/download/{tag}/"
    _require(asset_path.startswith(expected_prefix), "Updater URL does not point to this repository's tagged release.")
    name = asset_path[len(expected_prefix):]
    _require(bool(name) and "/" not in name, "Updater URL does not identify a release asset filename.")
    return name


def _version_tuple(version: str) -> tuple[int, int, int]:
    match = STABLE_VERSION.fullmatch(version)
    _require(match is not None, "Release version must be stable SemVer.")
    return tuple(int(part) for part in match.groups())


def require_newer_stable_version(candidate: str, latest: str | None) -> None:
    if latest is None:
        return
    _require(
        _version_tuple(candidate) > _version_tuple(latest),
        "Refusing to publish a release that is not newer than the current stable release.",
    )


def validate_signature_payload(manifest_signature: str, sidecar_bytes: bytes) -> None:
    try:
        sidecar_signature = sidecar_bytes.decode("utf-8").strip()
    except UnicodeDecodeError as error:
        raise ValueError("Updater signature asset is not valid UTF-8 text.") from error
    _require(bool(manifest_signature.strip()) and sidecar_signature == manifest_signature.strip(),
             "latest.json signature does not match its .sig asset.")


def validate_release(
    release: dict,
    manifest: dict,
    version: str,
    repository: str,
    tag: str,
    latest_stable_version: str | None = None,
) -> dict[str, str]:
    _require(bool(STABLE_VERSION.fullmatch(version)), "Release version must be stable SemVer.")
    require_newer_stable_version(version, latest_stable_version)
    _require(tag == f"v{version}", "Release tag does not match the application version.")
    _require(release.get("tag_name") == tag and release.get("draft") is True and release.get("prerelease") is False,
             "Expected a draft stable release with the requested tag.")
    _require(manifest.get("version") == version, "latest.json version does not match the release tag.")

    platforms = manifest.get("platforms")
    _require(isinstance(platforms, dict), "latest.json platforms must be an object.")
    actual_platforms = set(platforms)
    expected_platforms = set(EXPECTED_PLATFORMS)
    _require(actual_platforms == expected_platforms,
             f"latest.json platform keys mismatch (missing: {', '.join(sorted(expected_platforms - actual_platforms)) or 'none'}; "
             f"unexpected: {', '.join(sorted(actual_platforms - expected_platforms)) or 'none'}).")

    assets = release.get("assets")
    _require(isinstance(assets, list), "GitHub Release assets are missing.")
    assets_by_name = {asset.get("name"): asset for asset in assets if isinstance(asset.get("name"), str)}
    _require("latest.json" in assets_by_name, "tauri-action did not upload latest.json.")
    asset_urls = {asset.get("browser_download_url") for asset in assets}
    matched_assets: dict[str, str] = {}

    for platform, (required_suffix, architecture_aliases) in EXPECTED_PLATFORMS.items():
        entry = platforms[platform]
        _require(isinstance(entry, dict), f"latest.json entry for {platform} must be an object.")
        url = entry.get("url")
        signature = entry.get("signature")
        _require(isinstance(url, str) and bool(url), f"latest.json entry for {platform} has no updater URL.")
        _require(isinstance(signature, str) and bool(signature.strip()), f"latest.json entry for {platform} has no signature.")

        name = _asset_name(url, repository, tag)
        _require(url in asset_urls, f"latest.json URL for {platform} does not point to an asset in this release.")
        _require(name in assets_by_name, f"Updater asset for {platform} is missing from the release.")
        _require(name.endswith(required_suffix), f"{platform} points to the wrong updater bundle type.")
        lower_name = name.lower()
        _require(any(re.search(rf"(?:^|[-_.]){re.escape(alias)}(?:[-_.]|$)", lower_name) for alias in architecture_aliases),
                 f"Updater asset for {platform} does not identify the expected architecture.")
        _require(name not in matched_assets.values(), "Multiple platform keys point to the same updater asset.")
        matched_assets[platform] = name

        signature_name = f"{name}.sig"
        _require(signature_name in assets_by_name, f"Signed updater artifact for {platform} is missing its .sig asset.")
        _require(assets_by_name[signature_name].get("size", 0) <= 64 * 1024,
                 f"Updater signature asset for {platform} is unexpectedly large.")

    names = set(assets_by_name)
    required_installers = {
        "Windows NSIS installer": any(name.lower().endswith("-setup.exe") for name in names),
        "Windows MSI installer": any(name.lower().endswith(".msi") for name in names),
        "macOS disk image": any(name.lower().endswith(".dmg") for name in names),
        "Linux Debian package": any(name.lower().endswith(".deb") for name in names),
        "Linux RPM package": any(name.lower().endswith(".rpm") for name in names),
        "Linux AppImage": any(name.lower().endswith(".appimage") for name in names),
    }
    missing_installers = [label for label, present in required_installers.items() if not present]
    _require(not missing_installers, f"Release is missing human-installable artifacts: {', '.join(missing_installers)}.")
    return matched_assets


class _GitHubAssetRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keep API credentials on GitHub API requests, never on asset-CDN redirects."""

    def redirect_request(self, request, response, code, message, headers, new_url):
        source = urllib.parse.urlparse(request.full_url)
        destination = urllib.parse.urlparse(new_url)
        destination_host = (destination.hostname or "").lower()
        allowed_host = destination_host in {"github.com", "api.github.com"} or destination_host.endswith(".githubusercontent.com")
        if source.scheme != "https" or destination.scheme != "https" or not allowed_host:
            raise urllib.error.HTTPError(request.full_url, code, "Refused unsafe GitHub asset redirect.", headers, response)

        redirected = super().redirect_request(request, response, code, message, headers, new_url)
        if redirected and source.hostname != destination.hostname:
            for header_map in (redirected.headers, redirected.unredirected_hdrs):
                for key in list(header_map):
                    if key.lower() == "authorization":
                        del header_map[key]
        return redirected


def _github_get(url: str, token: str, accept: str = "application/vnd.github+json") -> bytes:
    parsed = urllib.parse.urlparse(url)
    _require(parsed.scheme == "https" and parsed.hostname in {"api.github.com", "github.com"},
             "GitHub API requests must use HTTPS on a GitHub host.")
    request = urllib.request.Request(
        url,
        headers={
            "Accept": accept,
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    opener = urllib.request.build_opener(_GitHubAssetRedirectHandler())
    with opener.open(request, timeout=30) as response:
        return response.read()


def main() -> None:
    token = os.environ.get("GH_TOKEN", "")
    repository = os.environ["GITHUB_REPOSITORY"]
    tag = os.environ["RELEASE_TAG"]
    version = os.environ["RELEASE_VERSION"]
    _require(bool(token), "GH_TOKEN is required to validate the draft release.")

    api_root = os.environ.get("GITHUB_API_URL", "https://api.github.com")
    release = json.loads(_github_get(f"{api_root}/repos/{repository}/releases/tags/{tag}", token))
    try:
        latest_release = json.loads(_github_get(f"{api_root}/repos/{repository}/releases/latest", token))
    except urllib.error.HTTPError as error:
        if error.code == 404:
            latest_release = None
        else:
            raise
    latest_tag = latest_release.get("tag_name") if latest_release else None
    latest_version = None
    if latest_tag is not None:
        _require(
            isinstance(latest_tag, str)
            and re.fullmatch(r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", latest_tag),
            "The current GitHub latest release does not use a stable vMAJOR.MINOR.PATCH tag.",
        )
        latest_version = latest_tag[1:]
    assets = {asset["name"]: asset for asset in release.get("assets", [])}
    _require("latest.json" in assets, "tauri-action did not produce latest.json.")
    manifest = json.loads(_github_get(assets["latest.json"]["url"], token, "application/octet-stream"))
    signed_assets = validate_release(release, manifest, version, repository, tag, latest_version)

    for platform, name in signed_assets.items():
        signature_asset = assets[f"{name}.sig"]
        signature_bytes = _github_get(signature_asset["url"], token, "application/octet-stream")
        validate_signature_payload(manifest["platforms"][platform]["signature"], signature_bytes)

    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write(f"release_id={release['id']}\n")
    print("Validated stable version, exact platform mapping, release assets, and updater signatures.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Avoid including API response bodies or request headers in CI logs.
        print(f"Release validation failed: {type(error).__name__}: {error}")
        raise SystemExit(1)
