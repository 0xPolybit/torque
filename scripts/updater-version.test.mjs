import assert from "node:assert/strict";
import test from "node:test";
import { compareSemVer, isStableUpdateAllowed, isValidSemVer } from "../src/lib/semver.js";

test("stable updates accept patch, minor, and major advances", () => {
  for (const [current, candidate] of [
    ["1.0.0", "1.0.1"],
    ["1.0.0", "1.1.0"],
    ["1.0.0", "2.0.0"],
  ]) {
    assert.equal(isStableUpdateAllowed(current, candidate), true);
  }
});

test("stable updates reject downgrades, equal versions, and prereleases", () => {
  assert.equal(isStableUpdateAllowed("1.1.0", "1.0.9"), false);
  assert.equal(isStableUpdateAllowed("1.0.0", "1.0.0"), false);
  assert.equal(isStableUpdateAllowed("1.0.0", "1.0.1-rc.1"), false);
  assert.equal(isStableUpdateAllowed("unknown", "1.0.1"), false);
  assert.equal(isStableUpdateAllowed("1.0.0-beta.1", "1.0.0"), true);
});

test("malformed versions are distinguished from valid versions that are not updates", () => {
  assert.equal(isValidSemVer("1.0.1"), true);
  assert.equal(isValidSemVer("1.0"), false);
  assert.equal(isValidSemVer("1.0.01"), false);
  assert.equal(isStableUpdateAllowed("1.0.0", "1.0.1-malformed!"), false);
});

test("SemVer precedence handles prerelease identifiers and ignores build metadata", () => {
  assert.equal(compareSemVer("1.0.0-alpha", "1.0.0-alpha.1"), -1);
  assert.equal(compareSemVer("1.0.0-alpha.2", "1.0.0-alpha.10"), -1);
  assert.equal(compareSemVer("1.0.0-1", "1.0.0-alpha"), -1);
  assert.equal(compareSemVer("1.0.0+build.5", "1.0.0+build.6"), 0);
  assert.equal(compareSemVer("v2.0.0", "1.9.9"), 1);
});

test("large numeric identifiers compare without JavaScript precision loss", () => {
  assert.equal(compareSemVer("999999999999999999999.0.0", "1000000000000000000000.0.0"), -1);
  assert.equal(compareSemVer("1.0.0-999999999999999999999", "1.0.0-1000000000000000000000"), -1);
});
