// User-owned workout structure.  Loads and percentages remain Kelani's job;
// this file only describes which optional movements the lifter wants to do.

export const BIG_LIFTS = ['Squat', 'Bench', 'Deadlift'];

const PREPARATION_CATALOG_BY_LIFT = {
  Squat: [
    { key: 'prepHipOpeners', labelKey: 'prepHipOpeners', sets: 2, reps: 10, perSide: true },
    { key: 'prepBodyweightSquats', labelKey: 'prepBodyweightSquats', sets: 2, reps: 10 },
    { key: 'prepGluteBridges', labelKey: 'prepGluteBridges', sets: 2, reps: 12 },
    { key: 'prepBracingBreaths', labelKey: 'prepBracingBreaths', sets: 2, reps: 5 },
  ],
  Bench: [
    { key: 'prepBandPullApart', labelKey: 'prepBandPullApart', sets: 2, reps: 20 },
    { key: 'prepBandExternalRotation', labelKey: 'prepBandExternalRotation', sets: 2, reps: 15, perSide: true },
    { key: 'prepLightRows', labelKey: 'prepLightRows', sets: 2, reps: 15 },
    { key: 'prepScapPushups', labelKey: 'prepScapPushups', sets: 2, reps: 10 },
    { key: 'prepBeachStretch', labelKey: 'prepBeachStretch', sets: 2, reps: 8, perSide: true },
    { key: 'prepThoracicFoamRoller', labelKey: 'prepThoracicFoamRoller', sets: 2, reps: 8 },
    { key: 'prepWallRollsExternalRotation', labelKey: 'prepWallRollsExternalRotation', sets: 3, reps: 8 },
    { key: 'prepClosedChainScapulaWall', labelKey: 'prepClosedChainScapulaWall', sets: 2, reps: 8 },
    { key: 'prepScapPushupPosition', labelKey: 'prepScapPushupPosition', sets: 2, reps: 10 },
  ],
  Deadlift: [
    { key: 'prepHipHinges', labelKey: 'prepHipHinges', sets: 2, reps: 10 },
    { key: 'prepLatPulldowns', labelKey: 'prepLatPulldowns', sets: 2, reps: 15 },
    { key: 'prepHamstringSweeps', labelKey: 'prepHamstringSweeps', sets: 2, reps: 10, perSide: true },
    { key: 'prepEmptyBarRows', labelKey: 'prepEmptyBarRows', sets: 2, reps: 10 },
  ],
};

const ACCESSORY_CATALOG_BY_LIFT = {
  Squat: [
    { key: 'pulldown', labelKey: 'accessoryPulldown', sets: 4, reps: 10, source: 'deadlift', pct: 0.25 },
    { key: 'legCurl', labelKey: 'accessoryLegCurl', sets: 4, reps: 12, source: 'squat', pct: 0.35 },
    { key: 'hipAbduction', labelKey: 'accessoryHipAbduction', sets: 4, reps: 12, source: 'squat', pct: 0.45 },
    { key: 'plank', labelKey: 'accessoryPlank', sets: 4, durationSeconds: 30, source: 'bodyweight' },
  ],
  Bench: [
    { key: 'hipThrust', labelKey: 'accessoryHipThrust', sets: 4, reps: 8, source: 'deadlift', pct: 0.60 },
    { key: 'row', labelKey: 'accessoryRow', sets: 4, reps: 10, source: 'deadlift', pct: 0.25 },
    { key: 'lateralRaise', labelKey: 'accessoryLateralRaise', sets: 4, reps: 12, source: 'fixed', weight: 5, perSide: true },
    { key: 'legExtension', labelKey: 'accessoryLegExtension', sets: 4, reps: 12, source: 'squat', pct: 0.35 },
  ],
  Deadlift: [
    { key: 'legExtension', labelKey: 'accessoryLegExtension', sets: 4, reps: 12, source: 'squat', pct: 0.35 },
    { key: 'plank', labelKey: 'accessoryPlank', sets: 4, durationSeconds: 30, source: 'bodyweight' },
    { key: 'legCurl', labelKey: 'accessoryLegCurl', sets: 4, reps: 12, source: 'squat', pct: 0.35 },
    { key: 'seatedCalfRaise', labelKey: 'accessorySeatedCalfRaise', sets: 4, reps: 12, source: 'squat', pct: 0.55 },
  ],
};

function allUniqueExercises(catalog) {
  const seen = new Set();
  return BIG_LIFTS.flatMap(lift => catalog[lift] || []).filter(item => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

const ALL_PREPARATION_EXERCISES = allUniqueExercises(PREPARATION_CATALOG_BY_LIFT);
const ALL_ACCESSORY_EXERCISES = allUniqueExercises(ACCESSORY_CATALOG_BY_LIFT);

// Every exercise is deliberately available for every big lift. The lift
// grouping describes when it is shown in a workout, not who is allowed to use
// the exercise.
export const PREPARATION_CATALOG = Object.fromEntries(
  BIG_LIFTS.map(lift => [lift, ALL_PREPARATION_EXERCISES])
);
export const ACCESSORY_CATALOG = Object.fromEntries(
  BIG_LIFTS.map(lift => [lift, ALL_ACCESSORY_EXERCISES])
);

function entriesFor(catalog, keys) {
  return (keys || []).map(key => {
    const template = Object.values(catalog).flat().find(item => item.key === key);
    return template ? { key: template.key, sets: template.sets, reps: template.reps, durationSeconds: template.durationSeconds } : null;
  }).filter(Boolean);
}

export function createWorkoutSetup({ preparationMode = 'basicFirst', accessoryMode = 'off' } = {}) {
  const prep = preparationMode === 'off' ? {} : {
    Squat: entriesFor(PREPARATION_CATALOG, ['prepHipOpeners', 'prepBodyweightSquats']),
    Bench: entriesFor(PREPARATION_CATALOG, ['prepBandPullApart', 'prepBandExternalRotation']),
    Deadlift: entriesFor(PREPARATION_CATALOG, ['prepHipHinges', 'prepLatPulldowns']),
  };
  const accessories = accessoryMode === 'off' ? {} : {
    Squat: entriesFor(ACCESSORY_CATALOG, accessoryMode === 'standard' ? ['pulldown', 'legCurl'] : ['hipAbduction', 'legCurl']),
    Bench: entriesFor(ACCESSORY_CATALOG, accessoryMode === 'standard' ? ['hipThrust', 'row'] : ['lateralRaise', 'row']),
    Deadlift: entriesFor(ACCESSORY_CATALOG, accessoryMode === 'lowerBodyFriendly' ? ['legCurl', 'seatedCalfRaise'] : ['legExtension', 'plank']),
  };
  return { version: 1, preparation: { enabled: preparationMode !== 'off', byLift: prep }, accessories: { enabled: accessoryMode !== 'off', byLift: accessories } };
}

function normalizeEntry(entry, template) {
  const sets = Math.max(1, Math.min(12, Number(entry?.sets) || template.sets));
  const durationSeconds = template.durationSeconds
    ? Math.max(5, Math.min(600, Number(entry?.durationSeconds) || template.durationSeconds))
    : undefined;
  const reps = template.durationSeconds ? undefined : Math.max(1, Math.min(100, Number(entry?.reps) || template.reps));
  return { key: template.key, sets, reps, durationSeconds };
}

export function normalizeWorkoutSetup(value, legacy = {}) {
  const fallback = createWorkoutSetup(legacy);
  if (!value || typeof value !== 'object') return fallback;
  const normalizeSection = (section, catalog, fallbackSection) => ({
    enabled: Boolean(section?.enabled),
    byLift: Object.fromEntries(BIG_LIFTS.map(lift => {
      const requested = Array.isArray(section?.byLift?.[lift]) ? section.byLift[lift] : fallbackSection.byLift[lift] || [];
      const templates = new Map((catalog[lift] || []).map(item => [item.key, item]));
      const seen = new Set();
      return [lift, requested.map(item => {
        const template = templates.get(item?.key);
        if (!template || seen.has(template.key)) return null;
        seen.add(template.key);
        return normalizeEntry(item, template);
      }).filter(Boolean)];
    })),
  });
  return {
    version: 1,
    preparation: normalizeSection(value.preparation, PREPARATION_CATALOG, fallback.preparation),
    accessories: normalizeSection(value.accessories, ACCESSORY_CATALOG, fallback.accessories),
  };
}

function resolveItems(setup, section, catalog, lifts) {
  const normalized = normalizeWorkoutSetup(setup);
  if (!normalized[section].enabled) return [];
  const seen = new Set();
  return (lifts || []).flatMap(lift => (normalized[section].byLift[lift] || []).map(entry => {
    if (seen.has(entry.key)) return null;
    seen.add(entry.key);
    const template = (catalog[lift] || []).find(item => item.key === entry.key);
    return template ? { ...template, ...entry } : null;
  }).filter(Boolean));
}

export function getWorkoutPreparation(setup, lifts) {
  return resolveItems(setup, 'preparation', PREPARATION_CATALOG, lifts);
}

export function getWorkoutAccessories(setup, lifts) {
  return resolveItems(setup, 'accessories', ACCESSORY_CATALOG, lifts);
}
