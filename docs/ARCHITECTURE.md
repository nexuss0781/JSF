# JSF Architecture

## Overview

JSF (JavaScript Shared Framework) is a system-level shared dependency manager that implements a content-addressable-like storage model for npm packages. It stores each unique package@version combination once in a global store and uses symbolic links to share them across projects.

## Design Goals

1. **Bandwidth Efficiency** - Download packages only once ever
2. **Disk Space Efficiency** - No duplication across projects
3. **Speed** - Near-instant installs for projects with cached dependencies
4. **Familiarity** - Compatible with existing `package.json` workflow
5. **Cross-platform** - Works on Windows, macOS, and Linux

## System Architecture

### High-Level Flow

```
┌─────────────┐
│ package.json │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│  jsf install │────▶│ Diff Resolver │
└─────────────┘     └──────┬───────┘
       │                    │
       │              ┌─────▼─────┐
       │              │   Store    │
       │              │   Scanner  │
       │              └─────┬─────┘
       │                    │
       ▼                    ▼
┌─────────────┐     ┌──────────────┐
│   Fetcher    │     │  Link Plan   │
│ (if missing) │     │  (reuse/cache)│
└──────┬──────┘     └──────┬───────┘
       │                    │
       ▼                    │
┌─────────────┐             │
│ Global Store │             │
└──────┬──────┘             │
       │                    │
       └──────────┬─────────┘
                  │
                  ▼
            ┌─────────────┐
            │   Symlinker  │
            └──────┬──────┘
                   │
                   ▼
            ┌─────────────┐
            │ node_modules/│
            │   (symlinks) │
            └─────────────┘
```

## Directory Structure

### Global Structure (`~/.jsf/`)

```
~/.jsf/
├── config.json           # System configuration
├── store/                # Content store - all packages
│   ├── <pkg-name>/       # Package directory (scoped packages use +)
│   │   ├── <version>/    # Specific version
│   │   │   ├── package.json
│   │   │   ├── index.js
│   │   │   └── ...       # All package files
│   │   └── <version2>/
│   └── express/...
├── projects/             # Project tracking metadata
│   └── <project-id>.json
├── registry-cache/       # Optional registry metadata cache
├── bin/                  # CLI binary symlinks
└── logs/                 # Operation logs
```

### Project Structure

```
<project>/
├── package.json          # Dependency manifest (unchanged)
├── jsf.lock             # JSF lockfile
├── node_modules/        # Contains only symlinks (created by JSF)
│   ├── express -> ~/.jsf/store/express/4.21.2
│   ├── lodash -> ~/.jsf/store/lodash/4.17.21
│   └── ...
└── ...                  # Project source files
```

## Core Components

### 1. Config Manager (`core/config.js`)

**Responsibilities:**
- Initialize `~/.jsf/` directory structure
- Load/save `config.json`
- Provide default configuration
- Ensure all required directories exist

**Key Functions:**
- `ensureJSFDirectories()` - Creates all global directories
- `loadConfig()` - Loads config with defaults merged
- `saveConfig(config)` - Writes config to disk
- `getConfig()` - Convenience getter

### 2. Store Manager (`core/store.js`)

**Responsibilities:**
- Manage global package store
- Check package existence
- List all stored packages
- Handle package naming (scoped packages)

**Key Functions:**
- `getStorePath(pkgName, version)` - Returns path in store for package@version
- `packageExistsInStore(pkgName, version)` - Checks if package exists
- `listStorePackages()` - Returns all packages in store grouped by name
- `getStoreInfo()` - Returns store statistics

**Naming Convention:**
- Regular packages: `store/express/4.21.2/`
- Scoped packages: `store/@scope+pkg/1.0.0/` (slashes replaced with +)

### 3. Project Tracker (`core/tracker.js`)

**Responsibilities:**
- Track which projects use JSF
- Generate stable project IDs
- Store project metadata
- Maintain install history

**Key Functions:**
- `trackProject(projectPath, deps)` - Records/updates project in tracker
- `getTrackedProjects()` - Lists all tracked projects
- `getProjectByPath(projectPath)` - Finds project by path

**Project ID Generation:**
Uses SHA256 hash of absolute resolved path (lowercase) truncated to 16 chars for stable identification.

### 4. Fetcher (`core/fetcher.js`)

**Responsibilities:**
- Download packages from npm registry
- Extract tarballs to global store
- Handle parallel downloads
- Atomic extraction

**Key Functions:**
- `fetchAndExtractPackage(pkgName, version)` - Fetch single package
- `fetchPackagesInParallel(packages)` - Fetch multiple packages concurrently

**Process:**
1. Check if exists in store (skip if cached)
2. Create temp staging directory
3. Fetch manifest and tarball via `pacote`
4. Extract tarball with `tar` (strip `package/` prefix)
5. Validate `package.json` exists
6. Atomically move from staging to store
7. Cleanup on error

**Concurrency:** Controlled by `maxConcurrency` in config (default: 8)

### 5. Resolver/Diff (`core/resolver.js`)

**Responsibilities:**
- Compare required deps with store
- Classify packages as NEW/UPGRADE/DOWNGRADE/OK
- Plan installation

**Key Functions:**
- `diffDependencies(requiredDeps, storePackages)` - Generate diff plan
- `getVersionsToFetch(requiredDeps, plan)` - Determine what to fetch

**Classification Logic (v0.1):**
- **NEW**: Package not in store or no satisfying version
- **OK**: Satisfying version exists in store
- **UPGRADE/DOWNGRADE**: Not fully implemented in v0.1, marked as needed

### 6. Linker (`core/linker.js`)

**Responsibilities:**
- Create symlinks from project to store
- Handle platform differences (Windows/Unix)
- Verify link integrity
- Manage `node_modules/` structure

**Key Functions:**
- `linkPackage(projectNodeModules, pkgName, version)` - Link single package
- `linkAllPackages(projectPath, packages)` - Link all packages
- `verifyLinks(projectPath)` - Check for broken symlinks

**Platform Handling:**
- **Windows**: Uses `junction` type (no admin required in most cases)
- **Unix/Linux/macOS**: Uses `dir` symlink type
- Falls back to regular symlink on error with helpful message

### 7. Utils (`core/utils.js`)

**Responsibilities:**
- Path normalization
- Hashing
- Platform detection
- Formatting helpers

**Key Functions:**
- `getProjectId(projectPath)` - Generate stable project ID
- `normalizePath(p)` - Normalize file paths
- `isWindows()` - Platform check
- `formatBytes(bytes)` - Human-readable sizes
- `expandHome(filepath)` - Expand `~` to home directory

## Command Flow

### `jsf setup`
1. Create all `~/.jsf/` directories
2. Load/create config.json
3. Prompt for registry URL
4. Check Windows permissions and warn if needed
5. Display success message

### `jsf install`
1. Read `package.json` from cwd
2. Merge dependencies and devDependencies
3. Scan global store
4. Diff dependencies against store
5. Display install plan
6. Resolve and fetch missing packages (parallel)
7. Extract to global store atomically
8. Create symlinks in project `node_modules/`
9. Track project in global tracker
10. Generate `jsf.lock`
11. Display summary with reuse stats

### `jsf status`
1. Read `package.json`
2. Get store inventory
3. Compute diff
4. Display categorized results

### `jsf projects`
1. Load all tracked projects
2. Display with metadata and dependencies

### `jsf run <script>`
1. Read `package.json` scripts
2. Optionally verify links
3. Spawn `npm run <script>` with inherited stdio

### `jsf verify`
1. Check if `node_modules/` exists
2. Scan for symlinks
3. Verify symlink targets exist
4. Report broken links

## Data Formats

### config.json
```json
{
  "version": 1,
  "registry": "https://registry.npmjs.org/",
  "storePath": "~/.jsf/store",
  "projectsPath": "~/.jsf/projects",
  "maxConcurrency": 8,
  "useSymlink": true,
  "allowNativeBuild": true,
  "createdAt": "ISO8601"
}
```

### jsf.lock (per project)
```json
{
  "lockfileVersion": 1,
  "generatedAt": "ISO8601",
  "dependencies": {
    "<package>": {
      "version": "x.y.z",
      "storePath": "~/.jsf/store/..."
    }
  }
}
```

### projects/<id>.json
```json
{
  "id": "a3f9...",
  "name": "project-name",
  "path": "/absolute/path",
  "packageJsonHash": "sha256...",
  "deps": { "pkg": "^1.0.0" },
  "lastInstall": "ISO8601",
  "jsfLockHash": ""
}
```

## Performance Considerations

### Parallelism
- Downloads: Up to `maxConcurrency` simultaneous (default 8)
- Uses `p-map` for controlled concurrency
- Prevents registry rate limiting

### Atomicity
- Extraction to `store/.staging-<timestamp>-<rand>/` then move
- Prevents corrupted partial packages
- Move operation is atomic on most filesystems

### Caching
- Zero re-download for existing packages
- Immediate reuse across all projects
- Store persists across project deletions

## Security Considerations

### v0.1 Limitations
- No integrity verification beyond basic checks
- No signature verification
- Relies on HTTPS registry
- No package allowlist/blocklist

### Future Improvements
- Verify `integrity` from package manifests
- Support for private registries with auth
- Content verification
- Sandboxing considerations

## Error Handling

### Symlink Issues (Windows)
- Detect Windows platform
- Try junction first
- Provide clear error messages with solutions
- Warn during setup

### Network Issues
- Fail gracefully on fetch errors
- Report which packages failed
- Don't corrupt existing store

### Missing Dependencies
- Validate package.json exists
- Check for broken links
- Suggest running install/verify

## Extensibility

The architecture is designed for easy extension:

- **Transitive dependencies**: Can be added to resolver
- **Monorepo support**: Workspace detection
- **Native modules**: Build caching in store per ABI
- **Different registries**: Configurable per install
- **Compression**: Store format can be optimized
- **Garbage collection**: Can track usage across projects
