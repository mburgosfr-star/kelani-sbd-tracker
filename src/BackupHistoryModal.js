import { responsiveFontSize } from './responsiveTypography';
import React, { useEffect, useRef, useState } from 'react';
import { BACKUP_HISTORY_DAYS_KEY, BACKUP_HISTORY_OPTIONS, BACKUP_SAFETY_FILE, backupHistoryDays } from './backupHistory';

export default function BackupHistoryModal({ t, Modal, buttonStyle, getHistory, onClose, onRestore }) {
  const [days, setDays] = useState(() => backupHistoryDays(localStorage));
  const [entries, setEntries] = useState([]);
  const [selectedName, setSelectedName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settingError, setSettingError] = useState('');
  const [reading, setReading] = useState(false);
  const activeRef = useRef(true);
  const [supported, setSupported] = useState(true);
  const dialogRef = useRef(null);
  useEffect(() => {
    activeRef.current = true;
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { activeRef.current = false; if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    const history = getHistory();
    if (!history) { setSupported(false); setLoading(false); return; }
    history.list().then(value => { if (active) setEntries(value); })
      .catch(() => { if (active) setError(t.backupHistoryReadError); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getHistory, t]);
  function changeDays(event) {
    const value = Number(event.target.value);
    try { localStorage.setItem(BACKUP_HISTORY_DAYS_KEY, String(value)); setDays(value); setSettingError(''); }
    catch { setSettingError(t.backupHistorySettingError); }
  }
  const selected = entries.find(entry => entry.name === selectedName)
    ?? entries.find(entry => entry.name === 'latest')
    ?? entries[0];
  const entryType = name => name === 'latest' ? t.backupHistoryLatest
    : name === BACKUP_SAFETY_FILE ? t.backupHistorySafety : t.backupHistoryDaily;

  async function choose(name) {
    if (reading) return;
    setReading(true);
    try {
      const backup = await getHistory().read(name);
      if (activeRef.current) onRestore(backup);
    } catch { if (activeRef.current) setError(t.backupHistoryReadError); }
    finally { if (activeRef.current) setReading(false); }
  }
  return <Modal title={t.backupHistoryTitle} onClose={onClose} zIndex={740}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.backupHistoryTitle} tabIndex={-1}
      style={{ outline: 'none' }} onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = [...dialogRef.current.querySelectorAll('select:not(:disabled), button:not(:disabled)')];
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
    <p style={{ lineHeight: 1.4, textAlign: 'center' }}>{t.backupHistoryDescription}</p>
    <label style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <strong>{t.backupHistoryRetention}</strong>
      <select value={days} onChange={changeDays} style={{ minHeight: 44, background: '#101010', color: '#fff4e6', border: '1px solid #ff8a3d', borderRadius: 8, padding: 8, fontSize: 'inherit', maxWidth: '100%' }}>
        {BACKUP_HISTORY_OPTIONS.map(value => <option key={value} value={value}>{value === 0 ? t.backupHistoryLatestOnly : t.backupHistoryDays.replace('{days}', value)}</option>)}
      </select>
    </label>
    {!supported && <p role="status">{t.backupHistoryNativeOnly}</p>}
    {loading && <p role="status">{t.backupHistoryLoading}</p>}
    {(error || settingError) && <p role="alert">{error || settingError}</p>}
    {reading && <p role="status">{t.backupHistoryLoading}</p>}
    {supported && !loading && !error && !entries.length && <p>{t.backupHistoryEmpty}</p>}
    {selected && (
      <div className="kelani-backup-selection">
        <label>
          <strong>{t.backupHistorySelect}</strong>
          <select value={selected.name} disabled={reading} onChange={event => setSelectedName(event.target.value)}>
            {entries.map(entry => (
              <option key={entry.name} value={entry.name}>
                {entry.backup && entry.name !== 'latest' && entry.name !== BACKUP_SAFETY_FILE
                  ? new Date(entry.backup.exportedAt).toLocaleString()
                  : entryType(entry.name)}
              </option>
            ))}
          </select>
        </label>
        {selected.backup && <div id="kelani-selected-backup">
          <strong>{entryType(selected.name)}</strong>
          <div>{new Date(selected.backup.exportedAt).toLocaleString()}</div>
          <div style={{ fontSize: responsiveFontSize(14) }}>
            {t.cycle} {selected.backup.summary.currentCycle} · {t.workout} {selected.backup.summary.currentWorkout}
          </div>
        </div>}
        {selected.error && <div role="alert">{t.backupHistoryReadError}</div>}
      </div>
    )}
    <div className="kelani-button-grid" style={{ marginTop: 14 }}>
      {selected && <button type="button" disabled={selected.error || reading}
        aria-describedby={selected.backup ? 'kelani-selected-backup' : undefined}
        onClick={() => choose(selected.name)} style={buttonStyle('secondary', '0')}>
        {t.backupHistoryRestore}
      </button>}
      <button type="button" onClick={onClose} style={buttonStyle('secondary', '0')}>{t.close}</button>
    </div>
    </div>
  </Modal>;
}
