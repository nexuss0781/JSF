import semver from 'semver';
import { listStorePackages } from './store.js';

export async function diffDependencies(requiredDeps, storePackages = null) {
  if (!storePackages) {
    storePackages = await listStorePackages();
  }
  
  const plan = {
    new: [],
    upgrade: [],
    downgrade: [],
    ok: [],
    all: []
  };
  
  for (const [pkgName, versionRange] of Object.entries(requiredDeps)) {
    const availableVersions = storePackages[pkgName] || [];
    
    if (availableVersions.length === 0) {
      // Need to resolve what version to install - for now pick latest that satisfies or just the range
      plan.new.push({
        name: pkgName,
        range: versionRange,
        action: 'new'
      });
      plan.all.push({ name: pkgName, range: versionRange, action: 'new' });
      continue;
    }
    
    // Find best matching version in store
    // For simplicity in v0.1, look for exact match or highest version
    const satisfyingVersions = availableVersions.filter(v => semver.satisfies(v, versionRange));
    
    if (satisfyingVersions.length === 0) {
      // No satisfying version in store - need to install/fetch
      plan.new.push({
        name: pkgName,
        range: versionRange,
        action: 'new'
      });
      plan.all.push({ name: pkgName, range: versionRange, action: 'new' });
      continue;
    }
    
    // Use highest satisfying version
    const bestVersion = satisfyingVersions.sort((a, b) => semver.rcompare(a, b))[0];
    
    plan.ok.push({
      name: pkgName,
      range: versionRange,
      version: bestVersion,
      action: 'ok'
    });
    plan.all.push({ name: pkgName, range: versionRange, version: bestVersion, action: 'ok' });
  }
  
  return plan;
}

export async function getVersionsToFetch(requiredDeps, plan) {
  // For packages marked as new with no satisfying version in store
  // We need to determine what version to fetch
  const toFetch = [];
  
  for (const item of plan.new) {
    // For v0.1, we'll try to fetch a version that satisfies the range
    // In a full implementation, we'd resolve from registry
    // For now, mark it for resolution
    toFetch.push({
      name: item.name,
      range: item.range,
      needResolution: true
    });
  }
  
  return toFetch;
}
