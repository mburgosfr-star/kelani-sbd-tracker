import { roundBarbellWeight } from './smartFrequencyPolicy';
import { LIFT_ORDER, isTopSetLabel, normalizeCooldownMode } from './workoutHistoryStats';
import {
  normalizeProgramProfile,
  normalizePreparationMode,
  normalizeBenchPressVariant,
  normalizeSquatVariant,
  normalizeDeadliftVariant,
} from './programProfiles';
import { generatePrepItems, generateWarmups } from './warmupAndPrepGeneration';
import {
  generateSquatAlternativeSets,
  generateSquatHomeAlternativeSets,
  generateBenchMachineAlternativeSets,
  generateBenchHomeAlternativeSets,
  generateBenchGoodMorningSets,
  generateDeadliftAlternativeSets,
  generateDeadliftHomeAlternativeSets,
  generateAccessoriesForLift,
} from './accessoryGeneration';

export function generateCooldownItems(cooldownMode = 'upperBackFriendly') {
  if (normalizeCooldownMode(cooldownMode) === 'off') return [];

  return [
    {
      labelKey: 'cooldownRhomboidStretch',
      prescription: '4×10 sec',
      perSide: true,
      done: false,
    },
    {
      labelKey: 'cooldownMassage',
      prescription: '2–5 min',
      done: false,
    },
  ];
}

function generateProgram(s, b, d, accessoryMode = 'off', accessoryPRs = {}, preparationMode = 'basicFirst', deadliftVariant = 'standard', benchPressVariant = 'standard', squatVariant = 'standard', cooldownMode = 'upperBackFriendly', programOverride = null) {
  function round25(w) {
  return roundBarbellWeight(w);
}

  const oneRMs = {
    Squat: s,
    Bench: b,
    Deadlift: d,
  };

  const normalizedPreparationMode = normalizePreparationMode(preparationMode);
  const normalizedCooldownMode = normalizeCooldownMode(cooldownMode);
  const normalizedDeadliftVariant = normalizeDeadliftVariant(deadliftVariant);
  const normalizedBenchPressVariant = normalizeBenchPressVariant(benchPressVariant);
  const normalizedSquatVariant = normalizeSquatVariant(squatVariant);

  const program = programOverride || [
    // Build block 1: technique and base volume without testing.
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 3, pct: 0.750, labelKey: 'topTriple' }, { sets: 2, reps: 5, pct: 0.650, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 5, pct: 0.600, labelKey: 'workSets' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 3, pct: 0.700, labelKey: 'topTriple' }, { sets: 2, reps: 4, pct: 0.625, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 3, pct: 0.750, labelKey: 'topTriple' }, { sets: 3, reps: 5, pct: 0.650, labelKey: 'backoff' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 3, pct: 0.775, labelKey: 'topTriple' }, { sets: 2, reps: 5, pct: 0.675, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 4, reps: 5, pct: 0.675, labelKey: 'workSets' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 3, pct: 0.725, labelKey: 'topTriple' }, { sets: 2, reps: 4, pct: 0.650, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 2, reps: 5, pct: 0.600, labelKey: 'backoff' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },

    // Build block 2: heavier doubles and specific bench work.
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 2, pct: 0.825, labelKey: 'topDouble' }, { sets: 2, reps: 4, pct: 0.725, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 5, pct: 0.625, labelKey: 'workSets' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 2, pct: 0.775, labelKey: 'topDouble' }, { sets: 2, reps: 3, pct: 0.700, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 2, pct: 0.825, labelKey: 'topDouble' }, { sets: 3, reps: 4, pct: 0.725, labelKey: 'backoff' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 2, pct: 0.850, labelKey: 'topDouble' }, { sets: 2, reps: 3, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 4, reps: 3, pct: 0.750, labelKey: 'workSets' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 2, pct: 0.800, labelKey: 'topDouble' }, { sets: 2, reps: 3, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 2, reps: 4, pct: 0.625, labelKey: 'backoff' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },

    // Intensification: singles are practice, not max attempts.
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.875, labelKey: 'topSingle' }, { sets: 1, reps: 3, pct: 0.750, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 2, reps: 4, pct: 0.650, labelKey: 'workSets' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.825, labelKey: 'topSingle' }, { sets: 1, reps: 3, pct: 0.700, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.875, labelKey: 'topSingle' }, { sets: 2, reps: 3, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 2, reps: 3, pct: 0.650, labelKey: 'workSets' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 3, pct: 0.700, labelKey: 'workSets' }] }] },

    // Peak and taper: express strength, do not build fatigue.
    { type: 'training', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'topSingle' }, { sets: 1, reps: 2, pct: 0.600, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'topSingle' }, { sets: 1, reps: 2, pct: 0.650, labelKey: 'backoff' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },
    { type: 'training', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.850, labelKey: 'topSingle' }, { sets: 2, reps: 2, pct: 0.700, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Squat', blocks: [{ sets: 2, reps: 3, pct: 0.500, labelKey: 'workSets' }] }, { lift: 'Bench', blocks: [{ sets: 2, reps: 3, pct: 0.500, labelKey: 'workSets' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },
  ];

  const workouts = [];

  function buildLiftBlock(liftConfig, liftIndex = 0) {
    const isSquatBeltAlternative =
      liftConfig.lift === 'Squat' && normalizedSquatVariant === 'beltSquat';
    const isSquatHomeAlternative =
      liftConfig.lift === 'Squat' && normalizedSquatVariant === 'zercherSquat';
    const isDeadliftAlternative =
      liftConfig.lift === 'Deadlift' && normalizedDeadliftVariant === 'alternative';
    const isDeadliftHomeAlternative =
      liftConfig.lift === 'Deadlift' && normalizedDeadliftVariant === 'hipThrust';
    const isBenchMachineAlternative =
      liftConfig.lift === 'Bench' && normalizedBenchPressVariant === 'machineAlternative';
    const isBenchHomeAlternative =
      liftConfig.lift === 'Bench' && normalizedBenchPressVariant === 'shoulderPress';
    const isBenchGoodMorningAlternative =
      liftConfig.lift === 'Bench' && normalizedBenchPressVariant === 'goodMorning';

    const sets = isSquatBeltAlternative
      ? generateSquatAlternativeSets(oneRMs)
      : isSquatHomeAlternative
        ? generateSquatHomeAlternativeSets(oneRMs)
        : isDeadliftAlternative
          ? generateDeadliftAlternativeSets(oneRMs)
          : isDeadliftHomeAlternative
            ? generateDeadliftHomeAlternativeSets(oneRMs)
            : isBenchMachineAlternative
              ? generateBenchMachineAlternativeSets(oneRMs)
              : isBenchHomeAlternative
                ? generateBenchHomeAlternativeSets(oneRMs)
                : isBenchGoodMorningAlternative
                  ? generateBenchGoodMorningSets(oneRMs)
                  : [];

    if (!isSquatBeltAlternative && !isSquatHomeAlternative && !isDeadliftAlternative && !isDeadliftHomeAlternative && !isBenchMachineAlternative && !isBenchHomeAlternative && !isBenchGoodMorningAlternative) {
      liftConfig.blocks.forEach((block, blockIndex) => {
        const hasPriorTopBlock = liftConfig.blocks
          .slice(0, blockIndex)
          .some(previousBlock =>
            isTopSetLabel(previousBlock.labelKey) ||
            previousBlock.labelKey === 'opener'
          );

        let labelKey = block.labelKey || null;

        if (labelKey === 'backoff' && (!hasPriorTopBlock || liftConfig.isSecondaryLight)) {
          labelKey = 'workSets';
        }

        for (let i = 0; i < block.sets; i++) {
          const weight = round25(oneRMs[liftConfig.lift] * block.pct);

          sets.push({
            labelKey,
            label: block.label || null,
            reps: block.reps,
            pct: block.pct,
            weight,
            originalWeight: weight,
            originalPct: block.pct,
            done: false,
          });
        }
      });
    }


    const includePreparation =
      liftIndex === 0 ||
      normalizedPreparationMode === 'basicAll';

    return {
      lift: liftConfig.lift,
      squatVariant: liftConfig.lift === 'Squat' ? normalizedSquatVariant : undefined,
      deadliftVariant: liftConfig.lift === 'Deadlift' ? normalizedDeadliftVariant : undefined,
      benchPressVariant: liftConfig.lift === 'Bench' ? normalizedBenchPressVariant : undefined,
      prepItems: includePreparation ? generatePrepItems(liftConfig.lift, normalizedPreparationMode) : [],
      warmups: generateWarmups(sets, liftConfig.lift),
      sets,
    };
  }

  program.forEach((day, dayIndex) => {
    if (day.type === 'rest') {
      workouts.push({
        number: dayIndex + 1,
        type: 'rest',
        lift: null,
        label: day.label,
        labelKey: day.labelKey,
        workoutEffort: day.workoutEffort || 'easy',
        lifts: [],
        prepItems: [],
        warmups: [],
        sets: [],
        accessories: [],
        cooldownItems: [],
      });
      return;
    }

    const liftBlocks = day.lifts.map((liftConfig, liftIndex) =>
      buildLiftBlock({
        ...liftConfig,
        isSecondaryLight: liftIndex > 0,
      }, liftIndex)
    );
    const primaryLift = liftBlocks[0]?.lift;

    workouts.push({
      number: dayIndex + 1,
      type: day.type,
      lift: primaryLift,
      label: day.label,
      labelKey: day.labelKey,
      lifts: liftBlocks,
      prepItems: liftBlocks[0]?.prepItems || [],
      warmups: liftBlocks[0]?.warmups || [],
      sets: liftBlocks[0]?.sets || [],
      accessories: day.disableAccessories ? [] : generateAccessoriesForLift(primaryLift, accessoryMode, accessoryPRs, oneRMs),
      cooldownItems: generateCooldownItems(normalizedCooldownMode),
    });
  });

  workouts.push({
  number: 28,
  type: 'meet',
  lift: 'SBD',
  labelKey: 'meetDay',
  lifts: LIFT_ORDER.map(lift => {
    const sets = [
      {
        labelKey: 'opener',
        reps: 1,
        pct: 0.90,
        weight: round25(oneRMs[lift] * 0.90),
        done: false,
      },
      {
        labelKey: 'secondAttempt',
        reps: 1,
        pct: 0.975,
        weight: round25(oneRMs[lift] * 0.975),
        done: false,
      },
      {
        labelKey: 'thirdAttempt',
        reps: 1,
        pct: 1.025,
        weight: round25(oneRMs[lift] * 1.025),
        done: false,
      },
    ];

    return {
      lift,
      prepItems: [],
      warmups: generateWarmups(sets, lift),
      sets,
    };
  }),
  warmups: [],
  sets: [],
  accessories: [],
});

  return workouts;
}

export function generateUltraProgram(s, b, d, accessoryMode = 'off', accessoryPRs = {}, preparationMode = 'basicFirst', deadliftVariant = 'standard', benchPressVariant = 'standard', squatVariant = 'standard', cooldownMode = 'upperBackFriendly') {
  const ultraProgram = [
    // Ultra block 1: high-frequency base, all lifts practiced often.
    { type: 'training', label: 'Ultra Primary SBD', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 3, pct: 0.725, labelKey: 'topTriple' }, { sets: 2, reps: 5, pct: 0.625, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 5, pct: 0.600, labelKey: 'workSets' }] }, { lift: 'Deadlift', blocks: [{ sets: 2, reps: 3, pct: 0.600, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Primary Bench', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 3, pct: 0.750, labelKey: 'topTriple' }, { sets: 3, reps: 5, pct: 0.650, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 3, reps: 5, pct: 0.600, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Primary Squat', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 3, pct: 0.775, labelKey: 'topTriple' }, { sets: 2, reps: 5, pct: 0.675, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 4, reps: 4, pct: 0.650, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Primary Deadlift', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 3, pct: 0.700, labelKey: 'topTriple' }, { sets: 2, reps: 4, pct: 0.625, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 5, pct: 0.600, labelKey: 'workSets' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },

    { type: 'training', label: 'Ultra Squat Volume', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 4, reps: 4, pct: 0.675, labelKey: 'workSets' }] }, { lift: 'Bench', blocks: [{ sets: 4, reps: 4, pct: 0.625, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Bench + Deadlift Skill', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 3, pct: 0.800, labelKey: 'topTriple' }, { sets: 3, reps: 4, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Deadlift', blocks: [{ sets: 2, reps: 3, pct: 0.600, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Light SBD', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 3, reps: 3, pct: 0.650, labelKey: 'workSets' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 3, pct: 0.650, labelKey: 'workSets' }] }, { lift: 'Deadlift', blocks: [{ sets: 2, reps: 2, pct: 0.600, labelKey: 'workSets' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },

    // Ultra block 2: strength build with all three lifts kept specific.
    { type: 'training', label: 'Ultra Squat Strength', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 2, pct: 0.825, labelKey: 'topDouble' }, { sets: 2, reps: 4, pct: 0.725, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 4, pct: 0.675, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Bench Strength', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 2, pct: 0.825, labelKey: 'topDouble' }, { sets: 3, reps: 4, pct: 0.725, labelKey: 'backoff' }] }, { lift: 'Deadlift', blocks: [{ sets: 3, reps: 3, pct: 0.625, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Deadlift Strength', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 2, pct: 0.775, labelKey: 'topDouble' }, { sets: 2, reps: 3, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 3, reps: 4, pct: 0.625, labelKey: 'workSets' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },

    { type: 'training', label: 'Ultra Heavy Squat Practice', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 2, pct: 0.850, labelKey: 'topDouble' }, { sets: 2, reps: 3, pct: 0.750, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 3, pct: 0.700, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Heavy Bench Practice', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 2, pct: 0.850, labelKey: 'topDouble' }, { sets: 3, reps: 3, pct: 0.750, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 2, reps: 3, pct: 0.650, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Deadlift + Bench Volume', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 2, pct: 0.800, labelKey: 'topDouble' }, { sets: 4, reps: 4, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 4, reps: 4, pct: 0.700, labelKey: 'workSets' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },

    // Ultra block 3: meet-specific singles without max testing.
    { type: 'training', label: 'Ultra Squat Single', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.850, labelKey: 'topSingle' }, { sets: 1, reps: 3, pct: 0.725, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 3, pct: 0.700, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Bench Single', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.850, labelKey: 'topSingle' }, { sets: 2, reps: 3, pct: 0.750, labelKey: 'backoff' }] }, { lift: 'Deadlift', blocks: [{ sets: 2, reps: 2, pct: 0.650, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Deadlift Single', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.825, labelKey: 'topSingle' }, { sets: 1, reps: 2, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 2, reps: 3, pct: 0.625, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra SBD Confidence', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.875, labelKey: 'topSingle' }, { sets: 1, reps: 2, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.825, labelKey: 'topSingle' }, { sets: 1, reps: 2, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.750, labelKey: 'topSingle' }, { sets: 1, reps: 2, pct: 0.650, labelKey: 'backoff' }] }] },

    // Peak and taper: openers, then freshness.
    { type: 'training', label: 'Ultra Squat Opener', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'topSingle' }, { sets: 4, reps: 4, pct: 0.700, labelKey: 'backoff' }] }] },
    { type: 'training', label: 'Ultra Bench Opener', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'topSingle' }, { sets: 1, reps: 2, pct: 0.650, labelKey: 'backoff' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },
    { type: 'training', label: 'Ultra Deadlift Opener-ish', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.850, labelKey: 'topSingle' }] }] },
    { type: 'training', label: 'Ultra Light Squat + Bench', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Squat', blocks: [{ sets: 2, reps: 3, pct: 0.500, labelKey: 'workSets' }] }, { lift: 'Bench', blocks: [{ sets: 2, reps: 3, pct: 0.500, labelKey: 'workSets' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },
  ];

  return generateProgram(
    s,
    b,
    d,
    accessoryMode,
    accessoryPRs,
    preparationMode,
    deadliftVariant,
    benchPressVariant,
    squatVariant,
    cooldownMode,
    ultraProgram
  );
}

export function generateProgramForProfile(programProfile, s, b, d, accessoryMode = 'off', accessoryPRs = {}, preparationMode = 'basicFirst', deadliftVariant = 'standard', benchPressVariant = 'standard', squatVariant = 'standard', cooldownMode = 'upperBackFriendly') {
  if (normalizeProgramProfile(programProfile) === 'kelaniSbdUltra') {
    return generateUltraProgram(s, b, d, accessoryMode, accessoryPRs, preparationMode, deadliftVariant, benchPressVariant, squatVariant, cooldownMode);
  }

  return generateProgram(s, b, d, accessoryMode, accessoryPRs, preparationMode, deadliftVariant, benchPressVariant, squatVariant, cooldownMode);
}
