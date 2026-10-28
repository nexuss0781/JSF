import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstallPlan } from '../src/core/resolver.js';
import { parseNameFromInstallPath } from '../src/core/npm-resolver.js';

function packageEntry(installPath, name, version, extra = {}) {
  return { installPath, name, version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, integrity: `sha512-${name}-${version}`, ...extra };
}

test('parses scoped and nested npm lock paths', () => {
  assert.equal(parseNameFromInstallPath('node_modules/@scope/pkg'), '@scope/pkg');
  assert.equal(parseNameFromInstallPath('node_modules/parent/node_modules/@scope/pkg'), '@scope/pkg');
  assert.equal(parseNameFromInstallPath('node_modules/a/node_modules/b'), 'b');
  assert.equal(parseNameFromInstallPath(''), null);
});

test('does not require an omitted optional root peer', async () => {
  const fs = (await import('fs-extra')).default;
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { resolveDependencyTree } = await import('../src/core/npm-resolver.js');
  const project = await mkdtemp(path.join(tmpdir(), 'jsf-optional-peer-'));
  try {
    const manifest = {
      name: 'jsf-optional-peer-fixture',
      version: '1.0.0',
      peerDependencies: { 'react-dom': '^18.0.0' },
      peerDependenciesMeta: { 'react-dom': { optional: true } }
    };
    const tree = await resolveDependencyTree(project, manifest, 'https://registry.npmjs.org/');
    assert.deepEqual(tree.direct, []);
    assert.deepEqual(tree.packages, []);
  } finally {
    await fs.remove(project);
  }
});

test('classifies new, upgrade, downgrade, and cached package versions', async () => {
  const tree = {
    packages: [
      packageEntry('node_modules/foo', 'foo', '2.0.0'),
      packageEntry('node_modules/bar', 'bar', '1.0.0'),
      packageEntry('node_modules/baz', 'baz', '1.0.0'),
      packageEntry('node_modules/cached', 'cached', '1.0.0'),
      packageEntry('node_modules/stable', 'stable', '1.0.0')
    ],
    direct: [
      { name: 'foo', range: '^2', packageName: 'foo', version: '2.0.0', installPath: 'node_modules/foo' },
      { name: 'bar', range: '1.0.0', packageName: 'bar', version: '1.0.0', installPath: 'node_modules/bar' },
      { name: 'baz', range: '1.0.0', packageName: 'baz', version: '1.0.0', installPath: 'node_modules/baz' },
      { name: 'cached', range: '1.0.0', packageName: 'cached', version: '1.0.0', installPath: 'node_modules/cached' },
      { name: 'stable', range: '1.0.0', packageName: 'stable', version: '1.0.0', installPath: 'node_modules/stable' }
    ]
  };
  const inventory = { foo: ['1.0.0'], bar: ['2.0.0'], cached: ['1.0.0'], stable: ['1.0.0', '2.0.0'] };
  const plan = await buildInstallPlan(tree, inventory);
  assert.deepEqual(plan.upgrade.map(item => item.name), ['foo']);
  assert.deepEqual(plan.downgrade.map(item => item.name), ['bar', 'stable']);
  assert.equal(plan.downgrade.find(item => item.name === 'stable').cached, true);
  assert.deepEqual(plan.new.map(item => item.name), ['baz']);
  assert.deepEqual(plan.ok.map(item => item.name), ['cached']);
  assert.equal(plan.toFetch.length, 3);
});

test('classifies against the prior project lock while reusing cached targets', async () => {
  const target = packageEntry('node_modules/widget', 'widget', '3.0.0');
  const tree = {
    packages: [target],
    direct: [{ name: 'widget', range: '^3', packageName: 'widget', version: '3.0.0', installPath: target.installPath }]
  };
  const previousLock = {
    dependencies: { widget: { packageName: 'widget', version: '2.4.0' } },
    packages: [{ installPath: target.installPath, name: 'widget', version: '2.4.0' }]
  };
  const plan = await buildInstallPlan(tree, { widget: ['2.4.0', '3.0.0'] }, previousLock);
  assert.equal(plan.upgrade.length, 1);
  assert.equal(plan.upgrade[0].cached, true);
  assert.equal(plan.toFetch.length, 0);
});

test('deduplicates fetch work for duplicate package versions at separate lock paths', async () => {
  const first = packageEntry('node_modules/a/node_modules/shared', 'shared', '1.2.3');
  const second = packageEntry('node_modules/b/node_modules/shared', 'shared', '1.2.3');
  const plan = await buildInstallPlan({ packages: [first, second], direct: [] }, {});
  assert.equal(plan.new.length, 2);
  assert.equal(plan.toFetch.length, 1);
});

test('materializes a shared npm tree with nested dependencies and validates project links', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'jsf-unit-tree-'));
  const script = String.raw`
    import fs from 'fs-extra';
    import path from 'node:path';
    import { pathToFileURL } from 'node:url';
    const root = process.env.JSF_TEST_REPO;
    const { getStorePath } = await import(pathToFileURL(path.join(root, 'src/core/store.js')));
    const { assertCachedIntegrities } = await import(pathToFileURL(path.join(root, 'src/core/store.js')));
    const { materializeInstallTree } = await import(pathToFileURL(path.join(root, 'src/core/instance.js')));
    const { linkInstallTree, verifyLinks } = await import(pathToFileURL(path.join(root, 'src/core/linker.js')));
    const project = path.join(process.env.JSF_TEST_ROOT, 'project');
    await fs.ensureDir(project);
    const packages = [
      { name: 'parent-fixture', version: '1.0.0', installPath: 'node_modules/parent-fixture', integrity: 'sha512-parent-fixture', bin: null },
      { name: 'child-fixture', version: '2.0.0', installPath: 'node_modules/parent-fixture/node_modules/child-fixture', bin: null }
    ];
    for (const pkg of packages) {
      const store = await getStorePath(pkg.name, pkg.version);
      await fs.ensureDir(store);
      await fs.writeJson(path.join(store, 'package.json'), { name: pkg.name, version: pkg.version, main: 'index.cjs' });
      if (pkg.integrity) await fs.writeJson(path.join(store, '.jsf-package.json'), { name: pkg.name, version: pkg.version, integrity: pkg.integrity });
      const content = pkg.name === 'parent-fixture' ? "module.exports = require('child-fixture')" : "module.exports = 'nested-ok'";
      await fs.writeFile(path.join(store, 'index.cjs'), content);
    }
    await assertCachedIntegrities([{ name: 'parent-fixture', version: '1.0.0', integrity: 'sha512-parent-fixture' }]);
    let integrityRejected = false;
    try {
      await assertCachedIntegrities([{ name: 'parent-fixture', version: '1.0.0', integrity: 'sha512-conflict' }]);
    } catch (error) {
      integrityRejected = /integrity conflict/.test(error.message);
    }
    if (!integrityRejected) throw new Error('Conflicting cached integrity was not rejected');
    const tree = {
      treeId: 'fixture-tree-001', packages,
      direct: [{ name: 'parent-fixture', range: '1.0.0', packageName: 'parent-fixture', version: '1.0.0', installPath: 'node_modules/parent-fixture' }]
    };
    const instance = await materializeInstallTree(tree);
    const links = await linkInstallTree(project, tree, instance);
    if (links.some(item => !item.linked)) throw new Error(JSON.stringify(links));
    const lock = {
      dependencies: { 'parent-fixture': { storePath: path.join(instance, 'node_modules/parent-fixture') } },
      binStorePath: path.join(instance, 'node_modules/.bin'),
      sharedStorePath: instance,
      treeId: tree.treeId,
      packages: packages.map(pkg => ({ ...pkg, storePath: path.join(instance, pkg.installPath) }))
    };
    await fs.writeJson(path.join(project, 'jsf.lock'), lock);
    const result = await verifyLinks(project);
    if (!result.valid) throw new Error(JSON.stringify(result));
    const { createRequire } = await import('node:module');
    const require = createRequire(path.join(project, 'verify.cjs'));
    if (require('parent-fixture') !== 'nested-ok') throw new Error('Nested package did not resolve');
    const source = await getStorePath('parent-fixture', '1.0.0');
    const instanceFile = path.join(instance, 'node_modules/parent-fixture/index.cjs');
    if ((await fs.stat(path.join(source, 'index.cjs'))).ino !== (await fs.stat(instanceFile)).ino) throw new Error('Package file was not hard-linked');
  `;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        JSF_HOME: path.join(tempRoot, 'user-home'),
        JSF_SHARED_HOME: path.join(tempRoot, 'shared-home'),
        JSF_SHARED_STORE: path.join(tempRoot, 'shared-home', 'store'),
        JSF_TEST_REPO: repoRoot,
        JSF_TEST_ROOT: tempRoot
      }
    });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('setup migrates a version-1 per-user cache into the shared machine store', async () => {
  const fs = (await import('fs-extra')).default;
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'jsf-migration-'));
  const userHome = path.join(tempRoot, 'user-home');
  const legacyStore = path.join(userHome, 'store');
  const sharedStore = path.join(tempRoot, 'machine', 'store');
  try {
    await fs.ensureDir(path.join(legacyStore, 'legacy-fixture', '1.0.0'));
    await fs.writeJson(path.join(userHome, 'config.json'), {
      version: 1,
      registry: 'https://registry.npmjs.org/',
      storePath: legacyStore,
      projectsPath: path.join(userHome, 'projects')
    });
    await fs.writeJson(path.join(legacyStore, 'legacy-fixture', '1.0.0', 'package.json'), {
      name: 'legacy-fixture', version: '1.0.0'
    });
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'bin/jsf.js'), 'setup'], {
      cwd: repoRoot,
      encoding: 'utf8',
      input: '',
      env: {
        ...process.env,
        JSF_HOME: userHome,
        JSF_SHARED_HOME: path.join(tempRoot, 'machine'),
        JSF_SHARED_STORE: sharedStore,
        CI: '1'
      }
    });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const migratedConfig = await fs.readJson(path.join(userHome, 'config.json'));
    assert.equal(migratedConfig.version, 2);
    assert.equal(migratedConfig.storePath, sharedStore);
    assert.equal(await fs.pathExists(path.join(sharedStore, 'legacy-fixture', '1.0.0', 'package.json')), true);
    assert.match(`${result.stdout}${result.stderr}`, /Migrated 1 cached package version/);
  } finally {
    await fs.remove(tempRoot);
  }
});
