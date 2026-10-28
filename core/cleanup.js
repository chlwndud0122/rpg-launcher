// Removes game files from older Minecraft versions after a version change,
// so friends never need the "repair" button just to free up space.
// Only touches `versions/<id>` and `runtime/java-<n>` folders inside the game folder.
// Worlds, settings, screenshots, mods and shared libraries/assets are left alone.
const fs = require('fs');
const path = require('path');

const VERSION_ID = /^[0-9a-z][0-9a-z.+_-]{0,80}$/i;
const JAVA_DIR = /^java-\d{1,3}$/;

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    return true;
  } catch {
    return false; // in use or locked: try again next time
  }
}

/**
 * @param {string} root        game folder
 * @param {string[]} keepVersions  version folder names still in use (e.g. '26.2', 'fabric-loader-x-26.2')
 * @param {string|null} javaPath  path to the javaw we are about to use
 * @returns {string[]} removed folder names (relative to root)
 */
function removeOldVersions(root, keepVersions, javaPath) {
  const removed = [];
  const keep = new Set(keepVersions);

  const versionsDir = path.join(root, 'versions');
  if (fs.existsSync(versionsDir)) {
    for (const name of fs.readdirSync(versionsDir)) {
      if (keep.has(name) || !VERSION_ID.test(name)) continue;
      const p = path.join(versionsDir, name);
      if (fs.lstatSync(p).isDirectory() && removeDir(p)) removed.push(path.join('versions', name));
    }
  }

  const runtimeDir = path.join(root, 'runtime');
  if (javaPath && fs.existsSync(runtimeDir)) {
    const rel = path.relative(runtimeDir, javaPath).split(path.sep)[0];
    if (JAVA_DIR.test(rel)) {
      for (const name of fs.readdirSync(runtimeDir)) {
        if (name === rel || !JAVA_DIR.test(name)) continue;
        const p = path.join(runtimeDir, name);
        if (fs.lstatSync(p).isDirectory() && removeDir(p)) removed.push(path.join('runtime', name));
      }
    }
  }
  return removed;
}

module.exports = { removeOldVersions };
