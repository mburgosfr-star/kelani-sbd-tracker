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
    completedSessions: 3,
    trainingSessions: 1,
    recoverySessions: 1,
    meetSessions: 1,
    failedOrSkippedSets: 1,
    milestoneCelebrations: 1,
    efforts: { easy: 1, good: 1, hard: 1, tooMuch: 0, unrecorded: 0 },
  });

  const report = buildAnonymousUsageReport(metrics);
  expect(report).toContain('completed_sessions=3');
  expect(report).toContain('failed_or_skipped_sets=1');
  expect(report).not.toContain('137.5');
  expect(report).not.toContain('92.5');
  expect(report).not.toContain('150');
  expect(report).not.toContain('2.5');
});

test('anonymous usage report contains only the documented aggregate fields', () => {
  const report = buildAnonymousUsageReport(buildAnonymousUsageMetrics());

  expect(report.split('\n')).toHaveLength(21);
  expect(report).not.toMatch(/body|date|device|history|one_rm|e1rm/i);
});
