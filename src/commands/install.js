import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'node:path';
import { resolveDependencyTree } from '../core/npm-resolver.js';
import { buildInstallPlan } from '../core/resolver.js';
import { listStorePackages } from '../core/store.js';
import { fetchPackagesInParallel } from '../core/fetcher.js';
import { materializeInstallTree } from '../core/instance.js';
import { linkInstallTree, verifyLinks } from '../core/linker.js';
import { trackProject } from '../core/tracker.js';
import { getConfig } from '../core/config.js';

function collectDeclaredDependencies(packageJson) {
  const dependencies = {
    ...(packageJson.peerDependencies || {}),
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.optionalDependencies || {})
  };
  return dependencies;
}

function itemLabel(item) {
  const label = item.directName || item.name;
  const location = item.directName ? 'direct' : item.installPath;
  return `${label}@${item.version} (${location})`;
}

function printPlan(plan) {
  console.log(chalk.cyan('\n📋 Resolved install plan:'));
  for (const [action, color, title] of [
    ['new', chalk.yellow, 'NEW'],
    ['upgrade', chalk.blue, 'UPGRADE'],
    ['downgrade', chalk.magenta, 'DOWNGRADE'],
    ['ok', chalk.green, 'CACHED / UP-TO-DATE']
  ]) {
    for (const item of plan[action]) {
      const transition = item.current ? `${item.current} → ${item.version}` : item.version;
      const cache = item.cached ? 'reuse' : 'fetch';
      console.log(color(`  ${title}: ${item.name}@${transition} [${cache}; ${item.installPath}]`));
    }
  }
  console.log();
}

function makeJsfLock(tree, instanceRoot, declaredDependencies) {
  const directByPath = new Map(tree.direct.map(item => [item.installPath, item]));
  const dependencies = {};
  const resolvedDeps = {};
  for (const direct of tree.direct) {
    const storePath = path.resolve(instanceRoot, direct.installPath);
    dependencies[direct.name] = {
      range: direct.range,
      packageName: direct.packageName,
      version: direct.version,
      installPath: direct.installPath,
      storePath
    };
    resolvedDeps[direct.name] = {
      range: direct.range,
      packageName: direct.packageName,
      version: direct.version,
      installPath: direct.installPath,
      storePath
    };
  }
  const packages = tree.packages.map(item => ({
    installPath: item.installPath,
    name: item.name,
    version: item.version,
    resolved: item.resolved,
    integrity: item.integrity,
    optional: item.optional,
    directName: directByPath.get(item.installPath)?.name || null,
    storePath: path.resolve(instanceRoot, item.installPath)
  }));
  return {
    lockfileVersion: 2,
    generatedAt: new Date().toISOString(),
    treeId: tree.treeId,
    sharedStorePath: instanceRoot,
    binStorePath: path.join(instanceRoot, 'node_modules', '.bin'),
    declaredDependencies,
    dependencies,
    packages
  };
}

export async function install() {
  console.log(chalk.cyan.bold('\n📥 JSF Install - Shared Machine Store\n'));
  const startTime = Date.now();
  try {
    const projectPath = process.cwd();
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!(await fs.pathExists(packageJsonPath))) {
      console.error(chalk.red('✗ No package.json found in the current directory.'));
      process.exitCode = 1;
      return;
    }

    const packageJson = await fs.readJson(packageJsonPath);
    const declaredDependencies = collectDeclaredDependencies(packageJson);
    const dependencyCount = Object.keys(declaredDependencies).length;
    console.log(chalk.white(`Project: ${packageJson.name || path.basename(projectPath)}`));
    console.log(chalk.gray(`Declared dependencies: ${dependencyCount}\n`));

    const config = await getConfig();
    const resolveSpinner = ora('Resolving the npm dependency and peer tree...').start();
    const tree = await resolveDependencyTree(projectPath, packageJson, config.registry);
    resolveSpinner.succeed(`Resolved ${tree.packages.length} packages (${tree.direct.length} direct)`);
    const lifecyclePackages = Object.entries(tree.npmLock.packages || {})
      .filter(([lockPath, entry]) => lockPath && entry.hasInstallScript)
      .map(([lockPath, entry]) => `${entry.name || lockPath} @ ${entry.version}`);
    if (lifecyclePackages.length) {
      console.warn(chalk.yellow(`⚠ ${lifecyclePackages.length} package(s) declare install scripts; JSF does not run lifecycle scripts: ${lifecyclePackages.slice(0, 8).join(', ')}${lifecyclePackages.length > 8 ? ', …' : ''}`));
    }

    const scanSpinner = ora('Scanning the machine-wide shared store...').start();
    const storePackages = await listStorePackages();
    scanSpinner.succeed(`Found ${Object.keys(storePackages).length} package name(s) in the shared store`);

    const oldLockPath = path.join(projectPath, 'jsf.lock');
    const previousLock = await fs.pathExists(oldLockPath) ? await fs.readJson(oldLockPath).catch(() => null) : null;
    const plan = await buildInstallPlan(tree, storePackages, previousLock);
    printPlan(plan);

    let fetchResults = [];
    if (plan.toFetch.length) {
      const fetchSpinner = ora(`Fetching ${plan.toFetch.length} unique package version(s) in parallel...`).start();
      fetchResults = await fetchPackagesInParallel(plan.toFetch);
      const failed = fetchResults.filter(result => !result.success);
      if (failed.length) {
        fetchSpinner.fail(`Failed to fetch ${failed.length} package version(s)`);
        for (const failure of failed) console.error(chalk.red(`  ✗ ${failure.name}@${failure.version}: ${failure.error}`));
        process.exitCode = 1;
        return;
      }
      fetchSpinner.succeed(`Fetched ${fetchResults.filter(result => !result.cached).length} package version(s)`);
    } else {
      console.log(chalk.green('All exact package versions are already in the shared store.'));
    }

    const treeSpinner = ora('Building the shared, hard-linked npm install tree...').start();
    const instanceRoot = await materializeInstallTree(tree);
    treeSpinner.succeed(`Prepared shared install tree ${tree.treeId}`);

    const linkSpinner = ora('Linking project dependencies to the shared store...').start();
    const linkResults = await linkInstallTree(projectPath, tree, instanceRoot);
    const linkFailures = linkResults.filter(result => !result.linked);
    if (linkFailures.length) {
      linkSpinner.fail(`Could not link ${linkFailures.length} item(s)`);
      for (const failure of linkFailures) console.error(chalk.red(`  ✗ ${failure.name}: ${failure.error}`));
      process.exitCode = 1;
      return;
    }
    linkSpinner.succeed(`Linked ${tree.direct.length} direct dependency/ies`);

    const lockData = makeJsfLock(tree, instanceRoot, declaredDependencies);
    await fs.writeJson(oldLockPath, lockData, { spaces: 2 });
    const verification = await verifyLinks(projectPath);
    if (!verification.valid) {
      console.error(chalk.red(`✗ Post-install verification failed: ${verification.message}`));
      for (const issue of verification.broken) console.error(chalk.red(`  • ${issue.name}: ${issue.reason}`));
      process.exitCode = 1;
      return;
    }

    await trackProject(projectPath, declaredDependencies, lockData.dependencies, lockData.packages);
    const uniqueCount = new Set(tree.packages.map(item => `${item.name}\u0000${item.version}`)).size;
    const downloadedCount = fetchResults.filter(result => result.success && !result.cached).length;
    const reusedCount = Math.max(0, uniqueCount - downloadedCount);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(chalk.green.bold(`\n✅ SUCCESS: Installed ${tree.packages.length} resolved package entries in ${elapsed}s`));
    console.log(chalk.cyan(`   Unique versions: ${uniqueCount} | Reused from shared store: ${reusedCount} | Downloaded: ${downloadedCount}`));
    console.log(chalk.gray(`   Verified project links and saved exact versions to ${oldLockPath}\n`));
  } catch (error) {
    console.error(chalk.red('\n✗ Install failed:'), error.message);
    if (['EACCES', 'EPERM', 'EROFS'].includes(error.code)) {
      console.error(chalk.yellow('The machine-wide package store needs administrator-managed write access for this install.'));
    }
    process.exitCode = 1;
  }
}
