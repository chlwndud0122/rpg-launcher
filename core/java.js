// Makes sure the right Java version is available, downloading it from Adoptium if needed.
// Friends never have to install Java themselves.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { fetchJson, download } = require('./net');

async function requiredJavaMajor(mcVersion) {
  const manifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
  const entry = manifest.versions.find(v => v.id === mcVersion);
  if (!entry) throw new Error(`마인크래프트 ${mcVersion} 버전을 찾을 수 없어요.`);
  const versionJson = await fetchJson(entry.url);
  return versionJson.javaVersion?.majorVersion || 21;
}

function findJavaw(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name, 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function ensureJava(root, mcVersion, report) {
  const major = await requiredJavaMajor(mcVersion);
  const javaDir = path.join(root, 'runtime', `java-${major}`);
  const existing = findJavaw(javaDir);
  if (existing) return existing;

  report({ step: `자바 ${major} 준비 중 (처음 한 번만)`, progress: 0 });
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const assets = await fetchJson(
    `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?os=${os}&architecture=${arch}&image_type=jre&vendor=eclipse`
  );
  const pkg = assets[0]?.binary?.package;
  if (!pkg) throw new Error(`자바 ${major}를 받을 수 없어요.`);

  const zipPath = path.join(root, 'runtime', pkg.name);
  await download(pkg.link, zipPath, {
    hash: pkg.checksum,
    algo: 'sha256',
    onProgress: p => report({ step: `자바 ${major} 다운로드 중`, progress: p }),
  });

  report({ step: `자바 ${major} 설치 중`, progress: 1 });
  const tmpDir = javaDir + '.tmp';
  fs.rmSync(tmpDir, { recursive: true, force: true });
  new AdmZip(zipPath).extractAllTo(tmpDir, true);
  fs.rmSync(javaDir, { recursive: true, force: true });
  fs.renameSync(tmpDir, javaDir);
  fs.rmSync(zipPath, { force: true });

  const javaw = findJavaw(javaDir);
  if (!javaw) throw new Error('자바 설치에 실패했어요.');
  return javaw;
}

module.exports = { ensureJava };
