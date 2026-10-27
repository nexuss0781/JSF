import fs from 'fs-extra';
import path from 'path';
import { getConfig } from './config.js';
import { getProjectId } from './utils.js';
import { createHash } from 'crypto';

export async function trackProject(projectPath, deps) {
  const config = await getConfig();
  const projectsPath = config.projectsPath;
  await fs.ensureDir(projectsPath);
  
  const projectId = getProjectId(projectPath);
  const absolutePath = path.resolve(projectPath);
  const packageJsonPath = path.join(absolutePath, 'package.json');
  
  let packageJsonHash = '';
  if (await fs.pathExists(packageJsonPath)) {
    const pkgContent = await fs.readFile(packageJsonPath);
    packageJsonHash = createHash('sha256').update(pkgContent).digest('hex');
  }
  
  const projectData = {
    id: projectId,
    name: path.basename(absolutePath),
    path: absolutePath,
    packageJsonHash,
    deps: deps || {},
    lastInstall: new Date().toISOString(),
    jsfLockHash: ''
  };
  
  const projectFile = path.join(projectsPath, `${projectId}.json`);
  await fs.writeJson(projectFile, projectData, { spaces: 2 });
  
  return projectData;
}

export async function getTrackedProjects() {
  const config = await getConfig();
  const projectsPath = config.projectsPath;
  
  if (!(await fs.pathExists(projectsPath))) {
    return [];
  }
  
  const files = await fs.readdir(projectsPath);
  const projects = [];
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const projectData = await fs.readJson(path.join(projectsPath, file));
        projects.push(projectData);
      } catch (e) {
        // Skip invalid project files
      }
    }
  }
  
  return projects.sort((a, b) => new Date(b.lastInstall) - new Date(a.lastInstall));
}

export async function getProjectByPath(projectPath) {
  const projects = await getTrackedProjects();
  const absolutePath = path.resolve(projectPath);
  return projects.find(p => p.path === absolutePath);
}
