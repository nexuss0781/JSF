# JSF Usage Guide

## Table of Contents
- [Getting Started](#getting-started)
- [Basic Workflow](#basic-workflow)
- [Commands Reference](#commands-reference)
- [Tips & Tricks](#tips--tricks)
- [Troubleshooting](#troubleshooting)
- [Examples](#examples)

## Getting Started

### Prerequisites
- Node.js ^20.17.0 or >=22.9.0
- npm (comes with Node.js)
- Administrator privileges or Developer Mode on Windows (for symlinks)

### Installation

1. **Navigate to JSF directory**
```bash
cd JSF
```

2. **Install dependencies**
```bash
npm install
```

3. **Link globally**
```bash
npm link
```

This makes the `jsf` command available globally in your terminal.

4. **Verify installation**
```bash
jsf --version
```
Should output: `0.0.1`

### First Time Setup

```bash
jsf setup
```

You'll be prompted for:
- NPM registry URL (defaults to `https://registry.npmjs.org/`)

The setup will:
- Create `~/.jsf/` directory structure
- Create default `config.json`
- Warn about Windows symlink permissions if applicable

## Basic Workflow

### Scenario 1: First Project

```bash
# Create project
mkdir my-app
cd my-app

# Create package.json
cat > package.json << 'EOF'
{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
EOF

# Install dependencies with JSF
jsf install
```

**What happens:**
- Express not in store → downloaded from npm
- Stored in `~/.jsf/store/express/4.21.2/`
- Symlink created in `node_modules/express`
- Project tracked in `~/.jsf/projects/`
- `jsf.lock` created

### Scenario 2: Second Project with Same Dependencies

```bash
# Create another project
mkdir my-app-2
cd my-app-2

# Same dependencies
cat > package.json << 'EOF'
{
  "name": "my-app-2",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.21.2"
  }
}
EOF

# Install with JSF
jsf install
```

**What happens:**
- Express found in store → reused (no download!)
- Symlink created instantly
- Output shows: `Reused: 1 from cache | Downloaded: 0`

This is the main benefit of JSF!

## Commands Reference

### `jsf setup`
Initialize JSF at system level.

```bash
jsf setup
```

**Creates:**
- `~/.jsf/`
- `~/.jsf/store/`
- `~/.jsf/projects/`
- `~/.jsf/registry-cache/`
- `~/.jsf/bin/`
- `~/.jsf/logs/`
- `~/.jsf/config.json`

### `jsf install`
Install dependencies from `package.json` using global store.

```bash
jsf install
```

**Behavior:**
- Reads `dependencies` and `devDependencies`
- Scans global store for cached packages
- Downloads only missing packages in parallel
- Creates symlinks in `node_modules/`
- Tracks project
- Generates `jsf.lock`

**Output example:**
```
📥 JSF Install - Using Global Store

Project: my-app
Dependencies: 2 prod, 1 dev

Scanning global store... ✓ Found 15 packages in store
Analyzing dependencies... ✓ Analysis complete

📋 Install Plan:
  ✓ express@4.21.2 [REUSE]
  + lodash@4.17.21 [DOWNLOAD]

Fetching 1 package(s) from registry... ✓ Fetched 1 package(s)
Linking packages to project... ✓ Linked 2 package(s)
Tracking project... ✓ Project tracked

✅ SUCCESS: Installed 2 packages in 1.23s
   Reused: 1 from cache | Downloaded: 1
```

### `jsf status`
Show dependency diff vs global store without installing.

```bash
jsf status
```

**Use case:** Check what will happen before running install.

**Output example:**
```
📊 JSF Status - Dependency Diff

Project: my-app

🆕 NEW (will be downloaded):
  + axios@^1.6.0

✅ UP-TO-DATE (in store):
  ✓ express@4.21.2
  ✓ lodash@4.17.21

Run "jsf install" to sync 1 package(s)
```

### `jsf projects`
List all tracked projects.

```bash
jsf projects
```

**Output example:**
```
📦 Tracked JSF Projects

• my-app
  Path: C:\projects\my-app
  ID: a3f9b2c1d4e5f6a7
  Last Install: 10/27/2026, 4:30:15 PM
  Dependencies: 3
  Packages: express@4.21.2, lodash@4.17.21, axios@1.6.0

• my-app-2
  Path: C:\projects\my-app-2
  ID: b4e8c3d2a1f9e7b6
  Last Install: 10/27/2026, 4:32:10 PM
  Dependencies: 2
  Packages: express@4.21.2, lodash@4.17.21

Total: 2 project(s)
```

### `jsf run <script>`
Run a package.json script via JSF.

```bash
jsf run dev
jsf run start
jsf run build
jsf run test
```

**Behavior:**
- Checks if script exists in package.json
- Optionally verifies symlinks
- Executes using `npm run <script>`
- Inherits stdio (see output in real-time)

### `jsf verify`
Verify linked node_modules and check for broken symlinks.

```bash
jsf verify
```

**Use case:** Debug issues after moving projects, git operations, or system changes.

**Output example (healthy):**
```
🔍 JSF Verify - Checking Linked Dependencies

Project: my-app

✅ All links are valid
All symlinks are valid and pointing to global store.
```

**Output example (broken):**
```
🔍 JSF Verify - Checking Linked Dependencies

Project: my-app

✗ 3 broken link(s) found

  • express: broken symlink
  • lodash: broken symlink
  • axios: broken symlink

Run "jsf install" or "jsf sync" to fix broken links.
```

## Tips & Tricks

### Save Bandwidth
Create multiple projects with similar dependencies - only download once!

### Check Before Installing
Use `jsf status` to see what will be downloaded before committing.

### Organize Projects
`jsf projects` gives you a quick overview of all JSF-managed projects.

### Debugging
If something seems off, run `jsf verify` to check symlink integrity.

### Custom Registry
Change registry during setup or edit `~/.jsf/config.json`:
```json
{
  "registry": "https://registry.npmmirror.com/"
}
```

### Concurrency Tuning
Adjust parallel downloads in `~/.jsf/config.json`:
```json
{
  "maxConcurrency": 16
}
```
Higher = faster but may hit rate limits. Default is 8.

## Troubleshooting

### Windows: Symlink Permission Errors

**Error:**
```
Error: Failed to link express@4.21.2: EPERM: operation not permitted, symlink
```

**Solutions:**

**Option 1: Enable Developer Mode (Recommended)**
1. Open Settings → Update & Security → For developers
2. Enable "Developer Mode"
3. Restart terminal
4. Try again

**Option 2: Run as Administrator**
1. Right-click terminal (PowerShell/CMD/Terminal)
2. Select "Run as Administrator"
3. Run `jsf install`

### Package Not Found

**Error:**
```
Error: Failed to fetch express@^4.21.2: 404 Not Found
```

**Solutions:**
1. Check package name spelling
2. Verify version/range exists on npm
3. Check registry configuration
4. Try different registry

### node_modules Already Exists

JSF will overwrite/create symlinks in `node_modules/`. If you have existing `node_modules/` from npm:
1. Remove it: `rm -rf node_modules` (or delete folder)
2. Run `jsf install`

Or just run `jsf install` - it will remove existing files/symlinks and recreate.

### Broken Links After Git Operations

If you clone a project or switch branches:
```bash
jsf verify
jsf install  # or jsf sync (when available)
```

### Command Not Found After npm link

**On Windows:**
Make sure npm global bin is in PATH. Check with:
```bash
npm config get prefix
```
Add `<prefix>` to your PATH.

**On Unix:**
Usually works automatically. If not, check shell profile.

### Slow First Install

First install for new packages downloads from registry - this is normal. Subsequent projects will be instant for those packages.

## Examples

### Example 1: Express + MongoDB App

**package.json:**
```json
{
  "name": "api-server",
  "version": "1.0.0",
  "scripts": {
    "dev": "nodemon app.js",
    "start": "node app.js"
  },
  "dependencies": {
    "express": "^4.21.2",
    "mongoose": "^8.0.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

```bash
jsf install
jsf run dev
```

### Example 2: React App

**package.json:**
```json
{
  "name": "react-app",
  "version": "0.1.0",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

```bash
jsf install
jsf run dev
```

### Example 3: Multiple Projects Sharing Deps

```bash
# Project 1
cd ~/projects/app1
echo '{"dependencies":{"lodash":"^4.17.21","axios":"^1.6.0"}}' > package.json
jsf install  # Downloads lodash, axios

# Project 2
cd ~/projects/app2
echo '{"dependencies":{"lodash":"^4.17.21","axios":"^1.6.0"}}' > package.json
jsf install  # Reuses both - instant!

# Project 3
cd ~/projects/app3
echo '{"dependencies":{"lodash":"^4.17.21","express":"^4.21.2"}}' > package.json
jsf install  # Reuses lodash, downloads express only
```

**Result:** Downloaded 3 unique packages total across 3 projects instead of 6.

## Best Practices

1. **Always use `jsf install`** in JSF-managed projects
2. **Run `jsf status` first** to preview changes
3. **Keep `package.json` as source of truth** - don't manually edit `node_modules`
4. **Commit `jsf.lock`** to version control (like package-lock.json)
5. **Use `jsf verify`** after cloning projects on new machines
6. **Run `jsf setup` once** per machine
7. **Don't delete `~/.jsf/`** unless you want to clear cache

## Limitations (v0.1)

- **Transitive dependencies**: Not fully resolved - only installs direct dependencies from package.json
- **Peer dependencies**: Not automatically handled
- **Workspaces/Monorepos**: Not supported
- **Native modules**: May need rebuilding per system
- **No garbage collection**: `jsf gc` not implemented yet
- **No lockfile sync from package-lock**: Only generates jsf.lock

These will be addressed in future versions. For now, focus on direct dependencies which covers most use cases.
