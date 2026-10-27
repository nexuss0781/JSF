import os from 'os';
import path from 'path';
import envPaths from 'env-paths';

const paths = envPaths('jsf', { suffix: '' });

export const JSF_HOME = path.join(os.homedir(), '.jsf');
export const STORE_PATH = path.join(JSF_HOME, 'store');
export const PROJECTS_PATH = path.join(JSF_HOME, 'projects');
export const REGISTRY_CACHE_PATH = path.join(JSF_HOME, 'registry-cache');
export const BIN_PATH = path.join(JSF_HOME, 'bin');
export const LOGS_PATH = path.join(JSF_HOME, 'logs');
export const CONFIG_PATH = path.join(JSF_HOME, 'config.json');

export const DEFAULT_CONFIG = {
  version: 1,
  registry: 'https://registry.npmjs.org/',
  storePath: STORE_PATH,
  projectsPath: PROJECTS_PATH,
  maxConcurrency: 8,
  useSymlink: true,
  allowNativeBuild: true,
  createdAt: new Date().toISOString()
};
