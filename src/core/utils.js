import path from 'path';
import { createHash } from 'crypto';
import os from 'os';

export function getProjectId(projectPath) {
  const absolutePath = path.resolve(projectPath);
  return createHash('sha256').update(absolutePath.toLowerCase()).digest('hex').substring(0, 16);
}

export function normalizePath(p) {
  return path.normalize(p);
}

export function isWindows() {
  return process.platform === 'win32';
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function expandHome(filepath) {
  if (!filepath) return filepath;
  if (filepath.startsWith('~')) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}
