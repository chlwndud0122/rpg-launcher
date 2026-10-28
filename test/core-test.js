// Headless test: installs everything into a test folder and boots the game with an offline test account.
const path = require('path');
const { Authenticator } = require('minecraft-launcher-core');
const { prepareAndLaunch } = require('../core/game');
const config = require('../launcher.config.json');
const root = process.argv[2];
(async () => {
  const auth = await Authenticator.getAuth('TestPlayer');
  let last = '';
  const t0 = Date.now();
  const { proc, done } = await prepareAndLaunch({
    root, config, auth, memoryGB: process.env.MEM ? Number(process.env.MEM) : 'auto',
    report: s => { const m = `${s.step} ${s.progress != null ? Math.round(s.progress*100)+'%' : ''}`; if (m !== last && !/%/.test(last) || s.started) console.log(((Date.now()-t0)/1000).toFixed(0)+'s', m); last = m; if (s.started) console.log('STARTED'); },
    onLog: l => {
      const mx = l.match(/-Xmx[0-9]+[GM]/); if (mx) console.log('MEMORY ARG', mx[0]); if (/ERROR|Exception|xaero|sodium|Loading \d+ mods|fabric/i.test(l)) process.stdout.write('  | ' + l.split('\n')[0].slice(0,200) + '\n'); if (/Sound engine started|Created: .*textures/i.test(l)) { console.log('GAME READY at', ((Date.now()-t0)/1000).toFixed(0)+'s'); setTimeout(()=>proc.kill(), 3000); } },
  });
  const code = await done; console.log('exit', code); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
