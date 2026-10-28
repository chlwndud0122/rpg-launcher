// Installs the Fabric mod loader and keeps the mod folder in sync with the config.
// Mods are downloaded from Modrinth (the official source) and checked against their hashes.
const fs = require('fs');
const path = require('path');
const { fetchJson, download, fileMatches } = require('./net');

const MODRINTH = 'https://api.modrinth.com/v2';

async function ensureFabric(root, mcVersion, loaderSetting) {
  let loader = loaderSetting;
  if (!loader || loader === 'latest') {
    const loaders = await fetchJson('https://meta.fabricmc.net/v2/versions/loader');
    loader = (loaders.find(l => l.stable) || loaders[0]).version;
  }
  const id = `fabric-loader-${loader}-${mcVersion}`;
  const jsonPath = path.join(root, 'versions', id, `${id}.json`);
  if (!fs.existsSync(jsonPath)) {
    const profile = await fetchJson(
      `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loader}/profile/json`
    );
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(profile, null, 2));
  }
  return id;
}

function pickVersion(versions) {
  return versions.find(v => v.version_type === 'release') || versions[0];
}

async function resolveMods(slugs, mcVersion) {
  const resolved = new Map(); // project_id -> file info
  const queue = [...slugs];
  const seen = new Set();
  while (queue.length) {
    const idOrSlug = queue.shift();
    if (seen.has(idOrSlug)) continue;
    seen.add(idOrSlug);
    const q = `loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
    const versions = await fetchJson(`${MODRINTH}/project/${idOrSlug}/version?${q}`);
    const v = pickVersion(versions);
    if (!v) throw new Error(`모드 "${idOrSlug}"는 ${mcVersion} 버전을 아직 지원하지 않아요.`);
    if (resolved.has(v.project_id)) continue;
    seen.add(v.project_id);
    const file = v.files.find(f => f.primary) || v.files[0];
    resolved.set(v.project_id, { name: file.filename, url: file.url, sha1: file.hashes.sha1 });
    for (const dep of v.dependencies || []) {
      if (dep.dependency_type === 'required' && dep.project_id) queue.push(dep.project_id);
    }
  }
  return [...resolved.values()];
}

async function syncMods(root, mcVersion, slugs, report) {
  const modsDir = path.join(root, 'mods');
  const manifestPath = path.join(root, 'launcher-mods.json');
  fs.mkdirSync(modsDir, { recursive: true });

  let mods;
  try {
    mods = await resolveMods(slugs, mcVersion);
  } catch (e) {
    // No internet? Fall back to what was installed last time.
    if (fs.existsSync(manifestPath)) {
      const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (prev.mcVersion === mcVersion && prev.mods.every(m => fs.existsSync(path.join(modsDir, m.name)))) {
        return prev.mods;
      }
    }
    throw e;
  }

  // Remove mods we installed before that are no longer in the list.
  if (fs.existsSync(manifestPath)) {
    const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const keep = new Set(mods.map(m => m.name));
    for (const m of prev.mods) {
      if (!keep.has(m.name)) fs.rmSync(path.join(modsDir, m.name), { force: true });
    }
  }

  for (let i = 0; i < mods.length; i++) {
    const m = mods[i];
    const dest = path.join(modsDir, m.name);
    if (await fileMatches(dest, m.sha1, 'sha1')) continue;
    report({ step: `모드 받는 중 (${i + 1}/${mods.length}) ${m.name}`, progress: i / mods.length });
    await download(m.url, dest, { hash: m.sha1, algo: 'sha1' });
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ mcVersion, mods }, null, 2));
  return mods;
}

module.exports = { ensureFabric, syncMods };
