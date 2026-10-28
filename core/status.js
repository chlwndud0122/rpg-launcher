// Asks the Minecraft server whether it is online and how many players are on
// (the same "server list ping" the game uses for the multiplayer screen).
const net = require('net');

function varint(n) {
  const out = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return Buffer.from(out);
}

// Reads a VarInt at `offset`; returns [value, bytesUsed] or null if incomplete.
function readVarint(buf, offset) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buf.length) return null;
    const b = buf[offset + i];
    value |= (b & 0x7f) << (7 * i);
    if (!(b & 0x80)) return [value >>> 0, i + 1];
  }
  throw new Error('bad varint');
}

function parseAddress(address) {
  const m = /^([^:]+)(?::(\d{1,5}))?$/.exec((address || '').trim());
  if (!m) return null;
  const port = m[2] ? Number(m[2]) : 25565;
  return port > 0 && port < 65536 ? { host: m[1], port } : null;
}

/**
 * @returns {Promise<{online: boolean, players?: {online: number, max: number}, ms?: number}>}
 */
function pingServer(address, timeoutMs = 4000) {
  const target = parseAddress(address);
  if (!target) return Promise.resolve({ online: false });
  return new Promise(resolve => {
    const started = Date.now();
    let buf = Buffer.alloc(0);
    let finished = false;
    const done = result => {
      if (finished) return;
      finished = true;
      sock.destroy();
      resolve(result);
    };
    const sock = net.connect({ host: target.host, port: target.port });
    sock.setTimeout(timeoutMs, () => done({ online: false }));
    sock.on('error', () => done({ online: false }));
    sock.on('connect', () => {
      const host = Buffer.from(target.host, 'utf8');
      const port = Buffer.from([target.port >> 8, target.port & 0xff]);
      const body = Buffer.concat([varint(0x00), varint(-1) /* any protocol version is fine for a status check */, varint(host.length), host, port, varint(1)]);
      sock.write(Buffer.concat([varint(body.length), body]));
      sock.write(Buffer.from([0x01, 0x00])); // status request
    });
    sock.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > 1024 * 1024) return done({ online: false });
      try {
        const len = readVarint(buf, 0);
        if (!len || buf.length < len[1] + len[0]) return;
        let o = len[1];
        const id = readVarint(buf, o); o += id[1];
        const strLen = readVarint(buf, o); o += strLen[1];
        const status = JSON.parse(buf.toString('utf8', o, o + strLen[0]));
        const online = Number(status?.players?.online);
        const max = Number(status?.players?.max);
        done({
          online: true,
          players: { online: Number.isFinite(online) ? online : 0, max: Number.isFinite(max) ? max : 0 },
          ms: Date.now() - started,
        });
      } catch {
        done({ online: false });
      }
    });
  });
}

module.exports = { pingServer, parseAddress };
