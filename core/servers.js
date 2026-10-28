// Puts our server at the top of the in-game multiplayer list (servers.dat).
// Servers that friends added themselves are kept as they are.
const fs = require('fs');
const path = require('path');

// --- Minimal NBT (uncompressed, big-endian) reader/writer ---
// Values are kept as { type, value } so unknown fields are written back unchanged.
const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };

function readNbt(buf) {
  let o = 0;
  const need = n => { if (o + n > buf.length) throw new Error('servers.dat is cut off'); };
  const str = () => { need(2); const len = buf.readUInt16BE(o); o += 2; need(len); const s = buf.toString('utf8', o, o + len); o += len; return s; };
  const payload = type => {
    switch (type) {
      case T.BYTE: need(1); return buf.readInt8(o++);
      case T.SHORT: need(2); o += 2; return buf.readInt16BE(o - 2);
      case T.INT: need(4); o += 4; return buf.readInt32BE(o - 4);
      case T.LONG: need(8); o += 8; return buf.readBigInt64BE(o - 8);
      case T.FLOAT: need(4); o += 4; return buf.readFloatBE(o - 4);
      case T.DOUBLE: need(8); o += 8; return buf.readDoubleBE(o - 8);
      case T.BYTE_ARRAY: { need(4); const n = buf.readInt32BE(o); o += 4; need(n); const v = Buffer.from(buf.subarray(o, o + n)); o += n; return v; }
      case T.STRING: return str();
      case T.LIST: {
        need(5); const itemType = buf.readUInt8(o); const n = buf.readInt32BE(o + 1); o += 5;
        const items = []; for (let i = 0; i < n; i++) items.push(payload(itemType));
        return { itemType, items };
      }
      case T.COMPOUND: {
        const entries = [];
        for (;;) {
          need(1); const t = buf.readUInt8(o++);
          if (t === T.END) break;
          const name = str();
          entries.push([name, { type: t, value: payload(t) }]);
        }
        return entries;
      }
      case T.INT_ARRAY: { need(4); const n = buf.readInt32BE(o); o += 4; const v = []; for (let i = 0; i < n; i++) { need(4); v.push(buf.readInt32BE(o)); o += 4; } return v; }
      case T.LONG_ARRAY: { need(4); const n = buf.readInt32BE(o); o += 4; const v = []; for (let i = 0; i < n; i++) { need(8); v.push(buf.readBigInt64BE(o)); o += 8; } return v; }
      default: throw new Error('unknown NBT tag ' + type);
    }
  };
  need(1);
  if (buf.readUInt8(o++) !== T.COMPOUND) throw new Error('servers.dat does not start with a compound');
  str(); // root name
  return payload(T.COMPOUND);
}

function writeNbt(rootEntries) {
  const parts = [];
  const u8 = v => { const b = Buffer.alloc(1); b.writeUInt8(v); parts.push(b); };
  const str = s => { const b = Buffer.from(s, 'utf8'); const l = Buffer.alloc(2); l.writeUInt16BE(b.length); parts.push(l, b); };
  const payload = (type, v) => {
    const b = Buffer.alloc(8);
    switch (type) {
      case T.BYTE: b.writeInt8(v); parts.push(b.subarray(0, 1)); break;
      case T.SHORT: b.writeInt16BE(v); parts.push(b.subarray(0, 2)); break;
      case T.INT: b.writeInt32BE(v); parts.push(b.subarray(0, 4)); break;
      case T.LONG: b.writeBigInt64BE(v); parts.push(b); break;
      case T.FLOAT: b.writeFloatBE(v); parts.push(b.subarray(0, 4)); break;
      case T.DOUBLE: b.writeDoubleBE(v); parts.push(b); break;
      case T.BYTE_ARRAY: b.writeInt32BE(v.length); parts.push(Buffer.from(b.subarray(0, 4)), v); break;
      case T.STRING: str(v); break;
      case T.LIST: u8(v.itemType); b.writeInt32BE(v.items.length); parts.push(Buffer.from(b.subarray(0, 4))); for (const it of v.items) payload(v.itemType, it); break;
      case T.COMPOUND: for (const [name, tag] of v) { u8(tag.type); str(name); payload(tag.type, tag.value); } u8(T.END); break;
      case T.INT_ARRAY: b.writeInt32BE(v.length); parts.push(Buffer.from(b.subarray(0, 4))); for (const n of v) { const x = Buffer.alloc(4); x.writeInt32BE(n); parts.push(x); } break;
      case T.LONG_ARRAY: b.writeInt32BE(v.length); parts.push(Buffer.from(b.subarray(0, 4))); for (const n of v) { const x = Buffer.alloc(8); x.writeBigInt64BE(n); parts.push(x); } break;
      default: throw new Error('unknown NBT tag ' + type);
    }
  };
  u8(T.COMPOUND); str('');
  payload(T.COMPOUND, rootEntries);
  return Buffer.concat(parts);
}

// --- servers.dat handling ---
const ipOf = entries => {
  const e = entries.find(([n]) => n === 'ip');
  return e && e[1].type === T.STRING ? e[1].value.trim().toLowerCase() : '';
};

/**
 * Makes sure `address` is the first entry in the multiplayer list, named `name`.
 * The address we added last time is replaced if the server moved.
 * Returns true when the file was changed.
 */
function ensureServerEntry(root, name, address) {
  if (!address) return false;
  const file = path.join(root, 'servers.dat');
  const memoFile = path.join(root, 'launcher-server.json');
  const want = address.trim().toLowerCase();
  let previous = '';
  try { previous = String(JSON.parse(fs.readFileSync(memoFile, 'utf8')).address || '').toLowerCase(); } catch {}

  let rootEntries = [];
  if (fs.existsSync(file)) {
    try {
      rootEntries = readNbt(fs.readFileSync(file));
    } catch {
      // Unreadable file: keep a copy and start a fresh list.
      fs.copyFileSync(file, file + '.broken');
      rootEntries = [];
    }
  }
  let listTag = rootEntries.find(([n]) => n === 'servers');
  if (!listTag || listTag[1].type !== T.LIST || (listTag[1].value.items.length && listTag[1].value.itemType !== T.COMPOUND)) {
    rootEntries = rootEntries.filter(([n]) => n !== 'servers');
    listTag = ['servers', { type: T.LIST, value: { itemType: T.COMPOUND, items: [] } }];
    rootEntries.push(listTag);
  }
  const list = listTag[1].value;
  list.itemType = T.COMPOUND;

  const ours = list.items.find(e => ipOf(e) === want);
  const others = list.items.filter(e => {
    const ip = ipOf(e);
    return ip !== want && !(previous && ip === previous);
  });
  const entry = ours || [['ip', { type: T.STRING, value: address }]];
  const nameTag = entry.find(([n]) => n === 'name');
  const changedName = !nameTag || nameTag[1].value !== name;
  if (nameTag) nameTag[1] = { type: T.STRING, value: name };
  else entry.unshift(['name', { type: T.STRING, value: name }]);

  const alreadyFirst = list.items[0] === ours && others.length === list.items.length - 1;
  list.items = [entry, ...others];
  if (!(alreadyFirst && !changedName && fs.existsSync(file))) {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(file + '.tmp', writeNbt(rootEntries));
    fs.renameSync(file + '.tmp', file);
  }
  fs.writeFileSync(memoFile, JSON.stringify({ address }));
  return !alreadyFirst || changedName;
}

module.exports = { ensureServerEntry, readNbt, writeNbt };
