import pacote from 'pacote';
import fs from 'fs-extra';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import * as tar from 'tar';
import pMap from 'p-map';
import { getConfig } from './config.js';
import { assertCachedIntegrities, getStorePathFromConfig, makePackageFilesReadOnly, packageExistsInStore } from './store.js';

export async function fetchAndExtractPackage(pkgName, version, lockInfo = {}, configOverride = null) {
  const config = configOverride || await getConfig();
  const storePath = getStorePathFromConfig(config, pkgName, version);
  if (await packageExistsInStore(pkgName, version, config)) {
    await assertCachedIntegrities([{ name: pkgName, version, integrity: lockInfo.integrity }], config);
    return { cached: true, path: storePath };
  }
  const parentPath = path.dirname(storePath);
  const tempPath = path.join(parentPath, `.staging-${process.pid}-${randomUUID()}`);
  try {
    await fs.ensureDir(tempPath);
    const options = { registry: config.registry };
    if (lockInfo.integrity) options.integrity = lockInfo.integrity;
    if (lockInfo.resolved) options.resolved = lockInfo.resolved;
    const manifest = await pacote.manifest(`${pkgName}@${version}`, options);
    if (manifest.version !== version) {
      throw new Error(`Registry returned ${pkgName}@${manifest.version} when ${version} was requested.`);
    }
    await pacote.tarball.stream(`${pkgName}@${version}`, tarball =>
      pipeline(tarball, tar.extract({ cwd: tempPath, strip: 1 })), options);
    const packageJsonPath = path.join(tempPath, 'package.json');
    if (!(await fs.pathExists(packageJsonPath))) {
      throw new Error(`Invalid package: ${pkgName}@${version} - no package.json found`);
    }
    const extractedManifest = await fs.readJson(packageJsonPath);
    if (extractedManifest.name !== pkgName || extractedManifest.version !== version) {
      throw new Error(`Package contents do not match ${pkgName}@${version}.`);
    }
    await fs.writeJson(path.join(tempPath, '.jsf-package.json'), {
      name: pkgName,
      version,
      integrity: lockInfo.integrity || manifest.dist?.integrity || null,
      resolved: lockInfo.resolved || manifest.dist?.tarball || null,
      verifiedAt: new Date().toISOString()
    });
    await makePackageFilesReadOnly(tempPath);
    await fs.ensureDir(parentPath);
    try {
      await fs.move(tempPath, storePath, { overwrite: false });
    } catch (moveError) {
      if (await packageExistsInStore(pkgName, version, config)) {
        await fs.remove(tempPath);
        await assertCachedIntegrities([{ name: pkgName, version, integrity: lockInfo.integrity }], config);
        return { cached: true, path: storePath, manifest };
      }
      throw moveError;
    }
    return { cached: false, path: storePath, manifest };
  } catch (error) {
    if (await fs.pathExists(tempPath)) await fs.remove(tempPath);
    throw error;
  }
}

export async function fetchPackagesInParallel(packages) {
  const config = await getConfig();
  const concurrency = Math.max(1, Number(config.maxConcurrency) || 8);
  return pMap(packages, async item => {
    try {
      const result = await fetchAndExtractPackage(item.name, item.version, item, config);
      return { name: item.name, version: item.version, success: true, ...result };
    } catch (error) {
      return { name: item.name, version: item.version, success: false, error: error.message };
    }
  }, { concurrency });
}
