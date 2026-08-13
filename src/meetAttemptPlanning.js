import { roundBarbellWeight } from './smartFrequencyPolicy';

const MINIMUM_MEET_ATTEMPT_STEP_KG = 2.5;

export function ensureStrictMeetAttempts(attempts = {}) {
  const opener = Number(attempts.opener) || 0;
  let secondAttempt = Number(
    attempts.secondAttempt ?? attempts.second
  ) || 0;
  let thirdAttempt = Number(
    attempts.thirdAttempt ?? attempts.third
  ) || 0;

  if (opener > 0 && secondAttempt <= opener) {
    secondAttempt = opener + MINIMUM_MEET_ATTEMPT_STEP_KG;
  }

  if (secondAttempt > 0 && thirdAttempt <= secondAttempt) {
    thirdAttempt = secondAttempt + MINIMUM_MEET_ATTEMPT_STEP_KG;
  }

  return { opener, secondAttempt, thirdAttempt };
}

export function buildMeetAttemptsFromOneRM(oneRM = 0) {
  const base = Number(oneRM) || 0;

  if (!(base > 0)) {
    return { opener: 0, secondAttempt: 0, thirdAttempt: 0 };
  }

  return ensureStrictMeetAttempts({
    opener: roundBarbellWeight(base * 0.9, 'nearest', 2.5),
    secondAttempt: roundBarbellWeight(base * 0.975, 'nearest', 2.5),
    thirdAttempt: roundBarbellWeight(base * 1.025, 'nearest', 2.5),
  });
}
