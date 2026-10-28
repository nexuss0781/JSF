import chalk from 'chalk';
import { getTrackedProjects } from '../core/tracker.js';

export async function projects() {
  console.log(chalk.cyan.bold('\n📦 Tracked JSF Projects\n'));
  try {
    const trackedProjects = await getTrackedProjects();
    if (trackedProjects.length === 0) {
      console.log(chalk.gray('No projects tracked yet.'));
      console.log(chalk.gray('Run "jsf install" in a project directory to track it.\n'));
      return;
    }
    for (const project of trackedProjects) {
      console.log(chalk.white.bold(`• ${project.name}`));
      console.log(chalk.gray(`  Path: ${project.path}`));
      console.log(chalk.gray(`  Last Install: ${new Date(project.lastInstall).toLocaleString()}`));
      const deps = Object.entries(project.deps || {});
      const resolved = project.resolvedDeps || {};
      console.log(chalk.gray(`  Direct dependencies: ${deps.length}`));
      if (deps.length) {
        const descriptions = deps.map(([name, range]) => {
          const item = resolved[name];
          return item?.version ? `${name}@${range} → ${item.version}` : `${name}@${range}`;
        });
        console.log(chalk.gray(`  Resolved: ${descriptions.join(', ')}`));
      }
      const transitive = (project.resolvedPackages || []).filter(item => !item.directName);
      if (transitive.length) {
        const versions = transitive.map(item => `${item.name}@${item.version}`);
        console.log(chalk.gray(`  Transitive (${transitive.length}): ${versions.join(', ')}`));
      }
      console.log();
    }
    console.log(chalk.gray(`Total: ${trackedProjects.length} project(s)\n`));
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exitCode = 1;
  }
}
