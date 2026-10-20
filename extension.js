const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function loadJsoncCatalog(context, fileName) {
  const raw = fs.readFileSync(path.join(context.extensionPath, fileName), 'utf8');
  const withoutComments = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '');
  return JSON.parse(withoutComments);
}

const LUARC = {
  '$schema': 'https://raw.githubusercontent.com/LuaLS/vscode-lua/master/setting/schema.json',
  'workspace.library': ['../runescape-api-stubs/types.lua', '../runescape-api-stubs/generated/'],
  'workspace.checkThirdParty': false
};

function formHtml(nonce, defaultLocation, dependencyCatalog, permissionCatalog, iconUri, cspSource) {
  const row = (label, control, tip) => `<div class="row" title="${escapeHtml(tip || '')}"><label>${escapeHtml(label)}</label>${control}</div>`;
  const catalogLevels = (prefix, key) => `
    <select name="${prefix}:${escapeHtml(key)}" data-key="${prefix}:${escapeHtml(key)}">
      <option value="none">Not used</option>
      <option value="required">Required</option>
      <option value="optional">Optional</option>
    </select>`;
  const catalogLinks = (entry) => [
    entry.docs ? `<a href="${escapeHtml(entry.docs)}">Docs</a>` : '',
    entry.modio ? `<a href="${escapeHtml(entry.modio)}">mod.io</a>` : ''
  ].filter(Boolean).join(' · ');
  const catalogRows = (prefix, catalog) => Object.entries(catalog).map(([key, entry]) => {
    const tip = [entry.description, entry.id ? `Published ID ${entry.id}` : ''].filter(Boolean).join(' — ');
    return row(key + ':', catalogLevels(prefix, key) + (catalogLinks(entry) ? `<span class="depLinks">${catalogLinks(entry)}</span>` : ''), tip);
  }).join('');
  const permissionRows = catalogRows('perm', permissionCatalog);
  const dependencyRows = catalogRows('dep', dependencyCatalog);
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${cspSource}; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px 24px; max-width: 640px; }
  h2 { margin-top: 0; display: flex; align-items: center; gap: 10px; }
  h2 img { width: 28px; height: 28px; border-radius: 6px; }
  .row { display: flex; align-items: center; gap: 12px; margin: 8px 0; }
  .row > label { width: 150px; flex: none; }
  .row > input[type=text], .row > select, .location { flex: 1; }
  .row > select + .depLinks { flex: none; }
  input[type=text], select { box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, #555); padding: 4px 6px; border-radius: 2px; }
  select { flex: none !important; min-width: 130px; }
  .depLinks { font-size: 0.9em; }
  .depLinks a { color: var(--vscode-textLink-foreground); margin-left: 4px; }
  .location { display: flex; gap: 6px; }
  .location input { flex: 1; }
  .row.top { align-items: flex-start; }
  .urls { flex: 1; }
  .urlRow { display: flex; gap: 6px; margin-bottom: 6px; }
  .urlRow input:first-child { width: 90px; flex: none; }
  .urlRow input:nth-child(2) { flex: 1; }
  .hint { margin: -4px 0 8px 162px; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .section { margin: 16px 0 0; padding-top: 10px; border-top: 1px solid var(--vscode-panel-border, #444); }
  .section > .title { font-weight: 600; margin-bottom: 4px; }
  .checkRow { display: flex; align-items: flex-start; gap: 10px; margin: 10px 0; cursor: pointer; }
  .checkRow input[type=checkbox] { flex: none; margin-top: 3px; width: 14px; height: 14px; }
  .checkRow .checkText { line-height: 1.4; }
  .checkRow .checkHint { display: block; color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  button { padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; cursor: pointer; border-radius: 2px; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #create { margin-top: 20px; }
  #error { color: var(--vscode-errorForeground); margin-top: 8px; white-space: pre-wrap; }
</style></head>
<body>
<h2><img src="${iconUri}" alt="">New RuneScape Plugin</h2>
<form id="form">
  ${row('Name:', '<input type="text" name="name" value="My Plugin" required>')}
  ${row('Location:', `<div class="location"><input type="text" name="location" value="${escapeHtml(defaultLocation)}"><button type="button" id="browse" class="secondary">Browse...</button></div>`)}
  <div class="hint" id="path"></div>
  ${row('Version:', '<input type="text" name="version" value="1.0">')}
  ${row('Contact email:', '<input type="text" name="contactEmailAddress" placeholder="you@example.com" required>', 'Required by Jagex for every published plugin')}

  <div class="section"><div class="title">Permissions</div>${permissionRows}</div>

  <div class="section"><div class="title">Dependencies</div>${dependencyRows}</div>

  <div class="section" id="urlsSection"><div class="title">URLs</div>
    <div class="row top" title="Hosts the plugin may call with httpAccess, as key and URL"><label>Base URLs:</label>
      <div class="urls"><div id="urlRows"></div><button type="button" id="addUrl" class="secondary">Add URL</button></div>
    </div>
  </div>

  <div class="section">
    <label class="checkRow">
      <input type="checkbox" name="includeExample" checked>
      <span class="checkText">Include example code<span class="checkHint">Adds main.lua + helper.lua using require()</span></span>
    </label>
    <label class="checkRow" title="Assumes runescape-api-stubs is cloned as a sibling folder to this project">
      <input type="checkbox" name="useStubs" checked>
      <span class="checkText">Generate .luarc.json<span class="checkHint">For runescape-api-stubs intellisense</span></span>
    </label>
  </div>

  <button type="submit" id="create">Create</button>
  <div id="error"></div>
</form>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('form');
  const urlRows = document.getElementById('urlRows');
  const addUrl = document.getElementById('addUrl');
  const addUrlRow = (key, value) => {
    const line = document.createElement('div');
    line.className = 'urlRow';
    for (const [placeholder, text] of [['key', key], ['https://...', value]]) {
      const input = document.createElement('input');
      input.type = 'text'; input.placeholder = placeholder; input.value = text;
      line.appendChild(input);
    }
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'secondary'; remove.textContent = 'Remove';
    remove.addEventListener('click', () => line.remove());
    line.appendChild(remove);
    urlRows.appendChild(line);
  };
  addUrl.addEventListener('click', () => addUrlRow(urlRows.children.length === 0 ? 'jagex' : '', 'https://'));
  const collectUrls = () => {
    const result = {};
    for (const line of urlRows.children) {
      const [k, v] = line.querySelectorAll('input');
      if (k.value.trim() && v.value.trim()) result[k.value.trim()] = v.value.trim();
    }
    return result;
  };
  const pathHint = document.getElementById('path');
  const updatePath = () => {
    const bs = String.fromCharCode(92);
    const loc = form.elements['location'].value;
    const sep = loc.includes(bs) ? bs : '/';
    pathHint.textContent = 'Project will be created in: ' + loc.replace(/[\\\\/]+$/, '') + sep + form.elements['name'].value;
  };
  form.elements['name'].addEventListener('input', updatePath);
  form.elements['location'].addEventListener('input', updatePath);
  updatePath();
  const httpAccess = form.elements['perm:httpAccess'];
  const urlsSection = document.getElementById('urlsSection');
  if (httpAccess && urlsSection) {
    const updateUrlsVisibility = () => { urlsSection.style.display = httpAccess.value === 'none' ? 'none' : ''; };
    httpAccess.addEventListener('change', updateUrlsVisibility);
    updateUrlsVisibility();
  }
  const includeExample = form.elements['includeExample'];
  const chatAccess = form.elements['perm:chatAccess'];
  if (includeExample && chatAccess) {
    const updateChatAccessDefault = () => { if (includeExample.checked) chatAccess.value = 'required'; };
    includeExample.addEventListener('change', updateChatAccessDefault);
    updateChatAccessDefault();
  }
  document.getElementById('browse').addEventListener('click', () => vscode.postMessage({ browse: true }));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const pick = (prefix, level) => [...data.entries()]
      .filter(([k, v]) => k.startsWith(prefix) && v === level)
      .map(([k]) => k.slice(prefix.length));
    vscode.postMessage({
      name: data.get('name').trim(),
      location: data.get('location').trim(),
      version: data.get('version').trim(),
      contactEmailAddress: data.get('contactEmailAddress').trim(),
      requiredPermissions: pick('perm:', 'required'),
      optionalPermissions: pick('perm:', 'optional'),
      requiredDependencies: pick('dep:', 'required'),
      optionalDependencies: pick('dep:', 'optional'),
      urls: collectUrls(),
      includeExample: data.has('includeExample'),
      useStubs: data.has('useStubs')
    });
  });
  window.addEventListener('message', (event) => {
    if (event.data.location) {
      form.elements['location'].value = event.data.location;
      updatePath();
    }
    document.getElementById('error').textContent = event.data.error || '';
  });
</script>
</body></html>`;
}

function exampleFiles(name) {
  return {
    'main.lua': `-- ${name} entry point, loaded when the plugin is enabled.\n\nlocal helper = require("helper")\n\n-- Fires once on load and again on every game state change (e.g. world hop).\nEvent.GameStateChanged.Subscribe("${name}", helper.onGameStateChanged)\n`,
    'helper.lua': `-- Requires the chatAccess permission (Permissions section above).\nlocal helper = {}\n\nfunction helper.onGameStateChanged(event)\n    if event.newState == GameState.GAME then\n        Chat.AddMessage("${name} says hello!")\n    end\nend\n\nreturn helper\n`
  };
}

function blankFiles(name) {
  return {
    'main.lua': `-- ${name} entry point, loaded when the plugin is enabled.\n`
  };
}

async function newProject(context) {
  const dependencyCatalog = loadJsoncCatalog(context, 'dependencies.jsonc');
  const permissionCatalog = loadJsoncCatalog(context, 'permissions.jsonc');
  const panel = vscode.window.createWebviewPanel('runescapeNewProject', 'New RuneScape Plugin', vscode.ViewColumn.Active, { enableScripts: true });
  const nonce = require('crypto').randomBytes(16).toString('hex');
  const iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');
  panel.iconPath = iconPath;
  const iconUri = panel.webview.asWebviewUri(iconPath);
  panel.webview.html = formHtml(nonce, path.join(os.homedir(), 'RuneScapePlugins'), dependencyCatalog, permissionCatalog, iconUri, panel.webview.cspSource);

  panel.webview.onDidReceiveMessage(async (form) => {
    if (form.browse) {
      const folders = await vscode.window.showOpenDialog({
        canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Select location'
      });
      if (folders && folders.length > 0) panel.webview.postMessage({ location: folders[0].fsPath });
      return;
    }

    if (!form.location) {
      panel.webview.postMessage({ error: 'Choose a location for the project.' });
      return;
    }
    if (!form.name) {
      panel.webview.postMessage({ error: 'Enter a plugin name.' });
      return;
    }
    if (!form.contactEmailAddress) {
      panel.webview.postMessage({ error: 'Enter a contact email address.' });
      return;
    }

    const folderName = slugify(form.name) || 'my-plugin';
    const projectDir = path.join(form.location, folderName);
    if (fs.existsSync(projectDir)) {
      panel.webview.postMessage({ error: `${projectDir} already exists.` });
      return;
    }

    const dependenciesByKey = (keys) => Object.fromEntries(keys.map((key) => [key, dependencyCatalog[key].id]));

    const manifest = {
      name: form.name,
      version: form.version || '1.0',
      contactEmailAddress: form.contactEmailAddress,
      requiredDependencies: dependenciesByKey(form.requiredDependencies || []),
      optionalDependencies: dependenciesByKey(form.optionalDependencies || []),
      requiredPermissions: form.requiredPermissions || [],
      optionalPermissions: form.optionalPermissions || [],
      urls: form.urls || {}
    };

    try {
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'plugin.json'), JSON.stringify(manifest, null, 4) + '\n');
      const files = form.includeExample ? exampleFiles(form.name) : blankFiles(form.name);
      for (const [fileName, contents] of Object.entries(files)) {
        fs.writeFileSync(path.join(projectDir, fileName), contents);
      }
      if (form.useStubs) {
        fs.writeFileSync(path.join(projectDir, '.luarc.json'), JSON.stringify(LUARC, null, 4) + '\n');
      }
      fs.mkdirSync(path.join(projectDir, '.vscode'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, '.vscode', 'extensions.json'), JSON.stringify({ recommendations: ['sumneko.lua'] }, null, 4) + '\n');
    } catch (e) {
      panel.webview.postMessage({ error: e.message });
      vscode.window.showErrorMessage(e.message);
      return;
    }

    panel.dispose();
    const consoleCommands = `plugins_refresh\nplugins_reload ${folderName}`;
    const buttons = ['Copy commands'];
    if (!vscode.extensions.getExtension('sumneko.lua')) buttons.push('Install Lua extension');
    const message = [
      `Created ${form.name}. Next steps, from the Command Palette:`,
      `• "Deploy to dev_plugins" - test it in-game`,
      `• "Package for mod.io" - build a release zip`,
      `Once deployed, in the game console: plugins_refresh, then plugins_reload ${folderName}`
    ].join('\n');
    const choice = await vscode.window.showInformationMessage(message, ...buttons);
    if (choice === 'Install Lua extension') await vscode.commands.executeCommand('workbench.extensions.installExtension', 'sumneko.lua');
    if (choice === 'Copy commands') vscode.env.clipboard.writeText(consoleCommands);
    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectDir));
  }, undefined, context.subscriptions);
}

const ICON_THEME_MATCH_TYPES = [
  { label: 'File extension', description: 'e.g. lua, json (matches any file ending in it)', value: 'fileExtensions' },
  { label: 'Exact file name', description: 'e.g. plugin.json, README.md', value: 'fileNames' },
  { label: 'Language ID', description: "e.g. lua, json (VS Code's detected language)", value: 'languageIds' }
];

function iconThemeDir(context) {
  return path.join(context.extensionPath, 'icons', 'theme');
}

function customIconDir(context) {
  return path.join(iconThemeDir(context), 'custom');
}

function getCustomIcons() {
  return vscode.workspace.getConfiguration('runescape').get('icons.customIcons') || [];
}

function writeIconTheme(context) {
  const base = JSON.parse(fs.readFileSync(path.join(context.extensionPath, 'icons', 'theme', 'runescape-icon-theme.base.json'), 'utf8'));
  for (const custom of getCustomIcons()) {
    base.iconDefinitions[custom.id] = { iconPath: `./custom/${custom.asset}` };
    base[custom.matchType][custom.pattern] = custom.id;
  }
  fs.writeFileSync(path.join(iconThemeDir(context), 'runescape-icon-theme.json'), JSON.stringify(base, null, 2) + '\n');
}

function isIconThemeActive() {
  return vscode.workspace.getConfiguration('workbench').get('iconTheme') === 'runescape-icons';
}

async function toggleIconTheme(context) {
  const config = vscode.workspace.getConfiguration('workbench');
  if (isIconThemeActive()) {
    const previous = context.globalState.get('runescape.previousIconTheme');
    await config.update('iconTheme', previous, vscode.ConfigurationTarget.Global);
  } else {
    await context.globalState.update('runescape.previousIconTheme', config.get('iconTheme'));
    await config.update('iconTheme', 'runescape-icons', vscode.ConfigurationTarget.Global);
  }
}

// Re-selecting the active icon theme makes VS Code re-read its JSON file from disk,
// so the sidebar picks up edits without a full window reload.
async function refreshIconTheme() {
  if (!isIconThemeActive()) return;
  const config = vscode.workspace.getConfiguration('workbench');
  await config.update('iconTheme', null, vscode.ConfigurationTarget.Global);
  await config.update('iconTheme', 'runescape-icons', vscode.ConfigurationTarget.Global);
}

async function addCustomIconFile(context, sourcePath, matchType, pattern) {
  const id = `_custom_${slugify(pattern)}_${Date.now().toString(36)}`;
  const asset = `${id}${path.extname(sourcePath)}`;
  fs.mkdirSync(customIconDir(context), { recursive: true });
  fs.copyFileSync(sourcePath, path.join(customIconDir(context), asset));

  const customIcons = getCustomIcons();
  customIcons.push({ id, matchType, pattern: pattern.trim(), asset });
  await vscode.workspace.getConfiguration('runescape').update('icons.customIcons', customIcons, vscode.ConfigurationTarget.Global);
  writeIconTheme(context);
}

async function removeCustomIconFile(context, id) {
  const customIcons = getCustomIcons();
  const target = customIcons.find((custom) => custom.id === id);
  if (!target) return;
  fs.rmSync(path.join(customIconDir(context), target.asset), { force: true });
  const remaining = customIcons.filter((custom) => custom.id !== id);
  await vscode.workspace.getConfiguration('runescape').update('icons.customIcons', remaining, vscode.ConfigurationTarget.Global);
  writeIconTheme(context);
}

const ICON_MIME_TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

function dataUriForFile(absPath) {
  const mime = ICON_MIME_TYPES[path.extname(absPath).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(absPath).toString('base64')}`;
}

function iconsManagerHtml(nonce, cspSource, iconUri, active, customIcons, pendingPreview) {
  const matchTypeOptions = ICON_THEME_MATCH_TYPES.map((m) => `<option value="${m.value}">${escapeHtml(m.label)} — ${escapeHtml(m.description)}</option>`).join('');
  const rows = customIcons.length
    ? customIcons.map((c) => `
      <div class="iconRow">
        <img src="${c.dataUri}" alt="">
        <div class="iconMeta"><span class="pattern">${escapeHtml(c.pattern)}</span><span class="matchType">${escapeHtml(c.matchType)}</span></div>
        <button type="button" class="secondary remove" data-id="${escapeHtml(c.id)}">Remove</button>
      </div>`).join('')
    : `<div class="empty">No custom icons yet.</div>`;
  const previewBlock = pendingPreview
    ? `<img src="${pendingPreview.dataUri}" alt="" class="previewImg"><span>${escapeHtml(pendingPreview.name)}</span>`
    : `<span class="hintText">No file selected.</span>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${cspSource} data:; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px 24px; max-width: 560px; }
  h2 { margin-top: 0; display: flex; align-items: center; gap: 10px; }
  h2 img { width: 28px; height: 28px; border-radius: 6px; }
  .section { margin: 18px 0; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border, #444); }
  .section > .title { font-weight: 600; margin-bottom: 8px; }
  .statusRow { display: flex; align-items: center; gap: 12px; }
  .status { color: var(--vscode-descriptionForeground); }
  .iconRow { display: flex; align-items: center; gap: 12px; margin: 8px 0; }
  .iconRow img { width: 24px; height: 24px; border-radius: 4px; }
  .iconMeta { flex: 1; display: flex; flex-direction: column; }
  .iconMeta .pattern { font-weight: 600; }
  .iconMeta .matchType { font-size: 0.85em; color: var(--vscode-descriptionForeground); }
  .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
  .addForm { display: flex; flex-direction: column; gap: 10px; }
  .addForm .row { display: flex; align-items: center; gap: 10px; }
  .previewImg { width: 32px; height: 32px; border-radius: 4px; }
  .hintText { color: var(--vscode-descriptionForeground); }
  select, input[type=text] { box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, #555); padding: 4px 6px; border-radius: 2px; flex: 1; }
  button { padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; cursor: pointer; border-radius: 2px; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #formError { color: var(--vscode-errorForeground); margin-top: 4px; }
</style></head>
<body>
<h2><img src="${iconUri}" alt="">RuneScape Icon Theme</h2>

<div class="section statusRow">
  <span class="status">${active ? 'RuneScape Plugin Icons is active.' : 'RuneScape Plugin Icons is not the active File Icon Theme.'}</span>
  <button type="button" id="toggleTheme">${active ? 'Disable' : 'Enable'}</button>
</div>

<div class="section">
  <div class="title">Custom Icons</div>
  <div id="iconList">${rows}</div>
</div>

<div class="section">
  <div class="title">Add Custom Icon</div>
  <div class="addForm">
    <div class="row">
      <button type="button" id="browse" class="secondary">Browse...</button>
      <span id="preview">${previewBlock}</span>
    </div>
    <div class="row">
      <select id="matchType">${matchTypeOptions}</select>
    </div>
    <div class="row">
      <input type="text" id="pattern" placeholder="e.g. lua, plugin.json">
      <button type="button" id="add">Add Icon</button>
    </div>
    <div id="formError"></div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.getElementById('toggleTheme').addEventListener('click', () => vscode.postMessage({ toggleTheme: true }));
  document.getElementById('browse').addEventListener('click', () => vscode.postMessage({ browse: true }));
  document.getElementById('add').addEventListener('click', () => {
    vscode.postMessage({
      add: { matchType: document.getElementById('matchType').value, pattern: document.getElementById('pattern').value.trim() }
    });
  });
  document.querySelectorAll('.remove').forEach((btn) => {
    btn.addEventListener('click', () => vscode.postMessage({ remove: { id: btn.dataset.id } }));
  });
  window.addEventListener('message', (event) => {
    document.getElementById('formError').textContent = event.data.error || '';
  });
</script>
</body></html>`;
}

async function manageIcons(context) {
  const panel = vscode.window.createWebviewPanel('runescapeIconsManager', 'RuneScape Icons', vscode.ViewColumn.Active, { enableScripts: true });
  const iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');
  panel.iconPath = iconPath;
  let pendingPreview = null;

  const render = () => {
    const nonce = require('crypto').randomBytes(16).toString('hex');
    const iconUri = panel.webview.asWebviewUri(iconPath);
    const customIcons = getCustomIcons().map((custom) => ({ ...custom, dataUri: dataUriForFile(path.join(customIconDir(context), custom.asset)) }));
    panel.webview.html = iconsManagerHtml(nonce, panel.webview.cspSource, iconUri, isIconThemeActive(), customIcons, pendingPreview);
  };

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.toggleTheme) {
      await toggleIconTheme(context);
      render();
      return;
    }

    if (msg.browse) {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Select icon image',
        filters: { Images: ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'] }
      });
      if (picked && picked.length > 0) {
        pendingPreview = { path: picked[0].fsPath, name: path.basename(picked[0].fsPath), dataUri: dataUriForFile(picked[0].fsPath) };
        render();
      }
      return;
    }

    if (msg.add) {
      if (!pendingPreview) {
        panel.webview.postMessage({ error: 'Choose an icon image first.' });
        return;
      }
      if (!msg.add.pattern) {
        panel.webview.postMessage({ error: 'Enter a file extension, file name, or language ID to match.' });
        return;
      }
      await addCustomIconFile(context, pendingPreview.path, msg.add.matchType, msg.add.pattern);
      pendingPreview = null;
      await refreshIconTheme();
      render();
      return;
    }

    if (msg.remove) {
      await removeCustomIconFile(context, msg.remove.id);
      await refreshIconTheme();
      render();
    }
  }, undefined, context.subscriptions);

  render();
}

function pluginRoot() {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  return folder ? folder.uri.fsPath : null;
}

function requirePluginProject() {
  const root = pluginRoot();
  if (!root) {
    vscode.window.showErrorMessage('Open a RuneScape plugin project first.');
    return null;
  }
  for (const required of ['plugin.json', 'main.lua']) {
    if (!fs.existsSync(path.join(root, required))) {
      vscode.window.showErrorMessage(`${required} not found in ${root}.`);
      return null;
    }
  }
  return root;
}

// Mirrors deploy.ps1's file selection: plugin.json, every *.lua file (skipping any
// path segment starting with '.'), and resources/ copied verbatim if present.
function collectPluginFiles(root) {
  const files = [{ rel: 'plugin.json', abs: path.join(root, 'plugin.json') }];
  const walkLua = (dir, relBase) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'resources') continue;
      const abs = path.join(dir, entry.name);
      const rel = path.join(relBase, entry.name);
      if (entry.isDirectory()) walkLua(abs, rel);
      else if (entry.name.endsWith('.lua')) files.push({ rel, abs });
    }
  };
  walkLua(root, '');
  const resourcesDir = path.join(root, 'resources');
  if (fs.existsSync(resourcesDir)) {
    const walkAll = (dir, relBase) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = path.join(relBase, entry.name);
        if (entry.isDirectory()) walkAll(abs, rel);
        else files.push({ rel, abs });
      }
    };
    walkAll(resourcesDir, 'resources');
  }
  return files;
}

function copyPluginFiles(files, targetDir) {
  for (const file of files) {
    const dest = path.join(targetDir, file.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file.abs, dest);
  }
}

// %ProgramData%\Jagex\<RuneScape-BETA|RuneScape>\dev_plugins, same as the Kotlin SDK's
// CLI and this ecosystem's deploy.ps1 scripts use.
function devPluginsRoot() {
  const programData = process.env.ProgramData;
  if (!programData) return null;
  const client = vscode.workspace.getConfiguration('runescape').get('devClient') || 'RuneScape-BETA';
  return path.join(programData, 'Jagex', client, 'dev_plugins');
}

function deployDev() {
  const root = requirePluginProject();
  if (!root) return;
  const base = devPluginsRoot();
  if (!base) {
    vscode.window.showErrorMessage('%ProgramData% is not set; deploying to dev_plugins only works on Windows.');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const slug = slugify(manifest.name || '') || 'plugin';
  const target = path.join(base, slug);

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const files = collectPluginFiles(root);
  copyPluginFiles(files, target);

  vscode.window.showInformationMessage(
    `Deployed ${files.length} file(s) to ${target}. In the game console: plugins_refresh, then plugins_reload ${slug}`
  );
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || stdout || error.message).trim()));
      else resolve(stdout);
    });
  });
}

async function packageModio() {
  const root = requirePluginProject();
  if (!root) return;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const slug = slugify(manifest.name || '') || 'plugin';
  const outPath = path.join(root, `${slug}-${manifest.version || '1.0'}.zip`);
  const quotePs = (value) => `'${value.replace(/'/g, "''")}'`;

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'rs3-package-'));
  try {
    copyPluginFiles(collectPluginFiles(root), staging);
    fs.rmSync(outPath, { force: true });
    await runPowerShell(`Compress-Archive -Path ${quotePs(path.join(staging, '*'))} -DestinationPath ${quotePs(outPath)} -Force`);
  } catch (e) {
    vscode.window.showErrorMessage(`Failed to package: ${e.message}`);
    return;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  const choice = await vscode.window.showInformationMessage(`Packaged ${path.basename(outPath)}`, 'Reveal in Explorer', 'Open mod.io');
  if (choice === 'Reveal in Explorer') vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outPath));
  if (choice === 'Open mod.io') vscode.env.openExternal(vscode.Uri.parse('https://mod.io/g/runescape'));
}

function activate(context) {
  writeIconTheme(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('runescape.newProject', () => newProject(context)),
    vscode.commands.registerCommand('runescape.deployDev', () => deployDev()),
    vscode.commands.registerCommand('runescape.packageModio', () => packageModio()),
    vscode.commands.registerCommand('runescape.icons.manage', () => manageIcons(context))
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
