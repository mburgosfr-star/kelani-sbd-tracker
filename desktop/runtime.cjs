const fs = require('node:fs/promises');
const path = require('node:path');

const APP_ORIGIN = 'kelani://app';
const MAX_BACKUP_BYTES = 32 * 1024 * 1024;

function isAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'kelani:' && url.host === 'app' && !url.username && !url.password;
  } catch { return false; }
}

function resolveAssetPath(root, value) {
  if (!isAppUrl(value)) return null;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    if (pathname.includes('\\') || pathname.includes('\0')) return null;
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, target);
    return relative.startsWith('..') || path.isAbsolute(relative) ? null : target;
  } catch { return null; }
}

function isAllowedExternalUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === 'mailto:') return url.pathname.toLowerCase() === 'mburgosfr@gmail.com';
    return url.protocol === 'https:' && ['github.com', 'apt.izzysoft.de', 'android.izzysoft.de'].includes(url.hostname);
  } catch { return false; }
}

function validateBackupText(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json) > MAX_BACKUP_BYTES) throw new Error('Invalid backup size');
  const value = JSON.parse(json);
  if (value?.backupVersion !== 1 || value.storageKey !== 'kel-powerlifting-user-data-v1' ||
      !value.data || typeof value.data !== 'object' || Array.isArray(value.data) ||
      typeof value.exportedAt !== 'string') throw new Error('Invalid backup format');
  return json;
}

async function writeVerifiedBackup(filename, json, { keepPrevious = false } = {}) {
  validateBackupText(json);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = filename + '.tmp';
  try {
    await fs.writeFile(temporary, json, { encoding: 'utf8', mode: 0o600 });
    const saved = await fs.readFile(temporary, 'utf8');
    if (saved !== json) throw new Error('Backup verification failed');
    validateBackupText(saved);
    if (keepPrevious) {
      try { await fs.copyFile(filename, filename + '.previous'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await fs.rename(temporary, filename);
    const data = await fs.readFile(filename, 'utf8');
    if (data !== json) throw new Error('Backup verification failed');
    return { data, path: filename };
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function normalizeTimer(value) {
  if (!value || !Number.isInteger(value.id) || !Number.isFinite(value.at) || value.at <= 0 ||
      typeof value.title !== 'string' || typeof value.body !== 'string') return null;
  return { id: value.id, at: value.at, title: value.title.slice(0, 160), body: value.body.slice(0, 500) };
}

function createTimerController({ now = Date.now, setTimeout: schedule = setTimeout, clearTimeout: cancel = clearTimeout, save, notify }) {
  let pending = null;
  let timeout = null;
  const tick = () => {
    if (timeout !== null) cancel(timeout);
    timeout = null;
    if (!pending) return;
    if (pending.at > now()) {
      timeout = schedule(tick, Math.min(pending.at - now(), 2 ** 31 - 1));
      return;
    }
    const elapsed = pending;
    save(null);
    pending = null;
    notify(elapsed);
  };
  return {
    schedule(value) {
      const next = normalizeTimer(value);
      if (!next) throw new Error('Invalid timer');
      save(next);
      pending = next;
      tick();
      return { scheduled: true, id: next.id, at: next.at, method: 'desktop' };
    },
    cancel() {
      save(null);
      pending = null;
      if (timeout !== null) cancel(timeout);
      timeout = null;
    },
    getPending() { return pending ? { ...pending, pending: true } : { pending: false }; },
    resume: tick,
  };
}

module.exports = { APP_ORIGIN, isAppUrl, resolveAssetPath, isAllowedExternalUrl, validateBackupText, writeVerifiedBackup, normalizeTimer, createTimerController };
