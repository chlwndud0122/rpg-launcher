const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  init: () => ipcRenderer.invoke('init'),
  login: () => ipcRenderer.invoke('login'),
  logout: () => ipcRenderer.invoke('logout'),
  play: () => ipcRenderer.invoke('play'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  minimize: () => ipcRenderer.send('win-minimize'),
  close: () => ipcRenderer.send('win-close'),
  onProgress: cb => ipcRenderer.on('progress', (_e, d) => cb(d)),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: s => ipcRenderer.invoke('set-settings', s),
  repair: () => ipcRenderer.invoke('repair'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateReady: cb => ipcRenderer.on('update-ready', (_e, d) => cb(d)),
  onGameClosed: cb => ipcRenderer.on('game-closed', (_e, d) => cb(d)),
  serverStatus: () => ipcRenderer.invoke('server-status'),
  copyLog: () => ipcRenderer.invoke('copy-log'),
});
