import { normalizeAccessoryMode } from './workoutHistoryStats';
import {
  accessoriesHaveUserProgress,
  mergeWorkoutPrepItems,
  setHasUserState,
  workoutHasUserProgress,
} from './workoutStateMerge';
import { roundMeetWeight } from './warmupAndPrepGeneration';

const ROW_TEMPLATE = {
  key: 'row', labelKey: 'accessoryRow', sets: 4, reps: 10, source: 'deadlift', pct: 0.25,
};

const ACCESSORY_TEMPLATES = {
  standard: {
    Squat: [
      { key: 'pulldown', labelKey: 'accessoryPulldown', sets: 4, reps: 10, source: 'deadlift', pct: 0.25 },
      { key: 'legCurl', labelKey: 'accessoryLegCurl', sets: 4, reps: 12, source: 'squat', pct: 0.35 },
    ],
    Bench: [
      { key: 'hipThrust', labelKey: 'accessoryHipThrust', sets: 4, reps: 8, source: 'deadlift', pct: 0.60 },
      ROW_TEMPLATE,
    ],
    Deadlift: [
      { key: 'legExtension', labelKey: 'accessoryLegExtension', sets: 4, reps: 12, source: 'squat', pct: 0.35 },
      { key: 'plank', labelKey: 'accessoryPlank', sets: 4, durationSeconds: 30, source: 'bodyweight' },
    ],
  },
  upperBackFriendly: {
    Squat: [
      { key: 'hipAbduction', labelKey: 'accessoryHipAbduction', sets: 4, reps: 12, source: 'squat', pct: 0.45 },
      { key: 'legCurl', labelKey: 'accessoryLegCurl', sets: 4, reps: 12, source: 'squat', pct: 0.35 },
    ],
    Bench: [
      { key: 'lateralRaise', labelKey: 'accessoryLateralRaise', sets: 4, reps: 12, source: 'fixed', weight: 5, perSide: true },
      ROW_TEMPLATE,
    ],
    Deadlift: [
      { key: 'plank', labelKey: 'accessoryPlank', sets: 4, durationSeconds: 30, source: 'bodyweight' },
      { key: 'seatedCalfRaise', labelKey: 'accessorySeatedCalfRaise', sets: 4, reps: 12, source: 'squat', pct: 0.55 },
    ],
  },
  lowerBodyFriendly: {
    Squat: [
      { key: 'hipAbduction', labelKey: 'accessoryHipAbduction', sets: 4, reps: 12, source: 'squat', pct: 0.45 },
      { key: 'plank', labelKey: 'accessoryPlank', sets: 4, durationSeconds: 30, source: 'bodyweight' },
    ],
    Bench: [
      { key: 'legExtension', labelKey: 'accessoryLegExtension', sets: 4, reps: 12, source: 'squat', pct: 0.35 },
      ROW_TEMPLATE,
    ],
    Deadlift: [
      { key: 'legCurl', labelKey: 'accessoryLegCurl', sets: 4, reps: 12, source: 'squat', pct: 0.35 },
      { key: 'seatedCalfRaise', labelKey: 'accessorySeatedCalfRaise', sets: 4, reps: 12, source: 'squat', pct: 0.55 },
    ],
  },
};

function getAccessoryBaseWeight(template, oneRMs, accessoryPRs = {}) {
  if (template.source === 'bodyweight') return 0;

  const previous = Number(accessoryPRs?.[template.key]) || 0;

  if (template.source === 'fixed') {
    return Math.max(template.weight || 2.5, previous || 0);
  }

  const sourceLift = {
    squat: 'Squat',
    bench: 'Bench',
    deadlift: 'Deadlift',
  }[template.source];

  const sourceWeight = Number(oneRMs?.[sourceLift]) || 0;
  const calculated = sourceWeight && template.pct
    ? Math.max(2.5, roundMeetWeight(sourceWeight * template.pct))
    : 20;

  return Math.max(calculated, previous || 0);
}

function makeWorkoutSet({ labelKey, groupKey, reps, weight, perSide = false }) {
  return {
    labelKey,
    groupLabelKey: labelKey,
    groupKey,
    reps,
    weight,
    originalWeight: weight,
    perSide,
    done: false,
  };
}

export function generateSquatAlternativeSets(oneRMs = {}) {
  const beltSquatWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Squat) || 0) * 0.60));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'squatAlternativeBeltSquat',
    groupKey: 'squatAlternativeBeltSquat',
    reps: 10,
    weight: beltSquatWeight,
  }));
}

export function generateSquatHomeAlternativeSets(oneRMs = {}) {
  const zercherSquatWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Squat) || 0) * 0.45));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'squatAlternativeZercherSquat',
    groupKey: 'squatAlternativeZercherSquat',
    reps: 6,
    weight: zercherSquatWeight,
  }));
}

export function generateBenchMachineAlternativeSets(oneRMs = {}) {
  const chestPressWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Bench) || 0) * 0.60));
  const pecDeckWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Bench) || 0) * 0.25));
  const tricepsPushdownWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Bench) || 0) * 0.20));

  return [
    ...Array.from({ length: 3 }, () => makeWorkoutSet({
      labelKey: 'benchMachineAlternativeChestPress',
      groupKey: 'benchMachineAlternativeChestPress',
      reps: 10,
      weight: chestPressWeight,
    })),
    ...Array.from({ length: 3 }, () => makeWorkoutSet({
      labelKey: 'benchMachineAlternativePecDeck',
      groupKey: 'benchMachineAlternativePecDeck',
      reps: 12,
      weight: pecDeckWeight,
    })),
    ...Array.from({ length: 3 }, () => makeWorkoutSet({
      labelKey: 'benchMachineAlternativeTricepsPushdown',
      groupKey: 'benchMachineAlternativeTricepsPushdown',
      reps: 12,
      weight: tricepsPushdownWeight,
    })),
  ];
}

export function generateBenchHomeAlternativeSets(oneRMs = {}) {
  const shoulderPressWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Bench) || 0) * 0.35));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'benchHomeAlternativeShoulderPress',
    groupKey: 'benchHomeAlternativeShoulderPress',
    reps: 6,
    weight: shoulderPressWeight,
  }));
}

export function generateBenchGoodMorningSets(oneRMs = {}) {
  const goodMorningWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Deadlift) || 0) * 0.40));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'benchHomeAlternativeGoodMorning',
    groupKey: 'benchHomeAlternativeGoodMorning',
    reps: 8,
    weight: goodMorningWeight,
  }));
}

export function generateDeadliftAlternativeSets(oneRMs = {}) {
  const legPressWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Squat) || 0) * 0.85));
  const cablePullThroughWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Deadlift) || 0) * 0.25));
  const cableGluteKickbackWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Squat) || 0) * 0.125));

  return [
    ...Array.from({ length: 3 }, () => makeWorkoutSet({
      labelKey: 'deadliftAlternativeLegPress',
      groupKey: 'deadliftAlternativeLegPress',
      reps: 10,
      weight: legPressWeight,
    })),
    ...Array.from({ length: 3 }, () => makeWorkoutSet({
      labelKey: 'deadliftAlternativeCablePullThrough',
      groupKey: 'deadliftAlternativeCablePullThrough',
      reps: 12,
      weight: cablePullThroughWeight,
    })),
    ...Array.from({ length: 3 }, () => makeWorkoutSet({
      labelKey: 'deadliftAlternativeCableGluteKickback',
      groupKey: 'deadliftAlternativeCableGluteKickback',
      reps: 12,
      weight: cableGluteKickbackWeight,
      perSide: true,
    })),
  ];
}

export function generateDeadliftHomeAlternativeSets(oneRMs = {}) {
  const hipThrustWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Deadlift) || 0) * 0.60));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'deadliftHomeAlternativeBarbellHipThrust',
    groupKey: 'deadliftHomeAlternativeBarbellHipThrust',
    reps: 8,
    weight: hipThrustWeight,
  }));
}

export function generateAccessoriesForLift(
  lift,
  accessoryMode = 'off',
  accessoryPRs = {},
  oneRMs = {},
  { lightRow = false } = {}
) {
  const normalizedMode = normalizeAccessoryMode(accessoryMode);
  if (normalizedMode === 'off') return [];

  return (ACCESSORY_TEMPLATES[normalizedMode]?.[lift] || [])
    .map(template => {
      const baseWeight = getAccessoryBaseWeight(template, oneRMs, accessoryPRs);
      const isLightRow = template.key === 'row' && (lightRow || normalizedMode !== 'standard');
      // Keep four accessible grid cells, but halve both reps and load for a
      // light Row. Reduce AFTER the PR floor so a saved Row PR cannot undo it.
      const weight = isLightRow ? Math.max(2.5, roundMeetWeight(baseWeight * 0.5)) : baseWeight;

      return {
        key: template.key,
        nameKey: template.labelKey,
        name: template.labelKey,
        reps: isLightRow ? 5 : template.reps,
        durationSeconds: template.durationSeconds,
        bodyweight: template.source === 'bodyweight',
        perSide: !!template.perSide,
        weights: Array.from({ length: template.sets }, () => weight),
        originalWeights: Array.from({ length: template.sets }, () => weight),
        done: Array.from({ length: template.sets }, () => false),
        failed: Array.from({ length: template.sets }, () => false),
        failedWeights: Array.from({ length: template.sets }, () => null),
        adjustedFromFailedSet: Array.from({ length: template.sets }, () => false),
        adjustedFromOriginal: Array.from({ length: template.sets }, () => false),
      };
    });
}


export function selectSmartAccessoriesForWorkout(
  accessoriesByLift = [],
  { history = [] } = {}
) {
  const normalizedLists = (accessoriesByLift || [])
    .filter(Array.isArray);

  if (normalizedLists.length <= 1) {
    return normalizedLists.flat();
  }

  const completedSnapshots = new Map();
  (history || []).forEach((entry, index) => {
    const snapshot = entry?.workoutSnapshot;
    if (!snapshot) return;

    const cycle = Number(entry?.cycle ?? snapshot?.cycle) || 0;
    const workoutNumber = Number(entry?.workoutNumber ?? snapshot?.number) || index;
    completedSnapshots.set(`${cycle}:${workoutNumber}`, {
      order: index,
      snapshot,
    });
  });

  const accessoryRecency = new Map();
  [...completedSnapshots.values()]
    .sort((a, b) => a.order - b.order)
    .forEach(({ order, snapshot }) => {
      (snapshot.accessories || []).forEach(accessory => {
        if (!(accessory.done || []).some(Boolean)) return;

        const key = accessory?.key || accessory?.nameKey || accessory?.name;
        if (key) accessoryRecency.set(key, order);
      });
    });

  const usedKeys = new Set();
  return normalizedLists.flatMap(accessories => {
    const candidates = (accessories || [])
      .map((accessory, templateIndex) => ({ accessory, templateIndex }))
      .filter(({ accessory }) => {
        const key = accessory?.key || accessory?.nameKey || accessory?.name;
        return key && !usedKeys.has(key);
      })
      .sort((a, b) => {
        const aKey = a.accessory?.key || a.accessory?.nameKey || a.accessory?.name;
        const bKey = b.accessory?.key || b.accessory?.nameKey || b.accessory?.name;
        // Bench always keeps its Row slot; recency only rotates the other
        // accessories, without adding another group to a multi-lift day.
        const requiredOrder = Number(bKey === 'row') - Number(aKey === 'row');
        const aRecency = accessoryRecency.has(aKey) ? accessoryRecency.get(aKey) : -1;
        const bRecency = accessoryRecency.has(bKey) ? accessoryRecency.get(bKey) : -1;
        return requiredOrder || aRecency - bRecency || a.templateIndex - b.templateIndex;
      });
    const selected = candidates[0]?.accessory;

    if (!selected) return [];

    const key = selected.key || selected.nameKey || selected.name;
    usedKeys.add(key);
    return [selected];
  });
}

export function generateAccessoriesForWorkout(workout, {
  accessoryMode = 'off',
  accessoryPRs = {},
  oneRMs = {},
  history = [],
  smart = false,
} = {}) {
  if (workout?.type !== 'training' || normalizeAccessoryMode(accessoryMode) === 'off') return [];

  const lifts = [...new Set(workout.lifts?.length
    ? workout.lifts.map(block => block.lift)
    : [workout.lift].filter(Boolean))];
  const isTaper = workout.accessoryIntensity === 'light' || workout.smartIdealRoute?.stage === 'taper';
  const lightRow = isTaper || workout.smartGeneratedDeload || workout.smartDayType === 'deload';
  const accessoriesByLift = lifts.map(lift => generateAccessoriesForLift(
    lift, accessoryMode, accessoryPRs, oneRMs, { lightRow }
  ));
  const row = accessoriesByLift[lifts.indexOf('Bench')]?.find(item => item.key === 'row');

  // Taper keeps only the light Bench/Row pairing, not the regular accessory
  // programme. Meet and recovery days were excluded above.
  if (isTaper) return row ? [row] : [];

  const accessories = smart
    ? selectSmartAccessoriesForWorkout(accessoriesByLift, { history })
    : (accessoriesByLift[0] || []);

  // Classic retains its primary-lift accessory plan, with the same Row rule
  // when Bench is secondary. Smart selects its Bench slot above.
  return row && !accessories.some(item => item.key === 'row')
    ? [...accessories, row]
    : accessories;
}

export function applyAccessoryPlanToWorkouts(
  workouts,
  generatedWorkouts,
  completedWorkoutNumbers = new Set(),
  activeWorkoutNumber = null
) {
  function accessoryKey(accessory) {
    return accessory?.key || accessory?.nameKey || accessory?.name;
  }

  function mergeAccessory(currentAccessory, generatedAccessory) {
    if (!currentAccessory || !accessoriesHaveUserProgress([currentAccessory])) return generatedAccessory;

    const generatedDone = generatedAccessory.done || [];
    const currentDone = currentAccessory.done || [];
    const currentWeights = currentAccessory.weights || [];
    const generatedWeights = generatedAccessory.weights || [];

    return {
      ...generatedAccessory,
      done: generatedDone.map((done, index) => currentDone[index] ?? done),
      weights: generatedWeights.map((weight, index) => currentWeights[index] ?? weight),
      originalWeights: currentAccessory.originalWeights || generatedAccessory.originalWeights,
      failed: (generatedAccessory.failed || generatedDone.map(() => false)).map((value, index) =>
        currentAccessory.failed?.[index] ?? value
      ),
      failedWeights: (generatedAccessory.failedWeights || generatedDone.map(() => null)).map((value, index) =>
        currentAccessory.failedWeights?.[index] ?? value
      ),
      skipped: (generatedAccessory.skipped || generatedDone.map(() => false)).map((value, index) =>
        currentAccessory.skipped?.[index] ?? value
      ),
      adjustedWeights: (generatedAccessory.adjustedWeights || generatedWeights).map((value, index) =>
        currentAccessory.adjustedWeights?.[index] ?? value
      ),
      adjustedFromFailedSet: (generatedAccessory.adjustedFromFailedSet || generatedDone.map(() => false)).map((value, index) =>
        currentAccessory.adjustedFromFailedSet?.[index] ?? value
      ),
      adjustedFromOriginal: (generatedAccessory.adjustedFromOriginal || generatedDone.map(() => false)).map((value, index) =>
        currentAccessory.adjustedFromOriginal?.[index] ?? value
      ),
    };
  }

  function mergeSet(currentSet, generatedSet) {
    if (!currentSet || !setHasUserState(currentSet)) return generatedSet;

    return {
      ...generatedSet,
      weight: currentSet.weight ?? generatedSet.weight,
      pct: currentSet.pct ?? generatedSet.pct,
      originalWeight: currentSet.originalWeight ?? generatedSet.originalWeight,
      originalPct: currentSet.originalPct ?? generatedSet.originalPct,
      done: currentSet.done ?? generatedSet.done,
      failed: currentSet.failed ?? generatedSet.failed,
      skipped: currentSet.skipped ?? generatedSet.skipped,
      failedAttempts: currentSet.failedAttempts ?? generatedSet.failedAttempts,
      failedWeight: currentSet.failedWeight ?? generatedSet.failedWeight,
      adjustedWeight: currentSet.adjustedWeight ?? generatedSet.adjustedWeight,
      effort: currentSet.effort ?? generatedSet.effort,
      adjustedFromFailedSet: currentSet.adjustedFromFailedSet ?? generatedSet.adjustedFromFailedSet,
      adjustedFromOriginal: currentSet.adjustedFromOriginal ?? generatedSet.adjustedFromOriginal,
    };
  }

  function mergeWarmup(currentWarmup, generatedWarmup) {
    if (!currentWarmup?.done) return generatedWarmup;

    return {
      ...generatedWarmup,
      done: currentWarmup.done,
    };
  }

  function cooldownKey(item) {
    return item?.key || item?.labelKey || item?.label || item?.prescription;
  }

  function mergeCooldownItems(currentCooldownItems = [], generatedCooldownItems = []) {
    const currentItemsByKey = new Map(
      (currentCooldownItems || []).map(item => [cooldownKey(item), item])
    );

    return (generatedCooldownItems || []).map(generatedItem => {
      const currentItem = currentItemsByKey.get(cooldownKey(generatedItem));
      if (!currentItem) return generatedItem;

      return {
        ...generatedItem,
        done: currentItem.done ?? generatedItem.done,
      };
    });
  }

  function mergeLiftBlock(
    currentLiftBlock,
    generatedLiftBlock,
    preserveMainLiftProgress = false
  ) {
    if (!currentLiftBlock) return generatedLiftBlock;

    const sameVariant =
      currentLiftBlock.deadliftVariant === generatedLiftBlock.deadliftVariant &&
      currentLiftBlock.benchPressVariant === generatedLiftBlock.benchPressVariant;

    if (!sameVariant) return generatedLiftBlock;

    return {
      ...generatedLiftBlock,
      prepItems: generatedLiftBlock.prepItems || [],
      warmups: preserveMainLiftProgress
        ? (generatedLiftBlock.warmups || []).map((warmup, index) =>
          mergeWarmup(currentLiftBlock.warmups?.[index], warmup)
        )
        : generatedLiftBlock.warmups || [],
      sets: preserveMainLiftProgress
        ? (generatedLiftBlock.sets || []).map((set, index) =>
          mergeSet(currentLiftBlock.sets?.[index], set)
        )
        : generatedLiftBlock.sets || [],
    };
  }

  return (workouts || []).map((workout, index) => {
    const generated = generatedWorkouts[index];
    if (completedWorkoutNumbers.has(Number(generated?.number || workout.number))) return workout;
    if (!generated) return workout;

    if (workout.type === 'meet') {
      // An untouched cached "meet" slot is stale plan data, not a real in-progress
      // meet day — adopt the freshly generated day type/content for it. Only a
      // meet day the user has actually started (entered attempts/warmups) is
      // protected from being overwritten by regeneration.
      if (!workoutHasUserProgress(workout)) return generated;

      return workout;
    }

    const currentAccessoriesByKey = new Map(
      (workout.accessories || []).map(accessory => [accessoryKey(accessory), accessory])
    );

    const workoutNumber = Number(generated.number || workout.number) || 0;
    const preserveStartedAccessories =
      workoutNumber === Number(activeWorkoutNumber) &&
      accessoriesHaveUserProgress(workout.accessories);
    const sameSmartPrescriptionVersion =
      !generated.smartGeneratedPrescription ||
      Number(workout.smartGeneratedPrescriptionVersion) ===
        Number(generated.smartGeneratedPrescriptionVersion);
    const preserveMainLiftProgress =
      Number(activeWorkoutNumber) > 0 &&
      workoutNumber === Number(activeWorkoutNumber) &&
      sameSmartPrescriptionVersion;

    const mergedLifts = (generated.lifts || []).map((generatedLiftBlock, liftIndex) =>
      mergeLiftBlock(
        (workout.lifts || [])[liftIndex],
        generatedLiftBlock,
        preserveMainLiftProgress
      )
    );
    const primaryLiftBlock = mergedLifts[0] || {};
    const mergedCooldownItems = mergeCooldownItems(workout.cooldownItems, generated.cooldownItems);
    const requiredRow = generated.type === 'training' && mergedLifts.some(block => block.lift === 'Bench')
      ? (generated.accessories || []).find(accessory => accessoryKey(accessory) === 'row')
      : null;
    const startedAccessories = requiredRow && !currentAccessoriesByKey.has('row')
      ? [...(workout.accessories || []), requiredRow]
      : (workout.accessories || []);

    return {
      ...generated,
      prepItems: mergeWorkoutPrepItems(workout, generated),
      warmups: primaryLiftBlock.warmups || generated.warmups || [],
      sets: primaryLiftBlock.sets || generated.sets || [],
      lifts: mergedLifts,
      cooldownItems: mergedCooldownItems,
      accessories: preserveStartedAccessories
        ? startedAccessories
        : (generated.accessories || []).map(generatedAccessory =>
          mergeAccessory(currentAccessoriesByKey.get(accessoryKey(generatedAccessory)), generatedAccessory)
        ),
    };
  });
}
