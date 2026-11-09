import { createBackupHistory, BACKUP_HISTORY_DAYS_KEY, BACKUP_SAFETY_FILE, backupHistoryDays, isDailyBackup } from './backupHistory';

function fixture(days = 30) {
  const files = new Map();
  const storage = { getItem: () => String(days) };
  const io = {
    list: vi.fn(async () => [...files.keys()].filter(name => name !== 'latest')),
    read: vi.fn(async name => { if (!files.has(name)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' }); return files.get(name); }),
    write: vi.fn(async (name, text) => files.set(name, text)),
    remove: vi.fn(async name => files.delete(name)), isMissing: error => error.code === 'ENOENT',
  };
  const history = createBackupHistory({ io, storage, now: () => new Date(2030, 3, 30, 12), validate: backup => backup?.data?.valid === true });
  const backup = (day, revision = 1) => ({ exportedAt: new Date(2030, 3, day, 12).toISOString(), data: { valid: true, revision } });
  return { files, io, history, backup };
}
test('defaults to 30 days and rejects unknown retention settings', () => {
  expect(backupHistoryDays({ getItem: () => null })).toBe(30);
  expect(backupHistoryDays({ getItem: () => 'bad' })).toBe(30);
  expect(backupHistoryDays({ getItem: () => '0' })).toBe(0);
  expect(BACKUP_HISTORY_DAYS_KEY).toBe('kelani-backup-history-days');
});
test('keeps one verified recovery point per local day, including multiple workouts', async () => {
  const { history, files, backup } = fixture();
  await history.record(backup(30));
  await history.record(backup(30, 2));
  expect(files.size).toBe(1);
  expect((await history.read('kelani-day-2030-04-30.json')).data.revision).toBe(2);
});
test.each([0, 7, 30, 90])('%i-day cleanup touches only managed daily history and preserves safety/latest/manual files', async days => {
  const { history, files, backup } = fixture(days);
  for (let day = -65; day <= 30; day++) {
    const value = backup(day);
    const date = new Date(value.exportedAt);
    const name = `kelani-day-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.json`;
    files.set(name, JSON.stringify(value));
  }
  for (const name of ['latest', BACKUP_SAFETY_FILE, 'manual-export.json', 'kelani-day-2030-99-99.json']) files.set(name, 'untouched');
  await history.record(backup(30));
  expect([...files.keys()].filter(isDailyBackup)).toHaveLength(days);
  for (const name of ['latest', BACKUP_SAFETY_FILE, 'manual-export.json', 'kelani-day-2030-99-99.json']) expect(files.get(name)).toBe('untouched');
});
test('failed writes and failed readback never start cleanup', async () => {
  const { history, io, backup } = fixture(7);
  io.write.mockRejectedValueOnce(new Error('Disk full'));
  await expect(history.record(backup(30))).rejects.toThrow('Disk full');
  expect(io.remove).not.toHaveBeenCalled();
  io.read.mockResolvedValueOnce(JSON.stringify(backup(29)));
  await expect(history.record(backup(30))).rejects.toThrow('verification');
  expect(io.remove).not.toHaveBeenCalled();
});
test('upgrade preservation does not prune until a new latest backup is verified', async () => {
  const { history, files, backup, io } = fixture(7);
  await history.record(backup(1), { prune: false });
  expect(files.has('kelani-day-2030-04-01.json')).toBe(true);
  expect(io.remove).not.toHaveBeenCalled();
});
test('safety backup is verified independently and is available for a later undo', async () => {
  const { history, backup } = fixture();
  await history.saveSafety(backup(30));
  expect(await history.read(BACKUP_SAFETY_FILE)).toEqual(backup(30));
});
test('unreadable files are reported and never offered as valid recovery data', async () => {
  const { history, files, backup } = fixture();
  files.set('kelani-day-2030-04-01.json', 'broken');
  files.set('latest', JSON.stringify(backup(30)));
  const entries = await history.list();
  expect(entries.find(entry => entry.name === 'latest').backup.exportedAt).toEqual(backup(30).exportedAt);
  expect(entries.find(entry => entry.name === 'latest').backup).not.toHaveProperty('data');
  expect(entries.find(entry => entry.error).name).toBe('kelani-day-2030-04-01.json');
});
