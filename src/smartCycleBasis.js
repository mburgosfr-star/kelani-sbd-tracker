import {
  LIFT_ORDER,
  calculateAchievedMaxesFromHistory,
  calculateBestMaxesFromHistory,
  roundE1RM,
} from './workoutHistoryStats';

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function normalizeCycleE1RMs(values = {}, fallback = {}) {
  return LIFT_ORDER.reduce((normalized, lift) => {
    const value = positiveNumber(values?.[lift]) || positiveNumber(fallback?.[lift]);
    normalized[lift] = roundE1RM(value);
    return normalized;
  }, {});
}

export function hasCompleteCycleE1RMs(values = {}) {
  return LIFT_ORDER.every(lift => positiveNumber(values?.[lift]) > 0);
}

// Reconstruct the basis that existed at the start of `currentCycle`.
// Current-cycle results are deliberately excluded: they may improve live
// PRs, but must never move the remaining prescriptions in that same cycle.
export function deriveCycleE1RMs({
  savedCycleE1RMs = {},
  prs = {},
  history = [],
  currentCycle = 1,
} = {}) {
  const cycle = Math.max(Number(currentCycle) || 1, 1);
  const priorHistory = (Array.isArray(history) ? history : []).filter(entry => (
    entry?.seedMax ||
    Number(entry?.cycle) < cycle
  ));
  const explicitBaselineHistory = priorHistory.filter(entry => (
    entry?.seedMax || entry?.manualMax
  ));
  const baselines = calculateBestMaxesFromHistory(explicitBaselineHistory);
  const achieved = calculateAchievedMaxesFromHistory(priorHistory);

  const reconstructed = LIFT_ORDER.reduce((result, lift) => {
    const historicalBasis = Math.max(
      positiveNumber(baselines?.[lift]?.oneRM),
      positiveNumber(baselines?.[lift]?.e1rm),
      positiveNumber(achieved?.[lift]?.oneRM),
      positiveNumber(achieved?.[lift]?.e1rm)
    );
    result[lift] = historicalBasis || positiveNumber(prs?.[lift]);
    return result;
  }, {});

  // A persisted value is authoritative per lift. The reconstructed values
  // only migrate older records or repair an incomplete saved object.
  return normalizeCycleE1RMs(savedCycleE1RMs, reconstructed);
}

export function buildNextCycleE1RMs({ prs = {}, history = [], nextCycle = 1 } = {}) {
  return deriveCycleE1RMs({
    prs,
    history,
    currentCycle: nextCycle,
  });
}
