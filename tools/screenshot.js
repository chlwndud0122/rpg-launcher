const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const state = process.argv.find(a => a.startsWith('--state='))?.split('=')[1] || 'out';
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 960, height: 600, x: -3000, y: 0, frame: false, show: false, backgroundColor: '#0f1115',
    webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), additionalArguments: ['--state=' + state], contextIsolation: true, sandbox: false, backgroundThrottling: false } });
  await w.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  w.showInactive();
  await new Promise(r => setTimeout(r, 2500));
  const art = process.argv.find(a => a.startsWith('--art='))?.split('=')[1];
  if (art) { await w.webContents.executeJavaScript(`(() => { const el = document.querySelector('.art'); el.style.backgroundImage = getComputedStyle(el).backgroundImage.replace('hero.jpg', 'hero-${art}.jpg'); })()`); await new Promise(r => setTimeout(r, 800)); }
  if (state.startsWith('settings')) { await w.webContents.executeJavaScript("document.getElementById('btn-settings').click()"); await new Promise(r => setTimeout(r, 600)); }
  if (state === 'busy') { await w.webContents.executeJavaScript("document.getElementById('btn-play').click()"); await new Promise(r => setTimeout(r, 600)); }
  const img = await w.webContents.capturePage();
  fs.writeFileSync(process.argv.find(a => a.startsWith('--out='))?.split('=')[1], img.toPNG());
  app.quit();
});
