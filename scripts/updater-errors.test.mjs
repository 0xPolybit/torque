import assert from "node:assert/strict";
import test from "node:test";
import { classifyUpdateError, safeUpdateFailureDetail } from "../src/lib/updateErrors.js";

test("network and GitHub failures remain distinct", () => {
  assert.equal(classifyUpdateError(new Error("request timed out"), "check").category, "network");
  assert.equal(classifyUpdateError(new Error("HTTP 404 release not found"), "check").category, "github");
  assert.equal(classifyUpdateError(new Error("HTTP 429 rate limit"), "check").category, "github");
});

test("invalid manifests, versions, and signatures are categorized safely", () => {
  assert.equal(classifyUpdateError(new Error("JSON parse error"), "check").category, "manifest");
  assert.equal(classifyUpdateError(new Error("invalid SemVer version"), "check").category, "version");
  assert.equal(classifyUpdateError(new Error("invalid URL in updater configuration"), "check").category, "manifest");
  assert.equal(classifyUpdateError(new Error("Minisign signature verification failed"), "download").category, "signature");
  assert.equal(classifyUpdateError(new Error("signed version mismatch"), "install").category, "signature");
});

test("storage and permission failures surface actionable categories", () => {
  assert.equal(classifyUpdateError(new Error("No space left on device"), "download").category, "disk-space");
  assert.equal(classifyUpdateError(new Error("Permission denied while writing installer"), "install").category, "permission");
});

test("interrupted downloads and install/restart failures retain operation context", () => {
  assert.equal(classifyUpdateError(new Error("unexpected stream end"), "download").category, "download");
  assert.equal(classifyUpdateError(new Error("native installer returned failure"), "install").category, "install");
  assert.equal(classifyUpdateError(new Error("relaunch failed"), "restart").category, "restart");
});

test("failure details remove URLs and bearer values and cap their length", () => {
  const detail = safeUpdateFailureDetail(new Error("GET https://example.invalid/path Bearer private-token"));
  assert.equal(detail, "GET <update URL> Bearer [redacted]");
  assert.equal(safeUpdateFailureDetail(new Error("x".repeat(500))).length, 280);
});
