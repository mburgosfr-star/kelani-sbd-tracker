import { getNewUserTrainingModel, normalizeTrainingModel } from './programProfiles';

test('new users start with Kelani SBD Smart', () => {
  expect(getNewUserTrainingModel()).toBe('smart');
});

test('a stale explicit Classic preference cannot put a new user in Classic', () => {
  expect(getNewUserTrainingModel('classic')).toBe('smart');
});

test('an explicit Smart choice remains Smart', () => {
  expect(getNewUserTrainingModel('smart')).toBe('smart');
});

test('normalization still preserves Classic for an existing saved user', () => {
  expect(normalizeTrainingModel('classic')).toBe('classic');
});
