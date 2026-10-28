// Offline tests for the server list (servers.dat) and old-version cleanup.
// Run: node test/servers-test.js [path-to-a-real-servers.dat]
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { ensureServerEntry, readNbt, writeNbt } = require('../core/servers');
const { removeOldVersions } = require('../core/cleanup');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-launcher-test-'));
const servers = root => {
  const list = readNbt(fs.readFileSync(path.join(root, 'servers.dat'))).find(([n]) => n === 'servers')[1].value.items;
  return list.map(e => Object.fromEntries(e.map(([k, t]) => [k, t.value])));
};
let passed = 0;
const test = (name, fn) => { const dir = fs.mkdtempSync(path.join(tmp, 'case-')); fn(dir); passed++; console.log('ok -', name); };

test('creates the list when there is no servers.dat', dir => {
  assert.strictEqual(ensureServerEntry(dir, '우리들의 RPG 서버', '161.33.209.62'), true);
  assert.deepStrictEqual(servers(dir), [{ name: '우리들의 RPG 서버', ip: '161.33.209.62' }]);
});

test('keeps servers friends added, with all their fields, and puts ours first', dir => {
  const friend = [
    ['name', { type: 8, value: 'Hypixel' }],
    ['ip', { type: 8, value: 'mc.hypixel.net' }],
    ['icon', { type: 8, value: 'iVBORw0KGgo=' }],
    ['acceptTextures', { type: 1, value: 1 }],
  ];
  fs.writeFileSync(path.join(dir, 'servers.dat'), writeNbt([['servers', { type: 9, value: { itemType: 10, items: [friend] } }]]));
  ensureServerEntry(dir, 'RPG', '161.33.209.62');
  const s = servers(dir);
  assert.strictEqual(s.length, 2);
  assert.strictEqual(s[0].ip, '161.33.209.62');
  assert.deepStrictEqual(s[1], { name: 'Hypixel', ip: 'mc.hypixel.net', icon: 'iVBORw0KGgo=', acceptTextures: 1 });
});

test('running again changes nothing', dir => {
  ensureServerEntry(dir, 'RPG', '161.33.209.62');
  const before = fs.readFileSync(path.join(dir, 'servers.dat'));
  assert.strictEqual(ensureServerEntry(dir, 'RPG', '161.33.209.62'), false);
  assert.deepStrictEqual(fs.readFileSync(path.join(dir, 'servers.dat')), before);
});

test('replaces the old address when the server moves, keeps a server icon', dir => {
  ensureServerEntry(dir, 'RPG', '1.2.3.4');
  const file = path.join(dir, 'servers.dat');
  const nbt = readNbt(fs.readFileSync(file));
  nbt[0][1].value.items[0].push(['icon', { type: 8, value: 'abc' }]);
  fs.writeFileSync(file, writeNbt(nbt));
  ensureServerEntry(dir, 'RPG', '161.33.209.62');
  assert.deepStrictEqual(servers(dir).map(s => s.ip), ['161.33.209.62']);
});

test('moves our server back to the top and renames it', dir => {
  ensureServerEntry(dir, 'Old name', '161.33.209.62');
  const file = path.join(dir, 'servers.dat');
  const nbt = readNbt(fs.readFileSync(file));
  nbt[0][1].value.items.unshift([['name', { type: 8, value: 'Other' }], ['ip', { type: 8, value: 'other.example' }]]);
  fs.writeFileSync(file, writeNbt(nbt));
  ensureServerEntry(dir, 'New name', '161.33.209.62');
  assert.deepStrictEqual(servers(dir).map(s => s.name), ['New name', 'Other']);
});

test('a broken servers.dat is kept as .broken and replaced', dir => {
  fs.writeFileSync(path.join(dir, 'servers.dat'), Buffer.from([10, 0, 0, 9, 0]));
  ensureServerEntry(dir, 'RPG', '161.33.209.62');
  assert.ok(fs.existsSync(path.join(dir, 'servers.dat.broken')));
  assert.strictEqual(servers(dir)[0].ip, '161.33.209.62');
});

test('removes old Minecraft versions and Java, keeps the current ones and everything else', dir => {
  const mk = p => fs.mkdirSync(path.join(dir, p), { recursive: true });
  ['versions/1.21.11', 'versions/fabric-loader-0.17.2-1.21.11', 'versions/26.2', 'versions/fabric-loader-0.18.0-26.2',
   'runtime/java-21/jdk-21/bin', 'runtime/java-25/jdk-25/bin', 'saves/world', 'libraries/x', 'assets/indexes', 'mods'].forEach(mk);
  const javaw = path.join(dir, 'runtime', 'java-25', 'jdk-25', 'bin', 'javaw.exe');
  fs.writeFileSync(javaw, '');
  const removed = removeOldVersions(dir, ['26.2', 'fabric-loader-0.18.0-26.2'], javaw).map(p => p.replace(/\\/g, '/')).sort();
  assert.deepStrictEqual(removed, ['runtime/java-21', 'versions/1.21.11', 'versions/fabric-loader-0.17.2-1.21.11']);
  for (const p of ['versions/26.2', 'versions/fabric-loader-0.18.0-26.2', 'runtime/java-25', 'saves/world', 'libraries/x', 'assets/indexes', 'mods']) {
    assert.ok(fs.existsSync(path.join(dir, p)), p + ' should be kept');
  }
});

test('does not touch Java when the Java path is outside the game folder', dir => {
  fs.mkdirSync(path.join(dir, 'runtime', 'java-21'), { recursive: true });
  removeOldVersions(dir, [], 'C:\\Program Files\\Java\\bin\\javaw.exe');
  assert.ok(fs.existsSync(path.join(dir, 'runtime', 'java-21')));
});

// Optional: read a real servers.dat written by Minecraft and check it survives a round trip.
const real = process.argv[2];
if (real && fs.existsSync(real)) {
  test('real servers.dat round-trips byte for byte', () => {
    const buf = fs.readFileSync(real);
    assert.deepStrictEqual(writeNbt(readNbt(buf)), buf);
  });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} tests passed`);
