#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILES = [
  'package.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
];

export function parseStableVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`Expected a stable SemVer version in MAJOR.MINOR.PATCH form; received ${String(value)}.`);
  }
  return value.split('.').map((part) => BigInt(part));
}

export function bumpVersion(current, kind) {
  const parts = parseStableVersion(current);
  if (!['patch', 'minor', 'major'].includes(kind)) {
    throw new Error(`Unsupported release type "${kind}". Use patch, minor, or major.`);
  }
  if (kind === 'major') return `${parts[0] + 1n}.0.0`;
  if (kind === 'minor') return `${parts[0]}.${parts[1] + 1n}.0`;
  return `${parts[0]}.${parts[1]}.${parts[2] + 1n}`;
}

export function readVersions(root = ROOT) {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const tauri = JSON.parse(readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const cargoToml = readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
  const cargoLock = readFileSync(path.join(root, 'src-tauri/Cargo.lock'), 'utf8');
  const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const lockMatch = cargoLock.match(/^\[\[package\]\]\r?\nname = "torque"\r?\nversion = "([^"]+)"/m);

  if (!cargoVersion) throw new Error('Could not find the Torque package version in src-tauri/Cargo.toml.');
  if (!lockMatch) throw new Error('Could not find the Torque package version in src-tauri/Cargo.lock.');

  return {
    packageJson,
    tauri,
    cargoToml,
    cargoLock,
    versions: {
      'package.json': packageJson.version,
      'src-tauri/tauri.conf.json': tauri.version,
      'src-tauri/Cargo.toml': cargoVersion,
      'src-tauri/Cargo.lock': lockMatch[1],
    },
  };
}

export function updateVersionFiles(root, nextVersion) {
  parseStableVersion(nextVersion);
  const state = readVersions(root);
  state.packageJson.version = nextVersion;
  state.tauri.version = nextVersion;
  writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(state.packageJson, null, 2)}\n`);
  writeFileSync(path.join(root, 'src-tauri/tauri.conf.json'), `${JSON.stringify(state.tauri, null, 2)}\n`);

  const cargoToml = state.cargoToml.replace(/^(version\s*=\s*)"[^"]+"/m, `$1"${nextVersion}"`);
  const cargoLock = state.cargoLock.replace(
    /(^\[\[package\]\]\r?\nname = "torque"\r?\nversion = ")[^"]+("\r?$)/m,
    `$1${nextVersion}$2`,
  );
  writeFileSync(path.join(root, 'src-tauri/Cargo.toml'), cargoToml);
  writeFileSync(path.join(root, 'src-tauri/Cargo.lock'), cargoLock);
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  if (result.error) throw new Error(`Could not run git ${args[0]}: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : '.'}`);
  }
  return result;
}

function githubRepository() {
  const remote = git(['remote', 'get-url', 'origin']).stdout.trim();
  let match = remote.match(/^(?:https?:\/\/|ssh:\/\/git@)github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) match = remote.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) throw new Error('The origin remote must point to a GitHub owner/repository URL to validate the updater endpoint.');
  return { owner: match[1], repository: match[2] };
}

function checkGitState({ allowNonMain, localOnly, candidateTag }) {
  const status = git(['status', '--porcelain', '--untracked-files=all']).stdout.trim();
  if (status) throw new Error('The working tree must be clean before release preflight or version bumping.');

  const branch = git(['branch', '--show-current']).stdout.trim();
  if (branch !== 'main' && !allowNonMain) {
    throw new Error(`Release tooling must run on main (currently on "${branch || 'detached HEAD'}"). Pass --allow-non-main only for an intentional release branch.`);
  }

  const localTag = git(['tag', '--list', candidateTag]).stdout.trim();
  if (localTag) throw new Error(`Tag ${candidateTag} already exists locally.`);

  if (!localOnly) {
    const remoteTag = git(['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${candidateTag}`], { allowFailure: true });
    if (remoteTag.status === 0 && remoteTag.stdout.trim()) throw new Error(`Tag ${candidateTag} already exists on origin.`);
    if (remoteTag.status !== 2) throw new Error('Could not check origin for an existing release tag. Check network access or explicitly pass --local-only.');
  }
}

export function validateUpdaterConfiguration(root = ROOT) {
  const tauri = JSON.parse(readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const publicKey = tauri.plugins?.updater?.pubkey;
  if (typeof publicKey !== 'string' || !publicKey.trim()) throw new Error('Updater public key is missing from src-tauri/tauri.conf.json.');
  let decodedKey = '';
  try {
    decodedKey = Buffer.from(publicKey, 'base64').toString('utf8');
  } catch {
    // The validation below reports malformed or placeholder public keys uniformly.
  }
  const publicKeyLines = decodedKey.trim().split(/\r?\n/);
  const publicKeyPayload = publicKeyLines[1] ?? '';
  const payloadBytes = Buffer.from(publicKeyPayload, 'base64');
  const validPublicKey = publicKeyLines.length === 2
    && /^untrusted comment: minisign public key: [0-9A-Fa-f]{16}$/.test(publicKeyLines[0])
    && /^[A-Za-z0-9+/]{56}$/.test(publicKeyPayload)
    && payloadBytes.length === 42
    && payloadBytes.toString('base64') === publicKeyPayload;
  if (!validPublicKey) {
    throw new Error('Updater public key is not a valid embedded Tauri/minisign public key.');
  }
  if (tauri.bundle?.createUpdaterArtifacts !== true) throw new Error('bundle.createUpdaterArtifacts must be enabled in src-tauri/tauri.conf.json.');
  if (tauri.plugins?.updater?.requireSignedVersion !== true) throw new Error('plugins.updater.requireSignedVersion must be enabled.');
  if (tauri.plugins?.updater?.allowDowngrades === true) throw new Error('Updater downgrade support must remain disabled.');

  const { owner, repository } = githubRepository();
  const expectedEndpoint = `https://github.com/${owner}/${repository}/releases/latest/download/latest.json`;
  const endpoints = tauri.plugins.updater.endpoints;
  const allEndpointsUseHttps = Array.isArray(endpoints) && endpoints.every((endpoint) => {
    try {
      return new URL(endpoint).protocol === 'https:';
    } catch {
      return false;
    }
  });
  if (!allEndpointsUseHttps || !endpoints.includes(expectedEndpoint)) {
    throw new Error(`Updater endpoint must include ${expectedEndpoint}, matching the GitHub origin.`);
  }

  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  if (!gitignore.split(/\r?\n/).includes('src-tauri/.private/')) {
    throw new Error('.gitignore must exclude src-tauri/.private/ for local signing-key storage.');
  }

  const capabilities = JSON.parse(readFileSync(path.join(root, 'src-tauri/capabilities/default.json'), 'utf8'));
  const expectedPermissions = [
    'core:window:allow-set-theme',
    'updater:allow-check',
    'updater:allow-download',
    'updater:allow-install',
    'process:allow-restart',
  ];
  if (!Array.isArray(capabilities.permissions)
      || [...capabilities.permissions].sort().join('\n') !== [...expectedPermissions].sort().join('\n')) {
    throw new Error('Tauri capability permissions changed; review and explicitly validate the required plugin permissions.');
  }
}

export function runPreflight({ kind = 'patch', allowNonMain = false, localOnly = false } = {}) {
  const { versions } = readVersions();
  const entries = Object.entries(versions);
  for (const [file, version] of entries) {
    try {
      parseStableVersion(version);
    } catch {
      throw new Error(`${file} contains an invalid stable SemVer version: ${String(version)}.`);
    }
  }
  const distinctVersions = new Set(entries.map(([, version]) => version));
  if (distinctVersions.size !== 1) {
    throw new Error(`Application version files disagree: ${entries.map(([file, version]) => `${file}=${version}`).join(', ')}.`);
  }
  const currentVersion = entries[0][1];
  const candidateTag = `v${bumpVersion(currentVersion, kind)}`;
  validateUpdaterConfiguration();
  checkGitState({ allowNonMain, localOnly, candidateTag });
  return { currentVersion, candidateVersion: candidateTag.slice(1), candidateTag };
}

function parseArgs(argv) {
  const [command, ...args] = argv;
  const options = { allowNonMain: args.includes('--allow-non-main'), localOnly: args.includes('--local-only') };
  if (command === 'preflight') {
    const kindIndex = args.indexOf('--kind');
    options.kind = kindIndex >= 0 ? args[kindIndex + 1] : 'patch';
    return { command, options };
  }
  return { command, options };
}

function release(kind, options) {
  const plan = runPreflight({ ...options, kind });
  updateVersionFiles(ROOT, plan.candidateVersion);
  const changed = readVersions(ROOT).versions;
  if (Object.values(changed).some((version) => version !== plan.candidateVersion)) {
    throw new Error('Version update did not produce matching version files; no release commit or tag was created.');
  }

  git(['diff', '--check']);
  git(['add', '--', ...VERSION_FILES]);
  git(['commit', '-m', `chore(release): ${plan.candidateTag}`]);
  git(['tag', plan.candidateTag]);
  console.log(`Created release commit and tag ${plan.candidateTag}. Nothing was pushed.`);
  console.log('Publish explicitly with: git push origin main, then git push origin ' + plan.candidateTag);
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'updater-config') {
    validateUpdaterConfiguration();
    console.log('Updater configuration passed local security checks.');
    return;
  }
  if (command === 'preflight') {
    const plan = runPreflight(options);
    console.log(`Preflight passed: ${plan.currentVersion} → ${plan.candidateVersion} (${plan.candidateTag}).`);
    return;
  }
  if (['patch', 'minor', 'major'].includes(command)) {
    release(command, options);
    return;
  }
  throw new Error('Usage: node scripts/release.mjs updater-config\n       node scripts/release.mjs preflight [--kind patch|minor|major] [--allow-non-main] [--local-only]\n       node scripts/release.mjs patch|minor|major [--allow-non-main] [--local-only]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Release tooling: ${error.message}`);
    process.exitCode = 1;
  }
}
