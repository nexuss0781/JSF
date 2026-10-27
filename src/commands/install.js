import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { diffDependencies, getVersionsToFetch } from '../core/resolver.js';
import { listStorePackages } from '../core/store.js';
import { fetchPackagesInParallel } from '../core/fetcher.js';
import { linkAllPackages } from '../core/linker.js';
import { trackProject } from '../core/tracker.js';
import pacote from 'pacote';
import { getConfig } from '../core/config.js';

export async function install() {
  console.log(chalk.cyan.bold('\n📥 JSF Install - Using Global Store\n'));
  
  const startTime = Date.now();
  
  try {
    const projectPath = process.cwd();
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    if (!(await fs.pathExists(packageJsonPath))) {
      console.log(chalk.red('✗ No package.json found in current directory'));
      console.log(chalk.gray('Run this command from a project root with package.json\n'));
      return;
    }
    
    const packageJson = await fs.readJson(packageJsonPath);
    const deps = { ...(packageJson.dependencies || {}) };
    const devDeps = { ...(packageJson.devDependencies || {}) };
    const allDeps = { ...deps, ...devDeps };
    
    if (Object.keys(allDeps).length === 0) {
      console.log(chalk.gray('No dependencies found in package.json\n'));
      return;
    }
    
    console.log(chalk.white(`Project: ${packageJson.name || path.basename(projectPath)}`));
    console.log(chalk.gray(`Dependencies: ${Object.keys(deps).length} prod, ${Object.keys(devDeps).length} dev\n`));
    
    // Scan store
    const spinner1 = ora('Scanning global store...').start();
    const storePackages = await listStorePackages();
    spinner1.succeed(`Found ${Object.keys(storePackages).length} packages in store`);
    
    // Diff
    const spinner2 = ora('Analyzing dependencies...').start();
    const plan = await diffDependencies(allDeps, storePackages);
    spinner2.succeed('Analysis complete');
    
    // Show plan
    console.log(chalk.cyan('\n📋 Install Plan:'));
    let toDownload = 0;
    let toReuse = 0;
    
    for (const item of plan.ok) {
      console.log(chalk.green(`  ✓ ${item.name}@${item.version} [REUSE]`));
      toReuse++;
    }
    for (const item of plan.new) {
      console.log(chalk.yellow(`  + ${item.name}@${item.range} [DOWNLOAD]`));
      toDownload++;
    }
    
    console.log();
    
    // Fetch missing packages
    if (toDownload > 0) {
      const spinner3 = ora(`Fetching ${toDownload} package(s) from registry...`).start();
      const config = await getConfig();
      const packagesToFetch = [];
      
      for (const item of plan.new) {
        // Try to resolve to a specific version
        try {
          const manifest = await pacote.manifest(`${item.name}@${item.range}`, { registry: config.registry });
          packagesToFetch.push({ name: item.name, version: manifest.version });
        } catch (error) {
          spinner3.fail(`Failed to resolve ${item.name}@${item.range}`);
          console.error(chalk.red(`Error: ${error.message}`));
          process.exitCode = 1;
          return;
        }
      }
      
      const fetchResults = await fetchPackagesInParallel(packagesToFetch);
      const failed = fetchResults.filter(r => !r.success);
      
      if (failed.length > 0) {
        spinner3.fail(`Failed to fetch ${failed.length} package(s)`);
        for (const f of failed) {
          console.error(chalk.red(`  ✗ ${f.name}@${f.version}: ${f.error}`));
        }
        process.exitCode = 1;
        return;
      }
      
      spinner3.succeed(`Fetched ${toDownload} package(s)`);
      
      // Update plan with fetched versions
      for (let i = 0; i < plan.new.length; i++) {
        plan.new[i].version = packagesToFetch[i].version;
      }
    }
    
    // Link packages
    const spinner4 = ora('Linking packages to project...').start();
    const packagesToLink = [
      ...plan.ok.map(p => ({ name: p.name, version: p.version })),
      ...plan.new.map(p => ({ name: p.name, version: p.version }))
    ];
    
    const linkResults = await linkAllPackages(projectPath, packagesToLink);
    const linkFailed = linkResults.filter(r => !r.linked);
    
    if (linkFailed.length > 0) {
      spinner4.warn(`Linked with ${linkFailed.length} warning(s)`);
      for (const f of linkFailed) {
        console.log(chalk.yellow(`  ⚠ ${f.name}@${f.version}: ${f.error}`));
      }
      process.exitCode = 1;
      return;
    } else {
      spinner4.succeed(`Linked ${packagesToLink.length} package(s)`);
    }
    
    // Track project
    const spinner5 = ora('Tracking project...').start();
    await trackProject(projectPath, allDeps);
    spinner5.succeed('Project tracked');
    
    // Write jsf.lock
    const lockData = {
      lockfileVersion: 1,
      generatedAt: new Date().toISOString(),
      dependencies: {}
    };
    
    for (const pkg of packagesToLink) {
      lockData.dependencies[pkg.name] = {
        version: pkg.version,
        storePath: `~/.jsf/store/${pkg.name.replace(/\//g, '+')}/${pkg.version}`
      };
    }
    
    const lockPath = path.join(projectPath, 'jsf.lock');
    await fs.writeJson(lockPath, lockData, { spaces: 2 });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(chalk.green.bold(`\n✅ SUCCESS: Installed ${packagesToLink.length} packages in ${elapsed}s`));
    console.log(chalk.cyan(`   Reused: ${toReuse} from cache | Downloaded: ${toDownload}\n`));
    
  } catch (error) {
    console.error(chalk.red('\n✗ Install failed:'), error.message);
    process.exit(1);
  }
}
