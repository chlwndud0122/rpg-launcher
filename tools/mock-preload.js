// Fake launcher API for UI screenshots (tools/screenshot.js). Not shipped.
const { contextBridge } = require('electron');
const state = process.argv.find(a => a.startsWith('--state='))?.split('=')[1] || 'out';
const loggedIn = state !== 'out';
let progressCb;
let updateCb;
contextBridge.exposeInMainWorld('launcher', {
  init: async () => {
    if (state === 'update') setTimeout(() => updateCb && updateCb({ version: '1.0.6' }), 200);
    return {
      config: { serverName: '우리들의 RPG 서버', subtitle: '', serverAddress: loggedIn ? '161.33.209.62' : '', minecraftVersion: '26.2' },
      account: loggedIn ? { name: 'choijooyoung', uuid: 'd499fe8881194b3490849842d69c2b07' } : null,
      version: '1.0.6',
      updateReady: false,
    };
  },
  login: async () => ({ ok: false }),
  logout: async () => true,
  play: async () => {
    setTimeout(() => progressCb && progressCb({ step: '모드 받는 중 (3/5) xaeros-minimap.jar', progress: 0.55 }), 50);
    return new Promise(() => {});
  },
  getSettings: async () => ({ memoryGB: state === 'settings-custom' ? 12 : 'auto', autoGB: 6, maxGB: 13, totalGB: 16 }),
  setSettings: async s => s,
  repair: async () => ({ ok: true }),
  openFolder: () => {},
  minimize: () => {},
  close: () => {},
  onProgress: cb => { progressCb = cb; },
  installUpdate: async () => true,
  onUpdateReady: cb => { updateCb = cb; },
  onGameClosed: () => {},
  serverStatus: async () => ({ online: true, players: { online: 3, max: 10 } }),
  copyLog: async () => ({ ok: true }),
});
