import fs from 'fs-extra';
import path from 'path';
import { CONFIG_PATH, DEFAULT_CONFIG, JSF_HOME, STORE_PATH, PROJECTS_PATH, REGISTRY_CACHE_PATH, BIN_PATH, LOGS_PATH } from '../constants.js';

export async function ensureJSFDirectories() {
  await fs.ensureDir(JSF_HOME);
  await fs.ensureDir(STORE_PATH);
  await fs.ensureDir(PROJECTS_PATH);
  await fs.ensureDir(REGISTRY_CACHE_PATH);
  await fs.ensureDir(BIN_PATH);
  await fs.ensureDir(LOGS_PATH);
}

export async function loadConfig() {
  await ensureJSFDirectories();
  if (await fs.pathExists(CONFIG_PATH)) {
    const config = await fs.readJson(CONFIG_PATH);
    return { ...DEFAULT_CONFIG, ...config };
  } else {
    await fs.writeJson(CONFIG_PATH, DEFAULT_CONFIG, { spaces: 2 });
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config) {
  await fs.ensureDir(JSF_HOME);
  await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
}

export async function getConfig() {
  return await loadConfig();
}
