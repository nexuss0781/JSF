import pacote from 'pacote';
import fs from 'fs-extra';
import path from 'path';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import { getConfig } from './config.js';
import { getStorePath, packageExistsInStore } from './store.js';
import pMap from 'p-map';

export async function fetchAndExtractPackage(pkgName, version) {
  const config = await getConfig();
  
  // Check if already exists
  if (await packageExistsInStore(pkgName, version)) {
    return { cached: true, path: await getStorePath(pkgName, version) };
  }
  
  const storePath = await getStorePath(pkgName, version);
  const tempPath = path.join(path.dirname(storePath), `.staging-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
  try {
    await fs.ensureDir(tempPath);
    
    // Fetch and extract the package tarball using pacote's stream handler API
    const manifest = await pacote.manifest(`${pkgName}@${version}`, { registry: config.registry });
    await pacote.tarball.stream(`${pkgName}@${version}`, (tarball) =>
      pipeline(tarball, tar.extract({
        cwd: tempPath,
        strip: 1 // npm packages have a 'package/' prefix
      })),
    { registry: config.registry });
    
    // Ensure package.json exists
    const pkgJsonPath = path.join(tempPath, 'package.json');
    if (!(await fs.pathExists(pkgJsonPath))) {
      throw new Error(`Invalid package: ${pkgName}@${version} - no package.json found`);
    }
    
    // Move atomically to store
    await fs.ensureDir(path.dirname(storePath));
    await fs.move(tempPath, storePath, { overwrite: false });
    
    return { cached: false, path: storePath, manifest };
  } catch (error) {
    // Cleanup on error
    if (await fs.pathExists(tempPath)) {
      await fs.remove(tempPath);
    }
    throw error;
  }
}

export async function fetchPackagesInParallel(packages) {
  const config = await getConfig();
  const results = await pMap(
    packages,
    async ({ name, version }) => {
      try {
        const result = await fetchAndExtractPackage(name, version);
        return { name, version, success: true, ...result };
      } catch (error) {
        return { name, version, success: false, error: error.message };
      }
    },
    { concurrency: config.maxConcurrency || 8 }
  );
  return results;
}
