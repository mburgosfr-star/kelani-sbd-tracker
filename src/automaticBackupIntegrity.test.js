import {
  buildBackupPayload,
  formatAutomaticBackupTimestamp,
  isVerifiedAutomaticBackupStatus,
  shouldRetryAutomaticBackup,
  validateBackupPayload,
} from './App';

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
