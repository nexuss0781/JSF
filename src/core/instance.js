import fs from 'fs-extra';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getConfig } from './config.js';
import { getStorePathFromConfig } from './store.js';

async function copyTreeWithHardlinks(source, destination) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) {
    const linkValue = await fs.readlink(source);
    await fs.ensureDir(path.dirname(destination));
    try {
      await fs.symlink(linkValue, destination);
    } catch (error) {
      const linkedPath = path.resolve(path.dirname(source), linkValue);
      if (await fs.pathExists(linkedPath)) {
        await copyTreeWithHardlinks(linkedPath, destination);
      } else {
        throw error;
      }
    }
    return;
  }
  if (stat.isDirectory()) {
    await fs.ensureDir(destination);
    const entries = await fs.readdir(source);
    for (const entry of entries) {
      await copyTreeWithHardlinks(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }
  await fs.ensureDir(path.dirname(destination));
  try {
    await fs.link(source, destination);
  } catch (error) {
    if (['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP', 'EMLINK'].includes(error.code)) {
      await fs.copyFile(source, destination);
    } else {
      throw error;
    }
  }
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function normalizeBinEntries(bin, packageName) {
  if (typeof bin === 'string') {
    const command = packageName.split('/').at(-1);
    return { [command]: bin };
  }
  return bin && typeof bin === 'object' ? bin : {};
}

async function createBinLinks(stageRoot, packages) {
  const groups = new Map();
  for (const entry of packages) {
    const packageRoot = path.join(stageRoot, entry.installPath);
    const moduleDirectory = path.dirname(packageRoot);
    const binEntries = normalizeBinEntries(entry.bin, entry.name);
    for (const [command, relativeTarget] of Object.entries(binEntries)) {
      if (typeof relativeTarget !== 'string' || path.isAbsolute(relativeTarget)) continue;
      const target = path.resolve(packageRoot, relativeTarget);
      if (!isInside(packageRoot, target) || !(await fs.pathExists(target))) continue;
      if (!groups.has(moduleDirectory)) groups.set(moduleDirectory, []);
      groups.get(moduleDirectory).push({ command, target });
    }
  }

  for (const [moduleDirectory, commands] of groups) {
    const binDirectory = path.join(moduleDirectory, '.bin');
    await fs.ensureDir(binDirectory);
    for (const { command, target } of commands) {
      const safeCommand = path.basename(command);
      if (process.platform === 'win32') {
        const relativeTarget = path.relative(binDirectory, target);
        const commandFile = path.join(binDirectory, `${safeCommand}.cmd`);
        const script = `@ECHO off\r\nnode "%~dp0\\${relativeTarget.replaceAll('/', '\\\\')}" %*\r\n`;
        await fs.writeFile(commandFile, script);
      } else {
        const linkPath = path.join(binDirectory, safeCommand);
        const relativeTarget = path.relative(binDirectory, target);
        try {
          await fs.symlink(relativeTarget, linkPath);
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
      }
    }
  }
  await fs.ensureDir(path.join(stageRoot, 'node_modules', '.bin'));
}

export async function materializeInstallTree(tree) {
  const config = await getConfig();
  const storeRoot = path.resolve(config.storePath);
  const instancesPath = path.join(storeRoot, '.instances');
  const instanceRoot = path.join(instancesPath, tree.treeId);
  const markerPath = path.join(instanceRoot, '.jsf-tree.json');

  await fs.ensureDir(instancesPath);
  if (await fs.pathExists(markerPath)) {
    const marker = await fs.readJson(markerPath).catch(() => null);
    if (marker?.treeId === tree.treeId) return instanceRoot;
  }
  if (await fs.pathExists(instanceRoot)) await fs.remove(instanceRoot);

  const stageRoot = path.join(instancesPath, `.staging-${tree.treeId}-${process.pid}-${randomUUID()}`);
  try {
    await fs.ensureDir(path.join(stageRoot, 'node_modules'));
    const sortedPackages = [...tree.packages].sort((a, b) => {
      const depthDifference = a.installPath.split('/').length - b.installPath.split('/').length;
      return depthDifference || a.installPath.localeCompare(b.installPath);
    });
    for (const entry of sortedPackages) {
      if (!entry.installPath.startsWith('node_modules/')) {
        throw new Error(`Unsafe npm install path in lockfile: ${entry.installPath}`);
      }
      const source = getStorePathFromConfig(config, entry.name, entry.version);
      if (!(await fs.pathExists(path.join(source, 'package.json')))) {
        throw new Error(`Shared store is missing ${entry.name}@${entry.version}.`);
      }
      const destination = path.resolve(stageRoot, entry.installPath);
      if (!isInside(stageRoot, destination)) throw new Error(`Unsafe npm install path in lockfile: ${entry.installPath}`);
      if (await fs.pathExists(destination)) await fs.remove(destination);
      await copyTreeWithHardlinks(source, destination);
    }
    await createBinLinks(stageRoot, tree.packages);
    await fs.writeJson(path.join(stageRoot, '.jsf-tree.json'), {
      treeId: tree.treeId,
      packageCount: tree.packages.length,
      createdAt: new Date().toISOString()
    }, { spaces: 2 });
    await fs.ensureDir(instancesPath);
    try {
      await fs.move(stageRoot, instanceRoot, { overwrite: false });
    } catch (error) {
      const marker = await fs.readJson(markerPath).catch(() => null);
      if (marker?.treeId === tree.treeId) {
        await fs.remove(stageRoot);
        return instanceRoot;
      }
      throw error;
    }
    return instanceRoot;
  } catch (error) {
    await fs.remove(stageRoot);
    throw error;
  }
}
