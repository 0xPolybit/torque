const semverPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseSemVer(value) {
  if (typeof value !== "string") return null;
  const normalized = value.startsWith("v") ? value.slice(1) : value;
  if (!semverPattern.test(value)) return null;
  const [withoutBuild] = normalized.split("+");
  const [core, prerelease] = withoutBuild.split("-");
  return {
    core: core.split("."),
    prerelease: prerelease === undefined ? null : prerelease.split("."),
  };
}

/** Return whether a string is a valid SemVer value accepted by the updater. */
export function isValidSemVer(value) {
  return parseSemVer(value) !== null;
}

function compareNumericIdentifiers(left, right) {
  const a = left.replace(/^0+(?=\d)/, "");
  const b = right.replace(/^0+(?=\d)/, "");
  if (a.length !== b.length) return a.length > b.length ? 1 : -1;
  return a === b ? 0 : a > b ? 1 : -1;
}

/** Compare two SemVer strings. Invalid values sort below valid versions. */
export function compareSemVer(left, right) {
  const first = parseSemVer(left);
  const second = parseSemVer(right);
  if (!first || !second) return first ? 1 : second ? -1 : 0;

  for (let index = 0; index < 3; index += 1) {
    const comparison = compareNumericIdentifiers(first.core[index], second.core[index]);
    if (comparison !== 0) return comparison;
  }

  if (first.prerelease === null || second.prerelease === null) {
    if (first.prerelease === second.prerelease) return 0;
    return first.prerelease === null ? 1 : -1;
  }

  const count = Math.max(first.prerelease.length, second.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const a = first.prerelease[index];
    const b = second.prerelease[index];
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1;
    if (a === b) continue;

    const aNumeric = /^(0|[1-9]\d*)$/.test(a);
    const bNumeric = /^(0|[1-9]\d*)$/.test(b);
    if (aNumeric && bNumeric) return compareNumericIdentifiers(a, b);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}

/** Stable Torque builds only accept strictly newer stable release versions. */
export function isStableUpdateAllowed(currentVersion, candidateVersion) {
  const current = parseSemVer(currentVersion);
  const candidate = parseSemVer(candidateVersion);
  return Boolean(current && candidate && candidate.prerelease === null && compareSemVer(candidateVersion, currentVersion) > 0);
}
