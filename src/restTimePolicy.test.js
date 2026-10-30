import { getRecommendedRestTimeSeconds } from './workoutHistoryStats';

const topLabels = ['heavySingle', 'topSingle', 'topDouble', 'topTriple'];

function restFor({ multi = false, type = 'training', label = 'topSingle', index = 1, fallbackSeconds = 90, sets } = {}) {
  const block = {
    warmups: [{ weight: 20, done: true }, { weight: 80, done: false }],
    sets: sets || [{ labelKey: label, weight: 100, reps: 1, done: false }],
  };
  const workout = { number: 1, type, ...(multi ? { lifts: [block] } : block) };
  return getRecommendedRestTimeSeconds({ workouts: [workout],
    placement: { workoutNumber: 1, type: multi ? 'meetWarmup' : 'warmup', liftIndex: 0, index }, fallbackSeconds });
}

test.each(topLabels)('five minutes before %s in both flat and multi-lift training', label => {
  for (const multi of [false, true]) {
    for (const fallbackSeconds of [90, 180, 300, 480]) {
      expect(restFor({ label, multi, fallbackSeconds })).toBe(300);
    }
  }
});

test('earlier warmups do not receive top-set recovery prematurely', () => {
  expect(restFor({ index: 0 })).toBe(90);
  expect(restFor({ multi: true, index: 0 })).toBe(90);
});

test.each(['opener', 'secondAttempt', 'thirdAttempt'])('attempt rest remains eight minutes before %s', label => {
  expect(restFor({ multi: true, type: 'meet', label })).toBe(480);
  expect(restFor({ multi: true, label })).toBe(480);
});

test('rest before ordinary work and already-completed top sets retains its existing policy', () => {
  const sets = [{ labelKey: 'topSingle', done: true }, { labelKey: 'backoff', done: false }];
  expect(restFor({ label: 'workSets' })).toBe(90);
  expect(restFor({ multi: true, label: 'workSets', fallbackSeconds: 180 })).toBe(180);
  expect(restFor({ sets })).toBe(90);
  expect(restFor({ multi: true, sets })).toBe(90);
});

test('rest after training sets and failed work keeps the existing durations', () => {
  const workout = { number: 1, type: 'training', sets: [{ labelKey: 'topSingle' }, { labelKey: 'backoff' }] };
  const read = (index, failed = false) => getRecommendedRestTimeSeconds({workouts:[workout], placement:{workoutNumber:1,type:'main',index,failed},fallbackSeconds:90});
  expect(read(0)).toBe(300);
  expect(read(1)).toBe(180);
  expect(read(1, true)).toBe(300);
});
