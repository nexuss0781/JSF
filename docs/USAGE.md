# JSF Usage Guide

## Requirements

- Node.js `^20.17.0` or `>=22.9.0`
- npm available on `PATH`
- Access to the npm registry (unless every needed package version is already cached)
- An administrator to initialize the default machine-wide store; trusted group/ACL write access for users who will add packages to it

## Install and setup

```sh
npm install --global jsf-cli
jsf --version
sudo jsf setup                # Linux/macOS; elevated PowerShell on Windows
```

Default shared package store paths are `/var/lib/jsf/store`, `/Library/Application Support/JSF/store`, and `%ProgramData%\\JSF\\store`. User-specific registry settings and project tracking stay under `~/.jsf/`. Do not make the shared store world-writable. For shared writes, configure a trusted group on Unix-like systems or a platform ACL on Windows.

When upgrading from the old per-user store, setup migrates cached package versions into the shared store. Run `jsf install` in existing projects afterward to replace links to the old location. Canonical package files are marked read-only to limit accidental cache changes; anyone with shared-store write access remains trusted.

Path overrides:

- `JSF_HOME`: per-user settings directory
- `JSF_SHARED_HOME`: machine-wide JSF root
- `JSF_SHARED_STORE`: exact package store path

All users who should share the same package cache must use the same shared store path.

## Install dependencies

In a project containing `package.json`, run:

```sh
jsf status
jsf install
```

JSF invokes npm’s lockfile resolver in a temporary directory, honoring `package-lock.json` or `npm-shrinkwrap.json` when present. It resolves exact transitive and peer dependency versions and their npm installation locations. It then downloads unique missing `name@version` packages in parallel, hard-links package files into a shared lock-specific tree, links direct dependencies into the project, writes `jsf.lock`, and records the resolved versions.

A JSF lock tree is reused when another project resolves the same package layout. Different peer contexts get separate tree layouts while reusing canonical package files. A cached exact version is reused even when the plan classifies it as an upgrade or downgrade.

### Example

```json
{
  "name": "react-app",
  "version": "1.0.0",
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1"
  }
}
```

`react-dom`’s peer requirement for `react` and its transitive dependencies are resolved through npm. After `jsf install`, use Node normally or run a project script through:

```sh
jsf run test
jsf run build
```

## Commands

### `jsf setup`

Initializes the configured machine-wide store and the current user’s settings. The first setup may require administrator privileges. Multi-user write permissions should be limited to a trusted group or ACL.

### `jsf status`

Resolves the current graph and compares each exact package version with the project lock and shared store. It reports NEW, UPGRADE, DOWNGRADE, or CACHED/UP-TO-DATE. If the project lock is incomplete or its manifest changed, the command may contact the registry.

### `jsf install`

Applies the resolved graph. Missing exact package versions are fetched concurrently (default 8); matching cached versions are reused. Registry integrity values from the npm lock are checked during fetch. JSF writes the exact tree and store targets to `jsf.lock` after linking.

### `jsf projects`

Lists projects tracked by the current OS user, including declared ranges and exact direct/transitive resolved versions.

### `jsf verify`

Checks for expected dependency links that are missing, broken, point outside the shared store, or disagree with `jsf.lock`. It exits non-zero if a problem is found.

## npm lockfiles and version classification

Commit `package.json` and a portable `package-lock.json` as the project’s primary dependency manifest. JSF reads either `package-lock.json` or `npm-shrinkwrap.json` and writes its own `jsf.lock` with exact paths and resolved versions. `jsf.lock` contains machine-specific shared-store paths, so it does not replace the portable npm lockfile.

For an existing JSF project, upgrade/downgrade is measured against its last `jsf.lock` version. For a project without a JSF lock, JSF compares the target with the highest cached version of the same package name. Cache presence is reported separately: an upgrade/downgrade target already cached is not downloaded again.

## Limitations

- Supports npm registry packages, semver ranges/tags, and npm aliases. `file:`, `workspace:`, Git, and direct URL dependencies are rejected.
- Package lifecycle scripts are not run. Packages that require `install` or `postinstall` work (including some native modules) may not function; JSF does not run potentially unsafe scripts in the shared store.
- Workspace/monorepo projects are not supported.
- Shared-store writes require administrator-managed permissions. Do not grant write access to untrusted users.
- Garbage collection and removal of unused cached versions are not implemented.

## Development checks

```sh
npm ci
npm test
npm run test:e2e
npm pack --dry-run
```

`npm run test:e2e` uses the public npm registry. `npm pack --dry-run` inspects the package contents but does not publish.
