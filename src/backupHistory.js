export const BACKUP_HISTORY_DAYS_KEY = 'kelani-backup-history-days';
export const BACKUP_HISTORY_OPTIONS = [0, 7, 30, 90];
export const BACKUP_SAFETY_FILE = 'kelani-before-restore.json';
const DAILY = /^kelani-day-(\d{4}-\d{2}-\d{2})\.json$/;

export function backupHistoryDays(storage) {
  const saved = storage.getItem(BACKUP_HISTORY_DAYS_KEY);
  return saved !== null && BACKUP_HISTORY_OPTIONS.includes(Number(saved)) ? Number(saved) : 30;
}
export function backupDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid backup date');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function isDailyBackup(name) {
  const day = DAILY.exec(name)?.[1];
  const date = day ? new Date(`${day}T00:00:00Z`) : null;
  return Boolean(date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day);
}

// The adapter owns a dedicated history directory. Only our daily filenames
// may be pruned; the latest backup, safety copy and manual exports are excluded.
export function createBackupHistory({ io, validate, storage, now = () => new Date() }) {
  async function read(name) {
    const backup = JSON.parse(await io.read(name));
    if (!validate(backup)) throw new Error('Invalid backup');
    return backup;
  }
  async function write(name, backup) {
    if (!validate(backup)) throw new Error('Invalid backup');
    const json = JSON.stringify(backup, null, 2);
    await io.write(name, json);
    if (JSON.stringify(await read(name)) !== JSON.stringify(backup)) throw new Error('Backup verification failed');
  }
  async function record(backup, { prune = true } = {}) {
    if (!validate(backup)) throw new Error('Invalid backup');
    const days = backupHistoryDays(storage);
    const name = `kelani-day-${backupDay(backup.exportedAt)}.json`;
    if (days) await write(name, backup);
    if (!prune) return;
    // Caller has already verified the new latest backup. Verify today's
    // history copy too before removing any older recovery point.
    const files = (await io.list()).filter(isDailyBackup).sort().reverse();
    const today = backupDay(now());
    const cutoff = new Date(`${today}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
    const oldest = cutoff.toISOString().slice(0, 10);
    const retained = days ? [name, ...files.filter(file => file !== name && DAILY.exec(file)[1] >= oldest)].slice(0, days) : [];
    for (const file of files) if (!retained.includes(file)) await io.remove(file);
  }
  async function list({ latestOnly = false } = {}) {
    const names = ['latest', ...(latestOnly ? [] : (await io.list()).filter(name => isDailyBackup(name) || name === BACKUP_SAFETY_FILE))];
    const entries = [];
    let latest = null;
    for (const name of names) {
      try {
        const backup = await read(name);
        if (name === 'latest') latest = backup;
        else if (isDailyBackup(name) && latest && backup.exportedAt === latest.exportedAt &&
          JSON.stringify(backup.data) === JSON.stringify(latest.data)) continue;
        // Keep only previews in the list, not ninety copies of full training
        // history in memory. Re-read and validate the chosen file on selection.
        entries.push({ name, backup: latestOnly ? backup : {
          exportedAt: backup.exportedAt, appVersion: backup.appVersion, summary: backup.summary,
        } });
      } catch (error) {
        if (name === 'latest' && io.isMissing(error)) continue;
        entries.push({ name, error: true });
      }
    }
    return entries.sort((a, b) => String(b.backup?.exportedAt || '').localeCompare(String(a.backup?.exportedAt || '')));
  }

  return { read, record, list, saveSafety: backup => write(BACKUP_SAFETY_FILE, backup) };
}
