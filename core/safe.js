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
  serverAddress: v => typeof v === 'string' && (v === '' || isAddress(v)),
  minecraftVersion: v => typeof v === 'string' && /^[0-9][0-9a-z.\-_]{0,30}$/i.test(v) && !v.includes('..'),
  fabricLoader: v => typeof v === 'string' && (v === 'latest' || /^[0-9][0-9a-z.+\-_]{0,30}$/i.test(v)) && !v.includes('..'),
  mods: v => Array.isArray(v) && v.length <= 100 && v.every(s => typeof s === 'string' && /^[a-z0-9_-]{1,64}$/i.test(s)),
  language: v => typeof v === 'string' && /^[a-z]{2,3}_[a-z]{2,3}$/i.test(v),
  // Our own mods (not on Modrinth), e.g. the 주영서버 UI mod. Only files in our own GitHub
  // repository, pinned by their sha1 so a changed file is never installed.
  customMods: v =>
    Array.isArray(v) && v.length <= 20 &&
    new Set(v.map(m => m?.name)).size === v.length &&
    v.every(m =>
      m && typeof m === 'object' &&
      safeFileName(m.name, '.jar') === m.name &&
      typeof m.sha1 === 'string' && /^[0-9a-f]{40}$/i.test(m.sha1) &&
      isOwnRepoUrl(m.url)),
  // Servers friends can pick from. "restricted" ones are only shown to players
  // the server says are allowed (see accessUrl).
  servers: v =>
    Array.isArray(v) && v.length >= 1 && v.length <= 5 &&
    new Set(v.map(s => s?.id)).size === v.length &&
    v.every(s =>
      s && typeof s === 'object' &&
      typeof s.id === 'string' && /^[a-z0-9_-]{1,20}$/.test(s.id) &&
      typeof s.name === 'string' && s.name.length >= 1 && s.name.length <= 40 &&
      typeof s.address === 'string' && s.address !== '' && isAddress(s.address) &&
      (s.restricted === undefined || typeof s.restricted === 'boolean')),
  // Where the launcher asks which restricted servers a player may see.
  // Plain http is allowed because it only answers "which servers", nothing secret.
  accessUrl: v => typeof v === 'string' && /^https?:\/\/[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:\d{1,5})?\/[a-z0-9/_-]{0,64}$/i.test(v),
};
// Files we host ourselves: https://raw.githubusercontent.com/chlwndud0122/rpg-launcher/...
const OWN_REPO_PREFIX = '/chlwndud0122/rpg-launcher/';
function isOwnRepoUrl(v) {
  if (typeof v !== 'string' || v.length > 300 || /\.\.|%|\\/.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname === 'raw.githubusercontent.com' && !u.search && !u.hash &&
      u.pathname.startsWith(OWN_REPO_PREFIX) && !u.pathname.includes('..') && !u.pathname.includes('%');
  } catch {
    return false;
  }
}
function isAddress(v) {
  return /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:\d{1,5})?$/i.test(v) && !/\.\./.test(v);
}

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

module.exports = { redact, applySafeConfig, safeFileName, assertTrustedUrl, isOwnRepoUrl, RULES };
