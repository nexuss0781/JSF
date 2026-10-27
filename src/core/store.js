import fs from 'fs-extra';
import path from 'path';
import { getConfig } from './config.js';

export async function getStorePath(pkgName, version) {
  const config = await getConfig();
  const storePath = config.storePath;
  // Handle scoped packages like @scope/pkg
  const safeName = pkgName.replace(/\//g, '+');
  return path.join(storePath, safeName, version);
}

export async function packageExistsInStore(pkgName, version) {
  const storePath = await getStorePath(pkgName, version);
  const packageJsonPath = path.join(storePath, 'package.json');
  return await fs.pathExists(storePath) && await fs.pathExists(packageJsonPath);
}

export async function listStorePackages() {
  const config = await getConfig();
  const storePath = config.storePath;
  if (!(await fs.pathExists(storePath))) {
    return {};
  }
  
  const result = {};
  const entries = await fs.readdir(storePath);
  
  for (const entry of entries) {
    const entryPath = path.join(storePath, entry);
    const stat = await fs.stat(entryPath);
    if (stat.isDirectory()) {
      // Convert back from safe name
      const pkgName = entry.replace(/\+/g, '/');
      const versions = await fs.readdir(entryPath);
      result[pkgName] = versions.filter(v => {
        const vPath = path.join(entryPath, v);
        return fs.statSync(vPath).isDirectory();
      });
    }
  }
  return result;
}

export async function getStoreInfo() {
  const packages = await listStorePackages();
  let totalPackages = 0;
  let totalVersions = 0;
  
  for (const pkg of Object.keys(packages)) {
    totalPackages++;
    totalVersions += packages[pkg].length;
  }
  
  return {
    packages,
    totalPackages,
    totalVersions
  };
}
