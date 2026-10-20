// Scrapes the PluginPermissions table from Jagex's own docs and appends any permission
// not already present in permissions.jsonc. Existing entries (and any hand-written edits
// to them, e.g. a curated description) are never changed or removed.
//
// Run by .github/workflows/permissions-sync.yml. No API key needed - it's a public page.

const fs = require('fs');
const path = require('path');

const DOCS_URL = 'https://developer.runescape.com/rs/core/plugin.html';
const DOCS_ANCHOR = `${DOCS_URL}#pluginpermissions`;
const JSONC_PATH = path.join(__dirname, '..', 'permissions.jsonc');
const SUMMARY_PATH = path.join(__dirname, 'permissions-sync-summary.txt');

const HEADER_LINES = [
  '{',
  '    // Known plugin permissions, offered as toggles ("New RuneScape Plugin Project" >',
  '    // Permissions) instead of typing them by hand. New entries are synced from',
  `    // ${DOCS_ANCHOR} by scripts/sync-permissions.js (see`,
  '    // .github/workflows/permissions-sync.yml) via a pull request; existing entries',
  '    // are never changed or removed by the sync, so hand edits are safe.',
  '    //',
  '    // key          = permission name used in plugin.json',
  '    // description  = short blurb shown as a tooltip in the form',
  '    // docs         = optional link shown next to the entry in the form'
];

function stripJsonComments(raw) {
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePermissionsTable(html) {
  const sectionStart = html.indexOf('id="pluginpermissions"');
  if (sectionStart === -1) throw new Error('Could not find the PluginPermissions section in the docs page');
  const tableStart = html.indexOf('<table>', sectionStart);
  const tableEnd = html.indexOf('</table>', tableStart);
  if (tableStart === -1 || tableEnd === -1) throw new Error('Could not find the PluginPermissions table in the docs page');
  const table = html.slice(tableStart, tableEnd);

  const permissions = [];
  const rowPattern = /<tr>\s*<td>(.*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;
  let match;
  while ((match = rowPattern.exec(table))) {
    const key = stripHtml(match[1]);
    const description = stripHtml(match[2]);
    if (key) permissions.push({ key, description });
  }
  return permissions;
}

function render(entries) {
  const body = JSON.stringify(entries, null, 4);
  const innerLines = body.split('\n').slice(1, -1);
  return [...HEADER_LINES, ...innerLines, '}', ''].join('\n');
}

async function main() {
  const res = await fetch(DOCS_URL);
  if (!res.ok) throw new Error(`Fetching ${DOCS_URL} failed: ${res.status}`);
  const html = await res.text();
  const permissions = parsePermissionsTable(html);

  const existing = JSON.parse(stripJsonComments(fs.readFileSync(JSONC_PATH, 'utf8')));

  const added = [];
  for (const { key, description } of permissions) {
    if (existing[key]) continue;
    existing[key] = { description, docs: DOCS_ANCHOR };
    added.push(key);
  }

  if (added.length === 0) {
    console.log('No new permissions found.');
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
