// Installs the Fabric mod loader and keeps the mod folder in sync with the config.
// Mods are downloaded from Modrinth (the official source) and checked against their hashes.
const fs = require('fs');
const path = require('path');
const { fetchJson, download, fileMatches } = require('./net');
const { safeFileName, assertTrustedUrl, isOwnRepoUrl } = require('./safe');

const MODRINTH = 'https://api.modrinth.com/v2';

async function ensureFabric(root, mcVersion, loaderSetting) {
  let loader = loaderSetting;
  if (!loader || loader === 'latest') {
    try {
      const loaders = await fetchJson('https://meta.fabricmc.net/v2/versions/loader');
      loader = (loaders.find(l => l.stable) || loaders[0]).version;
    } catch (e) {
      // Offline: keep using the Fabric we installed last time for this version.
      const suffix = `-${mcVersion}`;
      const dir = path.join(root, 'versions');
      const installed = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(n => n.startsWith('fabric-loader-') && n.endsWith(suffix) &&
            fs.existsSync(path.join(dir, n, `${n}.json`)))
        : [];
      if (!installed.length) throw e;
      return installed.sort().pop();
    }
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

// Looks up all mods at the same time (then their required add-ons, round by round)
// instead of one after another, so the "checking mods" step is much shorter.
async function resolveMods(slugs, mcVersion) {
  const resolved = new Map(); // project_id -> file info
  const seen = new Set();
  const q = `loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
  let round = slugs;
  while (round.length) {
    const ids = [...new Set(round)].filter(id => !seen.has(id));
    ids.forEach(id => seen.add(id));
    const results = await Promise.all(ids.map(async idOrSlug => {
      const v = pickVersion(await fetchJson(`${MODRINTH}/project/${idOrSlug}/version?${q}`));
      if (!v) throw new Error(`모드 "${idOrSlug}"는 ${mcVersion} 버전을 아직 지원하지 않아요.`);
      return [idOrSlug, v];
    }));
    round = [];
    for (const [idOrSlug, v] of results) { // keep the config's order
      if (resolved.has(v.project_id)) continue;
      seen.add(v.project_id);
      const file = v.files.find(f => f.primary) || v.files[0];
      const name = safeFileName(file?.filename, '.jar');
      if (!name || !/^[0-9a-f]{40}$/i.test(file.hashes?.sha1 || '')) throw new Error(`모드 "${idOrSlug}" 파일 정보가 이상해서 멈췄어요.`);
      assertTrustedUrl(file.url, ['modrinth.com']);
      resolved.set(v.project_id, { name, url: file.url, sha1: file.hashes.sha1 });
      for (const dep of v.dependencies || []) {
        if (dep.dependency_type === 'required' && dep.project_id) round.push(dep.project_id);
      }
    }
  }
  return [...resolved.values()];
}

// Our own mods from the config (already checked by safe.js; checked again here).
function customModList(list) {
  return (list || []).map(m => {
    const name = safeFileName(m?.name, '.jar');
    if (!name || !isOwnRepoUrl(m.url) || !/^[0-9a-f]{40}$/i.test(m.sha1 || '')) throw new Error('전용 모드 정보가 이상해서 멈췄어요.');
    return { name, url: m.url, sha1: m.sha1.toLowerCase() };
  });
}

async function syncMods(root, mcVersion, slugs, report, customMods = []) {
  const modsDir = path.join(root, 'mods');
  const manifestPath = path.join(root, 'launcher-mods.json');
  fs.mkdirSync(modsDir, { recursive: true });

  let mods;
  try {
    mods = await resolveMods(slugs, mcVersion);
    const own = customModList(customMods);
    const taken = new Set(mods.map(x => x.name));
    for (const c of own) if (!taken.has(c.name)) mods.push(c);
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
      const name = safeFileName(m.name, '.jar');
      if (name && !keep.has(name)) fs.rmSync(path.join(modsDir, name), { force: true });
    }
  }

  // Check every mod file at once, then download only the missing or changed ones.
  const ok = await Promise.all(mods.map(m => fileMatches(path.join(modsDir, m.name), m.sha1, 'sha1')));
  const missing = mods.filter((_, i) => !ok[i]);
  for (let i = 0; i < missing.length; i++) {
    const m = missing[i];
    report({ step: `모드 받는 중 (${i + 1}/${missing.length}) ${m.name}`, progress: i / missing.length });
    await download(m.url, path.join(modsDir, m.name), { hash: m.sha1, algo: 'sha1' });
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ mcVersion, mods }, null, 2));
  return mods;
}

module.exports = { ensureFabric, syncMods, customModList };
