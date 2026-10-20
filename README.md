<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".branding/lockup-horizontal-on-dark.png">
  <source media="(prefers-color-scheme: light)" srcset=".branding/lockup-horizontal-on-light.png">
  <img alt="RuneScape Plugin Kit" src=".branding/lockup-horizontal-on-light.png" width="600">
</picture>

Scaffold, deploy, and package sandboxed Lua RuneScape plugins — without leaving VS Code.

## Features

- **New RuneScape Plugin Project** — fill in a simple form (name, version, contact email,
  permissions, dependencies) and get a ready-to-run `plugin.json` + `main.lua`. No build
  step — Lua plugins run as-is.
- **Deploy to dev_plugins** — copies your plugin into the RuneScape client's `dev_plugins`
  folder so you can test it in-game. *(Windows only)*
- **Package for mod.io** — zips your plugin up, ready to upload to
  [mod.io/g/runescape](https://mod.io/g/runescape). *(Windows only)*
- **RuneScape Plugin Icons** — an optional file icon theme with icons for `plugin.json`,
  `.lua` files, and other common file types. Off by default; run **RuneScape: Manage
  Icons...** from the Command Palette to enable/disable it and add your own icons for
  any file extension, file name, or language.

## Getting started

1. Open the Command Palette (`Ctrl+Shift+P`) and run **New RuneScape Plugin Project**.
2. Fill in the form — this creates your project folder with `plugin.json` and `main.lua`.
3. Write your plugin, then run **Deploy to dev_plugins**.
4. In the game console, run `plugins_refresh` then `plugins_reload <slug>` to test it.
5. Happy with it? Run **Package for mod.io** and upload the zip.

Plugins follow the official
[RuneScape Client API plugin structure](https://developer.runescape.com/rs/structure.html):
a `plugin.json` manifest plus a `main.lua` entry point.

> New projects also get a `.luarc.json` pointing at a sibling
> [`runescape-api-stubs`](https://github.com/FriendlyDevelopment/runescape-api-stubs)
> checkout, for Lua Language Server intellisense against the real API.

## Settings

- `runescape.devClient` — which client's `dev_plugins` folder (under `%ProgramData%\Jagex`)
  to deploy to: `RuneScape-BETA` (default) or `RuneScape`.

## Contributing

Want to add a dependency to the catalog, or work on the extension itself? See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
