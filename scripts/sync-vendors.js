// Looks for mods tagged "library" in the RuneScape game on mod.io and appends any not
// already present in dependencies.jsonc. Existing entries (and any hand-written edits
// to them, e.g. a curated description) are never changed or removed.
//
// Run by .github/workflows/vendors-sync.yml. Requires MODIO_API_KEY in the environment.

const fs = require('fs');
const path = require('path');

const API = 'https://api.mod.io/v1';
const JSONC_PATH = path.join(__dirname, '..', 'dependencies.jsonc');
const SUMMARY_PATH = path.join(__dirname, 'sync-summary.txt');

const HEADER_LINES = [
  '{',
  '    // Known plugins that other plugins can declare as a dependency, offered',
  '    // as toggles ("New RuneScape Plugin Project" > Dependencies) instead of',
  '    // typing them by hand. New entries are synced from mods tagged "library" in',
  '    // the RuneScape game on mod.io by scripts/sync-vendors.js (see',
  '    // .github/workflows/vendors-sync.yml) via a pull request; existing entries',
  '    // are never changed or removed by the sync, so hand edits are safe.',
  '    //',
  '    // key          = name used in plugin.json / require() for this dependency',
  "    // id           = the dependency plugin's published ID",
  '    // description  = short blurb shown as a tooltip in the form',
  '    // docs, modio  = optional links shown next to the entry in the form'
];

function stripJsonComments(raw) {
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
}

async function modioGet(apiKey, pathname, params) {
  const url = new URL(API + pathname);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mod.io ${pathname} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function findRuneScapeGameId(apiKey) {
  const result = await modioGet(apiKey, '/games', { name_id: 'runescape' });
  const game = result.data && result.data[0];
  if (!game) throw new Error('Could not find the RuneScape game on mod.io (name_id=runescape)');
  return game.id;
}

async function fetchAllMods(apiKey, gameId) {
  const mods = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const page = await modioGet(apiKey, `/games/${gameId}/mods`, { _limit: limit, _offset: offset });
    mods.push(...page.data);
    if (page.data.length < limit) break;
  }
  return mods;
}

function isLibrary(mod) {
  return (mod.tags || []).some((tag) => (tag.name || '').trim().toLowerCase() === 'library');
}

function slugKey(mod) {
  return (mod.name_id || mod.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function render(entries) {
  const body = JSON.stringify(entries, null, 4);
  const innerLines = body.split('\n').slice(1, -1);
  return [...HEADER_LINES, ...innerLines, '}', ''].join('\n');
}

async function main() {
  const apiKey = process.env.MODIO_API_KEY;
  if (!apiKey) {
    console.error('MODIO_API_KEY is not set');
    process.exit(1);
  }

  const existing = JSON.parse(stripJsonComments(fs.readFileSync(JSONC_PATH, 'utf8')));
  const existingIds = new Set(Object.values(existing).map((entry) => entry.id));

  const gameId = await findRuneScapeGameId(apiKey);
  const mods = await fetchAllMods(apiKey, gameId);
  const libraries = mods.filter(isLibrary);

  const added = [];
  for (const mod of libraries) {
    if (existingIds.has(mod.id)) continue;
    let key = slugKey(mod) || 'library';
    if (existing[key]) key = `${key}-${mod.id}`;

    const entry = { id: mod.id, description: mod.summary || '', modio: mod.profile_url };
    if (mod.homepage_url) entry.docs = mod.homepage_url;

    existing[key] = entry;
    added.push(`${key} (${mod.profile_url})`);
  }

  if (added.length === 0) {
    console.log('No new library plugins found.');
    fs.writeFileSync(SUMMARY_PATH, '');
    return;
  }

  fs.writeFileSync(JSONC_PATH, render(existing));
  fs.writeFileSync(SUMMARY_PATH, added.join('\n') + '\n');
  console.log(`Added: ${added.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
