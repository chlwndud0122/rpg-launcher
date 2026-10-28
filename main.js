// Launcher main process: window, Microsoft login, and starting the game.
const { app, BrowserWindow, ipcMain, safeStorage, shell, session, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const { Auth } = require('msmc');
const os = require('os');
const { prepareAndLaunch, autoMemoryGB, maxMemoryGB } = require('./core/game');
const { fetchJson } = require('./core/net');
const { redact, applySafeConfig } = require('./core/safe');
const { pingServer } = require('./core/status');

// Keep the settings folder from before the rename, so nobody has to log in again.
app.setPath('userData', path.join(app.getPath('appData'), 'RPG Launcher'));

if (!app.requestSingleInstanceLock()) app.quit();

const GAME_DIR = path.join(app.getPath('appData'), '.rpg-launcher');
const ACCOUNT_FILE = path.join(app.getPath('userData'), 'account.dat');
const LOG_FILE = path.join(GAME_DIR, 'launcher-log.txt');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

// ---------- per-computer settings ----------
function readSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return { memoryGB: Number.isInteger(s.memoryGB) ? s.memoryGB : 'auto' };
  } catch {
    return { memoryGB: 'auto' };
  }
}

let win;
let account = null; // { name, uuid, auth (MCLC object) }
let gameRunning = false;

// ---------- config ----------
// Settings come from GitHub so the server owner can change them without a reinstall.
// The last copy that worked is kept on disk for when GitHub can't be reached.
const REMOTE_CACHE = path.join(app.getPath('userData'), 'remote-config.json');

async function loadConfig() {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'launcher.config.json'), 'utf8'));
  if (!config.remoteConfigUrl) return config;
  let remote = null;
  try {
    const sep = config.remoteConfigUrl.includes('?') ? '&' : '?';
    remote = await fetchJson(config.remoteConfigUrl + sep + 't=' + Date.now(), 8000);
    fs.writeFileSync(REMOTE_CACHE, JSON.stringify(remote));
  } catch (e) {
    log('remote config unavailable: ' + e.message);
    try { remote = JSON.parse(fs.readFileSync(REMOTE_CACHE, 'utf8')); } catch {}
  }
  if (remote && typeof remote === 'object') {
    const rejected = applySafeConfig(config, remote);
    if (rejected.length) log('ignored unsafe remote settings: ' + rejected.join(', '));
  }
  return config;
}

// ---------- launcher self-update (GitHub Releases) ----------
let updateReady = false;
function setupAutoUpdate() {
  if (!app.isPackaged || process.env.RPG_LAUNCHER_NO_UPDATE) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // installs quietly when the launcher is closed
  autoUpdater.on('update-available', i => log('update available: ' + i.version));
  autoUpdater.on('update-downloaded', i => {
    log('update downloaded: ' + i.version);
    updateReady = i.version;
    send('update-ready', { version: i.version });
  });
  autoUpdater.on('error', e => log('update check failed: ' + (e?.message || e)));
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
}

ipcMain.handle('install-update', () => {
  if (!updateReady || gameRunning) return false;
  require('electron-updater').autoUpdater.quitAndInstall(true, true);
  return true;
});

// ---------- account storage (encrypted by Windows) ----------
function saveRefreshToken(token) {
  try {
    fs.mkdirSync(path.dirname(ACCOUNT_FILE), { recursive: true });
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(token)
      : Buffer.from(token, 'utf8');
    fs.writeFileSync(ACCOUNT_FILE, data);
  } catch (e) {
    log('could not save account: ' + e.message);
  }
}

function readRefreshToken() {
  try {
    const data = fs.readFileSync(ACCOUNT_FILE);
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString('utf8');
  } catch {
    return null;
  }
}

// Log lines are collected and written together, so a chatty game doesn't
// cause thousands of tiny disk writes.
let logBuffer = [];
let logTimer = null;
function flushLog() {
  logTimer = null;
  if (!logBuffer.length) return;
  const text = logBuffer.join('');
  logBuffer = [];
  try {
    fs.mkdirSync(GAME_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, text);
  } catch {}
}
function log(line) {
  logBuffer.push(`[${new Date().toISOString()}] ${redact(line)}\n`);
  if (logBuffer.length >= 200) flushLog();
  else if (!logTimer) logTimer = setTimeout(flushLog, 1000);
}
process.on('exit', flushLog);

function friendlyAuthError(e) {
  const code = typeof e === 'string' ? e : e?.ts || e?.message || '';
  if (/gui\.closed|cancel/i.test(code)) return null; // user closed the login window
  if (/xsts\.child/i.test(code))
    return '청소년 계정은 보호자가 Xbox 가족 설정에서 허용해야 해요.';
  if (/xsts\.userNotFound|xboxLive/i.test(code))
    return 'Xbox 프로필이 필요해요. xbox.com에 한 번 로그인해 프로필을 만든 뒤 다시 시도해 주세요.';
  if (/profile|entitlement|minecraft/i.test(code))
    return '이 계정에는 마인크래프트 자바 에디션이 없어요. 구매한 계정으로 로그인해 주세요.';
  return '로그인에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
}

function toAccount(mc) {
  const auth = mc.mclc();
  return { name: auth.name, uuid: auth.uuid, auth };
}

async function restoreLogin() {
  const token = readRefreshToken();
  if (!token) return null;
  try {
    const xbox = await new Auth('select_account').refresh(token);
    const mc = await xbox.getMinecraft();
    saveRefreshToken(xbox.save());
    account = toAccount(mc);
    return account;
  } catch (e) {
    log('auto login failed: ' + JSON.stringify(e?.message || e));
    return null;
  }
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 960,
    height: 600,
    resizable: false,
    frame: false,
    backgroundColor: '#0f1115',
    title: '주영런처',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // The launcher page never navigates anywhere else.
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.on('will-attach-webview', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  // No camera, microphone, notifications, etc. for any page.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  createWindow();
  setupAutoUpdate();
  if (process.env.RPG_LAUNCHER_SELFTEST) runSelfTest();
});

// Developer self-test (only runs when the RPG_LAUNCHER_SELFTEST env var is set):
// boots the packaged app with an offline test account and reports what happened.
async function runSelfTest() {
  const out = process.env.RPG_LAUNCHER_SELFTEST;
  const say = m => fs.appendFileSync(out, m + '\n');
  try {
    await new Promise(r => win.webContents.once('did-finish-load', r));
    await new Promise(r => setTimeout(r, 3000));
    const shot = await win.webContents.capturePage();
    fs.writeFileSync(out.replace(/\.txt$/, '.png'), shot.toPNG());
    const { Authenticator } = require('minecraft-launcher-core');
    const config = await loadConfig();
    if (process.env.RPG_LAUNCHER_SERVER) config.serverAddress = process.env.RPG_LAUNCHER_SERVER;
    const t0 = Date.now();
    const { proc, done } = await prepareAndLaunch({
      root: process.env.RPG_LAUNCHER_GAMEDIR || GAME_DIR,
      config,
      auth: await Authenticator.getAuth('TestPlayer'),
      report: s => say(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s.step}`),
      onLog: l => {
        log(l.trimEnd());
        if (/Connecting to|Loading \d+ mods|Exception|Disconnected|lost connection/i.test(l)) say('  game: ' + l.trim().slice(0, 200));
        if (/Connecting to|Sound engine started/.test(l)) setTimeout(() => proc.kill(), 15000);
      },
    });
    say('exit ' + (await done));
  } catch (e) {
    say('SELFTEST FAILED: ' + (e?.stack || e));
  }
  app.quit();
}
app.on('window-all-closed', () => app.quit());

// ---------- IPC ----------
const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);

ipcMain.handle('init', async () => {
  // Both need the internet; do them at the same time so the launcher opens faster.
  const [config, acc] = await Promise.all([loadConfig(), restoreLogin()]);
  serverAddress = config.serverAddress || '';
  return {
    config: {
      serverName: config.serverName,
      subtitle: config.subtitle,
      serverAddress: config.serverAddress,
      minecraftVersion: config.minecraftVersion,
    },
    account: acc && { name: acc.name, uuid: acc.uuid },
    version: app.getVersion(),
    updateReady,
  };
});

ipcMain.handle('login', async () => {
  try {
    const authManager = new Auth('select_account');
    const xbox = await authManager.launch('electron', {
      width: 500,
      height: 650,
      parent: win,
      modal: true,
      autoHideMenuBar: true,
      title: '마이크로소프트 로그인',
    });
    const mc = await xbox.getMinecraft();
    if (mc.isDemo()) throw new Error('profile');
    saveRefreshToken(xbox.save());
    account = toAccount(mc);
    return { ok: true, account: { name: account.name, uuid: account.uuid } };
  } catch (e) {
    log('login failed: ' + JSON.stringify(e?.message || e));
    const msg = friendlyAuthError(e);
    return { ok: false, error: msg };
  }
});

ipcMain.handle('logout', async () => {
  account = null;
  fs.rmSync(ACCOUNT_FILE, { force: true });
  return true;
});

ipcMain.handle('play', async () => {
  if (gameRunning) return { ok: false, error: '게임이 이미 실행 중이에요.' };
  if (!account) return { ok: false, error: '먼저 로그인해 주세요.' };
  gameRunning = true;
  try {
    // Keep the log file small: start fresh when it gets big.
    try { if (fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) fs.rmSync(LOG_FILE); } catch {}
    // Refresh the login so the session is always valid when joining the server.
    const fresh = await restoreLogin();
    if (!fresh) {
      gameRunning = false;
      account = null;
      return { ok: false, error: '로그인이 만료됐어요. 다시 로그인해 주세요.', relogin: true };
    }
    const config = await loadConfig();
    serverAddress = config.serverAddress || '';
    const { done } = await prepareAndLaunch({
      root: GAME_DIR,
      config,
      auth: account.auth,
      memoryGB: readSettings().memoryGB,
      report: s => {
        send('progress', s);
        if (s.started) setTimeout(() => win && !win.isDestroyed() && win.minimize(), 1500);
      },
      onLog: l => log(l.trimEnd()),
    });
    done.then(code => {
      gameRunning = false;
      log('game closed with code ' + code);
      send('game-closed', { code, crashed: code !== 0 && code !== null });
      if (win && !win.isDestroyed()) {
        win.restore();
        win.focus();
      }
    });
    return { ok: true };
  } catch (e) {
    gameRunning = false;
    log('play failed: ' + (e?.stack || e));
    return { ok: false, error: e?.message || '게임을 시작하지 못했어요.' };
  }
});

ipcMain.handle('get-settings', () => ({
  ...readSettings(),
  autoGB: autoMemoryGB(),
  maxGB: maxMemoryGB(),
  totalGB: Math.round(os.totalmem() / 1024 ** 3),
}));

ipcMain.handle('set-settings', (_e, s) => {
  const max = maxMemoryGB();
  const memoryGB = Number.isInteger(s?.memoryGB) && s.memoryGB >= 2 && s.memoryGB <= max ? s.memoryGB : 'auto';
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ memoryGB }));
  return readSettings();
});

// Deletes downloaded game files so they are fetched again on the next start.
// Worlds, settings, screenshots and minimap data are kept.
const REPAIR_TARGETS = ['versions', 'libraries', 'assets', 'runtime', 'mods', '.fabric', 'launcher-mods.json'];
ipcMain.handle('repair', async () => {
  if (gameRunning) return { ok: false, error: '게임을 끈 다음에 복구할 수 있어요.' };
  try {
    for (const t of REPAIR_TARGETS) {
      fs.rmSync(path.join(GAME_DIR, t), { recursive: true, force: true, maxRetries: 3 });
    }
    log('repair: removed ' + REPAIR_TARGETS.join(', '));
    return { ok: true };
  } catch (e) {
    log('repair failed: ' + (e?.message || e));
    return { ok: false, error: '일부 파일을 지우지 못했어요. 컴퓨터를 다시 켠 뒤 해보세요.' };
  }
});

// Online/offline and player count for the main screen. Only ever pings the
// address from our own (checked) config, never one the page sends.
let serverAddress = '';
ipcMain.handle('server-status', async () => {
  if (!serverAddress) return { online: false, none: true };
  return pingServer(serverAddress);
});

// Copies the end of the launcher log so a friend can paste it to the server owner.
// Login tokens are already hidden when the log is written; hide them again to be safe.
ipcMain.handle('copy-log', () => {
  flushLog();
  let text = '';
  try {
    const data = fs.readFileSync(LOG_FILE, 'utf8');
    text = data.slice(-60000);
    const cut = text.indexOf('\n');
    if (data.length > 60000 && cut >= 0) text = text.slice(cut + 1);
  } catch {}
  const header = [
    `주영런처 v${app.getVersion()} · ${os.platform()} ${os.release()} · 램 ${Math.round(os.totalmem() / 1024 ** 3)}GB`,
    `메모리 설정: ${readSettings().memoryGB}`,
    '----',
  ].join('\n');
  clipboard.writeText(redact(header + '\n' + (text || '(기록 없음)')));
  return { ok: true, empty: !text };
});

ipcMain.handle('open-folder', () => {
  fs.mkdirSync(GAME_DIR, { recursive: true });
  shell.openPath(GAME_DIR);
});
ipcMain.on('win-minimize', () => win?.minimize());
ipcMain.on('win-close', () => win?.close());
