import chalk from 'chalk';
import { verifyLinks } from '../core/linker.js';
import path from 'path';

export async function verify() {
  console.log(chalk.cyan.bold('\n🔍 JSF Verify - Checking Linked Dependencies\n'));
  
  try {
    const projectPath = process.cwd();
    console.log(chalk.white(`Project: ${path.basename(projectPath)}\n`));
    
    const result = await verifyLinks(projectPath);
    
    if (result.valid) {
      console.log(chalk.green.bold('✅ ' + result.message));
      console.log(chalk.gray('All symlinks are valid and pointing to global store.\n'));
    } else {
      process.exitCode = 1;
      console.log(chalk.red.bold('✗ ' + result.message));
      console.log();
      for (const broken of result.broken) {
        console.log(chalk.red(`  • ${broken.name}: ${broken.reason}`));
      }
      console.log(chalk.yellow('\nRun "jsf install" or "jsf sync" to fix broken links.\n'));
    }
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}
