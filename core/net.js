// Small network helpers: JSON fetch with retries, and verified file downloads.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const UA = 'RPG-Launcher/1.0 (private friends server launcher)';

async function withRetry(fn, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

async function fetchJson(url, timeoutMs = 20000) {
  return withRetry(async () => {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
    return res.json();
  });
}

function hashFile(file, algo) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algo);
    fs.createReadStream(file)
      .on('data', d => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

async function fileMatches(file, hash, algo) {
  if (!fs.existsSync(file)) return false;
  if (!hash) return true;
  return (await hashFile(file, algo)).toLowerCase() === hash.toLowerCase();
}

// Downloads to a temp file, checks the hash, then moves it into place.
async function download(url, dest, { hash, algo = 'sha1', onProgress } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  await withRetry(async () => {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
    const total = Number(res.headers.get('content-length')) || 0;
    let done = 0;
    const body = Readable.fromWeb(res.body);
    body.on('data', c => {
      done += c.length;
      if (onProgress && total) onProgress(done / total);
    });
    await pipeline(body, fs.createWriteStream(tmp));
    if (hash && !(await fileMatches(tmp, hash, algo))) {
      fs.rmSync(tmp, { force: true });
      throw new Error('다운로드한 파일이 손상됐어요: ' + path.basename(dest));
    }
  });
  fs.renameSync(tmp, dest);
}

module.exports = { fetchJson, download, fileMatches, UA };
