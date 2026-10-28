# JSF Architecture

## Overview

JSF is a Node.js CLI that reuses exact npm package files across projects while preserving npm’s resolved dependency placement. It uses npm’s package-lock resolver to produce a complete registry dependency tree, downloads unique uncached `name@version` packages concurrently, stores package contents under a machine-wide root, and creates a lock-specific tree using hard links to those contents. Each project’s direct dependency links target that shared tree.

The lock-specific tree is important: the same package version can appear at more than one location in an npm tree, and peer dependencies can differ by context. A single mutable `node_modules` directory inside each package-version cache would not represent those cases correctly.

## Data locations

Default package stores:

- Linux: `/var/lib/jsf/store`
- macOS: `/Library/Application Support/JSF/store`
- Windows: `%ProgramData%\\JSF\\store`

Per-user settings, registry selection, project records, and logs live under `~/.jsf/`. `JSF_HOME` overrides that user directory; `JSF_SHARED_HOME` changes the machine-wide root; `JSF_SHARED_STORE` directly overrides the package store. Shared path permissions must be administered deliberately. Use a trusted group or platform ACL for shared writes; never use world-writable permissions.

```text
shared store/
├── <package-name-or-scope+name>/<version>/   # canonical extracted package files
└── .instances/<lock-tree-id>/                # hard-linked layout from npm lock placement
    └── node_modules/
        ├── <direct-package>/                 # package files hard-linked to canonical store
        │   └── node_modules/<nested-package>/
        └── .bin/

user home ~/.jsf/
├── config.json
└── projects/<project-id>.json

project/
├── package.json
├── package-lock.json                         # optional, portable npm resolution input
├── jsf.lock                                  # exact tree and link targets
└── node_modules/<direct-package> -> shared store/.instances/<tree>/node_modules/...
```

## Resolution and install flow

1. Read `package.json` and any `npm-shrinkwrap.json` or `package-lock.json`.
2. Run `npm install --package-lock-only --ignore-scripts` in a temporary directory to resolve exact versions and npm’s nested/hoisted peer layout without installing into the project.
3. Compare every resolved package entry to the machine store and the project’s previous `jsf.lock`. Classify each as NEW, UPGRADE, DOWNGRADE, or cached/up-to-date. Cache availability is tracked separately from the classification.
4. Deduplicate fetch work by exact `name@version` and download missing packages with configured concurrency. Tarball integrity from the npm lock is passed to `pacote`; extracted package name/version are checked before atomic promotion, and the verified integrity is recorded beside the package. Package files are marked read-only before being shared.
5. Create a tree instance by hard-linking canonical files into npm’s lockfile locations. The instance is keyed by a hash of its resolved package paths and versions and is reused by projects with the same tree.
6. Link each direct dependency and `.bin` into the project, save exact resolved versions in `jsf.lock`, verify links, and update that user’s project tracker.

The installer does not execute package lifecycle scripts. Registry packages are supported, including npm aliases. Local, workspace, Git, and URL sources are rejected with a clear error rather than installed incompletely.

## Classification

- **NEW**: The exact target is not cached and the package is not replacing a prior resolved version. If a different, higher cached version exists, a lower target is labelled DOWNGRADE.
- **UPGRADE**: The target semver is greater than the prior project version, or, for a project without an installed baseline, greater than the highest cached version.
- **DOWNGRADE**: The target semver is lower than the prior project version, or, without a baseline, lower than the highest cached version.
- **CACHED / UP-TO-DATE**: The target is already present and unchanged from the project lock.

A target already in cache is reused regardless of whether it is labelled an upgrade or downgrade. Different project lock trees remain isolated even when they share the same canonical package files. The file owner can still change permissions, so shared-store writers are a trust boundary.

When `jsf setup` upgrades a version-1 per-user configuration, it copies cached package versions into the machine-wide store and switches that user’s config. Existing projects should run `jsf install` again to retarget their links.

## Verification

`jsf verify` reads `jsf.lock` and checks that every expected direct dependency link exists, is a symlink/junction, resolves inside the configured shared store, and matches its recorded target. It also checks `.bin` and rejects broken or out-of-store links it finds at the project root. Invalid state returns a non-zero process exit code.

## Testing

- `npm test` runs offline unit tests for classification, lock-path parsing, and shared-tree behavior.
- `npm run test:e2e` resolves and installs real React and React DOM packages, checks transitive and peer resolution, verifies cross-project cache reuse, tests upgrade/downgrade classification, runs imports, and checks wrong-target link detection. This test requires registry access.
- `npm pack --dry-run` is used to validate the npm allowlist without publishing.
