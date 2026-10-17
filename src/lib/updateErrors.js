export function classifyUpdateError(error, operation) {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  if (/minisign|signature|signedversion|signed version/i.test(detail)) {
    return { category: "signature", message: "The update could not be verified. Torque did not install it." };
  }
  if (/no space|disk full|insufficient space|not enough space/i.test(detail)) {
    return { category: "disk-space", message: "There is not enough disk space to download or install the update. Free space and try again." };
  }
  if (/permission denied|access is denied|unauthorized|operation not permitted/i.test(detail)) {
    return { category: "permission", message: "Torque could not write the update. Check application-folder permissions and try again." };
  }
  if (/semver|invalid version|malformed version/i.test(detail)) {
    return { category: "version", message: "GitHub Releases returned an invalid update version." };
  }
  if (/json|manifest|serialization|deserialize|parse|invalidupdaterformat|did not match any variant|invalid url|unsupported scheme/i.test(detail)) {
    return { category: "manifest", message: "GitHub Releases returned an invalid update manifest." };
  }
  if (/dns|offline|network|connection|timed? ?out|timeout|failed to connect|resolve host/i.test(detail)) {
    return { category: "network", message: "Torque could not reach the update service. Check your internet connection and try again." };
  }
  if (/404|403|429|5\d\d|http status|status code|rate.?limit|release not found|targetnotfound|github/i.test(detail)) {
    return { category: "github", message: "GitHub Releases could not provide an update for this build." };
  }
  if (operation === "download") {
    return { category: "download", message: "The update download was interrupted. Check your connection and try again." };
  }
  if (operation === "install") {
    return { category: "install", message: "The verified update could not be installed. Close other Torque processes and try again." };
  }
  if (operation === "restart") {
    return { category: "restart", message: "The update is installed, but Torque could not restart. Restart the application to finish applying it." };
  }
  return { category: "other", message: "The update operation failed. Try again later." };
}

export function safeUpdateFailureDetail(error) {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  const sanitized = detail
    .replace(/https?:\/\/\S+/gi, "<update URL>")
    .replace(/(bearer\s+)\S+/gi, "$1[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized ? sanitized.slice(0, 280) : null;
}
