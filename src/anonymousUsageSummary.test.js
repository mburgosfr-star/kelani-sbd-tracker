import {
  buildAnonymousUsageMetrics,
  buildAnonymousUsageReport,
} from './anonymousUsageSummary';

test('anonymous usage metrics count completed sessions once and exclude personal values', () => {
  const sharedSnapshot = {
    type: 'training',
    workoutEffort: 'good',
    lifts: [
      { lift: 'Squat', sets: [{ weight: 137.5, reps: 3, done: true }] },
      { lift: 'Bench', sets: [{ weight: 92.5, reps: 3, failed: true }] },
    ],
    milestoneCelebration: {
      achievements: [{ type: 'e1RM', lift: 'Squat', value: 150, gain: 2.5 }],
    },
  };
  const metrics = buildAnonymousUsageMetrics({
    history: [
      { cycle: 1, workoutNumber: 0, seedMax: true, lift: 'Squat', topWeight: 140 },
      { cycle: 1, workoutNumber: 1, lift: 'Squat', workoutSnapshot: sharedSnapshot },
      { cycle: 1, workoutNumber: 1, lift: 'Bench', workoutSnapshot: sharedSnapshot },
      { cycle: 1, workoutNumber: 2, restDay: true, completionOnly: true, workoutEffort: 'easy' },
      {
        cycle: 1,
        workoutNumber: 3,
        lift: 'Squat',
        workoutSnapshot: { type: 'meet', workoutEffort: 'hard', sets: [] },
      },
    ],
    appVersion: '2.0.20',
    language: 'nl',
    weightUnit: 'kg',
    trainingModel: 'smart',
    athleteLevel: 'intermediate',
    preparationMode: 'general',
    accessoryMode: 'off',
    cooldownMode: 'upperBackFriendly',
  });

  expect(metrics).toMatchObject({
    schemaVersion: 2,
    completedSessions: 3,
    trainingSessions: 1,
    recoverySessions: 1,
    meetSessions: 1,
    failedSets: 1,
    milestoneCelebrations: 1,
    efforts: { easy: 1, good: 1, hard: 1, tooMuch: 0, unrecorded: 0 },
  });

  const report = buildAnonymousUsageReport(metrics);
  expect(report).toContain('schema_version=2');
  expect(report).toContain('completed_sessions=3');
  expect(report).toContain('failed_sets=1');
  expect(report).not.toContain('failed_or_skipped_sets');
  expect(report).not.toContain('137.5');
  expect(report).not.toContain('92.5');
  expect(report).not.toContain('150');
  expect(report).not.toContain('2.5');
});

test('failed-set metric counts each missed set once and ignores untouched optional work', () => {
  const metrics = buildAnonymousUsageMetrics({
    history: [{
      cycle: 1,
      workoutNumber: 1,
      lift: 'Bench',
      workoutSnapshot: {
        type: 'training',
        lifts: [{
          lift: 'Bench',
          sets: [
            { weight: 80, reps: 5, done: true, failed: true, skipped: true },
            { weight: 80, reps: 5, done: true, failed: false, skipped: false },
            { weight: 80, reps: 5, done: true, failed: false, skipped: true },
          ],
        }],
        prepItems: [{ key: 'bandPullApart', done: false }],
        smartDecisionSummary: { failed: ['diagnostic-only'] },
        accessories: [
          {
            reps: 10,
            weights: [25, 25, 25],
            done: [false, false, false],
            failed: [false, false, false],
            skipped: [false, false, false],
          },
          {
            reps: 10,
            weights: [30, 30, 30],
            done: [true, true, false],
            failed: [false, true, false],
            skipped: [false, true, false],
          },
        ],
        cooldownItems: [{ key: 'walk', done: false }],
      },
    }],
  });

  expect(metrics.failedSets).toBe(3);
});

test('anonymous usage report contains only the documented aggregate fields', () => {
  const report = buildAnonymousUsageReport(buildAnonymousUsageMetrics());

  expect(report.split('\n')).toHaveLength(21);
  expect(report).not.toMatch(/body|date|device|history|one_rm|e1rm/i);
});
