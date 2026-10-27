import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { verifyLinks } from '../core/linker.js';

export async function run(scriptName) {
  console.log(chalk.cyan.bold(`\n▶️  JSF Run - ${scriptName}\n`));
  
  try {
    const projectPath = process.cwd();
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    if (!(await fs.pathExists(packageJsonPath))) {
      console.log(chalk.red('✗ No package.json found in current directory\n'));
      return;
    }
    
    const packageJson = await fs.readJson(packageJsonPath);
    const scripts = packageJson.scripts || {};
    
    if (!scripts[scriptName]) {
      console.log(chalk.red(`✗ Script "${scriptName}" not found in package.json`));
      console.log(chalk.gray('\nAvailable scripts:'));
      for (const [name, cmd] of Object.entries(scripts)) {
        console.log(chalk.gray(`  ${name}: ${cmd}`));
      }
      console.log();
      return;
    }
    
    // Check links
    const verifyResult = await verifyLinks(projectPath);
    if (!verifyResult.valid) {
      console.log(chalk.yellow('⚠️  Some links are broken. Running "jsf install" may be needed.'));
      console.log(chalk.gray('Attempting to run anyway...\n'));
    }
    
    console.log(chalk.gray(`$ ${scripts[scriptName]}\n`));
    
    // Run the script using npm/node
    const child = spawn('npm', ['run', scriptName], {
      cwd: projectPath,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    
    child.on('error', (error) => {
      console.error(chalk.red('Error running script:'), error.message);
      process.exitCode = 1;
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        console.log(chalk.red(`\n✗ Script exited with code ${code}\n`));
        process.exitCode = Number.isInteger(code) && code > 0 ? code : 1;
      }
    });
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}
