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
      console.log(chalk.gray(`  ID: ${project.id}`));
      console.log(chalk.gray(`  Last Install: ${new Date(project.lastInstall).toLocaleString()}`));
      
      const depCount = Object.keys(project.deps || {}).length;
      console.log(chalk.gray(`  Dependencies: ${depCount}`));
      
      if (depCount > 0 && depCount <= 10) {
        const deps = Object.entries(project.deps).map(([name, ver]) => `${name}@${ver}`);
        console.log(chalk.gray(`  Packages: ${deps.join(', ')}`));
      } else if (depCount > 10) {
        const deps = Object.entries(project.deps).slice(0, 5).map(([name, ver]) => `${name}@${ver}`);
        console.log(chalk.gray(`  Packages: ${deps.join(', ')} + ${depCount - 5} more`));
      }
      console.log();
    }
    
    console.log(chalk.gray(`Total: ${trackedProjects.length} project(s)\n`));
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}
