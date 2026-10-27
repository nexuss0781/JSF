import fs from 'fs-extra';
import path from 'path';
import { getStorePath } from './store.js';
import { isWindows } from './utils.js';

export async function linkPackage(projectNodeModules, pkgName, version) {
  const storePath = await getStorePath(pkgName, version);
  const linkPath = path.join(projectNodeModules, pkgName);
  
  // Ensure parent directory exists (for scoped packages)
  await fs.ensureDir(path.dirname(linkPath));
  
  // Remove existing link/file if present
  if (await fs.pathExists(linkPath)) {
    await fs.remove(linkPath);
  }
  
  try {
    // Create symlink
    if (isWindows()) {
      // On Windows, try junction for directories (no admin needed in some cases)
      // or symlink - we'll use symlink with junction fallback concept
      await fs.ensureSymlink(storePath, linkPath, 'junction');
    } else {
      await fs.ensureSymlink(storePath, linkPath, 'dir');
    }
    return true;
  } catch (error) {
    // Try regular symlink as fallback
    try {
      await fs.symlink(storePath, linkPath, isWindows() ? 'junction' : 'dir');
      return true;
    } catch (e) {
      throw new Error(`Failed to link ${pkgName}@${version}: ${e.message}. On Windows, try enabling Developer Mode or running as Administrator.`);
    }
  }
}

export async function linkAllPackages(projectPath, packages) {
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  await fs.ensureDir(nodeModulesPath);
  
  const results = [];
  for (const pkg of packages) {
    try {
      await linkPackage(nodeModulesPath, pkg.name, pkg.version);
      results.push({ name: pkg.name, version: pkg.version, linked: true });
    } catch (error) {
      results.push({ name: pkg.name, version: pkg.version, linked: false, error: error.message });
    }
  }
  return results;
}

export async function verifyLinks(projectPath) {
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  if (!(await fs.pathExists(nodeModulesPath))) {
    return { valid: false, broken: [], message: 'node_modules does not exist' };
  }
  
  const broken = [];
  const entries = await fs.readdir(nodeModulesPath);
  
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const entryPath = path.join(nodeModulesPath, entry);
    
    try {
      const stats = await fs.lstat(entryPath);
      if (stats.isSymbolicLink()) {
        const target = await fs.readlink(entryPath);
        if (!(await fs.pathExists(entryPath))) {
          broken.push({ name: entry, path: entryPath, reason: 'broken symlink' });
        }
      }
    } catch (error) {
      broken.push({ name: entry, path: entryPath, reason: error.message });
    }
  }
  
  return {
    valid: broken.length === 0,
    broken,
    message: broken.length === 0 ? 'All links are valid' : `${broken.length} broken link(s) found`
  };
}
