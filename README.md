# JSF CLI

**Share npm package files across projects. Keep each project’s dependency tree correct.**

JSF resolves `package.json` dependencies through npm’s lockfile resolver, stores each exact package version in a machine-wide cache, and builds a lock-specific hard-linked install tree. A project’s direct `node_modules` entries link into that tree, so transitive and peer dependencies resolve in the same layout npm selected. Reusing a cached package version avoids downloading its tarball again.

Canonical package files are marked read-only to prevent accidental changes through a project link. Anyone authorized to write to the shared store must still be trusted; do not grant access to untrusted users.

## Requirements and supported inputs

- Node.js `^20.17.0` or `>=22.9.0`, plus npm.
- npm registry dependencies with semver ranges, tags, and npm aliases are supported. Existing `package-lock.json` or `npm-shrinkwrap.json` is used as a resolution input.
- `file:`, `workspace:`, Git, and direct URL dependencies are not supported yet; JSF reports these instead of partially installing them.
- JSF does not execute package lifecycle scripts. Packages that require `preinstall`, `install`, or `postinstall` work may need a different installer or a future JSF build step.

## Install

```sh
npm install --global jsmf-cli
jsf --version
```

Initialize the shared store once per machine. The default store is `/var/lib/jsf/store` on Linux, `/Library/Application Support/JSF/store` on macOS, or `%ProgramData%\\JSF\\store` on Windows. An administrator may need to run setup from an elevated shell:

```sh
sudo jsf setup
```

On Windows, use an elevated PowerShell prompt. The shared store should be readable by intended users. For multi-user writes, configure access through a trusted group or platform ACL; do **not** make the store world-writable. User registry settings and project tracking remain in that user’s `~/.jsf/` directory.

When upgrading from an older JSF setup, `jsf setup` migrates cached package versions from the prior per-user store. Run `jsf install` in each existing project afterward so its links target the machine-wide store.

You can override paths with `JSF_HOME` (per-user settings), `JSF_SHARED_HOME` (machine-wide JSF root), or `JSF_SHARED_STORE` (package store). All users who should share packages must point at the same shared store and have appropriate permissions.

## Use in a project

```sh
cd /path/to/project
jsf status
jsf install
jsf verify
jsf projects
jsf run test
```

`jsf install` resolves exact package versions, fetches only uncached package versions in parallel (default concurrency 8), creates/reuses a shared install tree, links the project, writes `jsf.lock`, and records resolved versions. `jsf status` runs npm’s lockfile resolver and compares the target graph with the project’s previous lock and the shared cache; it can contact the registry if the project lock is incomplete or the manifest changed.

Keep `package.json` and preferably `package-lock.json` in version control. `jsf.lock` records the exact resolved tree and shared-store links for JSF verification; it is machine-path-specific and should not replace the portable npm lockfile.

## Commands

| Command | Description |
| --- | --- |
| `jsf setup` | Initialize the shared store and per-user settings |
| `jsf install` | Resolve, fetch, and link the dependency tree |
| `jsf status` | Show exact versions and NEW / UPGRADE / DOWNGRADE changes |
| `jsf projects` | List tracked projects with resolved direct and transitive versions |
| `jsf run <script>` | Run a `package.json` script through npm |
| `jsf verify` | Check for missing, broken, or out-of-store project links |

## Development and release checks

```sh
npm ci
npm test
npm run test:e2e
npm pack --dry-run
```

The end-to-end test uses the npm registry and should be run on the supported operating systems before release. Publishing is intentionally not part of these local checks.

## License

MIT. See [LICENSE](LICENSE).
