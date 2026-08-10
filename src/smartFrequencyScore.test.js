import {
  SMART_INTENSITY_POINTS,
  SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL,
  getSmartFrequencyScoreTargets,
  getSmartIntensityRole,
  computeSmartFrequencyScoreState,
  isHeavySmartLiftBlock,
} from './smartFrequencyPolicy';
import { EXPOSURE_TARGETS_BY_LEVEL } from './smartPrescriptionEngine';
import { getSmartMaxConsecutiveTrainingDays } from './smartTrainingConstants';
import { getProjectedSmartLiftEligibility } from './smartTrainingEngine';

test('uses the agreed maximum consecutive training days by level and lift', () => {
  expect(getSmartMaxConsecutiveTrainingDays('beginner', 'Bench')).toBe(2);
  expect(getSmartMaxConsecutiveTrainingDays('intermediate', 'Bench')).toBe(2);
  expect(getSmartMaxConsecutiveTrainingDays('advanced', 'Squat')).toBe(2);
  expect(getSmartMaxConsecutiveTrainingDays('advanced', 'Bench')).toBe(3);
  expect(getSmartMaxConsecutiveTrainingDays('elite', 'Squat')).toBe(3);
  expect(getSmartMaxConsecutiveTrainingDays('elite', 'Bench')).toBe(3);
  ['beginner', 'intermediate', 'advanced', 'elite'].forEach(level => {
    expect(getSmartMaxConsecutiveTrainingDays(level, 'Deadlift')).toBe(2);
  });
});

function makeLiftBlock(lift, role, overrides = {}) {
  const doseByRole = {
    primary: { count: 1, pct: 0.90, reps: 3, labelKey: 'topTriple' },
    secondary: { count: 6, pct: 0.75, reps: 4, labelKey: 'workSets' },
    tertiary: { count: 2, pct: 0.60, reps: 4, labelKey: 'workSets' },
  };
  const dose = doseByRole[role] || doseByRole.tertiary;
  return {
    lift,
    role,
    sets: Array.from({ length: dose.count }, () => ({
      labelKey: dose.labelKey,
      pct: dose.pct,
      reps: dose.reps,
    })),
    ...overrides,
  };
}

function addWorkout(history, cycle, workoutNumber, lifts = []) {
  if (lifts.length === 0) {
    history.push({
      cycle,
      workoutNumber,
      restDay: true,
      workoutSnapshot: { type: 'rest' },
    });
    return;
  }

  history.push({
    cycle,
    workoutNumber,
    lift: lifts[0].lift,
    workoutSnapshot: {
      type: 'training',
      lifts: lifts.map(({ lift, role, overrides }) =>
        makeLiftBlock(lift, role, overrides)),
    },
  });
}

describe('frequency-score table', () => {
  const expectedSpacing = {
    beginner: { Squat: [3, 4], Bench: [2, 3], Deadlift: [7, 7] },
    intermediate: { Squat: [2, 3], Bench: [1, 2], Deadlift: [3, 4] },
    advanced: { Squat: [1, 2], Bench: [1, 2], Deadlift: [2, 3] },
    elite: { Squat: [1, 2], Bench: [1, 2], Deadlift: [1, 2] },
  };
  const expected = {
    beginner: {
      Squat: { score: 5, days: 2, mix: { heavy: 1, medium: 1, light: 0 } },
      Bench: { score: 6, days: 3, mix: { heavy: 1, medium: 1, light: 1 } },
      Deadlift: { score: 3, days: 1, mix: { heavy: 1, medium: 0, light: 0 } },
    },
    intermediate: {
      Squat: { score: 6, days: 3, mix: { heavy: 1, medium: 1, light: 1 } },
      Bench: { score: 7, days: 4, mix: { heavy: 1, medium: 1, light: 2 } },
      Deadlift: { score: 5, days: 2, mix: { heavy: 1, medium: 1, light: 0 } },
    },
    advanced: {
      Squat: { score: 7, days: 4, mix: { heavy: 1, medium: 1, light: 2 } },
      Bench: { score: 9, days: 5, mix: { heavy: 1, medium: 2, light: 2 } },
      Deadlift: { score: 6, days: 3, mix: { heavy: 1, medium: 1, light: 1 } },
    },
    elite: {
      Squat: { score: 9, days: 5, mix: { heavy: 1, medium: 2, light: 2 } },
      Bench: { score: 10, days: 6, mix: { heavy: 1, medium: 2, light: 3 } },
      Deadlift: { score: 7, days: 4, mix: { heavy: 1, medium: 1, light: 2 } },
    },
  };

  test.each(
    Object.entries(expected).flatMap(([level, lifts]) =>
      Object.entries(lifts).map(([lift, spec]) => [level, lift, spec]))
  )('%s %s: score %s matches 3x heavy + 2x medium + 1x light, days %s', (level, lift, spec) => {
    const target = SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL[level][lift];

    expect(target.score).toBe(spec.score);
    expect(target.days).toBe(spec.days);
    expect(target.defaultMix).toEqual(spec.mix);
    expect(target.idealSpacingDays).toEqual({
      min: expectedSpacing[level][lift][0],
      max: expectedSpacing[level][lift][1],
    });

    const computedScore =
      spec.mix.heavy * SMART_INTENSITY_POINTS.heavy +
      spec.mix.medium * SMART_INTENSITY_POINTS.medium +
      spec.mix.light * SMART_INTENSITY_POINTS.light;

    expect(computedScore).toBe(spec.score);
  });

  test('getSmartFrequencyScoreTargets falls back to intermediate for an unknown level', () => {
    expect(getSmartFrequencyScoreTargets('not-a-real-level'))
      .toBe(SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL.intermediate);
  });
});

describe('EXPOSURE_TARGETS_BY_LEVEL (smartPrescriptionEngine.js) is derived from the score table', () => {
  test.each(
    Object.entries(SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL).flatMap(
      ([level, lifts]) => Object.entries(lifts).map(([lift, target]) =>
        [level, lift, target.days])
    )
  )('%s %s exposure target equals the score table\'s days (%s)', (level, lift, days) => {
    expect(EXPOSURE_TARGETS_BY_LEVEL[level][lift]).toBe(days);
  });

  test('the table intentionally raises Elite Deadlift from 3 to 4 days/week (was a flat 3 under the old hand-maintained table)', () => {
    expect(EXPOSURE_TARGETS_BY_LEVEL.elite.Deadlift).toBe(4);
  });
});

describe('getSmartIntensityRole', () => {
  test('uses the structural role only when a block has no measurable work dose', () => {
    expect(getSmartIntensityRole({ lift: 'Squat', role: 'primary', sets: [] }))
      .toBe('heavy');
    expect(getSmartIntensityRole({ lift: 'Squat', role: 'secondary', sets: [] }))
      .toBe('medium');
    expect(getSmartIntensityRole({ lift: 'Squat', role: 'tertiary', sets: [] }))
      .toBe('light');
  });

  test('uses an explicit intended intensity only when a block has no measurable work dose', () => {
    expect(getSmartIntensityRole({
      lift: 'Bench',
      role: 'secondary',
      intensityRole: 'light',
      sets: [],
    })).toBe('light');

    expect(getSmartIntensityRole({
      lift: 'Squat',
      role: 'secondary',
      intensityRole: 'medium',
      sets: [],
    })).toBe('medium');
  });

  test('keeps the stored intended label for a completed historical workout', () => {
    expect(getSmartIntensityRole({
      lift: 'Deadlift',
      intensityRole: 'light',
      sets: Array.from({ length: 6 }, () => ({
        labelKey: 'workSets', pct: 0.70, reps: 4, done: true,
      })),
    })).toBe('light');
  });

  test('classifies complete sessions from nonlinear percentage-weighted load', () => {
    expect(getSmartIntensityRole({
      lift: 'Bench',
      intensityRole: 'light',
      sets: Array.from({ length: 6 }, () => ({ labelKey: 'workSets', pct: 0.70, reps: 4 })),
    })).toBe('medium');

    expect(getSmartIntensityRole({
      lift: 'Bench',
      sets: Array.from({ length: 6 }, () => ({ labelKey: 'workSets', pct: 0.75, reps: 4 })),
    })).toBe('medium');

    expect(getSmartIntensityRole({
      lift: 'Bench',
      sets: Array.from({ length: 2 }, () => ({ labelKey: 'workSets', pct: 0.60, reps: 4 })),
    })).toBe('light');
  });

  test('keeps the planned medium floor for the reported 6x4x65% Deadlift session', () => {
    expect(getSmartIntensityRole({
      lift: 'Deadlift',
      role: 'secondary',
      intensityRole: 'medium',
      sets: Array.from({ length: 6 }, () => ({
        labelKey: 'workSets', pct: 0.65, reps: 4, weight: 115,
      })),
    })).toBe('medium');
  });

  test('separates the W36-style 6×4×75% medium dose from W41-style 6×4×66% light work', () => {
    expect(getSmartIntensityRole({
      lift: 'Squat',
      sets: Array.from({ length: 6 }, () => ({ labelKey: 'workSets', pct: 0.75, reps: 4 })),
    })).toBe('medium');
    expect(getSmartIntensityRole({
      lift: 'Squat',
      sets: Array.from({ length: 6 }, () => ({ labelKey: 'workSets', pct: 0.66, reps: 4 })),
    })).toBe('light');
  });

  test('counts every work set instead of classifying from the heaviest set', () => {
    expect(getSmartIntensityRole({
      lift: 'Bench',
      sets: [
        { labelKey: 'topTriple', pct: 0.90, reps: 3 },
        ...Array.from({ length: 5 }, () => ({ labelKey: 'backoff', pct: 0.70, reps: 4 })),
      ],
    })).toBe('heavy');
    expect(getSmartIntensityRole({
      lift: 'Bench',
      sets: [{ labelKey: 'topTriple', pct: 0.90, reps: 3 }],
    })).toBe('heavy');
    expect(getSmartIntensityRole({
      lift: 'Bench',
      sets: Array.from({ length: 4 }, () => ({ labelKey: 'workSets', pct: 0.70, reps: 4 })),
    })).toBe('light');
  });

  test('an empty lift block is light', () => {
    expect(getSmartIntensityRole({ lift: 'Deadlift', sets: [] })).toBe('light');
  });

  test('does not change isHeavySmartLiftBlock behavior - stays a fully separate function', () => {
    const block = { lift: 'Squat', role: 'secondary', sets: [{ labelKey: 'workSets', pct: 0.70, reps: 5 }] };

    expect(isHeavySmartLiftBlock(block)).toBe(false);
    expect(getSmartIntensityRole(block)).toBe('light');
  });
});

describe('ideal lift spacing', () => {
  test('intermediate Deadlift is unavailable two days after its last exposure and available after three', () => {
    const history = [{
      cycle: 3,
      workoutNumber: 39,
      lift: 'Deadlift',
      workoutSnapshot: {
        type: 'training',
        lifts: [{ lift: 'Deadlift', role: 'primary', sets: [] }],
      },
    }];

    const tooSoon = getProjectedSmartLiftEligibility({
      history,
      currentCycle: 3,
      athleteLevel: 'intermediate',
      targetWorkoutNumber: 41,
    });
    const onTime = getProjectedSmartLiftEligibility({
      history,
      currentCycle: 3,
      athleteLevel: 'intermediate',
      targetWorkoutNumber: 42,
    });

    expect(tooSoon.spacingDaysByLift.Deadlift).toBe(2);
    expect(tooSoon.spacingEligibleLifts).not.toContain('Deadlift');
    expect(onTime.spacingEligibleLifts).toContain('Deadlift');
  });
});

describe('computeSmartFrequencyScoreState', () => {
  test('an athlete with no history yet has full remaining budget for every lift', () => {
    const state = computeSmartFrequencyScoreState({
      history: [],
      currentCycle: 1,
      workoutNumber: 1,
      athleteLevel: 'intermediate',
    });

    expect(state.Squat.scoreSoFar).toBe(0);
    expect(state.Squat.targetScore).toBe(6);
    expect(state.Squat.remainingScore).toBe(6);
    expect(state.Squat.remainingMix).toEqual({ heavy: 1, medium: 1, light: 1 });
    expect(state.Deadlift.targetScore).toBe(5);
  });

  test('a week matching the exact default mix reaches the target score with nothing remaining', () => {
    const history = [];
    addWorkout(history, 3, 20, [{ lift: 'Squat', role: 'primary' }]);
    addWorkout(history, 3, 21, [{ lift: 'Squat', role: 'secondary' }]);
    addWorkout(history, 3, 22, [{ lift: 'Squat', role: 'tertiary' }]);

    const state = computeSmartFrequencyScoreState({
      history,
      currentCycle: 3,
      workoutNumber: 23,
      athleteLevel: 'intermediate',
    });

    expect(state.Squat.exposures).toEqual({ heavy: 1, medium: 1, light: 1 });
    expect(state.Squat.scoreSoFar).toBe(6);
    expect(state.Squat.remainingScore).toBe(0);
    expect(state.Squat.remainingMix).toEqual({ heavy: 0, medium: 0, light: 0 });
  });

  test('a flexible mix (e.g. two medium sessions instead of one medium + one light) still counts toward the score, not the fixed default composition', () => {
    const history = [];
    addWorkout(history, 3, 20, [{ lift: 'Bench', role: 'primary' }]);
    addWorkout(history, 3, 21, [{ lift: 'Bench', role: 'secondary' }]);
    addWorkout(history, 3, 22, [{ lift: 'Bench', role: 'secondary' }]);

    const state = computeSmartFrequencyScoreState({
      history,
      currentCycle: 3,
      workoutNumber: 23,
      athleteLevel: 'intermediate',
    });

    // Intermediate Bench target is 7 (1 heavy + 1 medium + 2 light in the
    // default template). Two mediums instead of one medium + one light
    // still contribute the same score per session (heavy=3, medium=2 each).
    expect(state.Bench.exposures).toEqual({ heavy: 1, medium: 2, light: 0 });
    expect(state.Bench.scoreSoFar).toBe(3 + 2 + 2);
    expect(state.Bench.targetScore).toBe(7);
    expect(state.Bench.remainingScore).toBe(0);
  });

  test('legacy 70% secondary snapshots leave the intermediate medium exposure due', () => {
    const history = [];
    addWorkout(history, 3, 38, [{ lift: 'Squat', role: 'primary' }]);
    addWorkout(history, 3, 39, [{
      lift: 'Bench',
      role: 'secondary',
      overrides: {
        intensityRole: 'light',
        sets: [{ labelKey: 'workSets', pct: 0.70, reps: 4, done: true }],
      },
    }]);
    addWorkout(history, 3, 40, [{
      lift: 'Squat',
      role: 'secondary',
      overrides: {
        intensityRole: 'light',
        sets: [{ labelKey: 'workSets', pct: 0.70, reps: 4, done: true }],
      },
    }]);
    addWorkout(history, 3, 41, [{ lift: 'Bench', role: 'primary' }]);
    addWorkout(history, 3, 42, [{
      lift: 'Bench',
      role: 'secondary',
      overrides: {
        intensityRole: 'light',
        sets: [{ labelKey: 'workSets', pct: 0.70, reps: 4, done: true }],
      },
    }]);

    const state = computeSmartFrequencyScoreState({
      history,
      currentCycle: 3,
      workoutNumber: 43,
      athleteLevel: 'intermediate',
    });

    expect(state.Squat.exposures).toEqual({ heavy: 1, medium: 0, light: 1 });
    expect(state.Squat.remainingMix.medium).toBe(1);
    expect(state.Bench.exposures).toEqual({ heavy: 1, medium: 0, light: 2 });
    expect(state.Bench.remainingMix.medium).toBe(1);
  });

  test('only counts exposures inside the rolling 7-workout window before the target workout', () => {
    const history = [];
    // An old heavy Deadlift session far outside the rolling window (more
    // than SMART_FREQUENCY_WINDOW_SIZE - 1 workouts back) must not count.
    addWorkout(history, 3, 1, [{ lift: 'Deadlift', role: 'primary' }]);
    for (let workoutNumber = 2; workoutNumber <= 9; workoutNumber += 1) {
      addWorkout(history, 3, workoutNumber, [{ lift: 'Bench', role: 'primary' }]);
    }

    const state = computeSmartFrequencyScoreState({
      history,
      currentCycle: 3,
      workoutNumber: 10,
      athleteLevel: 'intermediate',
    });

    expect(state.Deadlift.exposures).toEqual({ heavy: 0, medium: 0, light: 0 });
    expect(state.Deadlift.scoreSoFar).toBe(0);
  });

  test('falls back to the intermediate table for an unrecognized athlete level', () => {
    const state = computeSmartFrequencyScoreState({
      history: [],
      currentCycle: 1,
      workoutNumber: 1,
      athleteLevel: 'not-a-real-level',
    });

    expect(state.Squat.targetScore).toBe(6);
  });
});
