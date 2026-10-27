import { Command } from 'commander';
import { setup } from './commands/setup.js';
import { install } from './commands/install.js';
import { projects } from './commands/projects.js';
import { status } from './commands/status.js';
import { run } from './commands/run.js';
import { verify } from './commands/verify.js';

const program = new Command();

program
  .name('jsf')
  .description('JSF - Install once. Share everywhere. System-level shared JavaScript dependency manager')
  .version('0.0.1');

program.command('setup').description('Initialize JSF at system level (creates ~/.jsf/, sets up config)').action(setup);
program.command('install').description('Install deps from package.json using global store').action(install);
program.command('status').description('Show diff vs global store (New / Upgrade / Downgrade / Up-to-date)').action(status);
program.command('projects').description('List all tracked projects with their versions').action(projects);
program.command('run <script>').description('Run a package.json script via JSF').action(run);
program.command('verify').description('Verify linked node_modules and check for broken symlinks').action(verify);

program.parse();
