import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { diffDependencies } from '../core/resolver.js';
import { listStorePackages } from '../core/store.js';

export async function status() {
  console.log(chalk.cyan.bold('\n📊 JSF Status - Dependency Diff\n'));
  
  try {
    const projectPath = process.cwd();
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    if (!(await fs.pathExists(packageJsonPath))) {
      console.log(chalk.red('✗ No package.json found in current directory'));
      console.log(chalk.gray('Run this command from a project root with package.json\n'));
      return;
    }
    
    const packageJson = await fs.readJson(packageJsonPath);
    const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
    
    if (Object.keys(deps).length === 0) {
      console.log(chalk.gray('No dependencies found in package.json\n'));
      return;
    }
    
    const storePackages = await listStorePackages();
    const plan = await diffDependencies(deps, storePackages);
    
    console.log(chalk.white(`Project: ${packageJson.name || path.basename(projectPath)}\n`));
    
    if (plan.new.length > 0) {
      console.log(chalk.yellow.bold('🆕 NEW (will be downloaded):'));
      for (const item of plan.new) {
        console.log(chalk.yellow(`  + ${item.name}@${item.range}`));
      }
      console.log();
    }
    
    if (plan.upgrade.length > 0) {
      console.log(chalk.blue.bold('⬆️  UPGRADE:'));
      for (const item of plan.upgrade) {
        console.log(chalk.blue(`  ~ ${item.name}@${item.current} -> ${item.target}`));
      }
      console.log();
    }
    
    if (plan.downgrade.length > 0) {
      console.log(chalk.magenta.bold('⬇️  DOWNGRADE:'));
      for (const item of plan.downgrade) {
        console.log(chalk.magenta(`  ~ ${item.name}@${item.current} -> ${item.target}`));
      }
      console.log();
    }
    
    if (plan.ok.length > 0) {
      console.log(chalk.green.bold('✅ UP-TO-DATE (in store):'));
      for (const item of plan.ok) {
        console.log(chalk.green(`  ✓ ${item.name}@${item.version}`));
      }
      console.log();
    }
    
    const total = plan.new.length + plan.upgrade.length + plan.downgrade.length;
    if (total === 0) {
      console.log(chalk.green.bold('🎉 All dependencies are cached in store!\n'));
    } else {
      console.log(chalk.gray(`Run "jsf install" to sync ${total} package(s)\n`));
    }
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}
