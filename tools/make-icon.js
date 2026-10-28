// Draws the launcher icon (pixel-art sword over a shield) and saves build/icon.png (256x256).
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,<canvas id=c width=256 height=256></canvas>');
  const data = await w.webContents.executeJavaScript(`(() => {
    const c = document.getElementById('c').getContext('2d');
    const P = 16, px = (x,y,col)=>{c.fillStyle=col;c.fillRect(x*P,y*P,P,P)};
    // rounded dark background
    c.fillStyle='#1a1630'; c.beginPath(); c.roundRect(0,0,256,256,48); c.fill();
    const g=c.createRadialGradient(128,200,10,128,200,180); g.addColorStop(0,'rgba(240,181,74,.45)'); g.addColorStop(1,'rgba(240,181,74,0)');
    c.fillStyle=g; c.beginPath(); c.roundRect(0,0,256,256,48); c.fill();
    // diagonal pixel sword (16x16 grid)
    const L=(pts,col)=>pts.forEach(([x,y])=>px(x,y,col));
    L([[13,2],[12,3],[11,4],[10,5],[9,6],[8,7]],'#ffffff');
    L([[14,2],[13,3],[12,4],[11,5],[10,6],[9,7],[8,8]],'#dfe4ee');
    L([[14,3],[13,4],[12,5],[11,6],[10,7],[9,8]],'#9aa4b8');
    L([[6,7],[7,8],[8,9],[9,10],[10,11]],'#f0b54a');
    L([[6,7],[10,11]],'#d9902a');
    L([[7,10],[6,11],[5,12]],'#8a5a2b');
    L([[3,13],[4,13],[3,14],[4,14]],'#f0b54a');
    L([[3,14]],'#d9902a');
    return document.getElementById('c').toDataURL('image/png');
  })()`);
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), Buffer.from(data.split(',')[1], 'base64'));
  app.quit();
});
