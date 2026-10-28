import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = path.resolve(new URL('..', import.meta.url).pathname);
const cli = path.join(repository, 'bin', 'jsf.js');

function runNode(args, cwd, env) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env: { ...env, CI: '1', FORCE_COLOR: '0' },
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 20 * 1024 * 1024
  });
  return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}`, error: result.error };
}

function writeManifest(projectPath, name, reactVersion, includeDom = false) {
  const dependencies = { react: reactVersion };
  if (includeDom) dependencies['react-dom'] = reactVersion;
  return fs.writeJson(path.join(projectPath, 'package.json'), { name, version: '1.0.0', dependencies }, { spaces: 2 });
}

function assertSuccess(result, context) {
  assert.equal(result.error, undefined, `${context}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${context}:\n${result.output}`);
}

test('npm-resolved install works end-to-end with peers, transitives, shared reuse, status, and verification', { timeout: 600_000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jsf-e2e-'));
  const sharedStore = path.join(root, 'machine-store');
  const userOne = path.join(root, 'user-one');
  const userTwo = path.join(root, 'user-two');
  const projectOne = path.join(root, 'app-one');
  const projectTwo = path.join(root, 'app-two');
  const projectThree = path.join(root, 'app-three');
  for (const directory of [projectOne, projectTwo, projectThree]) await fs.ensureDir(directory);
  const envOne = { ...process.env, JSF_HOME: userOne, JSF_SHARED_HOME: path.join(root, 'shared'), JSF_SHARED_STORE: sharedStore };
  const envTwo = { ...process.env, JSF_HOME: userTwo, JSF_SHARED_HOME: path.join(root, 'shared'), JSF_SHARED_STORE: sharedStore };

  try {
    await writeManifest(projectOne, 'jsf-e2e-app-one', '18.3.1', true);
    const first = runNode([cli, 'install'], projectOne, envOne);
    assertSuccess(first, 'first install');
    assert.match(first.output, /Downloaded: [1-9]/);
    const packageMarker = await fs.readJson(path.join(sharedStore, 'react', '18.3.1', '.jsf-package.json'));
    assert.ok(packageMarker.integrity, 'canonical package should record its verified lock integrity');
    const reactEntry = await fs.stat(path.join(sharedStore, 'react', '18.3.1', 'index.js'));
    assert.equal(reactEntry.mode & 0o222, 0, 'shared package files should be read-only');
    assertSuccess(runNode([cli, 'verify'], projectOne, envOne), 'first verify');
    const importCheck = runNode(['-e', "const r=require('react');const d=require('react-dom');if(r.version!=='18.3.1'||d.version!=='18.3.1')process.exit(2);console.log(r.version,d.version)"], projectOne, envOne);
    assertSuccess(importCheck, 'React peer/transitive import');
    assert.match(importCheck.output, /18\.3\.1/);

    await writeManifest(projectTwo, 'jsf-e2e-app-two', '18.3.1', true);
    const second = runNode([cli, 'install'], projectTwo, envTwo);
    assertSuccess(second, 'second-user cache reuse');
    assert.match(second.output, /Downloaded: 0/);
    assert.match(second.output, /Reused from shared store: [1-9]/);
    assertSuccess(runNode([cli, 'verify'], projectTwo, envTwo), 'second project verify');
    await fs.remove(path.join(projectTwo, 'node_modules', '.bin'));
    const missingBin = runNode([cli, 'verify'], projectTwo, envTwo);
    assert.notEqual(missingBin.status, 0, `verify should fail when the .bin link is missing:\n${missingBin.output}`);
    assert.match(missingBin.output, /\.bin: missing dependency link/);
    assertSuccess(runNode([cli, 'install'], projectTwo, envTwo), 'restore .bin link');
    const projects = runNode([cli, 'projects'], projectTwo, envTwo);
    assertSuccess(projects, 'projects listing');
    assert.match(projects.output, /react-dom@18\.3\.1/);
    assert.match(projects.output, /Transitive/);

    await writeManifest(projectThree, 'jsf-e2e-app-three', '17.0.2');
    const downgrade = runNode([cli, 'status'], projectThree, envOne);
    assertSuccess(downgrade, 'downgrade status');
    assert.match(downgrade.output, /DOWNGRADE/);
    const installOld = runNode([cli, 'install'], projectThree, envOne);
    assertSuccess(installOld, 'install downgrade target');
    await writeManifest(projectThree, 'jsf-e2e-app-three', '18.3.1');
    const upgrade = runNode([cli, 'status'], projectThree, envOne);
    assertSuccess(upgrade, 'upgrade status');
    assert.match(upgrade.output, /UPGRADE/);
    const installNew = runNode([cli, 'install'], projectThree, envOne);
    assertSuccess(installNew, 'install upgrade target');
    assert.match(installNew.output, /Downloaded: 0/);

    const external = path.join(root, 'outside-react');
    await fs.ensureDir(external);
    await fs.writeJson(path.join(external, 'package.json'), { name: 'react', version: '18.3.1' });
    await fs.remove(path.join(projectOne, 'node_modules', 'react'));
    await fs.symlink(external, path.join(projectOne, 'node_modules', 'react'), 'dir');
    const invalid = runNode([cli, 'verify'], projectOne, envOne);
    assert.notEqual(invalid.status, 0, `verify should fail for an outside link:\n${invalid.output}`);
    assert.match(invalid.output, /outside the shared store|does not match jsf.lock/);
    assertSuccess(runNode([cli, 'install'], projectOne, envOne), 'restore correct link');
    assertSuccess(runNode([cli, 'verify'], projectOne, envOne), 'final verify');
  } finally {
    await fs.remove(root);
  }
});
