import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { ensureJSFDirectories, loadConfig, saveConfig } from '../core/config.js';
import { isWindows } from '../core/utils.js';

export async function setup() {
  console.log(chalk.cyan.bold('\n🚀 JSF Setup - System Level Initialization\n'));
  
  const spinner = ora('Creating JSF directories...').start();
  try {
    await ensureJSFDirectories();
    spinner.succeed('JSF directories created at ~/.jsf/');
    
    // Load or create config
    const spinner2 = ora('Loading configuration...').start();
    let config = await loadConfig();
    spinner2.succeed('Configuration loaded');
    
    // Ask for registry
    const response = await prompts({
      type: 'text',
      name: 'registry',
      message: 'NPM registry URL:',
      initial: config.registry
    });
    
    if (response.registry) {
      config.registry = response.registry;
      await saveConfig(config);
      console.log(chalk.green('✓ Registry updated'));
    }
    
    // Check symlink permissions on Windows
    if (isWindows()) {
      console.log(chalk.yellow('\n⚠️  Windows detected'));
      console.log(chalk.gray('For symlinks to work properly:'));
      console.log(chalk.gray('  1. Enable Developer Mode in Windows Settings, OR'));
      console.log(chalk.gray('  2. Run your terminal as Administrator'));
      console.log(chalk.gray('Run "jsf doctor" after setup to check permissions.\n'));
    }
    
    console.log(chalk.green.bold('✅ JSF setup complete!'));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('  1. Go to a project with package.json'));
    console.log(chalk.gray('  2. Run "jsf install" to install dependencies'));
    console.log(chalk.gray('  3. Run "jsf run <script>" to run your project'));
    console.log(chalk.gray('  4. Create another project - dependencies will be reused!\n'));
    
  } catch (error) {
    spinner.fail('Setup failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}
