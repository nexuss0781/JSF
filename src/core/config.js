import fs from 'fs-extra';
import path from 'node:path';
import {
  BIN_PATH,
  CONFIG_PATH,
  DEFAULT_CONFIG,
  JSF_HOME,
  LOGS_PATH,
  PROJECTS_PATH,
  REGISTRY_CACHE_PATH,
  STORE_PATH
} from '../constants.js';

function resolveConfiguredPath(value, fallback) {
  const configured = value || fallback;
  const expanded = configured.startsWith('~')
    ? path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), configured.slice(1))
    : configured;
  return path.resolve(expanded);
}

function normalizeConfig(config) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    storePath: resolveConfiguredPath(config.storePath, STORE_PATH),
    projectsPath: resolveConfiguredPath(config.projectsPath, PROJECTS_PATH)
  };
}

async function ensureUserDirectories() {
  await fs.ensureDir(JSF_HOME);
  for (const directory of [PROJECTS_PATH, REGISTRY_CACHE_PATH, BIN_PATH, LOGS_PATH]) {
    await fs.ensureDir(directory);
  }
}

export async function ensureJSFDirectories() {
  await ensureUserDirectories();
  await fs.ensureDir(STORE_PATH);
}

export async function loadConfig() {
  await ensureUserDirectories();
  let config;
  if (await fs.pathExists(CONFIG_PATH)) {
    config = normalizeConfig(await fs.readJson(CONFIG_PATH));
  } else {
    config = normalizeConfig(DEFAULT_CONFIG);
    await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
  }
  await fs.ensureDir(config.projectsPath);
  return config;
}

export async function saveConfig(config) {
  await ensureUserDirectories();
  const normalized = normalizeConfig(config);
  await fs.writeJson(CONFIG_PATH, normalized, { spaces: 2 });
  return normalized;
}

export async function getConfig() {
  return loadConfig();
}
