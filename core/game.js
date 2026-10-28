// Prepares everything (Java, Fabric, mods) and starts Minecraft.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const { ensureJava } = require('./java');
const { ensureFabric, syncMods } = require('./mods');

function autoMemory() {
  const gb = os.totalmem() / 1024 ** 3;
  if (gb >= 15) return { max: '6G', min: '2G' };
  if (gb >= 7) return { max: '4G', min: '2G' };
  return { max: '2G', min: '1G' };
}

// First run only: set the game language and a few friendly defaults.
function writeDefaultOptions(root, config) {
  const file = path.join(root, 'options.txt');
  if (fs.existsSync(file)) return;
  const lines = [
    `lang:${config.language || 'ko_kr'}`,
    'onboardAccessibility:false',
    'skipMultiplayerWarning:true',
    'tutorialStep:none',
  ];
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

function parseAddress(addr) {
  const a = (addr || '').trim();
  return a || null;
}

/**
 * @param {object} p
 * @param {string} p.root       game folder
 * @param {object} p.config     launcher.config.json contents
 * @param {object} p.auth       MCLC user object
 * @param {(s:{step:string,progress?:number})=>void} p.report
 * @param {(line:string)=>void} [p.onLog]
 * @returns {Promise<{client: Client, done: Promise<number>}>}
 */
async function prepareAndLaunch({ root, config, auth, report: rawReport, onLog = () => {} }) {
  const mc = config.minecraftVersion;
  // Send at most ~10 progress updates per second (always send step changes).
  let lastStep = '';
  let lastAt = 0;
  const report = s => {
    const now = Date.now();
    if (s.step !== lastStep || s.started || now - lastAt > 100) {
      lastStep = s.step;
      lastAt = now;
      rawReport(s);
    }
  };
  fs.mkdirSync(root, { recursive: true });

  report({ step: '자바 확인 중', progress: 0 });
  const javaPath = await ensureJava(root, mc, report);

  report({ step: '모드 로더 확인 중', progress: 0 });
  const fabricId = await ensureFabric(root, mc, config.fabricLoader);

  report({ step: '모드 확인 중', progress: 0 });
  await syncMods(root, mc, config.mods || [], report);

  writeDefaultOptions(root, config);

  const client = new Client();
  const server = parseAddress(config.serverAddress);
  const opts = {
    root,
    authorization: auth,
    javaPath,
    version: { number: mc, type: 'release', custom: fabricId },
    memory: autoMemory(),
    overrides: { detached: false, maxSockets: 16 },
    launcherName: 'rpg-launcher',
  };
  if (server) opts.quickPlay = { type: 'multiplayer', identifier: server };

  let started = false;
  const done = new Promise(resolve => {
    client.on('close', code => resolve(code));
  });
  client.on('progress', e => {
    if (started) return;
    const names = { assets: '게임 리소스', natives: '게임 구성 요소', classes: '게임 라이브러리' };
    const label = names[e.type] || '게임 파일';
    report({ step: `${label} 받는 중`, progress: e.total ? e.task / e.total : 0 });
  });
  client.on('debug', l => onLog('[launcher] ' + l));
  client.on('data', l => {
    onLog(l);
    if (!started && /Setting user:|LWJGL|Backend library/i.test(l)) {
      started = true;
      report({ step: '게임 시작됨', progress: 1, started: true });
    }
  });

  report({ step: '게임 파일 확인 중', progress: 0 });
  const proc = await client.launch(opts);
  if (!proc) throw new Error('게임을 시작하지 못했어요.');
  return { client, proc, done };
}

module.exports = { prepareAndLaunch };
