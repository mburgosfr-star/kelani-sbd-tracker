import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BackupHistoryModal from './BackupHistoryModal';
import { DataSection, buildBackupPayload } from './App';
import { translations } from './translations';
import { BACKUP_HISTORY_DAYS_KEY, BACKUP_SAFETY_FILE } from './backupHistory';
const Modal = ({ title, children }) => <section><h3>{title}</h3>{children}</section>;
const buttonStyle = () => ({});
const data = revision => ({ version: 1, prs: { Squat: 40, Bench: 30, Deadlift: 50 }, history: [], currentCycle: revision });
const storageKey = 'kel-powerlifting-user-data-v1';
beforeEach(() => { localStorage.clear(); delete window.kelaniDesktop; });
afterEach(() => { delete window.kelaniDesktop; });
test.each(['en', 'nl', 'ca'])('history has localized retention choices, restore action and compact controls (%s)', async language => {
  const t = translations[language];
  const restore = vi.fn();
  const backup = buildBackupPayload(data(2));
  const getHistory = () => ({ list: async () => [{ name: 'kelani-day-2030-01-01.json', backup }], read: async () => backup });
  render(<BackupHistoryModal t={t} Modal={Modal} buttonStyle={buttonStyle} getHistory={getHistory} onClose={() => {}} onRestore={restore} />);
  const select = screen.getByRole('combobox');
  expect(select).toHaveValue('30');
  fireEvent.change(select, { target: { value: '7' } });
  expect(localStorage.getItem(BACKUP_HISTORY_DAYS_KEY)).toBe('7');
  fireEvent.click(await screen.findByRole('button', { name: t.backupHistoryRestore }));
  await waitFor(() => expect(restore).toHaveBeenCalledWith(backup));
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
