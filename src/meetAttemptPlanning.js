import { roundBarbellWeight } from './smartFrequencyPolicy';

const meetStep = value => value === 0.5 ? 0.5 : 2.5;

export function ensureStrictMeetAttempts(attempts = {}, incrementKg = 2.5) {
  const step = meetStep(incrementKg);
  const opener = Number(attempts.opener) || 0;
  let secondAttempt = Number(
    attempts.secondAttempt ?? attempts.second
  ) || 0;
  let thirdAttempt = Number(
    attempts.thirdAttempt ?? attempts.third
  ) || 0;

  if (opener > 0 && secondAttempt <= opener) {
    secondAttempt = opener + step;
  }

  if (secondAttempt > 0 && thirdAttempt <= secondAttempt) {
    thirdAttempt = secondAttempt + step;
  }

  return { opener, secondAttempt, thirdAttempt };
}

export function buildMeetAttemptsFromOneRM(oneRM = 0, incrementKg = 2.5) {
  const base = Number(oneRM) || 0;
  const step = meetStep(incrementKg);

  if (!(base > 0)) {
    return { opener: 0, secondAttempt: 0, thirdAttempt: 0 };
  }

  return ensureStrictMeetAttempts({
    opener: roundBarbellWeight(base * 0.9, 'nearest', step),
    secondAttempt: roundBarbellWeight(base * 0.975, 'nearest', step),
    thirdAttempt: roundBarbellWeight(base * 1.025, 'nearest', step),
  }, step);
}

// Anchor the third attempt before rounding earlier attempts. Small maxima
// must not gain an unintended extra step above the rounded 100% target.
export function buildMeetAttemptsFromE1RM(e1RM = 0, incrementKg = 2.5) {
  const base = Number(e1RM);
  const step = meetStep(incrementKg);
  if (!Number.isFinite(base) || base <= 0) {
    return { opener: 0, secondAttempt: 0, thirdAttempt: 0 };
  }
  const thirdAttempt = roundBarbellWeight(base, 'nearest', step);
  const secondAttempt = Math.min(
    roundBarbellWeight(base * 0.95, 'nearest', step), thirdAttempt - step
  );
  const opener = Math.min(
    roundBarbellWeight(base * 0.9, 'nearest', step), secondAttempt - step
  );
  // Three positive attempts require at least three chosen load increments.
  // Keep all weights positive; the normal strict-step fallback is the only
  // feasible plan at this boundary.
  return opener > 0 ? { opener, secondAttempt, thirdAttempt }
    : ensureStrictMeetAttempts({ opener: step, secondAttempt: step * 2, thirdAttempt: step * 3 }, step);
}
