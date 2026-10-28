import fs from 'fs-extra';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getConfig } from './config.js';
import { getProjectId } from './utils.js';

export async function trackProject(projectPath, deps, resolvedDeps = {}, resolvedPackages = []) {
  const config = await getConfig();
  const projectsPath = config.projectsPath;
  await fs.ensureDir(projectsPath);
  const absolutePath = path.resolve(projectPath);
  const projectId = getProjectId(absolutePath);
  const packageJsonPath = path.join(absolutePath, 'package.json');
  const packageJsonHash = await fs.pathExists(packageJsonPath)
    ? createHash('sha256').update(await fs.readFile(packageJsonPath)).digest('hex')
    : '';
  const lockPath = path.join(absolutePath, 'jsf.lock');
  const jsfLockHash = await fs.pathExists(lockPath)
    ? createHash('sha256').update(await fs.readFile(lockPath)).digest('hex')
    : '';
  const projectData = {
    id: projectId,
    name: path.basename(absolutePath),
    path: absolutePath,
    packageJsonHash,
    deps: deps || {},
    resolvedDeps: resolvedDeps || {},
    resolvedPackages: resolvedPackages || [],
    packageCount: (resolvedPackages || []).length,
    lastInstall: new Date().toISOString(),
    jsfLockHash
  };
  await fs.writeJson(path.join(projectsPath, `${projectId}.json`), projectData, { spaces: 2 });
  return projectData;
}

export async function getTrackedProjects() {
  const config = await getConfig();
  const projectsPath = config.projectsPath;
  if (!(await fs.pathExists(projectsPath))) return [];
  const files = await fs.readdir(projectsPath);
  const projects = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      projects.push(await fs.readJson(path.join(projectsPath, file)));
    } catch {
      // Ignore incomplete or invalid records and keep listing the remaining projects.
    }
  }
  return projects.sort((a, b) => new Date(b.lastInstall) - new Date(a.lastInstall));
}

export async function getProjectByPath(projectPath) {
  const projects = await getTrackedProjects();
  const absolutePath = path.resolve(projectPath);
  return projects.find(project => project.path === absolutePath);
}
