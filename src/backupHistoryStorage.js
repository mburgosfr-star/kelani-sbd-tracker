import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { getDesktopBridge } from './desktopRuntime';

export const NATIVE_BACKUP_ROOT = 'Kelani SBD Tracker/Automatic Backups';
const HISTORY_ROOT = `${NATIVE_BACKUP_ROOT}/History`;
export const backupFileMissing = error => ['ENOENT', 'OS-PLUG-FILE-0008'].includes(error?.code);
const validName = name => name === 'kelani-before-restore.json' || /^kelani-day-\d{4}-\d{2}-\d{2}\.json$/.test(name);
export function getBackupHistoryIO(validate = backup => backup?.storageKey === 'kel-powerlifting-user-data-v1' && Boolean(backup.data)) {
  const bridge = getDesktopBridge();
  if (bridge) return {
    list: () => bridge.backupHistory({ action: 'list' }),
    async read(name) {
      const result = await bridge.backupHistory({ action: 'read', name });
      if (result === null) throw Object.assign(new Error('Backup not found'), { code: 'ENOENT' });
      return result;
    },
    write: (name, json) => bridge.backupHistory({ action: 'write', name, json }),
    remove: name => bridge.backupHistory({ action: 'remove', name }),
    isMissing: backupFileMissing,
  };
  if (!Capacitor.isNativePlatform()) return null;
  const pathFor = name => {
    if (name === 'latest') return `${NATIVE_BACKUP_ROOT}/kelani-sbd-tracker-v2-autosave.json`;
    if (!validName(name)) throw new Error('Invalid backup filename');
    return `${HISTORY_ROOT}/${name}`;
  };
  return {
    async list() {
      try { return [...new Set((await Filesystem.readdir({ path: HISTORY_ROOT, directory: Directory.Documents })).files.map(file => file.name === 'kelani-before-restore.json.previous' ? 'kelani-before-restore.json' : file.name))]; }
      catch (error) { if (backupFileMissing(error)) return []; throw error; }
    },
    async read(name) {
      return readVerifiedNativeBackup(pathFor(name), validate);
    },
    async write(name, json) {
      if (!validName(name)) throw new Error('Invalid backup filename');
      await writeVerifiedNativeBackup(pathFor(name), json, { keepPrevious: name === 'kelani-before-restore.json' });
    },
    async remove(name) {
      if (!/^kelani-day-\d{4}-\d{2}-\d{2}\.json$/.test(name)) throw new Error('Invalid backup deletion');
      await Filesystem.deleteFile({ path: pathFor(name), directory: Directory.Documents });
    },
    isMissing: backupFileMissing,
  };
}
export async function readVerifiedNativeBackup(path, validate) {
  let originalError;
  for (const filename of [path, `${path}.previous`]) {
    try {
      const result = await Filesystem.readFile({ path: filename, directory: Directory.Documents, encoding: Encoding.UTF8 });
      if (!validate(JSON.parse(result.data))) throw new Error('Invalid backup');
      return result.data;
    } catch (error) { originalError ||= error; }
  }
  throw originalError;
}
export async function writeVerifiedNativeBackup(path, json, { keepPrevious = true } = {}) {
  const temporary = `${path}.tmp`;
  const options = { directory: Directory.Documents, encoding: Encoding.UTF8 };
  await Filesystem.writeFile({ ...options, path: temporary, data: json, recursive: true });
  if ((await Filesystem.readFile({ ...options, path: temporary })).data !== json) throw new Error('Backup verification failed');
  if (keepPrevious) {
    let previous;
    try {
      previous = (await Filesystem.readFile({ ...options, path })).data;
    } catch (error) { if (!backupFileMissing(error)) throw error; }
    // Never replace a previous recovery copy with damaged primary data.
    let usable = false;
    try {
      const backup = JSON.parse(previous);
      usable = backup?.storageKey === 'kel-powerlifting-user-data-v1' && Boolean(backup.data) &&
        typeof backup.exportedAt === 'string' && Number.isFinite(Date.parse(backup.exportedAt));
    } catch { /* Invalid primary data is not a recovery copy. */ }
    if (usable) {
      await Filesystem.writeFile({ ...options, path: `${path}.previous`, data: previous, recursive: true });
      if ((await Filesystem.readFile({ ...options, path: `${path}.previous` })).data !== previous) throw new Error('Previous backup verification failed');
    }
  }
  // Capacitor's Android implementation deletes the destination before moving.
  // The verified previous copy provides recovery across a failed replacement.
  await Filesystem.rename({ from: temporary, to: path, directory: Directory.Documents, toDirectory: Directory.Documents });
  const result = await Filesystem.readFile({ ...options, path });
  if (result.data !== json) throw new Error('Backup verification failed');
  return result;
}
