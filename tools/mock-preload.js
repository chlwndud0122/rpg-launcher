const { contextBridge } = require('electron');
const state = process.argv.find(a => a.startsWith('--state='))?.split('=')[1] || 'out';
let progressCb;
contextBridge.exposeInMainWorld('launcher', {
  init: async () => ({ config: { serverName: '우리들의 RPG 서버', subtitle: '친구들과 함께하는 모험', serverAddress: state === 'out' ? '' : 'rpg.example.com', minecraftVersion: '1.21.11' },
    account: state === 'out' ? null : { name: 'Steve_Adventurer', uuid: '8667ba71b85a4004af54457a9734eed7' } }),
  login: async () => ({ ok: false }), logout: async () => true,
  play: async () => { setTimeout(() => progressCb && progressCb({ step: '모드 받는 중 (3/5) xaeros-minimap.jar', progress: 0.55 }), 50); return new Promise(()=>{}); },
  openFolder: () => {}, minimize: () => {}, close: () => {},
  onProgress: cb => { progressCb = cb; }, onGameClosed: () => {},
  installUpdate: async () => true, onUpdateReady: cb => { if (state === 'busy') setTimeout(() => cb({ version: '1.0.1' }), 100); },
});
