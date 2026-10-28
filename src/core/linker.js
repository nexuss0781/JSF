import fs from 'fs-extra';
import path from 'node:path';
import { getConfig } from './config.js';
import { getStorePathFromConfig } from './store.js';
import { isWindows } from './utils.js';

async function removeIfPresent(target) {
  try {
    await fs.lstat(target);
    await fs.remove(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function createDirectoryLink(target, linkPath) {
  await fs.ensureDir(path.dirname(linkPath));
  await removeIfPresent(linkPath);
  await fs.symlink(target, linkPath, isWindows() ? 'junction' : 'dir');
}

export async function linkInstallTree(projectPath, tree, instanceRoot) {
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  await fs.ensureDir(nodeModulesPath);
  const results = [];
  for (const dependency of tree.direct) {
    const target = path.resolve(instanceRoot, dependency.installPath);
    const linkPath = path.join(nodeModulesPath, dependency.name);
    try {
      if (!(await fs.pathExists(target))) throw new Error(`Shared install tree is missing ${dependency.packageName}@${dependency.version}.`);
      await createDirectoryLink(target, linkPath);
      results.push({ name: dependency.name, version: dependency.version, target, linked: true });
    } catch (error) {
      results.push({ name: dependency.name, version: dependency.version, target, linked: false, error: error.message });
    }
  }
  const binsTarget = path.join(instanceRoot, 'node_modules', '.bin');
  try {
    await createDirectoryLink(binsTarget, path.join(nodeModulesPath, '.bin'));
  } catch (error) {
    results.push({ name: '.bin', target: binsTarget, linked: false, error: error.message });
  }
  return results;
}

function isWithin(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function inspectLink(linkPath, storePath, expectedTarget = null, name = path.basename(linkPath)) {
  try {
    const stat = await fs.lstat(linkPath);
    if (!stat.isSymbolicLink()) return { name, path: linkPath, reason: 'not a symlink to the shared store' };
    const rawTarget = await fs.readlink(linkPath);
    const target = path.resolve(path.dirname(linkPath), rawTarget);
    if (!(await fs.pathExists(target))) return { name, path: linkPath, reason: 'broken symlink' };
    const realTarget = await fs.realpath(target);
    const realStore = await fs.realpath(storePath);
    if (!isWithin(realStore, realTarget)) return { name, path: linkPath, reason: 'symlink points outside the shared store' };
    if (expectedTarget && path.resolve(expectedTarget) !== path.resolve(target)) {
      return { name, path: linkPath, reason: 'symlink target does not match jsf.lock' };
    }
    return null;
  } catch (error) {
    return { name, path: linkPath, reason: error.code === 'ENOENT' ? 'missing dependency link' : error.message };
  }
}

export async function verifyLinks(projectPath) {
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  if (!(await fs.pathExists(nodeModulesPath))) {
    return { valid: false, broken: [{ name: 'node_modules', path: nodeModulesPath, reason: 'node_modules does not exist' }], message: 'node_modules does not exist' };
  }
  const config = await getConfig();
  const storePath = path.resolve(config.storePath);
  const lockPath = path.join(projectPath, 'jsf.lock');
  const lock = await fs.pathExists(lockPath) ? await fs.readJson(lockPath).catch(() => null) : null;
  const expected = lock?.dependencies || {};
  const broken = [];

  for (const [name, dependency] of Object.entries(expected)) {
    const issue = await inspectLink(path.join(nodeModulesPath, name), storePath, dependency.storePath || null, name);
    if (issue) broken.push(issue);
  }
  const sharedTree = lock?.sharedStorePath ? path.resolve(lock.sharedStorePath) : null;
  if (sharedTree) {
    if (!isWithin(storePath, sharedTree)) {
      broken.push({ name: 'jsf.lock', path: lockPath, reason: 'shared install tree is outside the configured store' });
    } else if (!(await fs.pathExists(sharedTree))) {
      broken.push({ name: 'jsf.lock', path: sharedTree, reason: 'shared install tree is missing' });
    } else {
      const marker = await fs.readJson(path.join(sharedTree, '.jsf-tree.json')).catch(() => null);
      if (!marker || marker.treeId !== lock.treeId) {
        broken.push({ name: 'jsf.lock', path: sharedTree, reason: 'shared install tree marker is missing or does not match the lock' });
      }
      for (const pkg of lock.packages || []) {
        const packagePath = path.resolve(sharedTree, pkg.installPath || '');
        if (!pkg.installPath?.startsWith('node_modules/') || !isWithin(sharedTree, packagePath)) {
          broken.push({ name: `${pkg.name || 'package'}@${pkg.version || '?'}`, path: packagePath, reason: 'unsafe package path in jsf.lock' });
          continue;
        }
        if (pkg.storePath && path.resolve(pkg.storePath) !== packagePath) {
          broken.push({ name: `${pkg.name}@${pkg.version}`, path: packagePath, reason: 'package path does not match jsf.lock' });
          continue;
        }
        const manifest = await fs.readJson(path.join(packagePath, 'package.json')).catch(() => null);
        if (!manifest) {
          broken.push({ name: `${pkg.name}@${pkg.version}`, path: packagePath, reason: 'resolved package is missing from the shared tree' });
        } else if (manifest.name !== pkg.name || manifest.version !== pkg.version) {
          broken.push({ name: `${pkg.name}@${pkg.version}`, path: packagePath, reason: 'shared package contents do not match the lockfile' });
        } else if (pkg.integrity) {
          const canonicalPath = getStorePathFromConfig(config, pkg.name, pkg.version);
          const canonicalMarker = await fs.readJson(path.join(canonicalPath, '.jsf-package.json')).catch(() => null);
          if (canonicalMarker?.integrity && canonicalMarker.integrity !== pkg.integrity) {
            broken.push({ name: `${pkg.name}@${pkg.version}`, path: canonicalPath, reason: 'cached tarball integrity does not match jsf.lock' });
          }
        }
      }
    }
  }
  const binsPath = path.join(nodeModulesPath, '.bin');
  if (lock?.binStorePath || await fs.lstat(binsPath).then(() => true).catch(() => false)) {
    const issue = await inspectLink(binsPath, storePath, lock?.binStorePath || null, '.bin');
    if (issue) broken.push(issue);
  }

  for (const entry of await fs.readdir(nodeModulesPath).catch(() => [])) {
    if (entry.startsWith('.') || expected[entry]) continue;
    const entryPath = path.join(nodeModulesPath, entry);
    const stat = await fs.lstat(entryPath).catch(() => null);
    if (stat?.isSymbolicLink()) {
      const issue = await inspectLink(entryPath, storePath, null, entry);
      if (issue) broken.push(issue);
      continue;
    }
    if (!stat?.isDirectory() || !entry.startsWith('@')) continue;
    for (const scopedName of await fs.readdir(entryPath).catch(() => [])) {
      const packageName = `${entry}/${scopedName}`;
      if (expected[packageName]) continue;
      const issue = await inspectLink(path.join(entryPath, scopedName), storePath, null, packageName);
      if (issue) broken.push(issue);
    }
  }

  return {
    valid: broken.length === 0,
    broken,
    message: broken.length === 0 ? 'All JSF dependency links are valid and point to the shared store' : `${broken.length} invalid link(s) found`
  };
}
