import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BackupHistoryModal from './BackupHistoryModal';
import { AUTO_BACKUP_PATH, DataSection, buildBackupPayload, writeAutomaticBackup } from './App';
import { translations } from './translations';
import { BACKUP_HISTORY_DAYS_KEY, BACKUP_SAFETY_FILE } from './backupHistory';
const { saveDocument, shareDocument } = vi.hoisted(() => ({ saveDocument: vi.fn(), shareDocument: vi.fn() }));

vi.mock('@capacitor/core', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    Capacitor: { ...actual.Capacitor, isNativePlatform: vi.fn(() => false) },
    registerPlugin: (name, ...args) => name === 'BackupDocument'
      ? { save: saveDocument, share: shareDocument }
      : actual.registerPlugin(name, ...args),
  };
});
vi.mock('@capacitor/filesystem', async importOriginal => ({
  ...await importOriginal(),
  Filesystem: {
    writeFile: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(),
    readdir: vi.fn(), rename: vi.fn(), getUri: vi.fn(),
  },
}));

const Modal = ({ title, children }) => <section><h3>{title}</h3>{children}</section>;
const buttonStyle = () => ({});
const data = revision => ({ version: 1, prs: { Squat: 40, Bench: 30, Deadlift: 50 }, history: [], currentCycle: revision });
const storageKey = 'kel-powerlifting-user-data-v1';
beforeEach(() => { localStorage.clear(); delete window.kelaniDesktop; });
afterEach(() => { delete window.kelaniDesktop; Capacitor.isNativePlatform.mockReturnValue(false); });
test.each(['en', 'nl', 'ca'])('history has localized retention choices, restore action and compact controls (%s)', async language => {
  const t = translations[language];
  const restore = vi.fn();
  const backup = buildBackupPayload(data(2));
  const getHistory = () => ({ list: async () => [{ name: 'kelani-day-2030-01-01.json', backup }], read: async () => backup });
  render(<BackupHistoryModal t={t} Modal={Modal} buttonStyle={buttonStyle} getHistory={getHistory} onClose={() => {}} onRestore={restore} />);
  const select = screen.getByRole('combobox', { name: t.backupHistoryRetention });
  expect(select).toHaveValue('30');
  fireEvent.change(select, { target: { value: '7' } });
  expect(localStorage.getItem(BACKUP_HISTORY_DAYS_KEY)).toBe('7');
  fireEvent.click(await screen.findByRole('button', { name: t.backupHistoryRestore }));
  await waitFor(() => expect(restore).toHaveBeenCalledWith(backup));
});
test('a long history keeps one preview and restores the selected date', async () => {
  const t = translations.en;
  const entries = Array.from({ length: 90 }, (_, index) => ({
    name: index === 0 ? 'latest' : `recovery-${index}`,
    backup: buildBackupPayload(data(index + 1), { now: new Date(2026, 10, 27 - index) }),
  }));
  const read = vi.fn(async name => entries.find(entry => entry.name === name).backup);
  const onRestore = vi.fn();
  render(<BackupHistoryModal t={t} Modal={Modal} buttonStyle={buttonStyle}
    getHistory={() => ({ list: async () => entries, read })} onClose={() => {}} onRestore={onRestore} />);

  const picker = await screen.findByRole('combobox', { name: t.backupHistorySelect });
  expect(picker).toHaveValue('latest');
  expect(screen.getAllByRole('button', { name: t.backupHistoryRestore })).toHaveLength(1);
  fireEvent.change(picker, { target: { value: 'recovery-89' } });
  expect(screen.getByText(/Cycle 90/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: t.backupHistoryRestore }));
  await waitFor(() => expect(onRestore).toHaveBeenCalledWith(entries.at(-1).backup));
  expect(read).toHaveBeenCalledWith('recovery-89');
});

test('browser history explains file availability without creating browser backup copies', () => {
  render(<BackupHistoryModal t={translations.en} Modal={Modal} buttonStyle={buttonStyle} getHistory={() => null} onClose={() => {}} onRestore={() => {}} />);
  expect(screen.getByText(translations.en.backupHistoryNativeOnly)).toBeInTheDocument();
  expect(localStorage.length).toBe(0);
});
test('an unreadable recovery point cannot be restored', async () => {
  render(<BackupHistoryModal t={translations.en} Modal={Modal} buttonStyle={buttonStyle}
    getHistory={() => ({ list: async () => [{ name: 'broken', error: true }] })} onClose={() => {}} onRestore={() => {}} />);
  expect(await screen.findByRole('button', { name: 'Restore' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent(translations.en.backupHistoryReadError);
});
test('failed safety backup blocks history restoration and preserves the current stored data', async () => {
  const current = JSON.stringify(data(3));
  localStorage.setItem(storageKey, current);
  const old = buildBackupPayload(data(1));
  const write = vi.fn(async () => { throw new Error('Disk full'); });
  window.kelaniDesktop = { platform: 'desktop', backupHistory: async request => {
    if (request.action === 'list') return ['kelani-day-2030-01-01.json'];
    if (request.action === 'read') return request.name === 'latest' ? null : JSON.stringify(old);
    if (request.action === 'write') return write(request);
  } };
  render(<DataSection t={translations.en} />);
  fireEvent.click(screen.getByRole('button', { name: 'Manage' }));
  fireEvent.click(screen.getByRole('button', { name: 'Backup History' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
  expect(await screen.findByText(translations.en.backupHistoryRestoreWarning)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(translations.en.backupHistoryRestoreError);
  expect(localStorage.getItem(storageKey)).toBe(current);
  expect(write).toHaveBeenCalledWith(expect.objectContaining({ name: BACKUP_SAFETY_FILE }));
  const saved = JSON.parse(write.mock.calls[0][0].json);
  expect(saved.data).toEqual(data(3));
});
test('history restore verifies a safety copy before replacing data, retaining a way back', async () => {
  localStorage.setItem(storageKey, JSON.stringify(data(3)));
  const old = buildBackupPayload(data(1));
  const files = new Map([['kelani-day-2030-01-01.json', JSON.stringify(old)]]);
  let dataAtSafetyWrite;
  window.kelaniDesktop = { platform: 'desktop', backupHistory: async request => {
    if (request.action === 'list') return [...files.keys()];
    if (request.action === 'read') return files.get(request.name) || null;
    if (request.action === 'write') {
      dataAtSafetyWrite = JSON.parse(localStorage.getItem(storageKey));
      files.set(request.name, request.json);
    }
  } };
  render(<DataSection t={translations.en} />);
  fireEvent.click(screen.getByRole('button', { name: 'Manage' }));
  fireEvent.click(screen.getByRole('button', { name: 'Backup History' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
  await screen.findByText(translations.en.backupHistoryRestoreWarning);
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(storageKey))).toEqual(data(1)));
  expect(dataAtSafetyWrite).toEqual(data(3));
  expect(JSON.parse(files.get(BACKUP_SAFETY_FILE)).data).toEqual(data(3));
});


test.each([true, false])('Android writes the current profile and records only a saved export (%s)', async saved => {
  const t = translations.en;
  const statusKey = 'kelani-sbd-tracker-manual-backup-status';
  Capacitor.isNativePlatform.mockReturnValue(true);
  localStorage.setItem(storageKey, JSON.stringify(data(3)));
  const restDay = { cycle: 3, workoutNumber: 14, restDay: true, completionOnly: true };
  const active = { ...data(3), history: [restDay] };
  let json;
  Filesystem.writeFile.mockImplementation(async options => {
    json = options.data;
    return { uri: 'file:///cache/backup.json' };
  });
  Filesystem.readFile.mockImplementation(async () => ({ data: json }));
  let statusBeforeSave;
  saveDocument.mockReset();
  shareDocument.mockReset();
  Filesystem.deleteFile.mockClear();
  saveDocument.mockImplementation(async () => {
    statusBeforeSave = localStorage.getItem(statusKey);
    return { saved };
  });

  render(<DataSection t={t} profileForExport={active} />);
  fireEvent.click(screen.getByRole('button', { name: t.dataManagementAction }));
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await waitFor(() => expect(Filesystem.deleteFile).toHaveBeenCalledOnce());
  expect(saveDocument).toHaveBeenCalledOnce();
  expect(statusBeforeSave).toBeNull();
  expect(JSON.parse(json).data.history).toEqual([restDay]);
  expect(JSON.parse(localStorage.getItem(storageKey)).history).toEqual([]);
  if (saved) {
    expect(JSON.parse(localStorage.getItem(statusKey))).toMatchObject({
      verified: true, exportedAt: JSON.parse(json).exportedAt,
    });
    expect(screen.getByText(t.exportDataSuccess)).toBeInTheDocument();
    expect(shareDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t.shareAction }));
    expect(shareDocument).toHaveBeenCalledWith({ title: t.shareAction });
  } else {
    expect(localStorage.getItem(statusKey)).toBeNull();
    expect(screen.queryByText(t.exportDataSuccess)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.shareAction })).not.toBeInTheDocument();
  }
});

test('an Android rest-day backup replaces the old latest copy despite a stranded staging file', async () => {
  Capacitor.isNativePlatform.mockReturnValue(true);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const oldBackup = JSON.stringify(buildBackupPayload(data(7), { now: yesterday }));
  const strandedPath = `${AUTO_BACKUP_PATH}.tmp`;
  const stranded = JSON.stringify(buildBackupPayload(data(3)));
  const files = new Map([[AUTO_BACKUP_PATH, oldBackup], [strandedPath, stranded]]);
  Filesystem.readFile.mockImplementation(async ({ path }) => {
    if (!files.has(path)) throw Object.assign(new Error('Missing file'), { code: 'OS-PLUG-FILE-0008' });
    return { data: files.get(path) };
  });
  Filesystem.writeFile.mockImplementation(async ({ path, data: contents }) => {
    if (path === strandedPath) throw new Error('Cannot replace the stranded file');
    files.set(path, contents);
  });
  Filesystem.rename.mockImplementation(async ({ from, to }) => {
    files.set(to, files.get(from));
    files.delete(from);
  });
  Filesystem.deleteFile.mockImplementation(async ({ path }) => { files.delete(path); });
  Filesystem.readdir.mockImplementation(async ({ path }) => ({
    files: [...files.keys()].filter(name => name.startsWith(path + '/'))
      .map(name => ({ name: name.slice(path.length + 1) })),
  }));
  Filesystem.getUri.mockResolvedValue({ uri: 'file:///backup.json' });

  const rest = { cycle: 7, workoutNumber: 14, restDay: true, completionOnly: true };
  const active = { ...data(7), history: [rest] };
  await writeAutomaticBackup(active);

  expect(JSON.parse(files.get(AUTO_BACKUP_PATH)).data.history).toEqual([rest]);
  expect(files.get(`${AUTO_BACKUP_PATH}.previous`)).toBe(oldBackup);
  expect(files.get(strandedPath)).toBe(stranded);
  expect(JSON.parse(localStorage.getItem('kelani-sbd-tracker-auto-backup-status')))
    .toMatchObject({ ok: true, verified: true, summary: { historyEntries: 1 } });
});
