import os from 'node:os';
import path from 'node:path';

function getMachineSharedRoot() {
  if (process.platform === 'win32') {
    return path.join(process.env.ProgramData || 'C:\\ProgramData', 'JSF');
  }
  if (process.platform === 'darwin') {
    return '/Library/Application Support/JSF';
  }
  return '/var/lib/jsf';
}

const userHome = os.homedir();
export const JSF_HOME = path.resolve(process.env.JSF_HOME || path.join(userHome, '.jsf'));
export const SHARED_HOME = path.resolve(process.env.JSF_SHARED_HOME || getMachineSharedRoot());
export const STORE_PATH = path.resolve(process.env.JSF_SHARED_STORE || path.join(SHARED_HOME, 'store'));
export const PROJECTS_PATH = path.join(JSF_HOME, 'projects');
export const REGISTRY_CACHE_PATH = path.join(JSF_HOME, 'registry-cache');
export const BIN_PATH = path.join(JSF_HOME, 'bin');
export const LOGS_PATH = path.join(JSF_HOME, 'logs');
export const CONFIG_PATH = path.join(JSF_HOME, 'config.json');

export const DEFAULT_CONFIG = {
  version: 2,
  registry: 'https://registry.npmjs.org/',
  storePath: STORE_PATH,
  projectsPath: PROJECTS_PATH,
  maxConcurrency: 8,
  useSymlink: true,
  allowNativeBuild: false,
  createdAt: new Date().toISOString()
};
