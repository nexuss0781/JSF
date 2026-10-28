import { Command } from 'commander';
import { setup } from './commands/setup.js';
import { install } from './commands/install.js';
import { projects } from './commands/projects.js';
import { status } from './commands/status.js';
import { run } from './commands/run.js';
import { verify } from './commands/verify.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();
program
  .name('jsf')
  .description('JSF - shared npm package storage with project-specific dependency trees')
  .version(version);

program.command('setup')
  .description('Initialize the machine-wide store and per-user settings')
  .action(setup);
program.command('install')
  .description('Resolve, share, and link packages from package.json')
  .action(install);
program.command('status')
  .description('Show exact resolved versions and NEW / UPGRADE / DOWNGRADE changes')
  .action(status);
program.command('projects')
  .description('List tracked projects and their resolved package versions')
  .action(projects);
program.command('run <script>')
  .description('Run a package.json script via npm')
  .action(run);
program.command('verify')
  .description('Verify project links point to the shared store')
  .action(verify);

program.parse();
