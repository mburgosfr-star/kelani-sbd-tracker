import { Filesystem } from '@capacitor/filesystem';
import { vi } from 'vitest';
import { getBackupHistoryIO, writeVerifiedNativeBackup } from './backupHistoryStorage';
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: vi.fn(), readFile: vi.fn(), rename: vi.fn(), readdir: vi.fn(), deleteFile: vi.fn() }, Directory: { Documents: 'DOCUMENTS' }, Encoding: { UTF8: 'utf8' } }));
beforeEach(() => { vi.resetAllMocks(); });
test('native writes verify the temporary file before replacing the existing backup', async () => {
  const files = new Map([['backup.json', 'old']]);
  Filesystem.writeFile.mockImplementation(async ({ path, data }) => files.set(path, data));
  Filesystem.readFile.mockImplementation(async ({ path }) => ({ data: files.get(path) }));
  Filesystem.rename.mockImplementation(async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); });
  await writeVerifiedNativeBackup('backup.json', 'new');
  expect(files.get('backup.json')).toBe('new');
  Filesystem.readFile.mockResolvedValueOnce({ data: 'corrupt' });
  await expect(writeVerifiedNativeBackup('backup.json', 'other')).rejects.toThrow('verification');
  expect(files.get('backup.json')).toBe('new');
  expect(Filesystem.rename).toHaveBeenCalledTimes(1);
});
test('native operations never delete a safety copy, latest backup or arbitrary path', async () => {
  const io = getBackupHistoryIO();
  for (const name of ['../manual.json', 'latest', 'kelani-before-restore.json']) await expect(io.remove(name)).rejects.toThrow('Invalid');
  expect(Filesystem.deleteFile).not.toHaveBeenCalled();
});
test('missing history is empty, while storage permission failures are surfaced', async () => {
  const io = getBackupHistoryIO();
  Filesystem.readdir.mockRejectedValueOnce({ code: 'OS-PLUG-FILE-0008' }).mockRejectedValueOnce({ code: 'OS-PLUG-FILE-0007' });
  expect(await io.list()).toEqual([]);
  await expect(io.list()).rejects.toMatchObject({ code: 'OS-PLUG-FILE-0007' });
});

test('Android recovery uses the verified previous copy if replacement removes the destination and then fails', async () => {
  const { readVerifiedNativeBackup } = await import('./backupHistoryStorage');
  const previous = JSON.stringify({ storageKey: 'kel-powerlifting-user-data-v1', exportedAt: '2030-01-01T12:00:00Z', data: { revision: 1 } });
  const current = JSON.stringify({ storageKey: 'kel-powerlifting-user-data-v1', exportedAt: '2030-01-02T12:00:00Z', data: { revision: 2 } });
  const files = new Map([['backup.json', previous]]);
  Filesystem.writeFile.mockImplementation(async ({ path, data }) => files.set(path, data));
  Filesystem.readFile.mockImplementation(async ({ path }) => {
    if (!files.has(path)) throw { code: 'OS-PLUG-FILE-0008' };
    return { data: files.get(path) };
  });
  Filesystem.rename.mockImplementation(async ({ to }) => { files.delete(to); throw new Error('Move failed'); });
  await expect(writeVerifiedNativeBackup('backup.json', current)).rejects.toThrow('Move failed');
  expect(files.get('backup.json.previous')).toBe(previous);
  expect(await readVerifiedNativeBackup('backup.json', value => value?.data?.revision === 1)).toBe(previous);
});
