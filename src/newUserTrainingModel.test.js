import { getNewUserTrainingModel } from './App';

test('new users start with Kelani SBD Smart', () => {
  expect(getNewUserTrainingModel()).toBe('smart');
});

test('an explicit Classic choice remains Classic', () => {
  expect(getNewUserTrainingModel('classic')).toBe('classic');
});

test('an explicit Smart choice remains Smart', () => {
  expect(getNewUserTrainingModel('smart')).toBe('smart');
});
