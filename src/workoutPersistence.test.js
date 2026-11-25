import { saveProfile, readProfile, replaceProfile, clearProfile, PROFILE_KEY } from './workoutPersistence';

test('set edits survive reload without rewriting history, and import supersedes pending progress', () => {
  localStorage.clear();
  const initial = { history: [{ lift: 'Bench' }], inProgress: { workouts: [{ done: false }, { type: 'rest' }] } };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(initial));
  expect(readProfile(localStorage)).toEqual(initial);
  const checkpoint = saveProfile(localStorage, initial);
  const bytes = localStorage.getItem(PROFILE_KEY);
  const checked = { ...initial, inProgress: { workouts: [{ done: true }, initial.inProgress.workouts[1]] } };
  const latest = saveProfile(localStorage, checked, checkpoint);
  expect(localStorage.getItem(PROFILE_KEY)).toBe(bytes);
  expect(readProfile(localStorage)).toEqual(checked);
  saveProfile(localStorage, initial, latest);
  expect(readProfile(localStorage)).toEqual(initial);
  replaceProfile(localStorage, checked);
  expect(readProfile(localStorage)).toEqual(checked);
  clearProfile(localStorage);
  expect(readProfile(localStorage)).toBeNull();
});

test('restores the earlier complete progress record before the next incremental save', () => {
  localStorage.clear();
  const profile = { history: [{ lift: 'Bench' }], inProgress: { workouts: [{ done: false }] } };
  const saved = saveProfile(localStorage, profile);
  const inProgress = { workouts: [{ done: true }], currentIndex: 0 };
  localStorage.setItem(PROFILE_KEY + ':progress', JSON.stringify({ revision: saved.revision, inProgress }));
  expect(readProfile(localStorage)).toEqual({ ...profile, inProgress });
  saveProfile(localStorage, readProfile(localStorage));
  expect(readProfile(localStorage)).toEqual({ ...profile, inProgress });
});

test('completion at the quota preserves distinct snapshots and pending progress on failed retry', () => {
  const values = new Map();
  let limit = Infinity;
  const storage = {
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
    setItem(key, value) {
      const other = [...values].reduce((n, [k, v]) => n + (k === key ? 0 : v.length), 0);
      if (other + value.length > limit) throw new DOMException('Full', 'QuotaExceededError');
      values.set(key, value);
    },
  };
  const snapshot = { note: 'x'.repeat(1000), completed: true };
  const data = { history: [snapshot, { ...snapshot }, { ...snapshot, completed: false }].map(
    workoutSnapshot => ({ workoutSnapshot })), inProgress: { workouts: [{}] } };
  limit = 2700;
  const checkpoint = saveProfile(storage, data);
  expect(readProfile(storage)).toEqual(data);
  const edited = { ...data, inProgress: { workouts: [{ done: true }] } };
  saveProfile(storage, edited, checkpoint);
  expect(readProfile(storage)).toEqual(edited);
  limit = 1;
  expect(() => replaceProfile(storage, data)).toThrow();
  expect(readProfile(storage)).toEqual(edited);
  limit = 2700;
  replaceProfile(storage, data);
  expect(readProfile(storage)).toEqual(data);
});
