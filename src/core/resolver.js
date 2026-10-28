import semver from 'semver';
import { assertCachedIntegrities, listStorePackages } from './store.js';

function highestVersion(versions) {
  return versions.filter(version => semver.valid(version)).sort((a, b) => semver.rcompare(a, b))[0] || null;
}

function classify({ targetVersion, availableVersions, previousVersion }) {
  if (previousVersion && semver.valid(previousVersion) && semver.valid(targetVersion)) {
    const comparison = semver.compare(targetVersion, previousVersion);
    if (comparison > 0) return 'upgrade';
    if (comparison < 0) return 'downgrade';
    return 'ok';
  }
  const highestCached = highestVersion(availableVersions);
  if (highestCached && semver.valid(targetVersion)) {
    const comparison = semver.compare(targetVersion, highestCached);
    if (comparison < 0) return 'downgrade';
    if (comparison > 0) return 'upgrade';
  }
  return availableVersions.includes(targetVersion) ? 'ok' : 'new';
}

function previousByPath(previousLock) {
  const result = new Map();
  for (const entry of previousLock?.packages || []) {
    if (entry.installPath) result.set(entry.installPath, entry);
  }
  return result;
}

export async function buildInstallPlan(tree, storePackages = null, previousLock = null) {
  await assertCachedIntegrities(tree.packages);
  const inventory = storePackages || await listStorePackages();
  const priorPackages = previousByPath(previousLock);
  const directByPath = new Map((tree.direct || []).map(entry => [entry.installPath, entry]));
  const plan = { new: [], upgrade: [], downgrade: [], ok: [], all: [], toFetch: [], direct: [] };
  const fetchKeys = new Set();

  for (const entry of tree.packages) {
    const availableVersions = inventory[entry.name] || [];
    const previous = priorPackages.get(entry.installPath);
    const direct = directByPath.get(entry.installPath) || null;
    const previousVersion = previous?.name === entry.name
      ? previous.version
      : (direct && previousLock?.dependencies?.[direct.name]?.packageName === entry.name
        ? previousLock.dependencies[direct.name].version
        : null);
    const action = classify({ targetVersion: entry.version, availableVersions, previousVersion });
    const item = {
      ...entry,
      action,
      cached: availableVersions.includes(entry.version),
      current: previousVersion || null,
      directName: direct?.name || null,
      range: direct?.range || null
    };
    plan[action].push(item);
    plan.all.push(item);
    const fetchKey = `${entry.name}\u0000${entry.version}`;
    if (!item.cached && !fetchKeys.has(fetchKey)) {
      fetchKeys.add(fetchKey);
      plan.toFetch.push({ name: entry.name, version: entry.version, integrity: entry.integrity, resolved: entry.resolved });
    }
  }

  for (const direct of tree.direct || []) {
    const item = plan.all.find(candidate => candidate.installPath === direct.installPath);
    if (item) plan.direct.push({ ...direct, action: item.action, cached: item.cached, current: item.current });
  }
  return plan;
}
