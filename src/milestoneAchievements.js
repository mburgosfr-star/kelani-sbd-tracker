import {
  LIFT_ORDER,
  calculateAchievedMaxesFromHistory,
  calculateStrengthRatioMaxes,
  getAthleteLevel,
  mergeStrengthRatioMaxes,
  roundE1RM,
} from './workoutHistoryStats';
import {
  calculateActualOneRMsFromHistory,
  mergeHigherOneRMs,
} from './oneRMState';

const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced', 'elite'];

function buildMilestoneSnapshot({
  history = [],
  prs = {},
  oneRMs = {},
  bodyWeights = [],
  strengthRatioMaxes = {},
} = {}) {
  const establishedOneRMs = mergeHigherOneRMs(
    oneRMs,
    calculateActualOneRMsFromHistory(history)
  );
  const achievedMaxes = calculateAchievedMaxesFromHistory(history);
  const lifts = Object.fromEntries(LIFT_ORDER.map(lift => {
    const oneRM = roundE1RM(establishedOneRMs[lift]);
    const e1RM = Math.max(
      oneRM,
      roundE1RM(achievedMaxes?.[lift]?.e1rm)
    );

    return [lift, { oneRM, e1RM }];
  }));
  const totals = LIFT_ORDER.reduce((result, lift) => ({
    oneRM: result.oneRM + lifts[lift].oneRM,
    e1RM: result.e1RM + lifts[lift].e1RM,
  }), { oneRM: 0, e1RM: 0 });
  const ratioMaxes = mergeStrengthRatioMaxes(
    strengthRatioMaxes,
    calculateStrengthRatioMaxes({
      prs,
      oneRMs: establishedOneRMs,
      history,
      bodyWeights,
    })
  );

  return {
    lifts,
    totals,
    strengthMax: Number(ratioMaxes.strengthMax) || 0,
    eStrengthMax: Number(ratioMaxes.eStrengthMax) || 0,
    athleteLevel: getAthleteLevel({
      prs,
      history,
      bodyWeights,
      strengthRatioMaxes: ratioMaxes,
    }),
  };
}

function weightAchievement(type, lift, beforeValue, afterValue) {
  if (!(afterValue > beforeValue)) return null;

  return {
    type,
    lift,
    previous: beforeValue,
    value: afterValue,
    gain: afterValue - beforeValue,
  };
}

function ratioAchievement(type, beforeValue, afterValue) {
  if (!(afterValue > beforeValue)) return null;

  return {
    type,
    previous: beforeValue,
    value: afterValue,
    gain: Math.round((afterValue - beforeValue) * 100) / 100,
  };
}

export function buildMilestoneCelebration({
  before = {},
  after = {},
  completionId = null,
} = {}) {
  const beforeSnapshot = buildMilestoneSnapshot(before);
  const afterSnapshot = buildMilestoneSnapshot(after);
  const achievements = [];

  const beforeLevelIndex = LEVEL_ORDER.indexOf(beforeSnapshot.athleteLevel);
  const afterLevelIndex = LEVEL_ORDER.indexOf(afterSnapshot.athleteLevel);
  if (afterLevelIndex > beforeLevelIndex) {
    achievements.push({
      type: 'level',
      previous: beforeSnapshot.athleteLevel,
      value: afterSnapshot.athleteLevel,
    });
  }

  LIFT_ORDER.forEach(lift => {
    const achievement = weightAchievement(
      'oneRM',
      lift,
      beforeSnapshot.lifts[lift].oneRM,
      afterSnapshot.lifts[lift].oneRM
    );
    if (achievement) achievements.push(achievement);
  });
  const totalOneRM = weightAchievement(
    'oneRM',
    'Total',
    beforeSnapshot.totals.oneRM,
    afterSnapshot.totals.oneRM
  );
  if (totalOneRM) achievements.push(totalOneRM);

  LIFT_ORDER.forEach(lift => {
    const achievement = weightAchievement(
      'e1RM',
      lift,
      beforeSnapshot.lifts[lift].e1RM,
      afterSnapshot.lifts[lift].e1RM
    );
    if (achievement) achievements.push(achievement);
  });
  const totalE1RM = weightAchievement(
    'e1RM',
    'Total',
    beforeSnapshot.totals.e1RM,
    afterSnapshot.totals.e1RM
  );
  if (totalE1RM) achievements.push(totalE1RM);

  const strengthMax = ratioAchievement(
    'strengthMax',
    beforeSnapshot.strengthMax,
    afterSnapshot.strengthMax
  );
  if (strengthMax) achievements.push(strengthMax);

  const eStrengthMax = ratioAchievement(
    'eStrengthMax',
    beforeSnapshot.eStrengthMax,
    afterSnapshot.eStrengthMax
  );
  if (eStrengthMax) achievements.push(eStrengthMax);

  if (!achievements.length) return null;

  return {
    version: 1,
    completionId,
    primaryType: achievements[0].type,
    achievements,
  };
}
