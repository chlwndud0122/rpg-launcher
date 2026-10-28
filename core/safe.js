// Security helpers: hide secrets in logs, check settings and downloads before using them.
const path = require('path');

// Removes login tokens from any text before it is written to a log file.
function redact(text) {
  return String(text)
    .replace(/(--accessToken\s+)\S+/gi, '$1[숨김]')
    .replace(/("?access_?token"?\s*[:=]\s*"?)[^\s",}]+/gi, '$1[숨김]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[숨김]')
    .replace(/\bM\.C\d+_[A-Za-z0-9]+\.[A-Za-z0-9!*$._-]{20,}/g, '[숨김]'); // Microsoft refresh tokens
}

const RULES = {
  serverName: v => typeof v === 'string' && v.length <= 60,
  subtitle: v => typeof v === 'string' && v.length <= 120,
  // host or host:port, letters/numbers/dots/dashes only
  serverAddress: v =>
    typeof v === 'string' &&
    (v === '' || (/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:\d{1,5})?$/i.test(v) && !/\.\./.test(v))),
  minecraftVersion: v => typeof v === 'string' && /^[0-9][0-9a-z.\-_]{0,30}$/i.test(v) && !v.includes('..'),
  fabricLoader: v => typeof v === 'string' && (v === 'latest' || /^[0-9][0-9a-z.+\-_]{0,30}$/i.test(v)) && !v.includes('..'),
  mods: v => Array.isArray(v) && v.length <= 100 && v.every(s => typeof s === 'string' && /^[a-z0-9_-]{1,64}$/i.test(s)),
  language: v => typeof v === 'string' && /^[a-z]{2,3}_[a-z]{2,3}$/i.test(v),
};

// Copies only the settings that pass the checks. Returns the names that were rejected.
function applySafeConfig(target, source) {
  const rejected = [];
  for (const [key, ok] of Object.entries(RULES)) {
    if (source[key] === undefined) continue;
    if (ok(source[key])) target[key] = source[key];
    else rejected.push(key);
  }
  return rejected;
}

// A file name we are willing to write into a folder: no folders, no tricks.
function safeFileName(name, ext) {
  if (typeof name !== 'string') return null;
  const base = path.basename(name);
  if (base !== name || base.startsWith('.') || !/^[A-Za-z0-9._+\-]{1,200}$/.test(base)) return null;
  if (ext && !base.toLowerCase().endsWith(ext)) return null;
  return base;
}

// Only download over HTTPS from hosts we expect.
function assertTrustedUrl(url, hosts) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error('잘못된 다운로드 주소예요.');
  }
  if (u.protocol !== 'https:' || !hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) {
    throw new Error('믿을 수 없는 주소에서 받으려고 해서 멈췄어요: ' + u.hostname);
  }
  return url;
}

module.exports = { redact, applySafeConfig, safeFileName, assertTrustedUrl, RULES };
