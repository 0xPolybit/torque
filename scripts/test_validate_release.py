import unittest
import email.message
import urllib.request

from validate_release import (
    _GitHubAssetRedirectHandler,
    require_newer_stable_version,
    validate_release,
    validate_signature_payload,
)


class ValidateReleaseTests(unittest.TestCase):
    def setUp(self):
        self.repository = "0xPolybit/torque"
        self.tag = "v1.2.3"
        self.version = "1.2.3"
        self.assets = []
        self.platforms = {}
        artifacts = {
            "windows-x86_64": "Torque_1.2.3_x64-setup.nsis.zip",
            "darwin-x86_64": "Torque_1.2.3_x64.app.tar.gz",
            "darwin-aarch64": "Torque_1.2.3_aarch64.app.tar.gz",
            "linux-x86_64": "Torque_1.2.3_amd64.AppImage.tar.gz",
        }
        for platform, name in artifacts.items():
            url = f"https://github.com/{self.repository}/releases/download/{self.tag}/{name}"
            self.platforms[platform] = {"url": url, "signature": f"signed-content-{platform}"}
            self.assets.extend([
                {"name": name, "browser_download_url": url, "size": 1000},
                {"name": f"{name}.sig", "browser_download_url": f"{url}.sig", "size": 128},
            ])
        for name in [
            "Torque_1.2.3_x64-setup.exe",
            "Torque_1.2.3_x64_en-US.msi",
            "Torque_1.2.3_aarch64.dmg",
            "torque_1.2.3_amd64.deb",
            "torque-1.2.3-1.x86_64.rpm",
            "Torque_1.2.3_amd64.AppImage",
            "latest.json",
        ]:
            self.assets.append({"name": name, "browser_download_url": f"https://github.com/{self.repository}/releases/download/{self.tag}/{name}", "size": 100})
        self.release = {"tag_name": self.tag, "draft": True, "prerelease": False, "assets": self.assets}
        self.manifest = {"version": self.version, "platforms": self.platforms}

    def test_accepts_complete_release_and_maps_each_architecture(self):
        result = validate_release(self.release, self.manifest, self.version, self.repository, self.tag)
        self.assertEqual(set(result), set(self.platforms))

    def test_rejects_missing_or_unexpected_platform_entries(self):
        del self.manifest["platforms"]["darwin-aarch64"]
        with self.assertRaisesRegex(ValueError, "platform keys mismatch"):
            validate_release(self.release, self.manifest, self.version, self.repository, self.tag)

    def test_rejects_wrong_architecture_bundle_for_platform(self):
        self.manifest["platforms"]["darwin-aarch64"]["url"] = self.manifest["platforms"]["darwin-x86_64"]["url"]
        with self.assertRaisesRegex(ValueError, "expected architecture"):
            validate_release(self.release, self.manifest, self.version, self.repository, self.tag)

    def test_rejects_asset_from_another_tag_or_insecure_origin(self):
        entry = self.manifest["platforms"]["windows-x86_64"]
        entry["url"] = entry["url"].replace(self.tag, "v1.2.2")
        with self.assertRaisesRegex(ValueError, "tagged release"):
            validate_release(self.release, self.manifest, self.version, self.repository, self.tag)
        entry["url"] = entry["url"].replace("https://", "http://").replace("v1.2.2", self.tag)
        with self.assertRaisesRegex(ValueError, "must use HTTPS"):
            validate_release(self.release, self.manifest, self.version, self.repository, self.tag)

    def test_rejects_missing_signature_or_human_installer(self):
        self.manifest["platforms"]["linux-x86_64"]["signature"] = ""
        with self.assertRaisesRegex(ValueError, "has no signature"):
            validate_release(self.release, self.manifest, self.version, self.repository, self.tag)
        self.manifest["platforms"]["linux-x86_64"]["signature"] = "valid-shaped-signature"
        self.release["assets"] = [asset for asset in self.release["assets"] if asset["name"] != "Torque_1.2.3_aarch64.dmg"]
        with self.assertRaisesRegex(ValueError, "macOS disk image"):
            validate_release(self.release, self.manifest, self.version, self.repository, self.tag)

    def test_rejects_missing_sidecar_signature_asset(self):
        self.release["assets"] = [asset for asset in self.release["assets"] if asset["name"] != "Torque_1.2.3_aarch64.app.tar.gz.sig"]
        with self.assertRaisesRegex(ValueError, "missing its .sig asset"):
            validate_release(self.release, self.manifest, self.version, self.repository, self.tag)

    def test_rejects_a_signature_sidecar_that_differs_from_latest_json(self):
        with self.assertRaisesRegex(ValueError, "does not match"):
            validate_signature_payload("trusted signature", b"tampered signature\n")

    def test_rejects_non_draft_or_prerelease_publication(self):
        self.release["draft"] = False
        with self.assertRaisesRegex(ValueError, "draft stable release"):
            validate_release(self.release, self.manifest, self.version, self.repository, self.tag)

    def test_release_version_must_advance_the_stable_channel(self):
        require_newer_stable_version("1.0.1", "1.0.0")
        require_newer_stable_version("1.1.0", "1.0.9")
        require_newer_stable_version("2.0.0", "1.9.9")
        with self.assertRaisesRegex(ValueError, "not newer"):
            require_newer_stable_version("1.0.0", "1.0.0")
        with self.assertRaisesRegex(ValueError, "not newer"):
            require_newer_stable_version("1.0.9", "1.1.0")

    def test_asset_redirect_drops_authorization_and_rejects_http(self):
        request = urllib.request.Request(
            "https://api.github.com/repos/example/release/assets/1",
            headers={"Authorization": "Bearer placeholder"},
        )
        handler = _GitHubAssetRedirectHandler()
        redirected = handler.redirect_request(
            request, None, 302, "Found", email.message.Message(), "https://release-assets.githubusercontent.com/download/asset"
        )
        self.assertNotIn("Authorization", {key.title(): value for key, value in redirected.headers.items()})
        with self.assertRaisesRegex(Exception, "Refused unsafe") as error:
            handler.redirect_request(request, None, 302, "Found", email.message.Message(), "http://example.invalid/asset")
        error.exception.close()


if __name__ == "__main__":
    unittest.main()
