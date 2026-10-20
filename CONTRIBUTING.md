<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".branding/mark-on-dark-128.png">
  <source media="(prefers-color-scheme: light)" srcset=".branding/mark-on-light-128.png">
  <img alt="" src=".branding/mark-on-light-128.png" width="48">
</picture>

# Contributing

## Development

```
npm install
```

Press `F5` in VS Code to launch an Extension Development Host.

## Packaging

```
npm run package
```

Produces a `.vsix` file using [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce).

## Dependency and permission catalogs

The **New RuneScape Plugin Project** form offers dependencies and permissions (Not used /
Required / Optional) from two hand-maintained catalogs:

- [`dependencies.jsonc`](dependencies.jsonc) — add an entry (name, published ID, and
  optional `docs`/`modio` links) to offer it in the Dependencies section.
- [`permissions.jsonc`](permissions.jsonc) — add an entry (name, description, and an
  optional `docs` link) to offer it in the Permissions section. See
  [the official permission list](https://developer.runescape.com/rs/core/plugin.html#pluginpermissions)
  for what Jagex currently supports.

## Releasing

Merging a change to [`dependencies.jsonc`](dependencies.jsonc) or
[`permissions.jsonc`](permissions.jsonc) into `main`/`master` runs
[`.github/workflows/release.yml`](.github/workflows/release.yml), which:

1. Dumps both `.jsonc` catalogs to comment-free `.json` siblings and commits them back.
2. Bumps the patch version in `package.json`.
3. Tags the commit (`vX.Y.Z`), creates a GitHub release, and attaches `dependencies.json`,
   `permissions.json`, and the packaged `.vsix`.
4. Publishes the new version to the VS Code Marketplace, if a `VSCE_PAT` repository
   secret (a Marketplace personal access token) is configured — otherwise this step is
   skipped and steps 1-3 still run.

## Syncing the dependency catalog from mod.io

[`.github/workflows/vendors-sync.yml`](.github/workflows/vendors-sync.yml) runs weekly
(and on demand) to look for mods tagged "library" in the RuneScape game on mod.io, via
[`scripts/sync-vendors.js`](scripts/sync-vendors.js). Anything not already in
`dependencies.jsonc` gets added and opened as a pull request — it never commits
directly, and never changes or removes entries that are already there, so hand edits
(like a curated `description`) are safe. Merging that PR triggers the release workflow
above, since it touches `dependencies.jsonc`.

Needs a `MODIO_API_KEY` repository secret (a mod.io API key) — without it the workflow
fails loudly rather than silently skipping, so you'll notice it's missing.
