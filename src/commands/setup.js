import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import fs from 'fs-extra';
import path from 'node:path';
import { ensureJSFDirectories, loadConfig, saveConfig } from '../core/config.js';
import { JSF_HOME, PROJECTS_PATH, STORE_PATH } from '../constants.js';
import { makePackageFilesReadOnly } from '../core/store.js';
import { isWindows } from '../core/utils.js';

async function migrateLegacyStore(sourcePath, targetPath) {
  const source = path.resolve(sourcePath);
  const target = path.resolve(targetPath);
  if (source === target || !(await fs.pathExists(source))) return 0;
  let migrated = 0;
  for (const packageEntry of await fs.readdir(source)) {
    if (packageEntry.startsWith('.')) continue;
    const packageSource = path.join(source, packageEntry);
    if (!(await fs.stat(packageSource).catch(() => null))?.isDirectory()) continue;
    for (const version of await fs.readdir(packageSource)) {
      const versionSource = path.join(packageSource, version);
      if (!(await fs.pathExists(path.join(versionSource, 'package.json')))) continue;
      const versionTarget = path.join(target, packageEntry, version);
      if (await fs.pathExists(path.join(versionTarget, 'package.json'))) continue;
      await fs.ensureDir(path.dirname(versionTarget));
      await fs.copy(versionSource, versionTarget, { overwrite: false, errorOnExist: false });
      await makePackageFilesReadOnly(versionTarget);
      migrated++;
    }
  }
  return migrated;
}

export async function setup() {
  console.log(chalk.cyan.bold('\n🚀 JSF Setup - Machine-Wide Package Store\n'));
  const spinner = ora('Creating the machine-wide store and user configuration...').start();
  try {
    await ensureJSFDirectories();
    let config = await loadConfig();
    if (Number(config.version) < 2) {
      const migrated = await migrateLegacyStore(config.storePath, STORE_PATH);
      config = await saveConfig({ ...config, version: 2, storePath: STORE_PATH, projectsPath: PROJECTS_PATH });
      if (migrated) console.log(chalk.green(`✓ Migrated ${migrated} cached package version(s) to the shared store`));
    }
    spinner.succeed(`Shared store: ${STORE_PATH}\nUser settings: ${JSF_HOME}`);

    const response = await prompts({
      type: 'text',
      name: 'registry',
      message: 'npm registry URL:',
      initial: config.registry
    });
    if (response.registry) {
      config.registry = response.registry;
      config = await saveConfig(config);
      console.log(chalk.green('✓ Registry updated'));
    }

    if (isWindows()) {
      console.log(chalk.yellow('\nWindows note: configure a trusted shared ACL on the ProgramData\\JSF directory.'));
      console.log(chalk.gray('Project directory links may require Developer Mode or an elevated terminal.\n'));
    } else {
      console.log(chalk.yellow('\nThe shared store is system-owned. For multi-user writes, have an administrator grant access through a trusted JSF group; do not make the store world-writable.'));
      console.log(chalk.gray('Each user keeps separate registry settings and project records.\n'));
    }
    console.log(chalk.green.bold('✅ JSF setup complete!'));
    console.log(chalk.gray('\nNext: run "jsf install" in a package.json project. The exact resolved tree is shared when the lock graph matches.\n'));
  } catch (error) {
    spinner.fail('Setup failed');
    console.error(chalk.red('Error:'), error.message);
    if (['EACCES', 'EPERM', 'EROFS'].includes(error.code)) {
      console.error(chalk.yellow(`An administrator must initialize ${STORE_PATH} and grant the intended trusted users appropriate shared-store access.`));
    }
    process.exitCode = 1;
  }
}
