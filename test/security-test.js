// Security checks. Run with: node test/security-test.js
const fs = require('fs');
const path = require('path');
const { redact, applySafeConfig, safeFileName, assertTrustedUrl } = require('../core/safe');

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
const throws = fn => {
  try { fn(); return false; } catch { return true; }
};

// 1. Login tokens never reach the log file
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const mclcLine = `[MCLC]: Launching with arguments -Xmx4G net.fabricmc.loader.impl.launch.knot.KnotClient --username Steve --uuid abc --accessToken ${jwt} --userType msa`;
const out = redact(mclcLine);
check('accessToken argument is hidden', !out.includes(jwt) && out.includes('--accessToken [숨김]'));
check('bare JWT is hidden', !redact('token was ' + jwt).includes(jwt));
check('JSON access_token is hidden', !redact('{"access_token":"abcdef123456"}').includes('abcdef123456'));
check('Microsoft refresh token is hidden', !redact('refresh M.C540_BAY.0.U.-CsXyz1234567890abcdefghijk!').includes('CsXyz1234567890'));
check('normal game log is untouched', redact('[Render thread/INFO]: Loaded 1470 recipes') === '[Render thread/INFO]: Loaded 1470 recipes');

// 1b. Server list and access check settings are validated
{
  const { RULES } = require('../core/safe');
  check('server list accepted', RULES.servers([{ id: 'main', name: '주영서버', address: '1.2.3.4' }, { id: 'test', name: 'T', address: '1.2.3.4:25566', restricted: true }]));
  check('server list rejects bad address', !RULES.servers([{ id: 'main', name: 'x', address: 'evil.com --jvmArg' }]));
  check('server list rejects duplicate ids', !RULES.servers([{ id: 'a', name: 'x', address: 'a.com' }, { id: 'a', name: 'y', address: 'b.com' }]));
  check('server list rejects odd ids', !RULES.servers([{ id: '../x', name: 'x', address: 'a.com' }]));
  check('access url accepted', RULES.accessUrl('http://161.33.209.62:25580/access'));
  check('access url rejects other schemes', !RULES.accessUrl('file:///C:/x') && !RULES.accessUrl('javascript:alert(1)'));
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  check('access check only asks our own game server', main.includes('hostOf(s.address) === u.hostname'));
  check('play uses server id, not an address from the page', main.includes('visibleServers.find(s => s.id === serverId)'));
}

// 2. A tampered remote config cannot do damage
const base = { serverAddress: '', minecraftVersion: '1.21.11', mods: ['sodium'], language: 'ko_kr' };
const evil = {
  serverAddress: 'evil.com --jvmArg -Dx=y',
  minecraftVersion: '../../../Windows/System32',
  fabricLoader: '..\\..\\x',
  mods: ['sodium', '../../evil'],
  language: 'ko_kr\nresourcePacks:["evil"]',
  serverName: 'x'.repeat(500),
};
const cfg = { ...base };
const rejected = applySafeConfig(cfg, evil);
check('injected server address rejected', cfg.serverAddress === '' && rejected.includes('serverAddress'));
check('path traversal in version rejected', cfg.minecraftVersion === '1.21.11');
check('path traversal in loader rejected', cfg.fabricLoader === undefined);
check('path traversal in mod list rejected', cfg.mods.length === 1);
check('newline injection in language rejected', cfg.language === 'ko_kr');
check('oversized server name rejected', rejected.includes('serverName'));
const good = { ...base };
applySafeConfig(good, { serverAddress: 'play.example.com:25565', minecraftVersion: '26.3', mods: ['fabric-api', 'xaeros-minimap'] });
check('valid settings still accepted', good.serverAddress === 'play.example.com:25565' && good.minecraftVersion === '26.3' && good.mods.length === 2);
const ip = { ...base };
applySafeConfig(ip, { serverAddress: '123.45.67.89' });
check('IP address accepted', ip.serverAddress === '123.45.67.89');

// 3. Downloaded file names cannot escape their folder
check('../ in mod file name blocked', safeFileName('../../evil.jar', '.jar') === null);
check('..\\ in mod file name blocked', safeFileName('..\\..\\evil.jar', '.jar') === null);
check('absolute path blocked', safeFileName('C:\\Windows\\evil.jar', '.jar') === null);
check('non-jar mod blocked', safeFileName('evil.exe', '.jar') === null);
check('hidden file blocked', safeFileName('.evil.jar', '.jar') === null);
check('normal mod file allowed', safeFileName('sodium-fabric-0.8.14+mc1.21.11.jar', '.jar') === 'sodium-fabric-0.8.14+mc1.21.11.jar');

// 4. Downloads only from expected hosts over HTTPS
check('plain http blocked', throws(() => assertTrustedUrl('http://cdn.modrinth.com/a.jar', ['modrinth.com'])));
check('other host blocked', throws(() => assertTrustedUrl('https://evil.com/a.jar', ['modrinth.com'])));
check('look-alike host blocked', throws(() => assertTrustedUrl('https://modrinth.com.evil.com/a.jar', ['modrinth.com'])));
check('look-alike suffix blocked', throws(() => assertTrustedUrl('https://evilmodrinth.com/a.jar', ['modrinth.com'])));
check('modrinth CDN allowed', !throws(() => assertTrustedUrl('https://cdn.modrinth.com/data/x/a.jar', ['modrinth.com'])));

// 5. Window settings in the main process
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
check('contextIsolation on', /contextIsolation:\s*true/.test(main));
check('nodeIntegration off', /nodeIntegration:\s*false/.test(main));
check('sandbox on', /sandbox:\s*true/.test(main));
check('navigation blocked', main.includes("'will-navigate'"));
check('permission requests denied', main.includes('setPermissionRequestHandler'));
check('only https links open externally', /\^https:/.test(main));
check('log writes go through redact',
  /logBuffer\.push\([^\n]*redact\(/.test(main) &&
  (main.match(/appendFileSync\(LOG_FILE/g) || []).length === 1 &&
  /fs\.appendFileSync\(LOG_FILE, text\)/.test(main));
const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
check('page has a strict Content-Security-Policy', /script-src 'self'/.test(html) && !/unsafe-inline|unsafe-eval/.test(html));
const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
check('page never uses innerHTML', !/innerHTML|outerHTML|insertAdjacentHTML/.test(app));

// 6. No secrets committed
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
check('fuses: run-as-node disabled', pkg.build.electronFuses?.runAsNode === false);
check('fuses: asar integrity enabled', pkg.build.electronFuses?.enableEmbeddedAsarIntegrityValidation === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
