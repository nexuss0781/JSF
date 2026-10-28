import chalk from 'chalk';
import path from 'node:path';
import { verifyLinks } from '../core/linker.js';

export async function verify() {
  console.log(chalk.cyan.bold('\n🔍 JSF Verify - Checking Shared-Store Links\n'));
  try {
    const projectPath = process.cwd();
    console.log(chalk.white(`Project: ${path.basename(projectPath)}\n`));
    const result = await verifyLinks(projectPath);
    if (result.valid) {
      console.log(chalk.green.bold(`✅ ${result.message}\n`));
      return;
    }
    console.error(chalk.red.bold(`✗ ${result.message}`));
    for (const issue of result.broken) console.error(chalk.red(`  • ${issue.name}: ${issue.reason}`));
    console.error(chalk.yellow('\nRun "jsf install" to rebuild the project links and lockfile.\n'));
    process.exitCode = 1;
  } catch (error) {
    console.error(chalk.red('Verification failed:'), error.message);
    process.exitCode = 1;
  }
}
