import { buildCycleReview } from './cycleReview';

const lifts = ['Squat', 'Bench', 'Deadlift'];
const seeds = [95, 70, 120].map((topWeight, index) => ({ lift: lifts[index], cycle: 0, workoutNumber: 0, topWeight, e1rm: topWeight, seedMax: true }));
function session(cycle, number, weights, type = 'training') {
  const workoutSnapshot = { type, completed: true, lifts: lifts.map((lift, index) => ({
    lift, sets: [{ weight: weights[index], reps: 1, done: true }],
  })) };
  return lifts.map(lift => ({ cycle, workoutNumber: number, lift, workoutSnapshot }));
}

test('reviews successful results, counts each multi-lift day once and retains the baseline', () => {
  const history = [...seeds, ...session(1, 1, [100, 75, 125]), ...session(2, 1, [105, 80, 125]),
    { cycle: 2, workoutNumber: 2, restDay: true, workoutSnapshot: { type: 'rest', completed: true } }];
  const original = JSON.stringify(history);
  const review = buildCycleReview(history, 2);
  expect(review).toMatchObject({ cycle: 2, trainingDays: 1, restDays: 1, total: 310, totalGain: 25 });
  expect(review.lifts.map(item => item.oneRMGain)).toEqual([5, 5, 0]);
  expect(review.lifts.map(item => item.sinceStartGain)).toEqual([10, 10, 5]);
  expect(review.points).toEqual([{ cycle: 0, total: 285 }, { cycle: 1, total: 300 }, { cycle: 2, total: 310 }]);
  expect(JSON.stringify(history)).toBe(original);
});

test('failed/skipped sets and future history cannot create progress; a lower meet stays visible', () => {
  const meet = session(2, 3, [90, 70, 120], 'meet');
  meet[0].workoutSnapshot.lifts[0].sets.push({ weight: 200, reps: 1, done: true, failed: true });
  meet[0].workoutSnapshot.completedSummary = { results: [{ lift: 'Squat', oneRMToday: 200 }] };
  meet[0].workoutSnapshot.lifts[1].sets.push({ weight: 150, reps: 1, done: true, skipped: true });
  const review = buildCycleReview([...seeds, ...session(1, 1, [100, 75, 125]), ...meet, ...session(3, 1, [250, 200, 300])], 2);
  expect(review.meetTotal).toBe(280);
  expect(review.lifts.map(item => item.oneRM)).toEqual([90, 70, 120]);
  expect(review.lifts.map(item => item.oneRMGain)).toEqual([-10, -5, -5]);
  expect(review.total).toBe(300);
  expect(review.points.at(-1)).toEqual({ cycle: 2, total: 300 });
});

test('missing baselines are unknown, never zero-based claims of progress', () => {
  const review = buildCycleReview(session(1, 1, [100, 75, 125]), 1);
  expect(review.totalGain).toBeNull();
  expect(review.lifts.every(item => item.oneRMGain === null && item.sinceStartGain === null)).toBe(true);
  expect(buildCycleReview([], 1).total).toBeNull();
});

test('recognizes initial maxes in older backups without treating later manual updates as the starting point', () => {
  const legacySeeds = seeds.map(({ seedMax, cycle, ...entry }) => entry);
  const history = [...legacySeeds, ...session(1, 1, [100, 75, 125]),
    { lift: 'Squat', cycle: 2, workoutNumber: 0, manualMax: true, topWeight: 110, e1rm: 110 },
    ...session(2, 1, [115, 80, 130])];
  const review = buildCycleReview(history, 2);
  expect(review.totalGain).toBe(40);
  expect(review.lifts.map(item => item.sinceStartGain)).toEqual([20, 10, 10]);
  expect(review.points[0]).toEqual({ cycle: 0, total: 285 });
  expect(review.trainingDays).toBe(1);
});
