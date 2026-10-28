import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

function runNpm(args, cwd) {
  return new Promise((resolve, reject) => {
    const windows = process.platform === 'win32';
    const child = spawn(windows ? 'npm.cmd' : 'npm', args, {
      cwd,
      shell: windows,
      windowsHide: true,
      env: { ...process.env, NPM_CONFIG_FUND: 'false', NPM_CONFIG_AUDIT: 'false' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const append = chunk => {
      output = (output + chunk.toString()).slice(-12000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', error => reject(new Error(`Could not start npm to resolve dependencies: ${error.message}`)));
    child.on('close', code => {
      if (code === 0) return resolve(output);
      reject(new Error(`npm dependency resolution failed (exit ${code}).\n${output.trim()}`));
    });
  });
}

function parseNameFromInstallPath(installPath) {
  const parts = installPath.split('/');
  let name = null;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== 'node_modules' || i + 1 >= parts.length) continue;
    if (parts[i + 1].startsWith('@')) {
      if (i + 2 >= parts.length) return null;
      name = `${parts[i + 1]}/${parts[i + 2]}`;
      i += 2;
    } else {
      name = parts[i + 1];
      i += 1;
    }
  }
  return name;
}

function isPlatformCompatible(entry) {
  const matches = (values, current) => {
    if (!values) return true;
    const list = Array.isArray(values) ? values : [values];
    const positive = list.filter(value => !String(value).startsWith('!')).map(String);
    const negative = list.filter(value => String(value).startsWith('!')).map(value => String(value).slice(1));
    if (negative.includes(current)) return false;
    return positive.length === 0 || positive.includes(current);
  };
  return matches(entry.os, process.platform) && matches(entry.cpu, process.arch);
}

function validateRegistrySpecifier(name, range) {
  if (typeof range !== 'string' || range.trim() === '') {
    throw new Error(`Dependency ${name} must have a non-empty version or registry specifier.`);
  }
  if (/^(file:|link:|workspace:|git\+|git:|github:|https?:\/\/)/i.test(range)) {
    throw new Error(`Dependency ${name}@${range} is not a registry version specifier. JSF currently installs npm registry packages only.`);
  }
}

function getInstallPath(lockKey) {
  if (!lockKey || !lockKey.startsWith('node_modules/')) return null;
  return lockKey.replaceAll('\\', '/');
}

export async function resolveDependencyTree(projectPath, packageJson, registry) {
  const declared = {
    ...(packageJson.peerDependencies || {}),
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.optionalDependencies || {})
  };
  for (const [name, peerMeta] of Object.entries(packageJson.peerDependenciesMeta || {})) {
    const isAlsoDeclared = Object.hasOwn(packageJson.dependencies || {}, name)
      || Object.hasOwn(packageJson.devDependencies || {}, name)
      || Object.hasOwn(packageJson.optionalDependencies || {}, name);
    if (peerMeta?.optional && !isAlsoDeclared) delete declared[name];
  }
  for (const [name, range] of Object.entries(declared)) validateRegistrySpecifier(name, range);
  if (packageJson.workspaces) {
    throw new Error('Workspace packages are not supported by JSF yet. Run JSF from a single-package project.');
  }

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'jsf-resolve-'));
  try {
    const tempPackage = { ...packageJson };
    delete tempPackage.workspaces;
    await fs.writeJson(path.join(tempDirectory, 'package.json'), tempPackage, { spaces: 2 });
    for (const lockName of ['npm-shrinkwrap.json', 'package-lock.json']) {
      const source = path.join(projectPath, lockName);
      if (await fs.pathExists(source)) {
        await fs.copy(source, path.join(tempDirectory, lockName));
      }
    }
    await runNpm([
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--lockfile-version=3',
      '--registry', registry
    ], tempDirectory);

    const shrinkwrap = path.join(tempDirectory, 'npm-shrinkwrap.json');
    const lockPath = await fs.pathExists(shrinkwrap) ? shrinkwrap : path.join(tempDirectory, 'package-lock.json');
    if (!(await fs.pathExists(lockPath))) throw new Error('npm did not produce a package-lock.json.');
    const npmLock = await fs.readJson(lockPath);
    const lockPackages = npmLock.packages || {};
    const packages = [];

    for (const [lockKey, entry] of Object.entries(lockPackages)) {
      if (lockKey === '' || entry.link || entry.inBundle || !isPlatformCompatible(entry)) continue;
      const installPath = getInstallPath(lockKey);
      if (!installPath || !entry.version) continue;
      const name = entry.name || parseNameFromInstallPath(installPath);
      if (!name) throw new Error(`Could not determine the npm package name for lock entry ${lockKey}.`);
      if (/^(git\+|git:|file:|link:)/i.test(entry.resolved || '')) {
        throw new Error(`Resolved package ${name}@${entry.version} uses a non-registry source (${entry.resolved}). JSF currently installs npm registry packages only.`);
      }
      packages.push({
        installPath,
        name,
        version: entry.version,
        resolved: entry.resolved || null,
        integrity: entry.integrity || null,
        optional: Boolean(entry.optional),
        bin: entry.bin || null
      });
    }

    packages.sort((a, b) => a.installPath.localeCompare(b.installPath));
    const direct = [];
    for (const [dependencyName, range] of Object.entries(declared)) {
      const installPath = `node_modules/${dependencyName}`;
      const entry = packages.find(item => item.installPath === installPath);
      if (!entry) {
        if ((packageJson.optionalDependencies || {})[dependencyName]) continue;
        throw new Error(`npm resolved no installable package for direct dependency ${dependencyName}@${range}.`);
      }
      direct.push({
        name: dependencyName,
        range,
        packageName: entry.name,
        version: entry.version,
        installPath: entry.installPath
      });
    }

    const treeKey = JSON.stringify(packages.map(({ installPath, name, version, resolved, integrity, optional, bin }) => ({
      installPath, name, version, resolved, integrity, optional, bin
    })));
    const treeId = createHash('sha256').update(treeKey).digest('hex').slice(0, 32);
    return { npmLock, packages, direct, treeId };
  } finally {
    await fs.remove(tempDirectory);
  }
}

export { parseNameFromInstallPath };
