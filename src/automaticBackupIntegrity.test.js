import {
  AUTO_BACKUP_PATH,
  buildBackupPayload,
  formatAutomaticBackupTimestamp,
  isVerifiedAutomaticBackupStatus,
  isShareCancellation,
  removeLegacyBrowserAutomaticBackup,
  shouldRetryAutomaticBackup,
  validateBackupPayload,
  validateImportedBackup,
} from './App';

test('uses a v2-specific automatic backup filename that cannot collide with the legacy app', () => {
  expect(AUTO_BACKUP_PATH).toBe(
    'Kelani SBD Tracker/Automatic Backups/kelani-sbd-tracker-v2-autosave.json'
  );
});

test('recognizes only the explicit native share cancellation result', () => {
  expect(isShareCancellation(new Error('Share canceled'))).toBe(true);
  expect(isShareCancellation(new Error('Unsupported url'))).toBe(false);
  expect(isShareCancellation(null)).toBe(false);
});

test('removes the obsolete full browser backup mirror before canonical persistence', () => {
  const storage = {
    values: new Map([
      ['kelani-sbd-tracker-autosave', '{large backup}'],
      ['kelani-sbd-tracker-auto-backup-status', '{"ok":false}'],
    ]),
    getItem(key) {
      return this.values.has(key) ? this.values.get(key) : null;
    },
    removeItem(key) {
      this.values.delete(key);
    },
  };

  expect(removeLegacyBrowserAutomaticBackup(storage, false)).toBe(true);
  expect(storage.getItem('kelani-sbd-tracker-autosave')).toBeNull();
  expect(storage.getItem('kelani-sbd-tracker-auto-backup-status')).toBeNull();
});

test('clears a stale failed browser-backup status even when its large mirror is already gone', () => {
  const values = new Map([
    ['kelani-sbd-tracker-auto-backup-status', '{"ok":false}'],
  ]);
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    removeItem: key => values.delete(key),
  };

  expect(removeLegacyBrowserAutomaticBackup(storage, false)).toBe(true);
  expect(values.size).toBe(0);
});

test('never removes browser storage while running in the native shell', () => {
  const removeItem = jest.fn();
  const storage = {
    getItem: () => '{backup}',
    removeItem,
  };

  expect(removeLegacyBrowserAutomaticBackup(storage, true)).toBe(false);
  expect(removeItem).not.toHaveBeenCalled();
});

function makeStoredData(overrides = {}) {
  return {
    version: 1,
    history: [
      {
        cycle: 3,
        workoutNumber: 12,
        lift: 'Deadlift',
        topWeight: 140,
      },
    ],
    prs: {
      Squat: 145,
      Bench: 97.5,
      Deadlift: 180,
    },
    accessoryPRs: {},
    currentCycle: 3,
    bodyWeights: [],
    userProfile: {},
    meetPlannerAttempts: {},
    meetPrepChecklist: {},
    restTimeSeconds: 300,
    trainingModel: 'smart',
    programProfile: 'kelaniSbd',
    accessoryMode: 'off',
    preparationMode: 'off',
    cooldownMode: 'off',
    squatVariant: 'standard',
    deadliftVariant: 'standard',
    benchPressVariant: 'standard',
    inProgress: {
      programVersion: 'test-program',
      currentCycle: 3,
      currentIndex: 12,
      selectedIndex: 12,
      workouts: Array.from({ length: 13 }, (_, index) => ({ number: index + 1 })),
    },
    ...overrides,
  };
}

test('verifies an automatic backup only when the stored data matches exactly', () => {
  const data = makeStoredData();
  const backup = buildBackupPayload(data);

  expect(validateBackupPayload(backup, data)).toBe(true);
});

test('rejects an automatic backup containing stale workout progress', () => {
  const currentData = makeStoredData();
  const staleData = makeStoredData({
    currentCycle: 2,
    inProgress: {
      ...currentData.inProgress,
      currentCycle: 2,
      currentIndex: 4,
      selectedIndex: 4,
    },
  });
  const staleBackup = buildBackupPayload(staleData);

  expect(validateBackupPayload(staleBackup, currentData)).toBe(false);
});

test('accepts a well-formed legacy-compatible manual backup', () => {
  const data = makeStoredData({
    inProgress: undefined,
    bodyWeights: undefined,
  });

  expect(validateImportedBackup({
    storageKey: 'kel-powerlifting-user-data-v1',
    data,
  })).toBe(true);
});

test('rejects malformed manual backup data before it can replace saved data', () => {
  const validEnvelope = {
    storageKey: 'kel-powerlifting-user-data-v1',
    data: makeStoredData(),
  };

  expect(validateImportedBackup({
    ...validEnvelope,
    data: { ...validEnvelope.data, history: {} },
  })).toBe(false);
  expect(validateImportedBackup({
    ...validEnvelope,
    data: { ...validEnvelope.data, prs: { Squat: 145, Bench: 97.5 } },
  })).toBe(false);
  expect(validateImportedBackup({
    ...validEnvelope,
    data: { ...validEnvelope.data, inProgress: { workouts: 'invalid' } },
  })).toBe(false);
  expect(validateImportedBackup({
    ...validEnvelope,
    data: { ...validEnvelope.data, currentCycle: 0 },
  })).toBe(false);
  expect(validateImportedBackup({
    ...validEnvelope,
    data: {
      ...validEnvelope.data,
      cycleE1RMs: { Squat: 145, Bench: 97.5 },
    },
  })).toBe(false);
  expect(validateImportedBackup({
    ...validEnvelope,
    data: {
      ...validEnvelope.data,
      smartIdealRouteStartCycle: 0,
    },
  })).toBe(false);
});

test('does not treat failures, manual exports or unverified records as automatic backups', () => {
  expect(isVerifiedAutomaticBackupStatus({
    ok: true,
    source: 'automatic',
    verified: true,
    exportedAt: '2026-07-12T10:00:00.000Z',
  })).toBe(true);

  expect(isVerifiedAutomaticBackupStatus({
    ok: false,
    source: 'automatic',
    verified: false,
    attemptedAt: '2026-07-12T10:00:00.000Z',
  })).toBe(false);

  expect(isVerifiedAutomaticBackupStatus({
    ok: true,
    source: 'manual',
    verified: true,
    exportedAt: '2026-07-12T10:00:00.000Z',
  })).toBe(false);

  expect(isVerifiedAutomaticBackupStatus({
    ok: true,
    source: 'automatic',
    exportedAt: '2026-07-12T10:00:00.000Z',
  })).toBe(false);
});


test('formats the automatic backup timestamp compactly without seconds or year', () => {
  const localDate = new Date(2026, 6, 12, 10, 53, 37);

  expect(formatAutomaticBackupTimestamp(localDate.toISOString())).toBe('12-07 10:53');
  expect(formatAutomaticBackupTimestamp('invalid')).toBeNull();
});


test('retries missing, failed or legacy-path automatic backups', () => {
  const currentPath = 'Kelani SBD Tracker/Automatic Backups/kelani-sbd-tracker-autosave.json';

  expect(shouldRetryAutomaticBackup(null, currentPath)).toBe(true);
  expect(shouldRetryAutomaticBackup({
    ok: false,
    source: 'automatic',
    verified: false,
    attemptedAt: '2026-07-12T10:00:00.000Z',
  }, currentPath)).toBe(true);
  expect(shouldRetryAutomaticBackup({
    ok: true,
    source: 'automatic',
    verified: true,
    exportedAt: '2026-07-12T10:00:00.000Z',
    path: 'Kelani/kelani-sbd-tracker-autosave.json',
  }, currentPath)).toBe(true);
  expect(shouldRetryAutomaticBackup({
    ok: true,
    source: 'automatic',
    verified: true,
    exportedAt: '2026-07-12T10:00:00.000Z',
    path: currentPath,
  }, currentPath)).toBe(false);
});
