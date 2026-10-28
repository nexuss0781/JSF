import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'node:path';
import { resolveDependencyTree } from '../core/npm-resolver.js';
import { buildInstallPlan } from '../core/resolver.js';
import { listStorePackages } from '../core/store.js';
import { getConfig } from '../core/config.js';

function displayLabel(item) {
  return item.directName ? `${item.directName} (direct)` : `${item.name} via ${item.installPath}`;
}

export async function status() {
  console.log(chalk.cyan.bold('\n📊 JSF Status - Resolved Dependency Diff\n'));
  try {
    const projectPath = process.cwd();
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!(await fs.pathExists(packageJsonPath))) {
      console.error(chalk.red('✗ No package.json found in the current directory.'));
      process.exitCode = 1;
      return;
    }
    const packageJson = await fs.readJson(packageJsonPath);
    const config = await getConfig();
    const tree = await resolveDependencyTree(projectPath, packageJson, config.registry);
    const storePackages = await listStorePackages();
    const lockPath = path.join(projectPath, 'jsf.lock');
    const previousLock = await fs.pathExists(lockPath) ? await fs.readJson(lockPath).catch(() => null) : null;
    const plan = await buildInstallPlan(tree, storePackages, previousLock);

    console.log(chalk.white(`Project: ${packageJson.name || path.basename(projectPath)}`));
    console.log(chalk.gray(`Resolved: ${tree.packages.length} package entries; exact versions shown below.\n`));
    for (const [action, color, heading] of [
      ['new', chalk.yellow, 'NEW'],
      ['upgrade', chalk.blue, 'UPGRADE'],
      ['downgrade', chalk.magenta, 'DOWNGRADE'],
      ['ok', chalk.green, 'CACHED / UP-TO-DATE']
    ]) {
      if (!plan[action].length) continue;
      console.log(color.bold(`${heading}:`));
      for (const item of plan[action]) {
        const version = item.current && item.current !== item.version
          ? `${item.current} → ${item.version}`
          : `${item.name}@${item.version}`;
        const state = item.cached ? 'cached' : 'needs fetch';
        console.log(color(`  ${displayLabel(item)}: ${version} [${state}]`));
      }
      console.log();
    }

    const changed = plan.new.length + plan.upgrade.length + plan.downgrade.length;
    const downloadCount = plan.toFetch.length;
    if (!changed) {
      console.log(chalk.green.bold('All resolved package versions are already installed and cached.\n'));
    } else {
      console.log(chalk.gray(`Run "jsf install" to apply ${changed} classified package entries (${downloadCount} unique version(s) need downloading).\n`));
    }
  } catch (error) {
    console.error(chalk.red('Status check failed:'), error.message);
    process.exitCode = 1;
  }
}
