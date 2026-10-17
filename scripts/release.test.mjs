import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { bumpVersion, parseStableVersion, readVersions, updateVersionFiles, validateUpdaterConfiguration } from './release.mjs';

test('accepts stable three-part SemVer and rejects prerelease or malformed versions', () => {
  assert.deepEqual(parseStableVersion('0.2.1'), [0n, 2n, 1n]);
  for (const invalid of ['v0.2.1', '0.2', '01.2.3', '1.2.3-beta.1', '1.2.3+build']) {
    assert.throws(() => parseStableVersion(invalid), /stable SemVer/);
  }
});

test('bumps patch, minor, and major versions without changing unrelated parts', () => {
  assert.equal(bumpVersion('0.2.1', 'patch'), '0.2.2');
  assert.equal(bumpVersion('0.2.1', 'minor'), '0.3.0');
  assert.equal(bumpVersion('0.2.1', 'major'), '1.0.0');
  assert.equal(bumpVersion('999999999999999999.0.0', 'major'), '1000000000000000000.0.0');
});

test('updates all four application version locations while preserving other values', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'torque-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'src-tauri'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'torque', version: '0.2.1', private: true }, null, 2) + '\n');
  writeFileSync(path.join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '0.2.1', productName: 'Torque' }, null, 2) + '\n');
  writeFileSync(path.join(root, 'src-tauri/Cargo.toml'), '[package]\nname = "torque"\nversion = "0.2.1"\nedition = "2021"\n');
  writeFileSync(path.join(root, 'src-tauri/Cargo.lock'), '# lock\nversion = 4\n\n[[package]]\nname = "other"\nversion = "1.0.0"\n\n[[package]]\nname = "torque"\nversion = "0.2.1"\n');

  updateVersionFiles(root, '0.2.2');
  const versions = readVersions(root).versions;
  assert.deepEqual(Object.values(versions), ['0.2.2', '0.2.2', '0.2.2', '0.2.2']);
  assert.equal(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).private, true);
  assert.match(readFileSync(path.join(root, 'src-tauri/Cargo.lock'), 'utf8'), /name = "other"\nversion = "1\.0\.0"/);
});

test('current updater configuration embeds a valid public key and requires signed stable updates', () => {
  assert.doesNotThrow(() => validateUpdaterConfiguration());
});

test('updater preflight rejects disabled signed-version checks and downgrade permission', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'torque-updater-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'src-tauri/capabilities'), { recursive: true });
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  writeFileSync(path.join(root, '.gitignore'), 'src-tauri/.private/\n');
  const capabilityPath = path.join(root, 'src-tauri/capabilities/default.json');
  const capabilities = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8'));
  writeFileSync(capabilityPath, JSON.stringify(capabilities));

  config.plugins.updater.requireSignedVersion = false;
  writeFileSync(path.join(root, 'src-tauri/tauri.conf.json'), JSON.stringify(config));
  assert.throws(() => validateUpdaterConfiguration(root), /requireSignedVersion/);

  config.plugins.updater.requireSignedVersion = true;
  config.plugins.updater.allowDowngrades = true;
  writeFileSync(path.join(root, 'src-tauri/tauri.conf.json'), JSON.stringify(config));
  assert.throws(() => validateUpdaterConfiguration(root), /downgrade support/);

  config.plugins.updater.allowDowngrades = false;
  writeFileSync(path.join(root, 'src-tauri/tauri.conf.json'), JSON.stringify(config));
  capabilities.permissions.push('shell:allow-execute');
  writeFileSync(capabilityPath, JSON.stringify(capabilities));
  assert.throws(() => validateUpdaterConfiguration(root), /capability permissions changed/);
});
