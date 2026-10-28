import fs from 'fs-extra';
import path from 'node:path';
import { getConfig } from './config.js';

function safePackageName(pkgName) {
  return pkgName.replaceAll('/', '+');
}

export function getStorePathFromConfig(config, pkgName, version) {
  return path.join(path.resolve(config.storePath), safePackageName(pkgName), version);
}

export async function getStorePath(pkgName, version) {
  return getStorePathFromConfig(await getConfig(), pkgName, version);
}

export async function packageExistsInStore(pkgName, version, config = null) {
  const activeConfig = config || await getConfig();
  const storePath = getStorePathFromConfig(activeConfig, pkgName, version);
  return fs.pathExists(path.join(storePath, 'package.json'));
}

export async function makePackageFilesReadOnly(packagePath) {
  for (const entry of await fs.readdir(packagePath)) {
    const entryPath = path.join(packagePath, entry);
    const stat = await fs.lstat(entryPath);
    if (stat.isDirectory()) {
      await makePackageFilesReadOnly(entryPath);
    } else if (stat.isFile()) {
      await fs.chmod(entryPath, stat.mode & ~0o222);
    }
  }
}

export async function assertCachedIntegrities(packages, config = null) {
  const activeConfig = config || await getConfig();
  const storeRoot = path.resolve(activeConfig.storePath);
  const checked = new Set();
  for (const pkg of packages) {
    if (!pkg.integrity) continue;
    const key = `${pkg.name}\u0000${pkg.version}`;
    if (checked.has(key)) continue;
    checked.add(key);
    const storePath = path.join(storeRoot, safePackageName(pkg.name), pkg.version);
    const markerPath = path.join(storePath, '.jsf-package.json');
    if (!(await fs.pathExists(markerPath))) continue;
    const marker = await fs.readJson(markerPath);
    if (marker.integrity && marker.integrity !== pkg.integrity) {
      throw new Error(`Shared-store integrity conflict for ${pkg.name}@${pkg.version}; the cached tarball does not match this project lockfile.`);
    }
  }
}

export async function listStorePackages() {
  const config = await getConfig();
  const storePath = path.resolve(config.storePath);
  if (!(await fs.pathExists(storePath))) return {};
  const result = {};
  for (const entry of await fs.readdir(storePath)) {
    if (entry.startsWith('.')) continue;
    const entryPath = path.join(storePath, entry);
    if (!(await fs.stat(entryPath).catch(() => null))?.isDirectory()) continue;
    const pkgName = entry.replaceAll('+', '/');
    const versions = [];
    for (const child of await fs.readdir(entryPath)) {
      const childPath = path.join(entryPath, child);
      const childStat = await fs.stat(childPath).catch(() => null);
      if (childStat?.isDirectory() && await fs.pathExists(path.join(childPath, 'package.json'))) {
        versions.push(child);
      }
    }
    result[pkgName] = versions;
  }
  return result;
}

export async function getStoreInfo() {
  const packages = await listStorePackages();
  const totalPackages = Object.keys(packages).length;
  const totalVersions = Object.values(packages).reduce((total, versions) => total + versions.length, 0);
  return { packages, totalPackages, totalVersions };
}
