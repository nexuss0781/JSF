# JSF (JavaScript Shared Framework)

**Install once. Share everywhere.**

JSF is a system-level shared JavaScript dependency manager that eliminates redundant downloads. All packages are stored in a single global location (`~/.jsf/store/`) and symlinked to projects as needed. 

## The Problem

- Node.js projects are getting bigger with dependencies
- Installing dependencies downloads 2GB+ of packages repeatedly
- Every new project requires downloading the same packages again
- Wastes bandwidth and time

## The Solution

JSF solves this by:
- **System-level storage**: All packages installed once to `~/.jsf/store/`
- **Smart diffing**: Only download what's missing when installing in new projects
- **Instant reuse**: Projects share the same package files via symlinks
- **Familiar workflow**: Still uses `package.json` just like npm/yarn/pnpm

## Installation

```bash
# Navigate to JSF directory
cd JSF

# Install dependencies
npm install

# Link globally
npm link
```

## Usage

### 1. Setup JSF (First Time)
```bash
jsf setup
```
This creates the `~/.jsf/` directory structure and configures your registry.

### 2. Install Dependencies in a Project
```bash
# In your project directory with package.json
jsf install
```
JSF will:
1. Read your `package.json`
2. Check what's in the global store
3. Only download missing packages
4. Symlink all dependencies to `node_modules/`
5. Track your project

### 3. Check Status Before Installing
```bash
jsf status
```
Shows what's NEW, UPGRADE, DOWNGRADE, or UP-TO-DATE.

### 4. List All Tracked Projects
```bash
jsf projects
```
Shows all projects using JSF with their dependencies and versions.

### 5. Run Scripts
```bash
jsf run dev
jsf run start
jsf run build
```

### 6. Verify Links
```bash
jsf verify
```
Checks for broken symlinks in `node_modules/`.

## How It Works

```
~/.jsf/
├── config.json        # System configuration
├── store/             # Global package store (all packages live here)
│   ├── express/
│   │   └── 4.21.2/
│   └── lodash/
│       └── 4.17.21/
├── projects/          # Per-project metadata
├── registry-cache/    # Download cache
└── logs/              # Install logs
```

When you run `jsf install`:
1. **Scan** - Check global store for existing packages
2. **Diff** - Determine what needs to be downloaded
3. **Fetch** - Download only missing packages in parallel
4. **Extract** - Unpack to global store atomically
5. **Link** - Create symlinks from project `node_modules/` to store
6. **Track** - Save project metadata

When you install the same packages in another project, they are **reused instantly** with no downloads!

## Test It

```bash
# Setup
jsf setup

# Create first project
mkdir test-app && cd test-app
echo '{"name":"test-app","dependencies":{"express":"^4.21.2","lodash":"^4.17.21"}}' > package.json

# First install - downloads everything
jsf install

# Create second project with same deps
mkdir ../test-app-2 && cd ../test-app-2
echo '{"name":"test-app-2","dependencies":{"express":"^4.21.2","lodash":"^4.17.21"}}' > package.json

# Second install - should reuse from cache!
jsf install
# Expected: "Reused 2 from cache. Downloaded 0."
```

## Commands

| Command | Description |
| --- | --- |
| `jsf setup` | Initialize JSF at system level |
| `jsf install` | Install deps from package.json using global store |
| `jsf status` | Show diff vs global store |
| `jsf projects` | List all tracked projects |
| `jsf run <script>` | Run a package.json script via JSF |
| `jsf verify` | Verify linked node_modules |

## Windows Notes

On Windows, creating symlinks may require:
- **Developer Mode** enabled (Settings > Update & Security > For developers), or
- **Administrator privileges** for your terminal

If you encounter symlink errors, run `jsf setup` again or check permissions.

## Tech Stack

- [commander](https://github.com/tj/commander.js) - CLI parsing
- [pacote](https://github.com/npm/pacote) - npm registry fetching
- [tar](https://github.com/isaacs/node-tar) - Tarball extraction
- [p-map](https://github.com/sindresorhus/p-map) - Parallel processing
- [fs-extra](https://github.com/jprichardson/node-fs-extra) - File system utilities
- [semver](https://github.com/npm/node-semver) - Version handling

## License

MIT

---

**JSF - Install once. Share everywhere.**
