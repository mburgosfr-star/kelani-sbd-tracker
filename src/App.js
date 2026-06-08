import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { translations } from './translations';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const STORAGE_KEY = 'kel-powerlifting-user-data-v1';
const REST_TIME_OPTIONS = [90, 180, 300];
const ACCESSORY_MODES = ['off', 'basic', 'full'];
const SET_EFFORT_OPTIONS = ['easy', 'good', 'hard', 'max'];
const WORKOUT_EFFORT_OPTIONS = ['easy', 'good', 'hard', 'tooMuch'];
const LIFT_ORDER = ['Squat', 'Bench', 'Deadlift'];
const DEFAULT_REST_TIME_SECONDS = 300;
const AUTO_BACKUP_PATH = 'Kelani/kelani-sbd-tracker-autosave.json';
const AUTO_BACKUP_STATUS_KEY = 'kelani-sbd-tracker-auto-backup-status';

function buildBackupSummary(data) {
  const currentCycle = data?.currentCycle || 1;
  const totalWorkouts = data?.inProgress?.workouts?.length || 28;
  const selectedIndex = data?.inProgress?.selectedIndex;
  const completedWorkoutCount = getCompletedWorkoutCount(data?.history || [], currentCycle);
  const currentWorkout = Math.min((selectedIndex ?? completedWorkoutCount) + 1, totalWorkouts);

  return {
    backupVersion: 1,
    programVersion: data?.inProgress?.programVersion || null,
    currentCycle,
    currentWorkout,
    totalWorkouts,
    historyEntries: Array.isArray(data?.history) ? data.history.length : 0,
    bodyDataEntries: Array.isArray(data?.bodyWeights) ? data.bodyWeights.length : 0,
  };
}

function buildBackupPayload(data) {
  const exportedAt = new Date().toISOString();

  return {
    app: 'Kelani SBD Tracker',
    backupVersion: 1,
    appVersion: process.env.REACT_APP_VERSION ?? 'dev',
    exportedAt,
    storageKey: STORAGE_KEY,
    summary: buildBackupSummary(data),
    data,
  };
}

async function writeAutomaticBackup(data) {
  const backup = buildBackupPayload(data);
  const json = JSON.stringify(backup, null, 2);

  if (Capacitor.isNativePlatform()) {
    await Filesystem.mkdir({
      path: 'Kelani',
      directory: Directory.Documents,
      recursive: true,
    }).catch(() => {});

    await Filesystem.writeFile({
      path: AUTO_BACKUP_PATH,
      data: json,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
  } else {
    localStorage.setItem('kelani-sbd-tracker-autosave', json);
  }

  localStorage.setItem(AUTO_BACKUP_STATUS_KEY, JSON.stringify({
    ok: true,
    exportedAt: backup.exportedAt,
    path: AUTO_BACKUP_PATH,
    summary: backup.summary,
  }));

  return backup;
}


const THEME = {
  bg: '#18110d',
  card: '#2b1f18',
  border: '#6b4a2f',
  text: '#fff4e6',
  muted: '#fff4e6',

  primary: '#ff8a3d',
  red: '#ff5c45',
  yellow: '#ffd166',
  brown: '#a86f45'
  
};


const WORKOUT_CIRCLE_SIZE = 40;
const WORKOUT_CIRCLE_FONT_SIZE = 16;
const WORKOUT_SECTION_TITLE_FONT_SIZE = 18;
const WORKOUT_TITLE_FONT_SIZE = 16;
const WORKOUT_TEXT_FONT_SIZE = 15;
const WORKOUT_ROW_PADDING_Y = 8;
const WORKOUT_PREP_WARMUP_PADDING_Y = WORKOUT_ROW_PADDING_Y;

function toOptionalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function calculateLeanMassEstimate(bodyWeight, bodyFat, boneMass = null) {
  if (!bodyWeight || !bodyFat) return null;

  const fatMass = bodyWeight * (bodyFat / 100);
  const leanMass = bodyWeight - fatMass - (boneMass || 0);

  return Math.round(leanMass * 10) / 10;
}

function calculateBmrEstimate(leanMass) {
  if (!leanMass) return null;
  return Math.round(500 + (22 * leanMass));
}


function normalizeAccessoryMode(value) {
  return ACCESSORY_MODES.includes(value) ? value : 'off';
}

function normalizeRestTimeSeconds(value) {
  return REST_TIME_OPTIONS.includes(Number(value)) ? Number(value) : DEFAULT_REST_TIME_SECONDS;
}

function formatRestTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function epley(weight, reps) {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

function calculatePrsFromHistory(history) {
  return {
    Squat: Math.max(0, ...history.filter(h => h.lift === 'Squat').map(h => Number(h.e1rm) || 0)),
    Bench: Math.max(0, ...history.filter(h => h.lift === 'Bench').map(h => Number(h.e1rm) || 0)),
    Deadlift: Math.max(0, ...history.filter(h => h.lift === 'Deadlift').map(h => Number(h.e1rm) || 0)),
  };
}

function getEntryCycle(entry) {
  return Number(entry.cycle) || 1;
}

function getEntryWorkoutNumber(entry) {
  const workoutNumber = Number(entry.workoutNumber);
  return Number.isFinite(workoutNumber) ? workoutNumber : 0;
}

function getAbsoluteWorkoutIndex(entry) {
  return ((getEntryCycle(entry) - 1) * 28) + getEntryWorkoutNumber(entry);
}

function getWorkoutLabel(entry) {
  return `C${getEntryCycle(entry)}W${getEntryWorkoutNumber(entry)}`;
}

function getCompletedWorkoutCount(history, currentCycle) {
  const completedWorkoutNumbers = new Set(
    (history || [])
      .filter(entry => entry.cycle === currentCycle)
      .map(entry => Number(entry.workoutNumber))
      .filter(number => Number.isFinite(number))
  );

  return completedWorkoutNumbers.size;
}

function getRestorableSelectedIndex(inProgress, currentCycle, totalWorkouts) {
  const selectedIndex = Number(inProgress?.selectedIndex);

  if (
    !inProgress ||
    inProgress.currentCycle !== currentCycle ||
    !Number.isFinite(selectedIndex) ||
    totalWorkouts <= 0
  ) {
    return null;
  }

  return Math.max(0, Math.min(selectedIndex, totalWorkouts - 1));
}

function normalizeBodyWeights(data) {
  const entries = [];

  function normalizedBodyEntry(entry, fallbackWorkoutNumber = 0) {
    const bodyData = {
      bodyWeight: toOptionalNumber(entry.bodyWeight || entry.weight || entry.bodyWeightToday),
      bodyFat: toOptionalNumber(entry.bodyFat),
      bodyWater: toOptionalNumber(entry.bodyWater),
      visceralFat: toOptionalNumber(entry.visceralFat),
      leanMass: toOptionalNumber(entry.leanMass),
      physiqueRating: toOptionalNumber(entry.physiqueRating),
      boneMass: toOptionalNumber(entry.boneMass),
      bmr: toOptionalNumber(entry.bmr),
    };

    const hasAnyBodyData = Object.values(bodyData).some(value => value !== null);
    if (!hasAnyBodyData) return null;

    return {
      workoutNumber: Number.isFinite(Number(entry.workoutNumber))
        ? Number(entry.workoutNumber)
        : fallbackWorkoutNumber,
      cycle: getEntryCycle(entry),
      date: entry.date || new Date().toLocaleDateString('nl-NL'),
      timestamp: entry.timestamp || new Date().toISOString(),
      ...bodyData,
    };
  }

  (data.bodyWeights || []).forEach((entry, index) => {
    const normalized = normalizedBodyEntry(entry, index);
    if (normalized) entries.push(normalized);
  });

  (data.history || []).forEach(entry => {
    const normalized = normalizedBodyEntry(entry, 0);
    if (normalized) entries.push(normalized);
  });

  if (data.bodyWeightToday) {
    const completedWorkouts = (data.history || []).filter(
      h => h.lift && h.workoutNumber > 0
    ).length;

    const normalized = normalizedBodyEntry({
      workoutNumber: completedWorkouts,
      bodyWeight: data.bodyWeightToday,
    }, completedWorkouts);

    if (normalized) entries.push(normalized);
  }

  const byWorkout = {};

  entries.forEach(entry => {
    byWorkout[`${getEntryCycle(entry)}-${entry.workoutNumber}`] = entry;
  });

  return Object.values(byWorkout).sort(
    (a, b) => getAbsoluteWorkoutIndex(a) - getAbsoluteWorkoutIndex(b)
  );
}

function mergeGeneratedWorkoutStructure(workouts, generatedWorkouts, history, cycle) {
  const completedCount = getCompletedWorkoutCount(history, cycle);

  return workouts.map((workout, index) => {
    const generated = generatedWorkouts[index];
    if (!generated) return workout;

    const isCompleted = index < completedCount;
    const prepDone = isCompleted;

    if (workout.type === 'meet' || (workout.type === 'training' && (workout.lifts || []).length > 0)) {
      if (!isCompleted) {
        return generated;
      }

      return {
        ...workout,
        lifts: (workout.lifts || generated.lifts || []).map((liftBlock, liftIndex) => {
          const generatedLiftBlock = (generated.lifts || [])[liftIndex] || {};

          return {
            ...liftBlock,
            prepItems: (liftBlock.prepItems || generatedLiftBlock.prepItems || []).map(item => ({
              ...item,
              done: item.done ?? prepDone,
            })),
          };
        }),
      };
    }

    if (!isCompleted) {
      return {
        ...generated,
        prepItems: (generated.prepItems || []).map((item, itemIndex) => ({
          ...item,
          done: workout.prepItems?.[itemIndex]?.done ?? false,
        })),
      };
    }

    return {
      ...workout,
      prepItems: (workout.prepItems || generated.prepItems || []).map(item => ({
        ...item,
        done: item.done ?? prepDone,
      })),
    };
  });
}

function hydrateWorkoutsWithHistory(workouts, history, cycle) {
  return workouts.map(workout => {
    const savedSnapshot = history.find(
      entry =>
        entry.workoutNumber === workout.number &&
        entry.workoutSnapshot &&
        getEntryCycle(entry) === cycle &&
        (entry.lift === workout.lift || workout.type === 'meet')
    );

    if (savedSnapshot?.workoutSnapshot) {
      if (workout.type === 'meet') {
        return {
          ...savedSnapshot.workoutSnapshot,
          lifts: (savedSnapshot.workoutSnapshot.lifts || workout.lifts || []).map((liftBlock, index) => {
            const generatedLiftBlock = (workout.lifts || [])[index] || {};

            return {
              ...liftBlock,
              prepItems: (liftBlock.prepItems || generatedLiftBlock.prepItems || []).map(item => ({
                ...item,
                done: true,
              })),
            };
          }),
        };
      }

      const snapshot = savedSnapshot.workoutSnapshot;

      if (snapshot.type === 'training' && (snapshot.lifts || []).length > 0) {
        const restoredLifts = (snapshot.lifts || workout.lifts || []).map((liftBlock, index) => {
          const generatedLiftBlock = (workout.lifts || [])[index] || {};

          return {
            ...liftBlock,
            prepItems: (liftBlock.prepItems || generatedLiftBlock.prepItems || []).map(item => ({
              ...item,
              done: item.done ?? true,
            })),
            warmups: (liftBlock.warmups || generatedLiftBlock.warmups || []).map(item => ({
              ...item,
              done: item.done ?? true,
            })),
            sets: (liftBlock.sets || generatedLiftBlock.sets || []).map(item => ({
              ...item,
              done: item.done ?? true,
            })),
          };
        });

        const primaryLiftBlock = restoredLifts[0] || {};

        return {
          ...snapshot,
          lifts: restoredLifts,
          lift: primaryLiftBlock.lift || snapshot.lift,
          prepItems: primaryLiftBlock.prepItems || snapshot.prepItems || [],
          warmups: primaryLiftBlock.warmups || snapshot.warmups || [],
          sets: primaryLiftBlock.sets || snapshot.sets || [],
          accessories: (snapshot.accessories || workout.accessories || []).map(accessory => ({
            ...accessory,
            done: accessory.done || [],
          })),
          cooldownItems: (snapshot.cooldownItems || workout.cooldownItems || []).map(item => ({
            ...item,
            done: true,
          })),
        };
      }

      return {
        ...snapshot,
        prepItems: (snapshot.prepItems || workout.prepItems || []).map(item => ({
          ...item,
          done: item.done ?? true,
        })),
        warmups: (snapshot.warmups || workout.warmups || []).map(item => ({
          ...item,
          done: item.done ?? true,
        })),
        sets: (snapshot.sets || workout.sets || []).map(item => ({
          ...item,
          done: item.done ?? true,
        })),
        accessories: (snapshot.accessories || workout.accessories || []).map(accessory => ({
          ...accessory,
          done: accessory.done || [],
        })),
        cooldownItems: (snapshot.cooldownItems || workout.cooldownItems || []).map(item => ({
          ...item,
          done: true,
        })),
      };
    }

    const saved = history.find(
      entry =>
        entry.workoutNumber === workout.number &&
        getEntryCycle(entry) === cycle &&
        (entry.lift === workout.lift || workout.type === 'meet')
    );

    if (saved) {
      if (workout.type === 'meet') {
        return {
          ...workout,
          lifts: (workout.lifts || []).map(liftBlock => ({
            ...liftBlock,
            prepItems: (liftBlock.prepItems || []).map(item => ({ ...item, done: true })),
            warmups: (liftBlock.warmups || []).map(w => ({ ...w, done: true })),
            sets: (liftBlock.sets || []).map(s => ({ ...s, done: true })),
          })),
        };
      }

      return {
        ...workout,
        prepItems: (workout.prepItems || []).map(item => ({ ...item, done: true })),
        warmups: (workout.warmups || []).map(w => ({ ...w, done: true })),
        sets: (workout.sets || []).map(s => ({ ...s, done: true })),
        accessories: (workout.accessories || []).map(a => ({
          ...a,
          done: (a.done || []).map(() => true),
        })),
      };
    }

    return workout;
  });
}

function getWorkoutTypeKey(workout) {
  if (!workout) return null;
  if (workout.type === 'meet') return 'meetDay';
  if (workout.label === 'Pre-meet') return 'preMeet';

  const label = String(workout.label || '').toLowerCase();

  if (label.includes('technique')) return 'practice';
  if (label.includes('volume')) return 'volume';
  if (label.includes('heavy') || label.includes('peak') || label.includes('strength')) return 'heavy';

  return 'practice';
}

function liftLabel(lift, t) {
  if (lift === 'Squat') return t.squat;
  if (lift === 'Bench') return t.bench;
  if (lift === 'Deadlift') return t.deadlift;
  return lift;
}

function normalizeBenchPressVariant(variant) {
  if (variant === 'floorPress') return 'floorPress';
  if (variant === 'standingLandminePress') return 'standingLandminePress';
  return 'standard';
}

function isStandingLandminePress(lift, benchPressVariant = 'standard') {
  return lift === 'Bench' && normalizeBenchPressVariant(benchPressVariant) === 'standingLandminePress';
}

function workoutLiftLabel(lift, t, benchPressVariant = 'standard') {
  const normalizedBenchPressVariant = normalizeBenchPressVariant(benchPressVariant);

  if (lift === 'Bench' && normalizedBenchPressVariant === 'floorPress') {
    return t.benchPressFloorPress || 'Floor Press';
  }

  if (lift === 'Bench' && normalizedBenchPressVariant === 'standingLandminePress') {
    return t.benchPressStandingLandminePress || 'Landmine';
  }

  return liftLabel(lift, t);
}

function workoutDisplayWeightKg(weightKg, lift, benchPressVariant = 'standard') {
  const numericWeight = Number(weightKg);
  if (!Number.isFinite(numericWeight)) return weightKg;

  return isStandingLandminePress(lift, benchPressVariant)
    ? numericWeight / 2
    : numericWeight;
}

function workoutInputWeightKg(displayWeight, weightUnit = WEIGHT_UNITS.KG, lift, benchPressVariant = 'standard') {
  const baseKg = displayWeightToKg(displayWeight, weightUnit);
  return isStandingLandminePress(lift, benchPressVariant)
    ? baseKg * 2
    : baseKg;
}

function formatWorkoutWeightFromKg(weightKg, weightUnit = WEIGHT_UNITS.KG, t, lift, benchPressVariant = 'standard') {
  const formatted = formatWeightFromKg(workoutDisplayWeightKg(weightKg, lift, benchPressVariant), weightUnit);

  return isStandingLandminePress(lift, benchPressVariant)
    ? `${formatted.replace(/\s/g, '\u00a0')}\u00a0${(t.perArm || '/ arm').replace(/\s/g, '\u00a0')}`
    : formatted;
}

function shouldTrackWorkoutStrength(lift, benchPressVariant = 'standard') {
  return !isStandingLandminePress(lift, benchPressVariant);
}

function getWorkoutTypeLabel(workout, t) {
  const key = getWorkoutTypeKey(workout);
  return key ? t[key] : '—';
}

const WEIGHT_UNITS = {
  KG: 'kg',
  LB: 'lb',
};

const KG_TO_LB = 2.2046226218;

function normalizeWeightUnit(unit) {
  return unit === WEIGHT_UNITS.LB ? WEIGHT_UNITS.LB : WEIGHT_UNITS.KG;
}

function kgToDisplayWeight(weightKg, unit = WEIGHT_UNITS.KG) {
  const numericWeight = Number(weightKg);
  if (!Number.isFinite(numericWeight)) return '';

  return normalizeWeightUnit(unit) === WEIGHT_UNITS.LB
    ? numericWeight * KG_TO_LB
    : numericWeight;
}

function roundKgForStorage(weightKg) {
  const numericWeight = Number(weightKg);
  if (!Number.isFinite(numericWeight)) return '';

  return Number(numericWeight.toFixed(1));
}

function displayWeightToKg(weight, unit = WEIGHT_UNITS.KG) {
  const numericWeight = Number(weight);
  if (!Number.isFinite(numericWeight)) return '';

  const weightKg = normalizeWeightUnit(unit) === WEIGHT_UNITS.LB
    ? numericWeight / KG_TO_LB
    : numericWeight;

  return roundKgForStorage(weightKg);
}

function roundToStep(value, step) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '';

  return Math.round(numericValue / step) * step;
}

function formatWeightValue(value, unit = WEIGHT_UNITS.KG, { body = false } = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '—';

  const normalizedUnit = normalizeWeightUnit(unit);

  if (body) {
    return Number(numericValue.toFixed(1)).toString();
  }

  const decimals = normalizedUnit === WEIGHT_UNITS.LB ? 0 : 1;
  const rounded = roundToStep(numericValue, normalizedUnit === WEIGHT_UNITS.LB ? 5 : 2.5);

  return Number(rounded.toFixed(decimals)).toString();
}

function formatWeightFromKg(weightKg, unit = WEIGHT_UNITS.KG, options = {}) {
  const displayWeight = kgToDisplayWeight(weightKg, unit);
  if (displayWeight === '') return '—';

  return `${formatWeightValue(displayWeight, unit, options)} ${normalizeWeightUnit(unit)}`;
}


function normalizePreparationMode(mode) {
  if (mode === 'off') return 'off';
  if (mode === 'basicAll') return 'basicAll';
  if (mode === 'shoulderThoracic') return 'shoulderThoracic';

  // Backwards compatibility: old "basic" means first big lift only.
  if (mode === 'basic' || mode === 'basicFirst') return 'basicFirst';

  return 'basicFirst';
}

function generatePrepItems(lift, preparationMode = 'basicFirst') {
  const normalizedPreparationMode = normalizePreparationMode(preparationMode);

  if (normalizedPreparationMode === 'off') return [];

  if (normalizedPreparationMode === 'shoulderThoracic') {
    return [
      { labelKey: 'prepThoracicRotationSideLying', prescription: '2×8', perSide: true },
      { labelKey: 'prepBeachStretch', prescription: '2×8', perSide: true },
      { labelKey: 'prepThoracicFoamRoller', prescription: '2×8' },
      { labelKey: 'prepWallRollsExternalRotation', prescription: '3×8' },
      { labelKey: 'prepClosedChainScapulaWall', prescription: '2×8' },
      { labelKey: 'prepScapPushupPosition', prescription: '2×10' },
    ].map(item => ({
      ...item,
      done: false,
    }));
  }

  const itemsByLift = {
    Bench: [
      { labelKey: 'prepBandPullApart', prescription: '2×20' },
      { labelKey: 'prepBandExternalRotation', prescription: '2×15', perSide: true },
      { labelKey: 'prepLightRows', prescription: '2×15' },
      { labelKey: 'prepScapPushups', prescription: '2×10' },
    ],
    Squat: [
      { labelKey: 'prepHipOpeners', prescription: '2×10', perSide: true },
      { labelKey: 'prepBodyweightSquats', prescription: '2×10' },
      { labelKey: 'prepGluteBridges', prescription: '2×12' },
      { labelKey: 'prepBracingBreaths', prescription: '2×5' },
    ],
    Deadlift: [
      { labelKey: 'prepHipHinges', prescription: '2×10' },
      { labelKey: 'prepLatPulldowns', prescription: '2×15' },
      { labelKey: 'prepHamstringSweeps', prescription: '2×10', perSide: true },
      { labelKey: 'prepEmptyBarRows', prescription: '2×10' },
    ],
  };

  return (itemsByLift[lift] || []).map(item => ({
    ...item,
    done: false,
  }));
}

function generateWarmups(firstWorkWeight) {
  function roundDown10(w) {
    return Math.floor(w / 10) * 10;
  }

  function getWarmupReps(index) {
    if (index <= 1) return 5;
    if (index === 2) return 3;
    if (index === 3) return 2;
    return 1;
  }

  const weight = Number(firstWorkWeight) || 0;

  if (weight < 30) return [];

  const warmups = [{ weight: 20, reps: 5 }];

  while (weight - warmups[warmups.length - 1].weight > 50) {
    const previous = warmups[warmups.length - 1].weight;
    let nextWeight = previous + 50;

    if (weight - nextWeight < 10) {
      nextWeight = roundDown10(weight - 10);
    }

    if (nextWeight <= previous || nextWeight >= weight) break;

    warmups.push({
      weight: nextWeight,
      reps: getWarmupReps(warmups.length),
    });
  }

  return warmups.map(w => ({
    weight: w.weight,
    reps: w.reps,
    isWarmup: true,
    done: false,
  }));
}


const MEET_ATTEMPT_KEYS = ['opener', 'second', 'third'];
const MEET_ATTEMPT_PCTS = [0.90, 0.975, 1.025];

function roundMeetWeight(weight) {
  return Math.round((Number(weight) || 0) / 2.5) * 2.5;
}

function getFailedSetSuggestedWeight(weight) {
  const currentWeight = Number(weight) || 0;
  if (currentWeight <= 0) return 0;

  const rawWeight = currentWeight - Math.max(2.5, currentWeight * 0.075);
  const roundedWeight = Math.floor(rawWeight / 2.5) * 2.5;

  return Math.max(0, Number(roundedWeight.toFixed(1)));
}

function getSetTrainingMax(set) {
  const originalWeight = Number(set?.originalWeight ?? set?.failedWeight ?? set?.weight) || 0;
  const originalPct = Number(set?.originalPct ?? set?.pct) || 0;

  return originalWeight > 0 && originalPct > 0
    ? originalWeight / originalPct
    : 0;
}

function getSetPctForWeight(set, weight) {
  const trainingMax = getSetTrainingMax(set);
  if (!trainingMax) return Number(set?.pct) || null;

  return Number(weight) / trainingMax;
}

function isTopSetLabel(labelKey) {
  return ['heavySingle', 'topSingle', 'topDouble', 'topTriple'].includes(labelKey);
}

function isMainOrAttemptLabelKey(labelKey) {
  return [
    'heavySingle',
    'topSingle',
    'topDouble',
    'topTriple',
    'opener',
    'secondAttempt',
    'thirdAttempt',
  ].includes(labelKey);
}

function getBackoffGroupLabelForSets(sets = [], t) {
  const hasMainOrAttemptSet = sets.some(set => isMainOrAttemptLabelKey(set.labelKey));

  return hasMainOrAttemptSet
    ? t.backoff
    : (t.workSets || t.set);
}


function isAttemptSetLabel(labelKey) {
  return ['opener', 'secondAttempt', 'thirdAttempt'].includes(labelKey);
}

function getAdjustedAttemptWeight(weight) {
  return Math.max(2.5, roundMeetWeight((Number(weight) || 0) - 5));
}

function getMeetPlannerAttemptWeight(attempts, lift, setIndex, fallback) {
  const key = MEET_ATTEMPT_KEYS[setIndex];
  const custom = attempts?.[lift]?.[key];
  const value = Number(custom);

  return Number.isFinite(value) && value > 0
    ? roundMeetWeight(value)
    : fallback;
}

function applyMeetPlannerAttemptsToWorkouts(workouts, attempts = {}, prs = {}) {
  return (workouts || []).map(workout => {
    if (workout.type !== 'meet') return workout;

    return {
      ...workout,
      lifts: (workout.lifts || []).map(liftBlock => ({
        ...liftBlock,
        sets: (liftBlock.sets || []).map((set, setIndex) => {
          const suggestedWeight = prs?.[liftBlock.lift]
            ? roundMeetWeight(prs[liftBlock.lift] * (set.pct || MEET_ATTEMPT_PCTS[setIndex] || 1))
            : set.weight;

          return {
            ...set,
            weight: getMeetPlannerAttemptWeight(
              attempts,
              liftBlock.lift,
              setIndex,
              suggestedWeight
            ),
          };
        }),
      })),
    };
  });
}

const ACCESSORY_TEMPLATES = {
  Squat: [
    { key: 'pulldown', labelKey: 'accessoryPulldown', sets: 3, reps: 10, source: 'deadlift', pct: 0.25 },
    { key: 'legCurl', labelKey: 'accessoryLegCurl', sets: 3, reps: 12, source: 'squat', pct: 0.20 },
  ],
  Bench: [
    { key: 'hipThrust', labelKey: 'accessoryHipThrust', sets: 3, reps: 8, source: 'deadlift', pct: 0.40 },
    { key: 'shoulderRotations', labelKey: 'accessoryShoulderRotations', sets: 2, reps: 15, source: 'fixed', weight: 2.5, optional: true, perSide: true },
  ],
  Deadlift: [
    { key: 'row', labelKey: 'accessoryRow', sets: 3, reps: 10, source: 'deadlift', pct: 0.25 },
    { key: 'legPressModerate', labelKey: 'accessoryLegPressModerate', sets: 2, reps: 12, source: 'squat', pct: 0.60, optional: true },
  ],
};

function getAccessoryBaseWeight(template, oneRMs, accessoryPRs = {}) {
  const previous = Number(accessoryPRs?.[template.key]);

  if (previous > 0) {
    return previous;
  }

  if (template.source === 'fixed') {
    return template.weight || 2.5;
  }

  const sourceLift = {
    squat: 'Squat',
    bench: 'Bench',
    deadlift: 'Deadlift',
  }[template.source];

  const sourceWeight = Number(oneRMs?.[sourceLift]) || 0;

  if (!sourceWeight || !template.pct) {
    return 20;
  }

  return Math.max(2.5, roundMeetWeight(sourceWeight * template.pct));
}

function generateAccessoriesForLift(lift, accessoryMode = 'off', accessoryPRs = {}, oneRMs = {}) {
  if (accessoryMode === 'off') return [];

  const includeOptional = accessoryMode === 'full';

  return (ACCESSORY_TEMPLATES[lift] || [])
    .filter(template => includeOptional || !template.optional)
    .map(template => {
      const weight = getAccessoryBaseWeight(template, oneRMs, accessoryPRs);

      return {
        key: template.key,
        nameKey: template.labelKey,
        name: template.labelKey,
        reps: template.reps,
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

function applyAccessoryPlanToWorkouts(workouts, generatedWorkouts, completedCount) {
  function mergePrepItems(currentItems = [], generatedItems = []) {
    return (generatedItems || []).map((item, index) => ({
      ...item,
      done: currentItems?.[index]?.done ?? item.done ?? false,
    }));
  }

  function accessoryKey(accessory) {
    return accessory?.key || accessory?.nameKey || accessory?.name;
  }

  function mergeAccessory(currentAccessory, generatedAccessory) {
    if (!currentAccessory) return generatedAccessory;

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

  return (workouts || []).map((workout, index) => {
    if (index < completedCount) return workout;

    const generated = generatedWorkouts[index];
    if (!generated || workout.type === 'meet') return workout;

    const currentAccessoriesByKey = new Map(
      (workout.accessories || []).map(accessory => [accessoryKey(accessory), accessory])
    );

    return {
      ...workout,
      prepItems: mergePrepItems(workout.prepItems, generated.prepItems),
      lifts: (workout.lifts || generated.lifts || []).map((liftBlock, liftIndex) => {
        const generatedLiftBlock = generated.lifts?.[liftIndex] || {};

        return {
          ...liftBlock,
          prepItems: mergePrepItems(liftBlock.prepItems, generatedLiftBlock.prepItems),
        };
      }),
      accessories: (generated.accessories || []).map(generatedAccessory =>
        mergeAccessory(currentAccessoriesByKey.get(accessoryKey(generatedAccessory)), generatedAccessory)
      ),
    };
  });
}


function generateProgram(s, b, d, accessoryMode = 'off', accessoryPRs = {}, preparationMode = 'basicFirst') {
  function round25(w) {
    return Math.round(w / 2.5) * 2.5;
  }

  const oneRMs = {
    Squat: s,
    Bench: b,
    Deadlift: d,
  };

  const normalizedPreparationMode = normalizePreparationMode(preparationMode);

  const program = [
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 3, pct: 0.750, labelKey: 'topTriple' }, { sets: 4, reps: 5, pct: 0.650, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 5, pct: 0.600, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 3, pct: 0.750, labelKey: 'topTriple' }, { sets: 3, reps: 5, pct: 0.675, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 3, pct: 0.750, labelKey: 'topTriple' }, { sets: 4, reps: 6, pct: 0.650, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 3, pct: 0.775, labelKey: 'topTriple' }, { sets: 4, reps: 5, pct: 0.700, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 3, pct: 0.800, labelKey: 'topTriple' }, { sets: 4, reps: 5, pct: 0.700, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 3, pct: 0.700, labelKey: 'topTriple' }, { sets: 3, reps: 4, pct: 0.625, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 3, reps: 5, pct: 0.600, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 4, reps: 5, pct: 0.625, labelKey: 'workSets' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 2, pct: 0.825, labelKey: 'topDouble' }, { sets: 4, reps: 4, pct: 0.750, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 5, pct: 0.650, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 2, pct: 0.800, labelKey: 'topDouble' }, { sets: 3, reps: 4, pct: 0.725, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 2, pct: 0.825, labelKey: 'topDouble' }, { sets: 4, reps: 4, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 2, pct: 0.825, labelKey: 'topDouble' }, { sets: 4, reps: 4, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 2, pct: 0.850, labelKey: 'topDouble' }, { sets: 4, reps: 4, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 2, pct: 0.775, labelKey: 'topDouble' }, { sets: 3, reps: 4, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 3, reps: 4, pct: 0.650, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 4, reps: 4, pct: 0.675, labelKey: 'workSets' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.875, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.775, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 4, pct: 0.700, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.850, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.775, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.850, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.875, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.775, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.800, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 3, reps: 4, pct: 0.625, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 3, reps: 4, pct: 0.700, labelKey: 'workSets' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'opener' }, { sets: 1, reps: 1, pct: 0.930, labelKey: 'secondAttempt' }, { sets: 1, reps: 1, pct: 0.950, labelKey: 'thirdAttempt' }, { sets: 3, reps: 5, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'opener' }, { sets: 1, reps: 1, pct: 0.930, labelKey: 'secondAttempt' }, { sets: 1, reps: 1, pct: 0.950, labelKey: 'thirdAttempt' }, { sets: 3, reps: 5, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'opener' }, { sets: 1, reps: 1, pct: 0.930, labelKey: 'secondAttempt' }, { sets: 1, reps: 1, pct: 0.950, labelKey: 'thirdAttempt' }, { sets: 3, reps: 5, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.800, labelKey: 'topSingle' }, { sets: 2, reps: 4, pct: 0.650, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 4, pct: 0.600, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.750, labelKey: 'topSingle' }, { sets: 2, reps: 4, pct: 0.600, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.800, labelKey: 'topSingle' }, { sets: 2, reps: 4, pct: 0.650, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 2, reps: 4, pct: 0.600, labelKey: 'backoff' }] }] },
  ];

  const workouts = [];

  function buildLiftBlock(liftConfig, liftIndex = 0) {
    const sets = [];

    liftConfig.blocks.forEach(block => {
      for (let i = 0; i < block.sets; i++) {
        const weight = round25(oneRMs[liftConfig.lift] * block.pct);

        sets.push({
          labelKey: liftConfig.isSecondaryLight && block.labelKey === 'backoff'
            ? null
            : block.labelKey || null,
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

    const firstWorkWeight = sets.length ? sets[0].weight : 20;

    const includePreparation =
      liftIndex === 0 ||
      normalizedPreparationMode === 'basicAll';

    return {
      lift: liftConfig.lift,
      prepItems: includePreparation ? generatePrepItems(liftConfig.lift, normalizedPreparationMode) : [],
      warmups: generateWarmups(firstWorkWeight),
      sets,
    };
  }

  program.forEach((day, dayIndex) => {
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
      accessories: generateAccessoriesForLift(primaryLift, accessoryMode, accessoryPRs, oneRMs),
      cooldownItems: generateCooldownItems(),
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
      warmups: generateWarmups(sets[0].weight),
      sets,
    };
  }),
  warmups: [],
  sets: [],
  accessories: [],
});

  return workouts;
}


function RestTimer({ seconds, endTime, onDismiss, t }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil(((endTime || Date.now() + seconds * 1000) - Date.now()) / 1000)));
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasBeepedRef = useRef(false);

  useEffect(() => {
    const clearTick = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const clearFinishTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const finishTimer = () => {
      clearTick();
      setRemaining(0);

      if (!hasBeepedRef.current) {
        hasBeepedRef.current = true;
        playBeep();
      }
    };

    const updateRemaining = () => {
      const nextRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setRemaining(nextRemaining);

      if (nextRemaining <= 0) {
        finishTimer();
      }
    };

    const startVisibleTick = () => {
      clearTick();
      updateRemaining();

      if (!document.hidden && Date.now() < endTime) {
        intervalRef.current = setInterval(updateRemaining, 1000);
      }
    };

    hasBeepedRef.current = false;
    setRemaining(seconds);

    clearFinishTimeout();
    timeoutRef.current = setTimeout(finishTimer, seconds * 1000);

    startVisibleTick();
    document.addEventListener('visibilitychange', startVisibleTick);

    return () => {
      clearTick();
      clearFinishTimeout();
      document.removeEventListener('visibilitychange', startVisibleTick);
    };
  }, [seconds, endTime]);

  function playBeep() {
    try {


      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.9, ctx.currentTime);
      master.connect(ctx.destination);

      const beep = (delay, frequency, duration = 0.22) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);

        gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

        osc.connect(gain);
        gain.connect(master);

        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
      };

      [
        [0, 1200],
        [0.22, 1600],
        [0.55, 1200],
        [0.77, 1600],
        [1.1, 1800],
      ].forEach(([delay, frequency]) => beep(delay, frequency));

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 1800);
    } catch (e) {}
  }

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = remaining / seconds;
  const isDone = remaining <= 0;

  if (isDone) {
    return (
      <div style={{
        background: THEME.bg,
        borderTop: `1px solid ${THEME.border}`,
        borderBottom: `1px solid ${THEME.border}`,
        padding: '16px',
        textAlign: 'center',
        color: THEME.primary,
        fontSize: 20,
        fontWeight: 800
      }}>
        {t.readyNextSet}
      </div>
    );
  }

  return (
    <div style={{
      background: THEME.bg,
      borderTop: `1px solid ${THEME.border}`,
      borderBottom: `1px solid ${THEME.border}`,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      color: '#ffffff'
    }}>
      <svg width="54" height="54" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="27" cy="27" r="24" fill="none" stroke={THEME.border} strokeWidth="5" />
        <circle
          cx="27"
          cy="27"
          r="24"
          fill="none"
          stroke={THEME.primary}
          strokeWidth="5"
          strokeDasharray={`${2 * Math.PI * 24} ${2 * Math.PI * 24}`}
          strokeDashoffset={(2 * Math.PI * 24) * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>

      <div>
        <div style={{
          fontSize: 28,
          fontWeight: 700,
          color: '#ffffff',
          fontFamily: 'monospace'
        }}>
          {mins}:{String(secs).padStart(2, '0')}
        </div>

        <div style={{ fontSize: 12, color: '#ffffff', opacity: 0.85 }}>
          {t.restTime}
        </div>
      </div>
    </div>
  );
}

function formatPrepPrescription(item, t) {
  return item.perSide ? `${item.prescription} / ${t.side}` : item.prescription;
}

function WorkoutCircle({ done = false, active = false, skipped = false, disabled = false, onClick, label }) {
  const borderColor = skipped
    ? '#e74c3c'
    : done || active
      ? THEME.primary
      : THEME.border;

  const background = skipped
    ? '#e74c3c'
    : done
      ? THEME.primary
      : THEME.card;

  const color = skipped || done ? THEME.bg : THEME.text;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={event => {
        event.stopPropagation();
        if (!disabled && onClick) onClick(event);
      }}
      disabled={disabled}
      style={{
        width: WORKOUT_CIRCLE_SIZE,
        height: WORKOUT_CIRCLE_SIZE,
        minWidth: WORKOUT_CIRCLE_SIZE,
        flex: `0 0 ${WORKOUT_CIRCLE_SIZE}px`,
        borderRadius: '50%',
        border: `2px solid ${borderColor}`,
        background,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 900,
        fontSize: WORKOUT_CIRCLE_FONT_SIZE,
        lineHeight: 1,
        padding: 0,
        transform: 'scale(1)'
      }}
    >
      {skipped ? '✕' : done ? '✓' : ''}
    </button>
  );
}

function PrepRow({ item, isActive, isReadOnly, onToggle, t }) {
  const label = t[item.labelKey];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      minWidth: 0,
      boxSizing: 'border-box',
      padding: `${WORKOUT_PREP_WARMUP_PADDING_Y}px 0`,
      background: 'transparent'
    }}>
      <WorkoutCircle
        done={item.done}
        active={isActive}
        disabled={isReadOnly}
        onClick={onToggle}
        label={label}
      />

      <div style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <div
          title={label}
          style={{
            color: THEME.text,
            fontWeight: 800,
            fontSize: WORKOUT_TEXT_FONT_SIZE,
            lineHeight: 1.15
          }}
        >
          {label}
        </div>
        <div
          title={formatPrepPrescription(item, t)}
          style={{
            color: THEME.muted,
            fontSize: WORKOUT_TEXT_FONT_SIZE,
            marginTop: 1,
            lineHeight: 1.15
          }}
        >
          {formatPrepPrescription(item, t)}
        </div>
      </div>
    </div>
  );
}


function WarmupGrid({ warmups = [], isReadOnly, activeIndex, onToggle, renderTimer, followsPrep = false, t, weightUnit = WEIGHT_UNITS.KG, lift, benchPressVariant = 'standard' }) {
  if (!warmups.length) return null;

  const columnCount = warmups.length <= 2
    ? 2
    : warmups.length === 3
      ? 3
      : 4;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      justifyContent: 'center',
      columnGap: 12,
      rowGap: 0,
      padding: '0 10px'
    }}>
      {warmups.map((warmup, index) => {
        const label = `${t.warmup} ${index + 1}`;
        const isActive = index === activeIndex;
        const isDone = !!warmup.done;

        return (
          <React.Fragment key={index}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
              padding: `${WORKOUT_PREP_WARMUP_PADDING_Y}px 0`,
              background: 'transparent'
            }}>
              <WorkoutCircle
                done={isDone}
                active={isActive}
                disabled={isReadOnly}
                onClick={() => onToggle(index)}
                label={label}
              />

              <div style={{ flex: 1, minWidth: 0, marginLeft: 10, textAlign: 'left', lineHeight: 1.15 }}>
                <div style={{
                  color: THEME.text,
                  fontSize: WORKOUT_TEXT_FONT_SIZE,
                  fontWeight: 800,
                  lineHeight: 1.15
                }}>
                  {label}
                </div>

                <div style={{
                  color: THEME.muted,
                  fontSize: WORKOUT_TEXT_FONT_SIZE,
                  fontWeight: 700,
                  marginTop: 1,
                  lineHeight: 1.15
                }}>
                  {warmup.reps} × {formatWorkoutWeightFromKg(warmup.weight, weightUnit, t, lift, benchPressVariant)}
                </div>
              </div>
            </div>

            {renderTimer?.(index) && (
              <div style={{ gridColumn: '1 / -1' }}>
                {renderTimer(index)}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}


function generateCooldownItems() {
  return [
    {
      labelKey: 'cooldownRhomboidStretch',
      prescription: '4×10 sec',
      perSide: true,
      done: false,
    },
  ];
}

function CooldownBlock({ items = [], onToggleItem = () => {}, t, isReadOnly = false }) {
  const cooldownItems = items.length > 0 ? items : generateCooldownItems();
  const firstIncompleteIndex = cooldownItems.findIndex(item => !item.done);

  return (
    <div style={{
      background: THEME.card,
      border: `1px solid ${THEME.border}`,
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 10
    }}>
      <div style={{
        padding: '5px 10px',
        fontSize: WORKOUT_SECTION_TITLE_FONT_SIZE,
        fontWeight: 900,
        color: THEME.text,
        textAlign: 'center',
        borderBottom: `1px solid ${THEME.border}`
      }}>
        {t.cooldownTitle}
      </div>

      <div style={{ padding: '6px 10px' }}>
        {cooldownItems.map((item, index) => (
          <PrepRow
            key={index}
            item={item}
            isActive={!isReadOnly && index === firstIncompleteIndex}
            isReadOnly={isReadOnly}
            onToggle={() => onToggleItem(index)}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

function EffortPicker({ value, onChange, t }) {
  return (
    <div style={{
      background: THEME.bg,
      borderTop: `1px solid ${THEME.border}`,
      borderBottom: `1px solid ${THEME.border}`,
      padding: '7px 10px',
      display: 'grid',
      gap: 6
    }}>
      <div style={{
        color: THEME.text,
        fontSize: 12,
        fontWeight: 800,
        textAlign: 'center'
      }}>
        {t.setEffortQuestion}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 6
      }}>
        {SET_EFFORT_OPTIONS.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            style={{
              padding: '6px 3px',
              borderRadius: 8,
              border: `1px solid ${value === option ? THEME.primary : THEME.border}`,
              background: value === option ? THEME.primary : THEME.card,
              color: value === option ? THEME.bg : THEME.text,
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            {t[`setEffort${option[0].toUpperCase()}${option.slice(1)}`]}
          </button>
        ))}
      </div>
    </div>
  );
}

function getSetEffortLabel(effort, t) {
  if (!effort) return null;

  return {
    easy: t.setEffortEasy,
    good: t.setEffortGood,
    hard: t.setEffortHard,
    max: t.setEffortMax,
  }[effort] || null;
}

function getWorkoutEffortLabel(effort, t) {
  if (!effort) return null;

  return {
    easy: t.workoutEffortEasy,
    good: t.workoutEffortGood,
    hard: t.workoutEffortHard,
    tooMuch: t.workoutEffortTooMuch,
  }[effort] || null;
}

function getWorkoutEffortText(effort, t) {
  const label = getWorkoutEffortLabel(effort, t);
  if (!label) return null;

  return t.workoutEffortFelt
    ? t.workoutEffortFelt.replace('{effort}', label)
    : label;
}

function getCompletedWorkoutSuggestions(workout, t, benchPressVariant = 'standard') {
  if (!workout) return [];

  const suggestions = [];
  const lifts = (workout.lifts || []).length
    ? workout.lifts
    : [{ lift: workout.lift, sets: workout.sets || [] }];

  function isAttemptSet(set) {
    return ['opener', 'secondAttempt', 'thirdAttempt'].includes(set?.labelKey);
  }

  function setSubject(liftName, set, index) {
    const setLabel = set?.labelKey ? t[set.labelKey] : set?.label || `${t.set} ${index + 1}`;
    return `${liftName} ${String(setLabel).toLowerCase()}`;
  }

  function pushTrainingSetSuggestion(subject, effort, attemptSet) {
    if (effort === 'max') {
      suggestions.push(
        (attemptSet
          ? t.attemptEffortReviewHigh || '{set} felt maximal. Your attempt plan may be too aggressive; review Meet Planner or your attempt choices.'
          : t.setEffortReviewMaxesHigh || '{set} felt maximal. Your 1RM/e1RM may be too high; consider reviewing Settings → Maxes.'
        ).replace('{set}', subject)
      );
      return;
    }

    if (effort === 'easy') {
      suggestions.push(
        (attemptSet
          ? t.attemptEffortReviewLow || '{set} felt easy. Your attempt plan may be conservative; review Meet Planner or your attempt choices.'
          : t.setEffortReviewMaxesLow || '{set} felt easy. Your 1RM/e1RM may be too low; consider reviewing Settings → Maxes.'
        ).replace('{set}', subject)
      );
      return;
    }

    if (effort === 'hard') {
      suggestions.push(
        (attemptSet
          ? t.attemptEffortReviewHard || '{set} felt hard but manageable. That can be appropriate for attempt practice.'
          : t.setEffortReviewHard || '{set} felt hard but manageable. Keep the plan, and pay attention to technique and recovery.'
        ).replace('{set}', subject)
      );
      return;
    }

    if (effort === 'good') {
      suggestions.push(
        (attemptSet
          ? t.attemptEffortReviewGood || '{set} looked appropriate. Keep the attempt plan.'
          : t.setEffortReviewGood || '{set} feedback looks good. Keep following the plan.'
        ).replace('{set}', subject)
      );
    }
  }

  function pushMeetSetSuggestion(subject, set) {
    if (set.failed) {
      if (set.labelKey === 'opener') {
        suggestions.push((t.meetAttemptFailedOpener || '{set} was missed. The opener may have been too aggressive, or execution on meet day was off. Review opener selection for your next meet.').replace('{set}', subject));
        return;
      }

      if (set.labelKey === 'secondAttempt') {
        suggestions.push((t.meetAttemptFailedSecond || '{set} was missed. Review the jump from opener to second attempt for future meets.').replace('{set}', subject));
        return;
      }

      if (set.labelKey === 'thirdAttempt') {
        suggestions.push((t.meetAttemptFailedThird || '{set} was missed. This is useful limit data, but it may have been beyond today’s capacity.').replace('{set}', subject));
        return;
      }

      suggestions.push((t.meetAttemptFailedGeneric || '{set} was missed. Review attempt selection and execution for the next meet.').replace('{set}', subject));
      return;
    }

    if (set.effort === 'easy') {
      suggestions.push((t.meetAttemptEasy || '{set} looked conservative. That can be a good opener or safe attempt choice.').replace('{set}', subject));
      return;
    }

    if (set.effort === 'good') {
      suggestions.push((t.meetAttemptGood || '{set} looked well chosen. Keep this as useful attempt-planning data.').replace('{set}', subject));
      return;
    }

    if (set.effort === 'hard') {
      suggestions.push((t.meetAttemptHard || '{set} was hard but successful. Good information for future meet attempt jumps.').replace('{set}', subject));
      return;
    }

    if (set.effort === 'max') {
      suggestions.push((t.meetAttemptMax || '{set} was near your limit. Be careful using this as a future jump reference.').replace('{set}', subject));
    }
  }

  lifts.forEach(liftBlock => {
    const liftName = workoutLiftLabel(liftBlock.lift, t, benchPressVariant);
    const completedSets = (liftBlock.sets || [])
      .map((set, index) => ({ set, index }))
      .filter(({ set }) =>
        workout.type === 'meet'
          ? (set.done || set.failed) && isAttemptSet(set)
          : (set.done || set.failed) && !set.skipped
      );

    if (!completedSets.length) return;

    if (workout.type === 'meet') {
      completedSets
        .filter(({ set }) => isAttemptSet(set))
        .forEach(({ set, index }) => pushMeetSetSuggestion(setSubject(liftName, set, index), set));
      return;
    }

    if (workout.type !== 'training') return;

    const effortSets = completedSets.filter(({ set }) => set.effort);
    const attemptSets = effortSets.filter(({ set }) => isAttemptSet(set));

    if (attemptSets.length > 0) {
      attemptSets.forEach(({ set, index }) => {
        pushTrainingSetSuggestion(setSubject(liftName, set, index), set.effort, true);
      });
      return;
    }

    const priority =
      effortSets.find(({ set }) => set.effort === 'max') ||
      effortSets.find(({ set }) => set.effort === 'easy') ||
      effortSets.find(({ set }) => set.effort === 'hard') ||
      effortSets.find(({ set }) => set.effort === 'good');

    if (!priority) return;

    pushTrainingSetSuggestion(
      setSubject(liftName, priority.set, priority.index),
      priority.set.effort,
      false
    );
  });

  if (workout.type === 'meet') {
    if (workout.workoutEffort === 'easy') {
      suggestions.push(t.meetWorkoutEffortEasy || 'The whole meet felt easy. Your attempt selection may have been too conservative for today.');
    }

    if (workout.workoutEffort === 'good') {
      suggestions.push(t.meetWorkoutEffortGood || 'The whole meet felt good. Solid execution; review whether there was room for a slightly bigger total.');
    }

    if (workout.workoutEffort === 'hard') {
      suggestions.push(t.meetWorkoutEffortHard || 'The whole meet felt hard. That is normal for meet day; use the attempts as useful planning data.');
    }

    if (workout.workoutEffort === 'tooMuch') {
      suggestions.push(t.meetWorkoutEffortTooMuch || 'The whole meet felt too much. That can happen on meet day; review attempt jumps, recovery and execution.');
    }

    return suggestions;
  }

  if (workout.type === 'training') {
    if (workout.workoutEffort === 'easy') {
      suggestions.push(t.workoutEffortRecoveryEasy || 'The whole workout felt easy. Keep the plan; if this happens often, review rest time or training frequency.');
    }

    if (workout.workoutEffort === 'good') {
      suggestions.push(t.workoutEffortRecoveryGood || 'The whole workout felt good. This is the target: keep following the plan.');
    }

    if (workout.workoutEffort === 'hard') {
      suggestions.push(t.workoutEffortRecoveryHard || 'The whole workout felt hard. That can be okay; keep the plan, but pay attention to recovery.');
    }

    if (workout.workoutEffort === 'tooMuch') {
      suggestions.push(t.workoutEffortRecoveryTooMuch || 'The whole workout felt too much. Consider more rest between sets or more recovery between workouts.');
    }
  }

  return suggestions;
}

function SetActionButton({ title, onClick, borderColor, disabled = false, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: WORKOUT_CIRCLE_SIZE,
        height: WORKOUT_CIRCLE_SIZE,
        minWidth: WORKOUT_CIRCLE_SIZE,
        borderRadius: '50%',
        border: `2px solid ${borderColor}`,
        background: 'transparent',
        color: '#ffffff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: WORKOUT_CIRCLE_FONT_SIZE,
        fontWeight: 900,
        lineHeight: 1,
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0
      }}
    >
      {children}
    </button>
  );
}

function WorkoutActionRow({
  rowRef,
  left,
  title,
  detail,
  meta,
  actions,
  feedback,
  timerNode,
  onBodyClick,
  isReadOnly = false,
  active = false,
  activeBorder = false,
  borderMode = 'full',
  leftOffset = 0,
}) {
  const isGroupedRow = borderMode === 'group';
  const actionsWidth = WORKOUT_CIRCLE_SIZE * 3 + 16;

  const borderStyle = isGroupedRow
    ? {}
    : {
      border: `1px solid ${THEME.border}`,
    };

  return (
    <div
      ref={rowRef}
      style={{
        display: 'grid',
        gridTemplateColumns: isGroupedRow
          ? `minmax(0, 1fr) ${actionsWidth}px`
          : `auto minmax(0, 1fr) ${actionsWidth}px`,
        alignItems: 'center',
        gap: isGroupedRow ? '6px 10px' : 10,
        padding: isGroupedRow
          ? `${WORKOUT_ROW_PADDING_Y}px 10px ${WORKOUT_ROW_PADDING_Y}px 10px`
          : `${WORKOUT_ROW_PADDING_Y}px 10px ${WORKOUT_ROW_PADDING_Y}px 6px`,
        background: THEME.card,
        boxShadow: active ? 'inset 0 0 0 1px #f39c12' : 'none',
        borderLeft: activeBorder ? `4px solid ${THEME.primary}` : '4px solid transparent',
        ...borderStyle,
      }}
    >
      <div style={{
        gridColumn: isGroupedRow ? '1 / 2' : '1 / 2',
        gridRow: isGroupedRow ? '2 / 3' : '1 / 2',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: isGroupedRow ? 'flex-start' : 'center',
        transform: leftOffset && !isGroupedRow ? `translateX(${leftOffset}px)` : 'none',
      }}>
        {left}
      </div>

      <div
        onClick={isReadOnly ? undefined : onBodyClick}
        style={{
          gridColumn: isGroupedRow ? '1 / -1' : '2 / 3',
          gridRow: isGroupedRow ? '1 / 2' : '1 / 2',
          minWidth: 0,
          textAlign: 'left',
          cursor: isReadOnly || !onBodyClick ? 'default' : 'pointer',
        }}
      >
        {isGroupedRow ? (
          <div style={{
            color: THEME.text,
            fontSize: WORKOUT_TITLE_FONT_SIZE,
            fontWeight: 900,
            lineHeight: 1.35,
            paddingBottom: 1,
            whiteSpace: 'normal',
            overflow: 'visible',
            textOverflow: 'clip',
            overflowWrap: 'normal',
          }}>
            {title}{detail ? <>: <span style={{ color: THEME.muted }}>{detail}</span></> : null}
          </div>
        ) : (
          <>
            <div style={{
              color: THEME.text,
              fontSize: WORKOUT_TITLE_FONT_SIZE,
              fontWeight: 900,
              lineHeight: 1.25,
            }}>
              {title}
            </div>

            {detail && (
              <div style={{
                color: THEME.muted,
                fontSize: WORKOUT_TEXT_FONT_SIZE,
                fontWeight: 800,
                marginTop: 1,
                lineHeight: 1.25,
              }}>
                {detail}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{
        gridColumn: isGroupedRow ? '2 / 3' : '3 / 4',
        gridRow: isGroupedRow ? '2 / 3' : '1 / 2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
        minWidth: actionsWidth,
      }}>
        {meta}
        {actions}
      </div>

      {feedback && (
        <div style={{ gridColumn: '1 / -1' }}>
          {feedback}
        </div>
      )}

      {timerNode && (
        <div style={{ gridColumn: '1 / -1' }}>
          {timerNode}
        </div>
      )}
    </div>
  );
}


function SetRow({ set, index, label, isWarmup = false, onToggle, onWeightChange, onMarkFailed, onRestoreWeight, isActive, isReadOnly, t, weightUnit = WEIGHT_UNITS.KG, lift, benchPressVariant = 'standard' }) {
  const isAdjusted = Boolean(set.adjustedFromFailedSet || set.adjustedFromOriginal || set.failed);
  const displayPct = set.pct ? Number((set.pct * 100).toFixed(1)) : null;
  const effortLabel = getSetEffortLabel(set.effort, t);
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(set.weight));
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  function handleEditClick(e) {
    e.stopPropagation();
    setInputVal(formatWeightValue(kgToDisplayWeight(workoutDisplayWeightKg(set.weight, lift, benchPressVariant), weightUnit), weightUnit));
    setEditing(true);
  }

  function handleConfirm() {
    const val = parseFloat(inputVal);

    if (!isNaN(val) && val > 0) {
      onWeightChange(workoutInputWeightKg(val, weightUnit, lift, benchPressVariant));
    } else {
      setInputVal(formatWeightValue(kgToDisplayWeight(workoutDisplayWeightKg(set.weight, lift, benchPressVariant), weightUnit), weightUnit));
    }

    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') setEditing(false);
  }

  const isSetComplete = !!set.done || !!set.skipped;

  const detail = (
    <span style={{ color: isAdjusted ? '#f39c12' : THEME.muted }}>
      1 × {set.reps} × {formatWorkoutWeightFromKg(set.weight, weightUnit, t, lift, benchPressVariant)}{displayPct ? ` (${displayPct}%)` : ''}
    </span>
  );

  const meta = effortLabel ? (
    <div style={{
      display: 'inline-flex',
      marginTop: 3,
      padding: '2px 7px',
      borderRadius: 999,
      border: `1px solid ${THEME.primary}`,
      color: THEME.primary,
      fontSize: WORKOUT_CIRCLE_FONT_SIZE,
      fontWeight: 800,
      lineHeight: 1.2,
    }}>
      {effortLabel}
    </div>
  ) : null;

  const actions = isSetComplete || isReadOnly ? null : editing ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        ref={inputRef}
        type="number"
        step={normalizeWeightUnit(weightUnit) === WEIGHT_UNITS.LB ? "5" : "2.5"}
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleConfirm}
        style={{
          width: 70,
          padding: '4px 8px',
          fontSize: WORKOUT_CIRCLE_FONT_SIZE,
          fontWeight: 700,
          borderRadius: 4,
          border: '2px solid #e74c3c',
          textAlign: 'right',
        }}
      />
      <span style={{ fontSize: WORKOUT_CIRCLE_FONT_SIZE, color: THEME.text }}>{normalizeWeightUnit(weightUnit)}</span>
    </div>
  ) : (
    <>
      {!isWarmup && (
        <SetActionButton
          title={t.edit}
          borderColor={THEME.primary}
          onClick={handleEditClick}
        >
          ✎
        </SetActionButton>
      )}

      {onRestoreWeight && !isWarmup && (
        <SetActionButton
          title={t.restoreOriginalWeight}
          borderColor="#f39c12"
          onClick={(e) => {
            e.stopPropagation();
            onRestoreWeight();
          }}
        >
          ↺
        </SetActionButton>
      )}

      {onMarkFailed && !set.done && !isReadOnly && (
        <SetActionButton
          title={t.markSetFailed}
          borderColor="#e74c3c"
          onClick={(e) => {
            e.stopPropagation();
            onMarkFailed();
          }}
        >
          ✕
        </SetActionButton>
      )}
    </>
  );

  return (
    <WorkoutActionRow
      rowRef={el => {
        if (isActive && el && !el.dataset.scrolled) {
          el.dataset.scrolled = 'true';
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }}
      left={(
        <WorkoutCircle
          done={set.done}
          active={isActive}
          skipped={set.skipped}
          disabled={isReadOnly}
          onClick={onToggle}
          label={label}
        />
      )}
      title={label}
      detail={detail}
      meta={meta}
      actions={actions}
      onBodyClick={onToggle}
      isReadOnly={isReadOnly}
      active={isActive}
      activeBorder={isActive && !isWarmup}
      borderMode="group"
    />
  );
}

function SettingsListRow({ label, description, value, valueColor = THEME.text, actionLabel, onAction, actionContent, danger = false, noBorder = false, compact = false }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 190px)',
      alignItems: 'center',
      gap: 12,
      padding: compact ? '6px 0' : '10px 0',
      borderBottom: noBorder ? 'none' : `1px solid ${THEME.border}`
    }}>
      <div style={{
        minWidth: 0
      }}>
        <div style={{
          color: danger ? THEME.red : THEME.text,
          fontSize: 16,
          fontWeight: 800,
          lineHeight: 1.2
        }}>
          {label}
        </div>

        {description && (
          <div style={{
            color: THEME.muted,
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.3,
            marginTop: 6
          }}>
            {description}
          </div>
        )}
      </div>

      <div style={{
        color: valueColor,
        fontSize: 15,
        fontWeight: 800,
        textAlign: 'center',
        width: '100%'
      }}>
        {actionContent || (
          actionLabel ? (
            <button
              type="button"
              onClick={onAction}
              style={{
                width: '100%',
                padding: '9px 11px',
                fontSize: 15,
                fontWeight: 800,
                background: danger ? '#8b1e1e' : THEME.card,
                color: '#ffffff',
                border: `1px solid ${danger ? THEME.red : THEME.primary}`,
                borderRadius: 8,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {actionLabel}
            </button>
          ) : (
            <span>{value || '—'}</span>
          )
        )}
      </div>
    </div>
  );
}

function SettingsActionButton({ children, onClick, variant = 'primary', style = {}, disabled = false }) {
  const isPrimary = variant === 'primary';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: 12,
        fontSize: 16,
        fontWeight: 800,
        background: isPrimary ? THEME.card : THEME.bg,
        color: disabled ? THEME.muted : THEME.text,
        border: `1px solid ${isPrimary ? THEME.primary : THEME.border}`,
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style
      }}
    >
      {children}
    </button>
  );
}

function SettingsModal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 650,
      padding: 16
    }}>
      <div style={{
        background: THEME.card,
        border: `1px solid ${THEME.primary}`,
        borderRadius: 12,
        padding: 18,
        maxWidth: 420,
        width: '100%',
        maxHeight: '88vh',
        overflowY: 'auto',
        color: THEME.text
      }}>
        <h3 style={{ margin: '0 0 16px', textAlign: 'center' }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function modalInputStyle() {
  return {
    width: '100%',
    padding: 10,
    fontSize: 16,
    borderRadius: 4,
    background: THEME.bg,
    color: THEME.text,
    border: `1px solid ${THEME.border}`,
    boxSizing: 'border-box'
  };
}

function Toast({ message }) {
  if (!message) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 18,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 700,
      background: THEME.card,
      border: `1px solid ${THEME.primary}`,
      borderRadius: 999,
      padding: '10px 16px',
      color: THEME.text,
      fontWeight: 800,
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
    }}>
      {message}
    </div>
  );
}


const MEET_PREP_ITEMS = [
    ['id', 'meetPrepId'],
    ['registration', 'meetPrepRegistration'],
    ['bodyweight', 'meetPrepBodyweight'],
    ['clothing', 'meetPrepClothing'],
    ['shoes', 'meetPrepShoes'],
    ['socks', 'meetPrepSocks'],
    ['equipment', 'meetPrepEquipment'],
    ['food', 'meetPrepFood'],
    ['attempts', 'meetPrepAttempts'],
    ['rackHeights', 'meetPrepRackHeights'],
    ['pen', 'meetPrepPen'],
    ['phone', 'meetPrepPhone'],
    ['travel', 'meetPrepTravel'],
];

function MeetPrepChecklistSection({ meetPrepChecklist = {}, setMeetPrepChecklist = () => {}, t }) {
  const [showMeetPrepChecklist, setShowMeetPrepChecklist] = useState(false);
  const [showMeetPrepResetConfirm, setShowMeetPrepResetConfirm] = useState(false);


  const toggleMeetPrepItem = key => {
    setMeetPrepChecklist(prev => ({
      ...(prev || {}),
      [key]: !prev?.[key],
    }));
  };

  const checkedMeetPrepItems = MEET_PREP_ITEMS.filter(([key]) => !!meetPrepChecklist?.[key]).length;
  const allMeetPrepItemsChecked = checkedMeetPrepItems === MEET_PREP_ITEMS.length && MEET_PREP_ITEMS.length > 0;
  const hasCheckedMeetPrepItems = checkedMeetPrepItems > 0;

  return (
    <>
      <SettingsListRow
        label={t.meetPrepChecklist}
        actionLabel={`${checkedMeetPrepItems} / ${MEET_PREP_ITEMS.length}${allMeetPrepItemsChecked ? ` · ✓ ${t.meetPrepReady}` : ''}`}
        onAction={() => setShowMeetPrepChecklist(true)}
      />

      {showMeetPrepChecklist && (
        <SettingsModal
          title={t.meetPrepChecklist}
          onClose={() => {
            setShowMeetPrepChecklist(false);
            setShowMeetPrepResetConfirm(false);
          }}
        >
          <p style={{
            margin: '0 0 8px',
            color: THEME.muted,
            fontSize: 13,
            lineHeight: 1.4,
            textAlign: 'center'
          }}>
            {t.meetPrepChecklistHint}
          </p>

          <div style={{
            margin: '0 0 14px',
            color: allMeetPrepItemsChecked ? THEME.primary : THEME.text,
            fontSize: 14,
            fontWeight: 800,
            textAlign: 'center'
          }}>
            {checkedMeetPrepItems} / {MEET_PREP_ITEMS.length}{allMeetPrepItemsChecked ? ` · ✓ ${t.meetPrepReady}` : ''}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {MEET_PREP_ITEMS.map(([key, labelKey]) => {
              const checked = !!meetPrepChecklist?.[key];

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleMeetPrepItem(key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: 10,
                    borderRadius: 8,
                    border: `1px solid ${checked ? THEME.primary : THEME.border}`,
                    background: THEME.bg,
                    color: THEME.text,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <span style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: `1px solid ${checked ? THEME.primary : THEME.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: THEME.primary,
                    fontWeight: 900,
                    flexShrink: 0
                  }}>
                    {checked ? '✓' : ''}
                  </span>

                  <span style={{
                    fontSize: 14,
                    fontWeight: checked ? 700 : 500,
                    textDecoration: 'none'
                  }}>
                    {t[labelKey]}
                  </span>
                </button>
              );
            })}
          </div>
          {hasCheckedMeetPrepItems && (
            <div style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: `1px solid ${THEME.border}`
            }}>
              {showMeetPrepResetConfirm ? (
                <div>
                  <p style={{
                    margin: '0 0 10px',
                    color: THEME.muted,
                    fontSize: 13,
                    lineHeight: 1.4,
                    textAlign: 'center'
                  }}>
                    {t.meetPrepResetConfirmText}
                  </p>

                  <SettingsActionButton
                    onClick={() => {
                      setMeetPrepChecklist({});
                      setShowMeetPrepResetConfirm(false);
                    }}
                  >
                    {t.meetPrepResetConfirm}
                  </SettingsActionButton>

                  <SettingsActionButton
                    variant="secondary"
                    onClick={() => setShowMeetPrepResetConfirm(false)}
                    style={{ marginTop: 8, fontWeight: 700 }}
                  >
                    {t.cancel}
                  </SettingsActionButton>
                </div>
              ) : (
                <SettingsActionButton
                  variant="secondary"
                  onClick={() => setShowMeetPrepResetConfirm(true)}
                >
                  {t.meetPrepReset}
                </SettingsActionButton>
              )}
            </div>
          )}

          {!showMeetPrepResetConfirm && (
            <SettingsActionButton
              variant="secondary"
              onClick={() => {
                setShowMeetPrepChecklist(false);
                setShowMeetPrepResetConfirm(false);
              }}
              style={{ marginTop: 14 }}
            >
              {t.done}
            </SettingsActionButton>
          )}
        </SettingsModal>
      )}
    </>
  );
}

function DataSection({ meetPrepChecklist = {}, setMeetPrepChecklist = () => {}, t }) {
  const [notice, setNotice] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const importInputRef = useRef(null);

  const downloadJson = (filename, json) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const buildDataSectionBackupSummary = data => {
    const currentCycle = data?.currentCycle || 1;
    const totalWorkouts = data?.inProgress?.workouts?.length || 28;
    const selectedIndex = data?.inProgress?.selectedIndex;
    const completedWorkoutCount = getCompletedWorkoutCount(data?.history || [], currentCycle);
    const currentWorkout = Math.min((selectedIndex ?? completedWorkoutCount) + 1, totalWorkouts);

    return {
      backupVersion: 1,
      programVersion: data?.inProgress?.programVersion || null,
      currentCycle,
      currentWorkout,
      totalWorkouts,
      historyEntries: Array.isArray(data?.history) ? data.history.length : 0,
      bodyDataEntries: Array.isArray(data?.bodyWeights) ? data.bodyWeights.length : 0,
    };
  };

  const exportData = async () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (!saved) {
        setNotice(t.exportDataNoData);
        return;
      }

      const exportedAt = new Date().toISOString();
      const timestamp = exportedAt.slice(0, 16).replace('T', '-').replace(':', '');
      const filename = `kelani-sbd-tracker-backup-${timestamp}.json`;
      const data = JSON.parse(saved);
      const backup = {
        app: t.appName,
        backupVersion: 1,
        appVersion: process.env.REACT_APP_VERSION ?? 'dev',
        exportedAt,
        storageKey: STORAGE_KEY,
        summary: buildBackupSummary(data),
        data,
      };
      const json = JSON.stringify(backup, null, 2);

      if (Capacitor.isNativePlatform()) {
        const result = await Filesystem.writeFile({
          path: filename,
          data: json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });

        await Share.share({
          title: t.exportData,
          text: t.exportDataDescription,
          files: [result.uri],
          dialogTitle: t.exportData,
        });
      } else {
        downloadJson(filename, json);
      }

      setNotice(t.exportDataSuccess);
    } catch (e) {
      setNotice(t.exportDataError);
    }
  };

  const importData = async event => {
    try {
      const file = event.target.files?.[0];
      event.target.value = '';

      if (!file) return;

      const text = await file.text();
      const backup = JSON.parse(text);

      if (
        backup?.storageKey !== STORAGE_KEY ||
        !backup?.data ||
        typeof backup.data !== 'object' ||
        !backup.data.prs ||
        !backup.data.history
      ) {
        setNotice(t.importDataInvalid);
        return;
      }

      setPendingImport({
        data: backup.data,
        appVersion: backup.appVersion || '—',
        exportedAt: backup.exportedAt || '—',
        summary: backup.summary || buildDataSectionBackupSummary(backup.data),
      });
    } catch (e) {
      setNotice(t.importDataError);
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingImport.data));
    setNotice(t.importDataSuccess);
    setPendingImport(null);
    window.location.reload();
  };

  const importSummary = pendingImport?.summary;

  const autoBackupStatus = (() => {
    try {
      return JSON.parse(localStorage.getItem(AUTO_BACKUP_STATUS_KEY) || 'null');
    } catch {
      return null;
    }
  })();

  const autoBackupDate = autoBackupStatus?.exportedAt
    ? new Date(autoBackupStatus.exportedAt).toLocaleString()
    : null;

  return (
    <>
      <MeetPrepChecklistSection
        meetPrepChecklist={meetPrepChecklist}
        setMeetPrepChecklist={setMeetPrepChecklist}
        t={t}
      />

      <SettingsListRow
        label={t.dataManagement}
        noBorder={true}
        compact={true}
        actionContent={(
          <div style={{
            display: 'grid',
            gap: 6,
            justifyItems: 'stretch',
            width: '100%'
          }}>
            <button
              type="button"
              onClick={exportData}
              style={{
                width: '100%',
                padding: '9px 11px',
                fontSize: 15,
                fontWeight: 800,
                background: THEME.card,
                color: THEME.text,
                border: `1px solid ${THEME.primary}`,
                borderRadius: 8,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {t.exportDataShort || t.exportData}
            </button>

            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              style={{
                width: '100%',
                padding: '9px 11px',
                fontSize: 15,
                fontWeight: 800,
                background: THEME.card,
                color: THEME.text,
                border: `1px solid ${THEME.primary}`,
                borderRadius: 8,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {t.importDataShort || t.importData}
            </button>
          </div>
        )}
      />

      <SettingsListRow
        label={t.lastAutomaticBackup}
        value={autoBackupDate || t.noAutomaticBackupYet}
        valueColor={autoBackupStatus?.ok ? THEME.primary : THEME.red}
        compact={true}
      />

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        onChange={importData}
        style={{ display: 'none' }}
      />

      {notice && (
        <div style={{
          padding: '7px 0',
          color: THEME.primary,
          fontSize: 13,
          fontWeight: 700,
          textAlign: 'center',
          borderBottom: `1px solid ${THEME.border}`
        }}>
          {notice}
        </div>
      )}

      {pendingImport && (
        <SettingsModal
          title={t.importData}
          onClose={() => setPendingImport(null)}
        >
          <p style={{
            margin: '0 0 16px',
            color: THEME.text,
            fontSize: 14,
            lineHeight: 1.4,
            textAlign: 'center'
          }}>
            {t.importDataConfirm}
          </p>

          <div style={{
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            padding: 12,
            marginBottom: 14,
            display: 'grid',
            gap: 8,
            fontSize: 13
          }}>
            <h4 style={{
              margin: '0 0 4px',
              color: THEME.text,
              fontSize: 14,
              textAlign: 'center'
            }}>
              {t.importPreviewTitle}
            </h4>

            {[
              [t.importPreviewVersion, pendingImport.appVersion],
              [
                t.importPreviewExportedAt,
                pendingImport.exportedAt && pendingImport.exportedAt !== '—'
                  ? new Date(pendingImport.exportedAt).toLocaleString()
                  : '—'
              ],
              [
                t.importPreviewProgress,
                `${t.cycle} ${importSummary?.currentCycle || 1} · ${t.workoutProgress} ${importSummary?.currentWorkout || 1} / ${importSummary?.totalWorkouts || 28}`
              ],
              [t.importPreviewBodyData, importSummary?.bodyDataEntries ?? 0],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: THEME.muted, fontWeight: 700 }}>{label}</span>
                <strong style={{ color: THEME.text, textAlign: 'right' }}>{value}</strong>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <button
              onClick={confirmImport}
              style={{
                width: '100%',
                padding: 12,
                fontSize: 14,
                fontWeight: 800,
                background: THEME.card,
                color: '#ffffff',
                border: `1px solid ${THEME.primary}`,
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              {t.importData}
            </button>

            <button
              onClick={() => setPendingImport(null)}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 14,
                fontWeight: 700,
                background: 'transparent',
                color: THEME.text,
                border: `1px solid ${THEME.border}`,
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              {t.cancel}
            </button>
          </div>
        </SettingsModal>
      )}
    </>
  );
}

function SupportActionButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '9px 11px',
        fontSize: 15,
        fontWeight: 800,
        background: THEME.card,
        color: '#ffffff',
        border: `1px solid ${THEME.primary}`,
        borderRadius: 8,
        cursor: 'pointer',
        minHeight: 42,
        width: '100%',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}
    >
      {children}
    </button>
  );
}

function SupportSection({ t }) {
  const links = [
    {
      label: t.supportKelani || 'Support Kelani',
      url: 'https://kelani-site.mburgosfr.workers.dev/#support',
    },
    {
      label: t.sendFeedbackShort || t.sendFeedback,
      url: 'mailto:mburgosfr@gmail.com?subject=Kelani%20SBD%20Tracker%20feedback',
    },
    {
      label: t.reportIssueShort || t.reportBug,
      url: 'https://github.com/mburgosfr-star/kelani-sbd-tracker/issues/new',
    },
    {
      label: t.sourceCode || 'Source code',
      url: 'https://github.com/mburgosfr-star/kelani-sbd-tracker',
    },
  ];

  function openLink(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <SettingsListRow
      label={t.support}
      description={t.supportDescription}
      actionContent={(
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 8,
          width: '100%'
        }}>
          {links.map(item => (
            <SupportActionButton
              key={item.label}
              onClick={() => openLink(item.url)}
            >
              {item.label}
            </SupportActionButton>
          ))}
        </div>
      )}
    />
  );
}

function ProfileSection({ userProfile, onSave, weightUnit, setWeightUnit, t }) {
  const [isEditing, setIsEditing] = useState(false);
  const [birthDate, setBirthDate] = useState(userProfile?.birthDate || '');
  const [sex, setSex] = useState(userProfile?.sex || '');
  const [profileWeightUnit, setProfileWeightUnit] = useState(normalizeWeightUnit(weightUnit));
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    setBirthDate(userProfile?.birthDate || '');
    setSex(userProfile?.sex || '');
    setProfileWeightUnit(normalizeWeightUnit(weightUnit));
  }, [userProfile?.birthDate, userProfile?.sex, weightUnit]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(id);
  }, [notice]);

  function openEdit() {
    setBirthDate(userProfile?.birthDate || '');
    setSex(userProfile?.sex || '');
    setProfileWeightUnit(normalizeWeightUnit(weightUnit));
    setIsEditing(true);
  }

  function handleSave() {
    onSave({ birthDate, sex });
    setWeightUnit(normalizeWeightUnit(profileWeightUnit));
    setIsEditing(false);
    setNotice(t.profileSaved);
  }

  return (
    <>
      <Toast message={notice} />

      <SettingsListRow label={t.profile} actionLabel={t.editProfile || t.edit} onAction={openEdit} />

      {isEditing && (
        <SettingsModal
          title={t.profile}
          onClose={() => setIsEditing(false)}
        >
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>{t.birthDate}</label>
            <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} style={modalInputStyle()} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>{t.sex}</label>
            <select value={sex} onChange={e => setSex(e.target.value)} style={modalInputStyle()}>
              <option value="">{t.selectSex}</option>
              <option value="male">{t.male}</option>
              <option value="female">{t.female}</option>
              <option value="other">{t.other}</option>
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>{t.weightUnit}</label>
            <select value={profileWeightUnit} onChange={e => setProfileWeightUnit(normalizeWeightUnit(e.target.value))} style={modalInputStyle()}>
              <option value={WEIGHT_UNITS.KG}>{t.weightUnitKg}</option>
              <option value={WEIGHT_UNITS.LB}>{t.weightUnitLb}</option>
            </select>
          </div>

          <button onClick={handleSave} style={{ width: '100%', padding: 12, fontSize: 15, fontWeight: 700, background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.primary}`, borderRadius: 8, cursor: 'pointer' }}>
            {t.save}
          </button>

          <button onClick={() => setIsEditing(false)} style={{ width: '100%', marginTop: 8, padding: 10, fontSize: 14, fontWeight: 700, background: 'transparent', color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 8, cursor: 'pointer' }}>
            {t.cancel}
          </button>
        </SettingsModal>
      )}
    </>
  );
}



function MaxesSection({ best1RMs = {}, bestE1RMs = {}, prs = {}, onSaveMaxes, t, weightUnit = WEIGHT_UNITS.KG }) {
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [selectedLift, setSelectedLift] = useState(null);
  const [oneRMInput, setOneRMInput] = useState('');
  const [e1RMInput, setE1RMInput] = useState('');
  const [calculatorWeight, setCalculatorWeight] = useState('');
  const [calculatorReps, setCalculatorReps] = useState('');
  const [notice, setNotice] = useState(null);

  const liftKeys = ['Squat', 'Bench', 'Deadlift'];

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  function inputValue(valueKg) {
    const displayValue = kgToDisplayWeight(valueKg, weightUnit);
    if (displayValue === '') return '';
    return formatWeightValue(displayValue, weightUnit);
  }

  function setE1RMInputFromKg(valueKg) {
    const displayValue = kgToDisplayWeight(valueKg, weightUnit);
    if (displayValue === '') return;
    setE1RMInput(formatWeightValue(displayValue, weightUnit));
  }

  function openLift(lift) {
    setSelectedLift(lift);
    setOneRMInput(inputValue(best1RMs?.[lift]));
    setE1RMInput(inputValue(bestE1RMs?.[lift] || prs?.[lift]));
    setCalculatorWeight('');
    setCalculatorReps('');
  }

  function closeLift() {
    setSelectedLift(null);
    setOneRMInput('');
    setE1RMInput('');
    setCalculatorWeight('');
    setCalculatorReps('');
  }

  function handleCalculateE1RM() {
    const weightKg = displayWeightToKg(parseFloat(calculatorWeight), weightUnit);
    const reps = parseInt(calculatorReps, 10);

    if (!Number(weightKg) || !Number.isFinite(reps) || reps < 1) return;

    const currentOneRM = displayWeightToKg(parseFloat(oneRMInput), weightUnit);
    const estimatedE1RM = roundKgForStorage(weightKg * (1 + reps / 30));

    if (Number(currentOneRM) && Number(estimatedE1RM) < Number(currentOneRM)) {
      setNotice(t.estimatedE1RMBelow1RM);
      return;
    }

    setE1RMInputFromKg(estimatedE1RM);
  }

  function handleSaveLift() {
    if (!selectedLift) return;

    const nextOneRM = displayWeightToKg(parseFloat(oneRMInput), weightUnit);
    const nextE1RM = displayWeightToKg(parseFloat(e1RMInput), weightUnit);

    if (!Number(nextOneRM) || !Number(nextE1RM)) return;

    if (Number(nextE1RM) < Number(nextOneRM)) {
      setE1RMInput(String(oneRMInput));
      setNotice(t.e1RMRaisedTo1RM);
      return;
    }

    onSaveMaxes?.(selectedLift, {
      oneRM: nextOneRM,
      e1RM: nextE1RM,
    });

    closeLift();
    setIsOverviewOpen(false);
    setNotice(t.maxesSaved);
  }

  return (
    <>
      <Toast message={notice} />

      <SettingsListRow label={t.maxes} actionLabel={t.editMaxes || t.editProfile} onAction={() => setIsOverviewOpen(true)} />

      {isOverviewOpen && (
        <SettingsModal title={t.maxes} onClose={() => setIsOverviewOpen(false)}>
          {liftKeys.map(lift => (
            <div key={lift} style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 10,
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: lift === 'Deadlift' ? 'none' : `1px solid ${THEME.border}`,
            }}>
              <div>
                <div style={{ fontWeight: 900, color: THEME.text, marginBottom: 4 }}>
                  {liftLabel(lift, t)}
                </div>
                <div style={{ color: THEME.muted, fontSize: 13, lineHeight: 1.35 }}>
                  {t.oneRM}: {best1RMs?.[lift] ? formatWeightFromKg(best1RMs[lift], weightUnit) : '—'} · {t.e1RM}: {(bestE1RMs?.[lift] || prs?.[lift]) ? formatWeightFromKg(bestE1RMs?.[lift] || prs?.[lift], weightUnit) : '—'}
                </div>
              </div>

              <button onClick={() => openLift(lift)} style={{
                padding: '8px 10px',
                fontSize: 13,
                fontWeight: 800,
                background: 'transparent',
                color: THEME.text,
                border: `1px solid ${THEME.border}`,
                borderRadius: 8,
                cursor: 'pointer',
              }}>
                {t.adjust}
              </button>
            </div>
          ))}

          <button onClick={() => setIsOverviewOpen(false)} style={{ width: '100%', marginTop: 14, padding: 10, fontSize: 14, fontWeight: 700, background: 'transparent', color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 8, cursor: 'pointer' }}>
            {t.done}
          </button>
        </SettingsModal>
      )}

      {selectedLift && (
        <SettingsModal title={`${liftLabel(selectedLift, t)} · ${t.maxes}`} onClose={closeLift}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>{t.oneRM}</label>
            <input type="number" min="0" step={weightUnit === WEIGHT_UNITS.LB ? "5" : "2.5"} value={oneRMInput} onChange={e => setOneRMInput(e.target.value)} style={modalInputStyle()} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>{t.e1RM}</label>
            <input type="number" min="0" step={weightUnit === WEIGHT_UNITS.LB ? "5" : "2.5"} value={e1RMInput} onChange={e => setE1RMInput(e.target.value)} style={modalInputStyle()} />
          </div>

          <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontWeight: 900, color: THEME.text, marginBottom: 10 }}>
              {t.estimateE1RM}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 700, fontSize: 13 }}>{t.submaxWeight}</label>
                <input
                  type="number"
                  min="0"
                  step={weightUnit === WEIGHT_UNITS.LB ? "5" : "2.5"}
                  value={calculatorWeight}
                  onChange={e => setCalculatorWeight(e.target.value)}
                  style={modalInputStyle()}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 700, fontSize: 13 }}>{t.submaxReps}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={calculatorReps}
                  onChange={e => setCalculatorReps(e.target.value)}
                  style={modalInputStyle()}
                />
              </div>
            </div>

            <button onClick={handleCalculateE1RM} style={{ width: '100%', padding: 10, fontSize: 14, fontWeight: 800, background: 'transparent', color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 8, cursor: 'pointer' }}>
              {t.calculateE1RM}
            </button>
          </div>

          <button onClick={handleSaveLift} style={{ width: '100%', padding: 12, fontSize: 15, fontWeight: 700, background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.primary}`, borderRadius: 8, cursor: 'pointer' }}>
            {t.save}
          </button>

          <button onClick={closeLift} style={{ width: '100%', marginTop: 8, padding: 10, fontSize: 14, fontWeight: 700, background: 'transparent', color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 8, cursor: 'pointer' }}>
            {t.cancel}
          </button>
        </SettingsModal>
      )}
    </>
  );
}

function BodyDataSection({ bodyData, onSave, t, weightUnit = WEIGHT_UNITS.KG }) {
  const previous = bodyData || {};
  const [isEditing, setIsEditing] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null);
  const [form, setForm] = useState({
    bodyWeight: '',
    bodyFat: '',
    bodyWater: '',
    visceralFat: '',
    physiqueRating: '',
    boneMass: '',
  });

  useEffect(() => {
    if (!saveNotice) return;
    const id = window.setTimeout(() => setSaveNotice(null), 1800);
    return () => window.clearTimeout(id);
  }, [saveNotice]);

  function openEdit() {
    setForm({
      bodyWeight: '',
      bodyFat: '',
      bodyWater: '',
      visceralFat: '',
      physiqueRating: '',
      boneMass: '',
    });
    setIsEditing(true);
  }

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function isWeightMassField(field) {
    return field === 'bodyWeight' || field === 'boneMass';
  }

  function enteredValue(field) {
    const entered = toOptionalNumber(form[field]);
    if (entered === null) return null;

    return isWeightMassField(field)
      ? displayWeightToKg(entered, weightUnit)
      : entered;
  }

  function placeholderValue(field) {
    const previousValue = previous[field];
    if (!previousValue) return '';

    return isWeightMassField(field)
      ? formatWeightValue(kgToDisplayWeight(previousValue, weightUnit), weightUnit, { body: true })
      : String(previousValue);
  }

  function finalValue(field) {
    const entered = enteredValue(field);
    if (entered !== null) return entered;
    return previous[field] || null;
  }

  function handleSave() {
    const bodyWeight = finalValue('bodyWeight');
    const bodyFat = finalValue('bodyFat');
    const boneMass = finalValue('boneMass');
    const leanMass = calculateLeanMassEstimate(bodyWeight, bodyFat, boneMass) || previous.leanMass || null;
    const bmr = calculateBmrEstimate(leanMass) || previous.bmr || null;

    const nextData = {
      bodyWeight,
      bodyFat,
      bodyWater: finalValue('bodyWater'),
      visceralFat: finalValue('visceralFat'),
      leanMass,
      physiqueRating: finalValue('physiqueRating'),
      boneMass,
      bmr,
    };

    const hasAnyValue = Object.values(nextData).some(value => value !== null);
    if (!hasAnyValue) return;

    onSave(nextData);
    setIsEditing(false);
    setSaveNotice(t.bodyDataUpdated);
  }

  const fields = [
    { key: 'bodyWeight', label: t.bodyweight, unit: normalizeWeightUnit(weightUnit) },
    { key: 'bodyFat', label: t.bodyFatPercent, unit: '%' },
    { key: 'bodyWater', label: t.bodyWaterPercent, unit: '%' },
    { key: 'visceralFat', label: t.visceralFatRating },
    { key: 'physiqueRating', label: t.physiqueRating },
    { key: 'boneMass', label: t.boneMassKg, unit: normalizeWeightUnit(weightUnit) },
  ];

  return (
    <>
      <Toast message={saveNotice} />

      <SettingsListRow label={t.updateBodyData} actionLabel={t.editBodyData || t.edit} onAction={openEdit} />

      {isEditing && (
        <SettingsModal
          title={t.updateBodyData}
          onClose={() => setIsEditing(false)}
        >
          {fields.map(field => (
            <div key={field.key} style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>{field.label}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  value={form[field.key]}
                  onChange={e => updateField(field.key, e.target.value)}
                  placeholder={placeholderValue(field.key)}
                  style={{
                    ...modalInputStyle(),
                    paddingRight: field.unit ? 48 : 10
                  }}
                />
                {field.unit && (
                  <span style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: THEME.text,
                    fontSize: 15,
                    pointerEvents: 'none'
                  }}>
                    {field.unit}
                  </span>
                )}
              </div>
            </div>
          ))}

          <button onClick={handleSave} style={{ width: '100%', padding: 12, fontSize: 15, fontWeight: 700, background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.primary}`, borderRadius: 8, cursor: 'pointer' }}>
            {t.save}
          </button>

          <button onClick={() => setIsEditing(false)} style={{ width: '100%', marginTop: 8, padding: 10, fontSize: 14, fontWeight: 700, background: 'transparent', color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 8, cursor: 'pointer' }}>
            {t.cancel}
          </button>
        </SettingsModal>
      )}
    </>
  );
}

function RestTimeSection({ restTimeSeconds, setRestTimeSeconds, t }) {
  const [showOptions, setShowOptions] = useState(false);

  return (
    <>
      <SettingsListRow
        label={t.restTime}
        actionLabel={formatRestTime(restTimeSeconds)}
        onAction={() => setShowOptions(true)}
      />

      {showOptions && (
        <SettingsModal
          title={t.restTime}
          onClose={() => setShowOptions(false)}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            {REST_TIME_OPTIONS.map(seconds => (
              <button
                key={seconds}
                onClick={() => {
                  setRestTimeSeconds(seconds);
                  setShowOptions(false);
                }}
                style={{
                  width: '100%',
                  padding: 12,
                  fontSize: 15,
                  fontWeight: 800,
                  borderRadius: 8,
                  border: `1px solid ${restTimeSeconds === seconds ? THEME.primary : THEME.border}`,
                  background: restTimeSeconds === seconds ? THEME.primary : THEME.card,
                  color: restTimeSeconds === seconds ? THEME.bg : THEME.text,
                  cursor: 'pointer'
                }}
              >
                {formatRestTime(seconds)}
              </button>
            ))}

            <button
              onClick={() => setShowOptions(false)}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 14,
                fontWeight: 700,
                background: 'transparent',
                color: THEME.text,
                border: `1px solid ${THEME.border}`,
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              {t.cancel}
            </button>
          </div>
        </SettingsModal>
      )}
    </>
  );
}


function PreparationSection({ preparationMode, setPreparationMode, t }) {
  const [showOptions, setShowOptions] = useState(false);

  const normalizedPreparationMode = normalizePreparationMode(preparationMode);
  const modes = ['off', 'basicFirst', 'basicAll', 'shoulderThoracic'];
  const labels = {
    off: t.preparationOff,
    basicFirst: t.preparationBasicFirst || t.preparationBasic,
    basicAll: t.preparationBasicAll || t.preparationBasic,
    shoulderThoracic: t.preparationShoulderThoracic,
  };

  return (
    <>
      <SettingsListRow
        label={t.preparation}
        actionLabel={labels[normalizedPreparationMode] || labels.basicFirst}
        onAction={() => setShowOptions(true)}
      />

      {showOptions && (
        <SettingsModal
          title={t.preparation}
          onClose={() => setShowOptions(false)}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            {modes.map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setPreparationMode(mode);
                  setShowOptions(false);
                }}
                style={{
                  width: '100%',
                  padding: 12,
                  fontSize: 15,
                  fontWeight: 800,
                  borderRadius: 8,
                  border: `1px solid ${normalizedPreparationMode === mode ? THEME.primary : THEME.border}`,
                  background: normalizedPreparationMode === mode ? THEME.primary : THEME.card,
                  color: normalizedPreparationMode === mode ? THEME.bg : THEME.text,
                  cursor: 'pointer'
                }}
              >
                {labels[mode]}
              </button>
            ))}
          </div>
        </SettingsModal>
      )}
    </>
  );
}


function WorkoutSection({
  preparationMode,
  setPreparationMode,
  accessoryMode,
  setAccessoryMode,
  benchPressVariant,
  setBenchPressVariant,
  t,
}) {
  const [showWorkoutSettings, setShowWorkoutSettings] = useState(false);

  return (
    <>
      <SettingsListRow
        label={t.workoutSettings}
        actionLabel={t.configure || t.edit}
        onAction={() => setShowWorkoutSettings(true)}
      />

      {showWorkoutSettings && (
        <SettingsModal
          title={t.workoutSettings}
          onClose={() => setShowWorkoutSettings(false)}
        >
          <PreparationSection
            preparationMode={preparationMode}
            setPreparationMode={setPreparationMode}
            t={t}
          />

          <AccessorySection
            accessoryMode={accessoryMode}
            setAccessoryMode={setAccessoryMode}
            t={t}
          />

          <BenchPressVariantSection
            benchPressVariant={benchPressVariant}
            setBenchPressVariant={setBenchPressVariant}
            t={t}
          />

          <button
            type="button"
            onClick={() => setShowWorkoutSettings(false)}
            style={{
              width: '100%',
              marginTop: 12,
              padding: 12,
              fontSize: 15,
              fontWeight: 800,
              background: THEME.card,
              color: THEME.text,
              border: `1px solid ${THEME.primary}`,
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            {t.done || 'Done'}
          </button>
        </SettingsModal>
      )}
    </>
  );
}


function BenchPressVariantSection({ benchPressVariant, setBenchPressVariant, t }) {
  const [showOptions, setShowOptions] = useState(false);

  const modes = ['standard', 'floorPress', 'standingLandminePress'];
  const labels = {
    standard: t.benchPressStandard,
    floorPress: t.benchPressFloorPress,
    standingLandminePress: t.benchPressStandingLandminePress,
  };

  return (
    <>
      <SettingsListRow
        label={t.benchPressVariant}
        actionLabel={labels[benchPressVariant] || labels.standard}
        onAction={() => setShowOptions(true)}
        noBorder
      />

      {showOptions && (
        <SettingsModal
          title={t.benchPressVariant}
          onClose={() => setShowOptions(false)}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            {modes.map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setBenchPressVariant(mode);
                  setShowOptions(false);
                }}
                style={{
                  width: '100%',
                  padding: 12,
                  fontSize: 15,
                  fontWeight: 800,
                  borderRadius: 8,
                  border: `1px solid ${benchPressVariant === mode ? THEME.primary : THEME.border}`,
                  background: benchPressVariant === mode ? THEME.primary : THEME.card,
                  color: benchPressVariant === mode ? THEME.bg : THEME.text,
                  cursor: 'pointer'
                }}
              >
                {labels[mode]}
              </button>
            ))}
          </div>
        </SettingsModal>
      )}
    </>
  );
}


function AccessorySection({ accessoryMode, setAccessoryMode, t }) {
  const [showOptions, setShowOptions] = useState(false);

  const labels = {
    off: t.accessoriesOff,
    basic: t.accessoriesBasic,
    full: t.accessoriesFull,
  };

  return (
    <>
      <SettingsListRow
        label={t.accessories}
        actionLabel={labels[accessoryMode] || labels.off}
        onAction={() => setShowOptions(true)}
      />

      {showOptions && (
        <SettingsModal
          title={t.accessories}
          onClose={() => setShowOptions(false)}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            {ACCESSORY_MODES.map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setAccessoryMode(mode);
                  setShowOptions(false);
                }}
                style={{
                  width: '100%',
                  padding: 12,
                  fontSize: 15,
                  fontWeight: 800,
                  borderRadius: 8,
                  border: `1px solid ${accessoryMode === mode ? THEME.primary : THEME.border}`,
                  background: accessoryMode === mode ? THEME.primary : THEME.card,
                  color: accessoryMode === mode ? THEME.bg : THEME.text,
                  cursor: 'pointer'
                }}
              >
                {labels[mode]}
              </button>
            ))}
          </div>
        </SettingsModal>
      )}
    </>
  );
}



function LanguageSection({ language, setLanguage, t }) {
  const [isEditing, setIsEditing] = useState(false);

  const languageNames = {
    nl: t.languageDutch,
    en: t.languageEnglish,
    ca: t.languageCatalan,
  };

  return (
    <>
      <SettingsListRow
        label={t.language}
        actionLabel={languageNames[language]}
        onAction={() => setIsEditing(true)}
      />

      {isEditing && (
        <SettingsModal
          title={t.changeLanguage}
          onClose={() => setIsEditing(false)}
        >
          {['ca', 'en', 'nl'].map(l => (
            <button
              key={l}
              onClick={() => {
                setLanguage(l);
                setIsEditing(false);
              }}
              style={{
                width: '100%',
                padding: 12,
                fontSize: 15,
                fontWeight: 700,
                background: language === l ? THEME.primary : THEME.card,
                color: '#ffffff',
                border: `1px solid ${language === l ? THEME.primary : THEME.border}`,
                borderRadius: 8,
                cursor: 'pointer',
                marginBottom: 8
              }}
            >
              {languageNames[l]}
            </button>
          ))}

          <button onClick={() => setIsEditing(false)} style={{ width: '100%', padding: 10, fontSize: 14, fontWeight: 700, background: 'transparent', color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 8, cursor: 'pointer' }}>
            {t.cancel}
          </button>
        </SettingsModal>
      )}
    </>
  );
}

function NewCycleModal({ prs, onStart, t, weightUnit = WEIGHT_UNITS.KG }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
      padding: 16
    }}>
      <div style={{
        background: THEME.card,
        borderRadius: 12,
        padding: 24,
        maxWidth: 340,
        width: '90%'
      }}>
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 10 }}>
          🏆
        </div>

        <h3 style={{ margin: '0 0 8px', textAlign: 'center' }}>
          {t.cycleCompleted}
        </h3>

        <p style={{ color: THEME.muted, fontSize: 14, margin: '0 0 20px', textAlign: 'center' }}>
          {t.newCycleWeights}
        </p>
        <div style={{
          background: THEME.card,
          border: `1px solid ${THEME.border}`,
          color: THEME.text,
          borderRadius: 8,
          padding: 12,
          marginBottom: 20
        }}>
          {LIFT_ORDER.map(lift => (
            <div
              key={lift}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                fontSize: 14
              }}
            >
              <span style={{ color: THEME.text, fontWeight: 700 }}>
                {liftLabel(lift, t)} {t.e1RM}
              </span>
              <span style={{ fontWeight: 700 }}>{prs[lift] ? formatWeightFromKg(prs[lift], weightUnit) : '—'}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onStart}
          style={{
            width: '100%',
            padding: 14,
            fontSize: 16,
            background: THEME.card,
            color: '#ffffff',
            border: `1px solid ${THEME.primary}`,
            borderRadius: 4,
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          {t.startNewCycle} 🚀
        </button>
      </div>
    </div>
  );
}

function BackoffGroup({ entries, activeIndex, isReadOnly, onToggle, onEditAll, onRestoreAll, onMarkFailed, renderTimer, label, t, weightUnit = WEIGHT_UNITS.KG, lift, benchPressVariant = 'standard' }) {
  const [editing, setEditing] = useState(false);
  const firstSet = entries?.[0]?.set || {};
  const firstOpenEntry = entries.find(({ set }) => !set.done && !set.skipped) || entries[0];
  const failedEntry = entries.find(({ set }) => set.failed || set.skipped);
  const allSameWeight = entries.every(({ set }) => Number(set.weight) === Number(firstSet.weight));
  const allSameReps = entries.every(({ set }) => Number(set.reps) === Number(firstSet.reps));
  const displayPct = firstSet.pct ? Number((firstSet.pct * 100).toFixed(1)) : null;
  const [inputVal, setInputVal] = useState(String(firstSet.weight || ''));

  useEffect(() => {
    if (editing) {
      setInputVal(formatWeightValue(kgToDisplayWeight(workoutDisplayWeightKg(firstSet.weight || '', lift, benchPressVariant), weightUnit), weightUnit));
    }
  }, [editing, firstSet.weight, weightUnit, lift, benchPressVariant]);

  if (!entries?.length) return null;

  function confirmEdit() {
    const val = parseFloat(inputVal);

    if (!Number.isNaN(val) && val > 0) {
      onEditAll(workoutInputWeightKg(val, weightUnit, lift, benchPressVariant));
    }

    setEditing(false);
  }

  function handleEditClick(e) {
    e.stopPropagation();
    setInputVal(formatWeightValue(kgToDisplayWeight(workoutDisplayWeightKg(firstSet.weight || '', lift, benchPressVariant), weightUnit), weightUnit));
    setEditing(true);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') confirmEdit();
    if (e.key === 'Escape') setEditing(false);
  }

  const timerNode = entries
    .map(({ index }) => renderTimer?.(index))
    .find(Boolean);

  const groupLabel = label || t.backoff;
  const isAdjusted = entries.some(({ set }) =>
    Boolean(set.adjustedFromFailedSet || set.adjustedFromOriginal || set.failed) ||
    Number(set.weight) !== Number(set.originalWeight ?? set.weight)
  );
  const detailColor = isAdjusted ? '#f39c12' : THEME.muted;
  const isGroupComplete = entries.every(({ set }) => set.done || set.skipped);

  const detail = (
    <span style={{ color: detailColor }}>
      {entries.length} × {allSameReps ? firstSet.reps : '—'} × {allSameWeight ? formatWorkoutWeightFromKg(firstSet.weight, weightUnit, t, lift, benchPressVariant) : normalizeWeightUnit(weightUnit)}{displayPct ? ` (${displayPct}%)` : ''}
    </span>
  );

  const actions = isGroupComplete || isReadOnly ? null : editing ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="number"
        step={normalizeWeightUnit(weightUnit) === WEIGHT_UNITS.LB ? "5" : "2.5"}
        value={inputVal}
        autoFocus
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={confirmEdit}
        style={{
          width: 66,
          padding: '4px 6px',
          fontSize: 14,
          fontWeight: 800,
          borderRadius: 4,
          border: `1px solid ${THEME.primary}`,
          background: THEME.bg,
          color: THEME.text,
          textAlign: 'right',
        }}
      />
      <span style={{ fontSize: WORKOUT_CIRCLE_FONT_SIZE, color: THEME.text }}>
        {normalizeWeightUnit(weightUnit)}
      </span>
    </div>
  ) : (
    <>
      <SetActionButton
        title={t.edit}
        disabled={isReadOnly}
        borderColor={THEME.primary}
        onClick={handleEditClick}
      >
        ✎
      </SetActionButton>

      <SetActionButton
        title={t.restoreOriginalWeight}
        disabled={isReadOnly}
        borderColor="#f39c12"
        onClick={e => {
          e.stopPropagation();
          onRestoreAll();
        }}
      >
        ↺
      </SetActionButton>

      <SetActionButton
        title={t.markSetFailed}
        disabled={isReadOnly}
        borderColor="#e74c3c"
        onClick={e => {
          e.stopPropagation();
          if (firstOpenEntry) onMarkFailed(firstOpenEntry.index);
        }}
      >
        ✕
      </SetActionButton>
    </>
  );

  const feedback = failedEntry ? (
    <div style={{
      marginTop: 2,
      padding: '7px 9px',
      border: '1px solid #e74c3c',
      borderRadius: 8,
      color: '#ffffff',
      background: 'rgba(231, 76, 60, 0.16)',
      fontSize: 12,
      fontWeight: 800,
      lineHeight: 1.3,
      textAlign: 'center',
    }}>
      {failedEntry.set.skipped
        ? t.topSetSkipped
        : t.failedSetAdjusted.replace('{weight}', formatWeightFromKg(failedEntry.set.adjustedWeight, weightUnit))}
    </div>
  ) : null;

  return (
    <WorkoutActionRow
      left={(
        <div style={{
          display: 'flex',
          gap: 5,
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'nowrap',
        }}>
          {entries.map(({ set, index }) => (
            <WorkoutCircle
              key={index}
              done={set.done}
              active={index === activeIndex}
              skipped={set.skipped}
              disabled={isReadOnly}
              onClick={() => onToggle(index)}
              label={`${groupLabel} ${index + 1}`}
            />
          ))}
        </div>
      )}
      title={groupLabel}
      detail={detail}
      actions={actions}
      feedback={feedback}
      timerNode={timerNode}
      isReadOnly={isReadOnly}
      borderMode="group"
    />
  );
}

function AccessoryGroup({ acc, accIndex, isActiveGroup, isReadOnly, hasMoreAccessoryWork, onToggle, onEditAll, onRestoreAll, onMarkFailed, renderTimer, t, weightUnit = WEIGHT_UNITS.KG }) {
  const [editing, setEditing] = useState(false);
  const firstWeight = acc.weights?.[0] || 0;
  const allSameWeight = (acc.weights || []).every(weight => Number(weight) === Number(firstWeight));
  const firstOpenIndex = (acc.done || []).findIndex(done => !done);
  const firstSkippedIndex = (acc.skipped || []).findIndex(Boolean);
  const firstFailedIndex = (acc.failed || []).findIndex(Boolean);
  const feedbackIndex = firstSkippedIndex !== -1 ? firstSkippedIndex : firstFailedIndex;
  const [inputVal, setInputVal] = useState(String(firstWeight || ''));

  useEffect(() => {
    if (editing) {
      setInputVal(formatWeightValue(kgToDisplayWeight(firstWeight || '', weightUnit), weightUnit));
    }
  }, [editing, firstWeight, weightUnit]);

  function confirmEdit() {
    const val = parseFloat(inputVal);

    if (!Number.isNaN(val) && val > 0) {
      onEditAll(displayWeightToKg(val, weightUnit));
    }

    setEditing(false);
  }

  function handleEditClick(e) {
    e.stopPropagation();
    setInputVal(formatWeightValue(kgToDisplayWeight(firstWeight || '', weightUnit), weightUnit));
    setEditing(true);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') confirmEdit();
    if (e.key === 'Escape') setEditing(false);
  }

  const timerNode = (acc.done || [])
    .map((_, index) => renderTimer?.(index))
    .find(Boolean);

  const accessoryLabel = acc.nameKey ? t[acc.nameKey] : acc.name;
  const isAccessoryComplete = (acc.done || []).length > 0 && (acc.done || []).every(Boolean);

  const detail = (
    <>
      {(acc.done || []).length} × {acc.reps}{acc.perSide ? ` ${t.perSide}` : ''} × {allSameWeight ? formatWeightFromKg(firstWeight, weightUnit) : normalizeWeightUnit(weightUnit)}
    </>
  );

  const actions = isAccessoryComplete || isReadOnly ? null : editing ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="number"
        step={normalizeWeightUnit(weightUnit) === WEIGHT_UNITS.LB ? "5" : "2.5"}
        value={inputVal}
        autoFocus
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={confirmEdit}
        style={{
          width: 66,
          padding: '4px 6px',
          fontSize: 14,
          fontWeight: 800,
          borderRadius: 4,
          border: `1px solid ${THEME.primary}`,
          background: THEME.bg,
          color: THEME.text,
          textAlign: 'right',
        }}
      />
      <span style={{ fontSize: WORKOUT_CIRCLE_FONT_SIZE, color: THEME.text }}>
        {normalizeWeightUnit(weightUnit)}
      </span>
    </div>
  ) : (
    <>
      <SetActionButton
        title={t.edit}
        disabled={isReadOnly}
        borderColor={THEME.primary}
        onClick={handleEditClick}
      >
        ✎
      </SetActionButton>

      <SetActionButton
        title={t.restoreOriginalWeight}
        disabled={isReadOnly}
        borderColor="#f39c12"
        onClick={e => {
          e.stopPropagation();
          onRestoreAll();
        }}
      >
        ↺
      </SetActionButton>

      <SetActionButton
        title={t.markSetFailed}
        disabled={isReadOnly || firstOpenIndex === -1}
        borderColor="#e74c3c"
        onClick={e => {
          e.stopPropagation();
          if (firstOpenIndex !== -1) onMarkFailed(firstOpenIndex);
        }}
      >
        ✕
      </SetActionButton>
    </>
  );

  const feedback = feedbackIndex !== -1 ? (
    <div style={{
      marginTop: 2,
      padding: '7px 9px',
      border: '1px solid #e74c3c',
      borderRadius: 8,
      color: '#ffffff',
      background: 'rgba(231, 76, 60, 0.16)',
      fontSize: 12,
      fontWeight: 800,
      lineHeight: 1.3,
      textAlign: 'center',
    }}>
      {acc.skipped?.[feedbackIndex]
        ? t.topSetSkipped
        : t.failedSetAdjusted.replace(
          '{weight}',
          formatWeightFromKg(acc.adjustedWeights?.[feedbackIndex] ?? acc.weights?.[feedbackIndex] ?? firstWeight, weightUnit)
        )}
    </div>
  ) : null;

  return (
    <WorkoutActionRow
      left={(
        <div style={{
          display: 'flex',
          gap: 5,
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'nowrap',
        }}>
          {(acc.done || []).map((done, index) => (
            <WorkoutCircle
              key={index}
              done={done}
              active={isActiveGroup && index === firstOpenIndex}
              skipped={!!acc.skipped?.[index]}
              disabled={isReadOnly}
              onClick={() => onToggle(index)}
              label={`${accessoryLabel} ${index + 1}`}
            />
          ))}
        </div>
      )}
      title={accessoryLabel}
      detail={detail}
      actions={actions}
      feedback={feedback}
      timerNode={timerNode}
      isReadOnly={isReadOnly}
      borderMode="group"
    />
  );
}

function CurrentWorkout({ workout, currentCycle, totalWorkouts, onTogglePrepItem, onToggleWarmup, onToggleSet, onMarkSetFailed, onRestoreSetWeight, onToggleAccessorySet, onMarkAccessorySetFailed, onRestoreAccessoryWeight, onToggleCooldownItem, onToggleMeetPrepItem, onToggleMeetWarmup, onToggleMeetSet, onMarkMeetSetFailed, onRestoreMeetSetWeight, onMeetWeightChange, onMeetSetEffortChange, onWeightChange, onSetEffortChange, onAccessoryWeightChange, onComplete, onViewAll, onActivateWorkout, showNewCycle, newCyclePRs, onStartNewCycle, isReadOnly, t, weightUnit = WEIGHT_UNITS.KG, benchPressVariant = 'standard', timer, setTimer, startTimer }) {
  const effectiveBenchPressVariant = workout?.type === 'meet' ? 'standard' : benchPressVariant;
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);

  function isTimerFor(placement) {
    if (!timer || !timer.placement) return false;
    if (timer.placement.workoutNumber !== workout.number) return false;

    return Object.keys(placement).every(key => timer.placement[key] === placement[key]);
  }

  function renderInlineTimer(placement) {
    if (!isTimerFor(placement)) return null;

    if (timer.endTime && Date.now() >= timer.endTime) {
      return null;
    }

    return (
      <RestTimer
        key={timer.id}
        seconds={timer.seconds}
        endTime={timer.endTime}
        onDismiss={() => setTimer(null)}
        t={t}
      />
    );
  }


  function renderActivateWorkoutCard() {
    if (!isReadOnly) return null;

    const workoutNumber = workout?.number || '—';
    const confirmText = t.activateWorkoutConfirmText
      .replaceAll('{workout}', workoutNumber);

    return (
      <div style={{
        marginBottom: 10,
        padding: '8px 10px',
        border: `1px solid ${THEME.border}`,
        borderRadius: 8,
        background: THEME.card,
        color: THEME.muted,
        fontSize: 12,
        fontWeight: 800,
        textAlign: 'center'
      }}>
        <div>{t.preview}</div>

        {!showActivateConfirm && onActivateWorkout && (
          <button
            type="button"
            onClick={() => setShowActivateConfirm(true)}
            style={{
              marginTop: 8,
              padding: '7px 11px',
              borderRadius: 6,
              border: `1px solid ${THEME.primary}`,
              background: THEME.primary,
              color: THEME.bg,
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            {t.activateWorkout}
          </button>
        )}

        {showActivateConfirm && (
          <div style={{
            marginTop: 10,
            padding: 10,
            border: `1px solid ${THEME.primary}`,
            borderRadius: 8,
            background: THEME.bg,
            color: THEME.text,
            textAlign: 'left',
            lineHeight: 1.35
          }}>
            <div style={{
              color: THEME.text,
              fontSize: 14,
              fontWeight: 900,
              marginBottom: 6,
              textAlign: 'center'
            }}>
              {t.activateWorkoutConfirmTitle}
            </div>

            <div style={{
              color: THEME.muted,
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 10,
              textAlign: 'center'
            }}>
              {confirmText}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8
            }}>
              <button
                type="button"
                onClick={() => setShowActivateConfirm(false)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: `1px solid ${THEME.border}`,
                  background: 'transparent',
                  color: THEME.text,
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {t.cancel}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowActivateConfirm(false);
                  onActivateWorkout();
                }}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: `1px solid ${THEME.primary}`,
                  background: THEME.primary,
                  color: THEME.bg,
                  fontSize: 14,
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                {t.activateWorkout}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (workout.type === 'rest') {
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
     <h1 style={{ 
        textAlign: 'center', 
        marginTop: 80, 
        marginBottom: 24 
      }}>
        {t.appName}
      </h1>        
      <div style={{ background: THEME.card, padding: 40, borderRadius: 8 }}>
          <div style={{ fontSize: 48 }}>🎉</div>
          <h2>{t.deload}</h2>
          <p style={{ color: THEME.muted }}>{t.restReadyNextCycle}</p>
        </div>
        <button onClick={onStartNewCycle} style={{ marginTop: 16, width: '100%', padding: 10, fontSize: 16, background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.primary}`, borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
          {t.startNewCycle}
        </button>
      </div>
    );
  }

    if (workout.type === 'meet' || (workout.type === 'training' && (workout.lifts || []).length > 0)) {

    const isMeetDay = workout.type === 'meet';
    const allMeetDone = (workout.lifts || []).every(liftBlock =>
      (liftBlock.sets || []).every(s => s.done)
    );
    const allMainLiftSetsDone = allMeetDone;

    const meetDayProjectedTotal = (workout.lifts || []).reduce((total, liftBlock) => {
      const thirdAttempt = liftBlock.sets?.[2]?.weight;
      return total + (Number(thirdAttempt) || 0);
    }, 0);

    const getVisiblePrepItems = (liftBlock, liftIndex) =>
      liftBlock.prepItems || [];

    const firstIncompleteLiftIndex = (workout.lifts || []).findIndex((liftBlock, liftIndex) =>
      getVisiblePrepItems(liftBlock, liftIndex).some(item => !item.done) ||
      (liftBlock.warmups || []).some(w => !w.done) ||
      (liftBlock.sets || []).some(s => !s.done)
    );

    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
        <AppHeader
          t={t}
          title={`${t.workout} ${workout.number} — ${getWorkoutTitle(workout, t, effectiveBenchPressVariant)}`}
          subtitle={`${t.cycle} ${currentCycle} · ${t.workoutProgress} ${workout.number} / ${totalWorkouts}${isMeetDay ? ` · ${t.meetDay}` : ''}`}
          titleStyle={{
            fontSize: 'clamp(20px, 6vw, 24px)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        />

        {renderActivateWorkoutCard()}

{isMeetDay && (
<div style={{
  marginBottom: 10,
  padding: 10,
  border: `1px solid ${THEME.primary}`,
  borderRadius: 10,
  background: THEME.card,
  textAlign: 'center'
}}>
  <div style={{ color: THEME.muted, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
    {t.projectedTotal}
  </div>
  <div style={{ color: THEME.text, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
    {meetDayProjectedTotal ? formatWeightFromKg(meetDayProjectedTotal, weightUnit) : '—'}
  </div>
</div>
)}

        {(workout.lifts || []).map((liftBlock, li) => {
          const visiblePrepItems = getVisiblePrepItems(liftBlock, li);
          const firstIncompletePrepItem = visiblePrepItems.findIndex(item => !item.done);
          const firstIncompleteWarmup = (liftBlock.warmups || []).findIndex(w => !w.done);
          const firstIncompleteSet = (liftBlock.sets || []).findIndex(s => !s.done);
          const allPrepDone = visiblePrepItems.every(item => item.done);
          const allWarmupsDone = (liftBlock.warmups || []).every(w => w.done);

          return (
            <div
              key={liftBlock.lift}
              style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}
            >
              <div style={{
                padding: '6px 10px',
                fontSize: WORKOUT_SECTION_TITLE_FONT_SIZE,
                fontWeight: 900,
                color: THEME.text,
                textAlign: 'center',
                borderBottom: `1px solid ${THEME.border}`,
              }}>
                {workoutLiftLabel(liftBlock.lift, t, effectiveBenchPressVariant)}
              </div>

              {visiblePrepItems.length > 0 && (
                <div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    justifyContent: 'center',
                    columnGap: 12,
                    rowGap: 0,
                    padding: '0 10px'
                  }}>
                    {visiblePrepItems.map((item, pi) => (
                      <PrepRow
                        key={`prep-${pi}`}
                        item={item}
                        isActive={
                          !isReadOnly &&
                          li === firstIncompleteLiftIndex &&
                          pi === firstIncompletePrepItem
                        }
                        isReadOnly={isReadOnly}
                        onToggle={() => handleToggle(() => onToggleMeetPrepItem(li, pi))}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              )}

              <WarmupGrid
                warmups={liftBlock.warmups || []}
                isReadOnly={isReadOnly}
                activeIndex={
                  !isReadOnly &&
                  li === firstIncompleteLiftIndex &&
                  allPrepDone
                    ? firstIncompleteWarmup
                    : -1
                }
                onToggle={wi => handleToggle(() => onToggleMeetWarmup(li, wi))}
                renderTimer={wi => renderInlineTimer({ type: 'meetWarmup', liftIndex: li, index: wi })}
                followsPrep={visiblePrepItems.length > 0}
                t={t}
                weightUnit={weightUnit}
                lift={workout.lift}
                benchPressVariant={effectiveBenchPressVariant}
              />

              {(liftBlock.sets || []).map((set, si) => {
                const backoffSetEntries = (liftBlock.sets || [])
                  .map((backoffSet, backoffIndex) => ({ set: backoffSet, index: backoffIndex }))
                  .filter(({ set: backoffSet }) => ['backoff', 'workSets'].includes(backoffSet.labelKey));
                const backoffGroupLabel = getBackoffGroupLabelForSets(liftBlock.sets || [], t);

                const secondarySetEntries = (liftBlock.sets || [])
                  .map((secondarySet, secondaryIndex) => ({ set: secondarySet, index: secondaryIndex }));

                const isSecondaryTrainingLift = !isMeetDay && li > 0 && secondarySetEntries.length > 1;

                if (isSecondaryTrainingLift) {
                  if (si !== 0) return null;

                  const firstIncompleteSecondarySet = secondarySetEntries.find(({ set: secondarySet }) =>
                    !secondarySet.done && !secondarySet.skipped
                  )?.index ?? -1;

                  return (
                    <React.Fragment key={`secondary-set-group-${li}`}>
                      <BackoffGroup
                        entries={secondarySetEntries}
                        activeIndex={
                          !isReadOnly &&
                          li === firstIncompleteLiftIndex &&
                          allPrepDone &&
                          allWarmupsDone
                            ? firstIncompleteSecondarySet
                            : -1
                        }
                        isReadOnly={isReadOnly}
                        onToggle={index => handleToggle(() => onToggleMeetSet(li, index))}
                        onEditAll={val => secondarySetEntries.forEach(({ index }) => onMeetWeightChange(li, index, val))}
                        onRestoreAll={() => secondarySetEntries.forEach(({ index }) => onRestoreMeetSetWeight(li, index))}
                        onMarkFailed={index => handleToggle(() => onMarkMeetSetFailed(li, index))}
                        renderTimer={index => renderInlineTimer({ type: 'meetSet', liftIndex: li, index })}
                        label={backoffGroupLabel}
                        t={t}
                        weightUnit={weightUnit}
                        lift={liftBlock.lift}
                        benchPressVariant={effectiveBenchPressVariant}
                      />
                    </React.Fragment>
                  );
                }

                if (['backoff', 'workSets'].includes(set.labelKey)) {
                  if (backoffSetEntries[0]?.index !== si) return null;

                  const firstIncompleteBackoff = backoffSetEntries.find(({ set: backoffSet }) => !backoffSet.done && !backoffSet.skipped)?.index ?? -1;

                  return (
                    <React.Fragment key={`backoff-group-${li}-${si}`}>
                      <BackoffGroup
                        entries={backoffSetEntries}
                        activeIndex={
                          !isReadOnly &&
                          li === firstIncompleteLiftIndex &&
                          allPrepDone &&
                          allWarmupsDone
                            ? firstIncompleteBackoff
                            : -1
                        }
                        isReadOnly={isReadOnly}
                        onToggle={index => handleToggle(() => onToggleMeetSet(li, index))}
                        onEditAll={val => backoffSetEntries.forEach(({ index }) => onMeetWeightChange(li, index, val))}
                        onRestoreAll={() => backoffSetEntries.forEach(({ index }) => onRestoreMeetSetWeight(li, index))}
                        onMarkFailed={index => handleToggle(() => onMarkMeetSetFailed(li, index))}
                        renderTimer={index => renderInlineTimer({ type: 'meetSet', liftIndex: li, index })}
                        label={backoffGroupLabel}
                        t={t}
                        weightUnit={weightUnit}
                        lift={liftBlock.lift}
                        benchPressVariant={effectiveBenchPressVariant}
                      />
                    </React.Fragment>
                  );
                }

                const hasLaterMeetSetAction = (liftBlock.sets || []).some((laterSet, laterIndex) =>
                  laterIndex > si && (laterSet.done || laterSet.failed || laterSet.skipped)
                );

                const hasLaterMeetLiftAction = (workout.lifts || []).some((laterLiftBlock, laterLiftIndex) =>
                  laterLiftIndex > li &&
                  (laterLiftBlock.sets || []).some(laterSet =>
                    laterSet.done || laterSet.failed || laterSet.skipped
                  )
                );

                const showMeetSetNotice =
                  (set.failed || set.skipped) &&
                  !hasLaterMeetSetAction &&
                  !hasLaterMeetLiftAction;

                return (
                <React.Fragment key={`attempt-${si}`}>
                  {showMeetSetNotice && (
                    <div style={{
                      margin: 0,
                      padding: '8px 10px',
                      borderTop: '1px solid #e74c3c',
                      borderBottom: '1px solid #e74c3c',
                      color: '#ffffff',
                      background: 'rgba(231, 76, 60, 0.16)',
                      fontSize: 12,
                      fontWeight: 800,
                      lineHeight: 1.3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <span style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#e74c3c',
                        color: THEME.bg,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontWeight: 900
                      }}>
                        !
                      </span>
                      <span>
                        {set.skipped
                          ? t.topSetSkipped
                          : t.failedSetAdjusted.replace('{weight}', formatWeightFromKg(set.adjustedWeight, weightUnit))}
                      </span>
                    </div>
                  )}

                  <SetRow
                    set={set}
                    index={si}
                    label={set.labelKey ? t[set.labelKey] : `${t.set} ${si + 1}`}
                    isWarmup={false}
                    isActive={
                      !isReadOnly &&
                      li === firstIncompleteLiftIndex &&
                      allPrepDone &&
                      allWarmupsDone &&
                      si === firstIncompleteSet
                    }
                    isReadOnly={isReadOnly}
                    onToggle={() => handleToggle(() => onToggleMeetSet(li, si))}
                    onMarkFailed={() => handleToggle(() => onMarkMeetSetFailed(li, si))}
                    onRestoreWeight={() => handleToggle(() => onRestoreMeetSetWeight(li, si))}
                    onWeightChange={val => onMeetWeightChange(li, si, val)}
                    t={t}
                    weightUnit={weightUnit}
                    lift={liftBlock.lift}
                    benchPressVariant={effectiveBenchPressVariant}
                  />
                  {renderInlineTimer({ type: 'meetSet', liftIndex: li, index: si })}
                  {set.done && !set.failed && !set.skipped && !set.effort && (
                    <EffortPicker
                      value={set.effort}
                      onChange={effort => handleToggle(() => onMeetSetEffortChange(li, si, effort))}
                      t={t}
                    />
                  )}
                </React.Fragment>
                );
              })}
            </div>
          );
        })}

        {!isMeetDay && (workout.accessories || []).length > 0 && (
          <div style={{
            background: THEME.card,
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            overflow: 'hidden',
            marginBottom: 10
          }}>
            <div style={{
              padding: '6px 10px',
              fontSize: WORKOUT_SECTION_TITLE_FONT_SIZE,
              fontWeight: 900,
              color: THEME.text,
              textAlign: 'center',
              borderBottom: `1px solid ${THEME.border}`
            }}>
              {t.accessories}
            </div>

            {(workout.accessories || []).map((acc, ai) => {
              const firstIncompleteAccessoryGroup = (workout.accessories || []).findIndex(a =>
                (a.done || []).some(done => !done)
              );
              const hasMoreAccessoryWork = (acc.done || []).some((done, si) => si > -1 && !done) ||
                (workout.accessories || []).some((nextAccessory, nextIndex) =>
                  nextIndex > ai && (nextAccessory.done || []).some(done => !done)
                );

              return (
                <AccessoryGroup
                  key={ai}
                  acc={acc}
                  accIndex={ai}
                  isActiveGroup={!isReadOnly && allMainLiftSetsDone && ai === firstIncompleteAccessoryGroup}
                  isReadOnly={isReadOnly}
                  hasMoreAccessoryWork={hasMoreAccessoryWork}
                  onToggle={si => handleToggle(() => onToggleAccessorySet(ai, si))}
                  onEditAll={val => (acc.done || []).forEach((_, si) => onAccessoryWeightChange(ai, si, val))}
                  onRestoreAll={() => (acc.done || []).forEach((_, si) => onRestoreAccessoryWeight(ai, si))}
                  onMarkFailed={si => handleToggle(() => onMarkAccessorySetFailed(ai, si))}
                  renderTimer={si => renderInlineTimer({ type: 'accessory', accIndex: ai, index: si })}
                  t={t}
                  weightUnit={weightUnit}
                  lift={workout.lift}
                  benchPressVariant={effectiveBenchPressVariant}
                />
              );
            })}
          </div>
        )}

        {!isMeetDay && (
          <CooldownBlock
            items={workout.cooldownItems || generateCooldownItems()}
            onToggleItem={index => handleToggle(() => onToggleCooldownItem(index))}
            t={t}
            isReadOnly={isReadOnly}
          />
        )}

        <button
          onClick={() => {
            if (isReadOnly) return;
            onComplete();
          }}
          disabled={!allMeetDone || isReadOnly}
          style={{
            width: '100%',
            padding: 10,
            fontSize: 16,
            fontWeight: 600,
            background: THEME.card,
            color: (allMeetDone && !isReadOnly) ? 'white' : '#666',
            border: `1px solid ${THEME.primary}`,
            borderRadius: 8,
            cursor: (allMeetDone && !isReadOnly) ? 'pointer' : 'not-allowed',
            marginBottom: 10,
            opacity: 1
          }}
        >
          {isReadOnly
            ? t.previewNotCompletable
            : allMeetDone
            ? `${t.completeWorkout} ✓`
            : t.completeWorkout}
        </button>
      </div>
    );
  }

  const allDone = (workout.sets || []).every(s => s.done);
  const allPrepDone = (workout.prepItems || []).every(item => item.done);

  function handleToggle(fn) {
    if (isReadOnly) return;
    fn();
  }

  return (
    <div style={{
      maxWidth: 500,
      margin: '0 auto',
      padding: '8px 12px 12px',
      paddingBottom: 16,
      fontFamily: 'sans-serif'
    }}>
      <h2 style={{ margin: '12px 0 8px', textAlign: 'center', fontSize: 24 }}>
        {t.workout} {workout.number} — {workoutLiftLabel(workout.lift, t, effectiveBenchPressVariant)}
      </h2>

      <div style={{ textAlign: 'center', color: THEME.muted, fontSize: 13, marginBottom: 12 }}>
        {t.cycle} {currentCycle} · {t.workoutProgress} {workout.number} / {totalWorkouts}
      </div>

      {renderActivateWorkoutCard()}

      {(workout.prepItems || []).length > 0 && (
        <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            padding: '6px 10px',
            fontSize: WORKOUT_SECTION_TITLE_FONT_SIZE,
            fontWeight: 900,
            color: THEME.text,
            textAlign: 'center'
          }}>
            {t.prepTitle}
          </div>

          <div style={{
            display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    justifyContent: 'center',
                    columnGap: 12,
                    rowGap: 0,
                    padding: '0 10px'
          }}>
            {workout.prepItems.map((item, i) => (
              <PrepRow
                key={i}
                item={item}
                isActive={!isReadOnly && i === workout.prepItems.findIndex(prep => !prep.done)}
                isReadOnly={isReadOnly}
                onToggle={() => handleToggle(() => onTogglePrepItem(i))}
                t={t}
              />
            ))}
          </div>
        </div>
      )}

      {(workout.warmups || []).length > 0 && (
        <div style={{
          background: THEME.card,
          border: `1px solid ${THEME.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 10
        }}>
          <WarmupGrid
            warmups={workout.warmups || []}
            isReadOnly={isReadOnly}
            activeIndex={!isReadOnly && allPrepDone ? workout.warmups.findIndex(wu => !wu.done) : -1}
            onToggle={i => handleToggle(() => onToggleWarmup(i))}
            renderTimer={i => renderInlineTimer({ type: 'warmup', index: i })}
            followsPrep={(workout.prepItems || []).length > 0}
            t={t}
            weightUnit={weightUnit}
            lift={workout.lift}
            benchPressVariant={effectiveBenchPressVariant}
          />
        </div>
      )}

      <div style={{
        background: THEME.card,
        border: `1px solid ${THEME.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 10
      }}>
        <div style={{
          padding: '6px 10px',
          fontSize: 16,
          fontWeight: 700,
          color: THEME.text,
          textAlign: 'center'
        }}>
          {workoutLiftLabel(workout.lift, t, effectiveBenchPressVariant)}
        </div>

        {workout.sets.map((set, i) => {
          const allWarmupsDone = allPrepDone && (workout.warmups || []).every(w => w.done);
          const backoffSetEntries = (workout.sets || [])
            .map((backoffSet, backoffIndex) => ({ set: backoffSet, index: backoffIndex }))
            .filter(({ set: backoffSet }) => ['backoff', 'workSets'].includes(backoffSet.labelKey));
          const backoffGroupLabel = getBackoffGroupLabelForSets(workout.sets || [], t);
          const firstIncomplete = workout.sets.findIndex(s => !s.done);
          const hasLaterSetAction = workout.sets.some((laterSet, laterIndex) =>
            laterIndex > i && (laterSet.done || laterSet.failed || laterSet.skipped)
          );
          const showSetNotice = set.failed || (set.skipped && !hasLaterSetAction);

          if (['backoff', 'workSets'].includes(set.labelKey)) {
            if (backoffSetEntries[0]?.index !== i) return null;

            const firstIncompleteBackoff = backoffSetEntries.find(({ set: backoffSet }) => !backoffSet.done && !backoffSet.skipped)?.index ?? -1;

            return (
              <React.Fragment key={`backoff-group-${i}`}>
                <BackoffGroup
                  entries={backoffSetEntries}
                  activeIndex={!isReadOnly && allWarmupsDone ? firstIncompleteBackoff : -1}
                  isReadOnly={isReadOnly}
                  onToggle={index => handleToggle(() => onToggleSet(index))}
                  onEditAll={val => backoffSetEntries.forEach(({ index }) => onWeightChange('set', index, val))}
                  onRestoreAll={() => backoffSetEntries.forEach(({ index }) => onRestoreSetWeight(index))}
                  onMarkFailed={index => handleToggle(() => onMarkSetFailed(index))}
                  renderTimer={index => renderInlineTimer({ type: 'main', index })}
                  label={backoffGroupLabel}
                  t={t}
                  weightUnit={weightUnit}
                  lift={workout.lift}
                  benchPressVariant={effectiveBenchPressVariant}
                />
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={i}>
              {showSetNotice && (
                <div style={{
                  margin: 0,
                  padding: '10px 14px',
                  borderTop: '1px solid #e74c3c',
                  borderBottom: '1px solid #e74c3c',
                  color: '#ffffff',
                  background: 'rgba(231, 76, 60, 0.16)',
                  fontSize: 13,
                  fontWeight: 800,
                  lineHeight: 1.35,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}>
                  <span style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#e74c3c',
                    color: THEME.bg,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontWeight: 900
                  }}>
                    !
                  </span>
                  <span>
                    {set.skipped
                      ? t.topSetSkipped
                      : t.failedSetAdjusted.replace('{weight}', formatWeightFromKg(set.adjustedWeight, weightUnit))}
                  </span>
                </div>
              )}
              {set.failed && renderInlineTimer({ type: 'main', index: i })}
              <SetRow
                set={set}
                index={i}
                label={set.labelKey ? t[set.labelKey] : set.label || `${t.set} ${i + 1}`}
                isWarmup={false}
                isActive={!isReadOnly && allWarmupsDone && i === firstIncomplete}
                isReadOnly={isReadOnly}
                onToggle={() => handleToggle(() => onToggleSet(i))}
                onMarkFailed={() => handleToggle(() => onMarkSetFailed(i))}
                onRestoreWeight={() => handleToggle(() => onRestoreSetWeight(i))}
                onWeightChange={val => onWeightChange('set', i, val)}
                t={t}
                weightUnit={weightUnit}
                lift={workout.lift}
                benchPressVariant={effectiveBenchPressVariant}
              />
              {!set.failed && renderInlineTimer({ type: 'main', index: i })}
              {set.done && !set.failed && !set.skipped && !set.effort && (
                <EffortPicker
                  value={set.effort}
                  onChange={effort => handleToggle(() => onSetEffortChange(i, effort))}
                  t={t}
                  weightUnit={weightUnit}
                  lift={workout.lift}
                  benchPressVariant={effectiveBenchPressVariant}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {(workout.accessories || []).length > 0 && (
        <div style={{
          background: THEME.card,
          border: `1px solid ${THEME.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 10
        }}>
          <div style={{
            padding: '6px 10px',
            fontSize: WORKOUT_SECTION_TITLE_FONT_SIZE,
            fontWeight: 900,
            color: THEME.text,
            textAlign: 'center',
            borderBottom: `1px solid ${THEME.border}`
          }}>
            {t.accessories}
          </div>

          {workout.accessories.map((acc, ai) => {
            const allMainSetsDone = (workout.sets || []).every(s => s.done);
            const firstIncompleteAccessoryGroup = (workout.accessories || []).findIndex(a =>
              (a.done || []).some(done => !done)
            );
            const hasMoreAccessoryWork = (acc.done || []).some((done, si) => si > -1 && !done) ||
              (workout.accessories || []).some((nextAccessory, nextIndex) =>
                nextIndex > ai && (nextAccessory.done || []).some(done => !done)
              );

            return (
              <AccessoryGroup
                key={ai}
                acc={acc}
                accIndex={ai}
                isActiveGroup={!isReadOnly && allMainSetsDone && ai === firstIncompleteAccessoryGroup}
                isReadOnly={isReadOnly}
                hasMoreAccessoryWork={hasMoreAccessoryWork}
                onToggle={si => handleToggle(() => onToggleAccessorySet(ai, si))}
                onEditAll={val => (acc.done || []).forEach((_, si) => onAccessoryWeightChange(ai, si, val))}
                onRestoreAll={() => (acc.done || []).forEach((_, si) => onRestoreAccessoryWeight(ai, si))}
                onMarkFailed={si => handleToggle(() => onMarkAccessorySetFailed(ai, si))}
                renderTimer={si => renderInlineTimer({ type: 'accessory', accIndex: ai, index: si })}
                t={t}
              />
            );
          })}
        </div>
      )}

      <CooldownBlock
        items={workout.cooldownItems || generateCooldownItems()}
        onToggleItem={index => handleToggle(() => onToggleCooldownItem(index))}
        t={t}
        isReadOnly={isReadOnly}
      />

      <button
        onClick={() => {
          if (isReadOnly) return;
          onComplete();
        }}
        disabled={!allDone || isReadOnly}
        style={{
          width: '100%',
          padding: 10,
          fontSize: 16,
          fontWeight: 600,
          background: THEME.card,
          color: (allDone && !isReadOnly) ? 'white' : '#666',
          border: `1px solid ${THEME.primary}`,
          borderRadius: 8,
          cursor: (allDone && !isReadOnly) ? 'pointer' : 'not-allowed',
          marginBottom: 10,
          opacity: 1
        }}
      >
        {isReadOnly
          ? t.previewNotCompletable
          : allDone
          ? t.completeWorkout
          : t.completeWorkout}
      </button>

      {showNewCycle && <NewCycleModal prs={newCyclePRs} onStart={onStartNewCycle} t={t}         weightUnit={weightUnit}
/>}
    </div>
  );
}

function StatsScreen({ history, bodyWeights, currentCycle, currentIndex, totalWorkouts, meetPlannerAttempts, setMeetPlannerAttempts, onBack, t, weightUnit = WEIGHT_UNITS.KG, best1RMs = {}, bestE1RMs = {} }) {
const [activescreen, setActivescreen] = useState('lifts');
const [showResetMeetPlannerConfirm, setShowResetMeetPlannerConfirm] = useState(false);
const customMeetAttempts = meetPlannerAttempts || {};
const hasCustomMeetAttempts = Object.values(customMeetAttempts).some(liftAttempts =>
  liftAttempts &&
  Object.values(liftAttempts).some(value =>
    value !== undefined && value !== null && value !== ''
  )
);
  const liftData = {};
  const totalData = [];
  const bodyData = [];
  const strengthData = [];
  const COLORS = {
  Squat: THEME.red,
  Bench: THEME.primary,
  Deadlift: THEME.yellow
};

const statsWeightUnit = normalizeWeightUnit(weightUnit);

function chartWeightFromKg(weightKg, options = {}) {
  const displayWeight = kgToDisplayWeight(weightKg, statsWeightUnit);
  if (displayWeight === '') return null;

  const formatted = formatWeightValue(displayWeight, statsWeightUnit, options);
  const value = Number(formatted);
  return Number.isFinite(value) ? value : null;
}

function weightMetricTitle(label) {
  return `${label} (${statsWeightUnit})`;
}
  
const bestStats = {
  Squat: { oneRM: 0, e1rm: 0 },
  Bench: { oneRM: 0, e1rm: 0 },
  Deadlift: { oneRM: 0, e1rm: 0 },
};

const sortedHistory = [...history]
  .filter(entry => entry && entry.lift)
  .sort((a, b) => getAbsoluteWorkoutIndex(a) - getAbsoluteWorkoutIndex(b));

sortedHistory.forEach(entry => {
  const label = getWorkoutLabel(entry);

  if (entry.lift && LIFT_ORDER.includes(entry.lift)) {
    if (!liftData[entry.lift]) liftData[entry.lift] = [];

    bestStats[entry.lift].oneRM = Math.max(
  bestStats[entry.lift].oneRM,
  entry.topWeight || 0
);

    bestStats[entry.lift].e1rm = Math.max(bestStats[entry.lift].e1rm, entry.e1rm || 0);

    if (getEntryWorkoutNumber(entry) > 0 || entry.seedMax || entry.manualMax) {
      liftData[entry.lift].push({
        label,
        absoluteWorkoutIndex: getAbsoluteWorkoutIndex(entry),
        oneRM: chartWeightFromKg(bestStats[entry.lift].oneRM),
        e1rm: chartWeightFromKg(bestStats[entry.lift].e1rm),
      });
    }
  }

});

LIFT_ORDER.forEach(lift => {
  const currentOneRM = Number(best1RMs?.[lift]) || bestStats[lift].oneRM || 0;
  const currentE1RM = Number(bestE1RMs?.[lift]) || bestStats[lift].e1rm || 0;

  bestStats[lift] = {
    oneRM: currentOneRM,
    e1rm: currentE1RM,
  };

  const latestPoint = liftData[lift]?.[liftData[lift].length - 1];
  if (latestPoint) {
    latestPoint.oneRM = chartWeightFromKg(currentOneRM);
    latestPoint.e1rm = chartWeightFromKg(currentE1RM);
  }
});

const bestPerLift = {};

sortedHistory.forEach(entry => {
  if (!entry.lift || !LIFT_ORDER.includes(entry.lift)) return;

  if (!bestPerLift[entry.lift]) {
    bestPerLift[entry.lift] = { oneRM: 0, e1rm: 0 };
  }

  bestPerLift[entry.lift].oneRM = Math.max(
    bestPerLift[entry.lift].oneRM,
    entry.topWeight || 0
  );

  bestPerLift[entry.lift].e1rm = Math.max(
    bestPerLift[entry.lift].e1rm,
    entry.e1rm || 0
  );

  if ((getEntryWorkoutNumber(entry) > 0 || entry.seedMax || entry.manualMax) && bestPerLift.Squat && bestPerLift.Bench && bestPerLift.Deadlift) {
    totalData.push({
      label: getWorkoutLabel(entry),
      workoutNumber: getEntryWorkoutNumber(entry),
      absoluteWorkoutIndex: getAbsoluteWorkoutIndex(entry),
      date: entry.date,
      oneRM:
        bestPerLift.Squat.oneRM +
        bestPerLift.Bench.oneRM +
        bestPerLift.Deadlift.oneRM,
      e1rm:
        bestPerLift.Squat.e1rm +
        bestPerLift.Bench.e1rm +
        bestPerLift.Deadlift.e1rm,
    });
  }
});

const currentTotalOneRM =
  (Number(best1RMs?.Squat) || 0) +
  (Number(best1RMs?.Bench) || 0) +
  (Number(best1RMs?.Deadlift) || 0);

const currentTotalE1RM =
  (Number(bestE1RMs?.Squat) || 0) +
  (Number(bestE1RMs?.Bench) || 0) +
  (Number(bestE1RMs?.Deadlift) || 0);

if (totalData.length && currentTotalOneRM && currentTotalE1RM) {
  const latestTotalPoint = totalData[totalData.length - 1];
  latestTotalPoint.oneRM = currentTotalOneRM;
  latestTotalPoint.e1rm = currentTotalE1RM;
}

const bodyMetricData = {
  bodyFat: [],
  bodyWater: [],
  leanMass: [],
  visceralFat: [],
  physiqueRating: [],
  boneMass: [],
  bmr: [],
};

bodyWeights.forEach(entry => {
  const workoutNumber = getEntryWorkoutNumber(entry);
  const base = {
    label: getWorkoutLabel(entry),
    workoutNumber,
    absoluteWorkoutIndex: getAbsoluteWorkoutIndex(entry),
  };

  if (entry.bodyWeight) {
    bodyData.push({
      ...base,
      gewicht: chartWeightFromKg(entry.bodyWeight, { body: true }),
    });
  }

  [
    'bodyFat',
    'bodyWater',
    'leanMass',
    'visceralFat',
    'physiqueRating',
    'boneMass',
    'bmr',
  ].forEach(key => {
    const value = Number(entry[key]);

    if (!Number.isFinite(value) || value <= 0) return;

    bodyMetricData[key].push({
      ...base,
      [key]: (key === 'leanMass' || key === 'boneMass')
        ? chartWeightFromKg(value, { body: true })
        : value,
    });
  });
});

const sortedBodyWeights = [...bodyWeights].sort(
  (a, b) => getAbsoluteWorkoutIndex(a) - getAbsoluteWorkoutIndex(b)
);

function getBodyWeightForWorkoutIndex(absoluteWorkoutIndex) {
  let latest = null;

  sortedBodyWeights.forEach(entry => {
    if (getAbsoluteWorkoutIndex(entry) <= absoluteWorkoutIndex && entry.bodyWeight) {
      latest = entry;
    }
  });

  if (!latest && absoluteWorkoutIndex <= 0) {
    latest = sortedBodyWeights.find(entry => entry.bodyWeight) || null;
  }

  return latest?.bodyWeight || null;
}

totalData.forEach(entry => {
  const bodyWeightForWorkout = getBodyWeightForWorkoutIndex(entry.absoluteWorkoutIndex);

  if (!bodyWeightForWorkout) return;

  strengthData.push({
    label: entry.label,
    absoluteWorkoutIndex: entry.absoluteWorkoutIndex,
    strength: Math.round((entry.oneRM / bodyWeightForWorkout) * 100) / 100,
    eStrength: Math.round((entry.e1rm / bodyWeightForWorkout) * 100) / 100,
  });
});

function chartMetricLabel(key) {
  if (key === 'oneRM') return weightMetricTitle('1RM');
  if (key === 'e1rm') return weightMetricTitle(t.e1RM);
  if (key === 'gewicht') return weightMetricTitle(t.bodyweight);
  if (key === 'strength') return t.strength;
  if (key === 'eStrength') return t.eStrength;
  if (key === 'bodyFat') return `${t.bodyFatPercent} (%)`;
  if (key === 'bodyWater') return `${t.bodyWaterPercent} (%)`;
  if (key === 'leanMass') return weightMetricTitle(t.leanMassKg);
  if (key === 'visceralFat') return `${t.visceralFatRating} rating`;
  if (key === 'physiqueRating') return t.physiqueRating;
  if (key === 'boneMass') return weightMetricTitle(t.boneMassKg);
  if (key === 'bmr') return `${t.bmrKcal} (kcal)`;

  return key;
}

function roundAttempt(weight) {
  return Math.round((Number(weight) || 0) / 2.5) * 2.5;
}

function updateMeetAttempt(lift, key, value) {
  setMeetPlannerAttempts(prev => ({
    ...(prev || {}),
    [lift]: {
      ...((prev || {})[lift] || {}),
      [key]: value,
    },
  }));
}

function meetAttemptValue(lift, key, fallback) {
  const custom = customMeetAttempts?.[lift]?.[key];

  if (custom === undefined || custom === null) return fallback;
  if (custom === '') return '';

  return custom;
}

function formatMeetAttemptInput(valueKg) {
  if (valueKg === undefined || valueKg === null || valueKg === '') return '';
  return formatWeightValue(kgToDisplayWeight(valueKg, statsWeightUnit), statsWeightUnit);
}

function roundMeetAttemptDisplay(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '';

  return statsWeightUnit === WEIGHT_UNITS.LB
    ? roundToStep(numericValue, 5)
    : roundAttempt(numericValue);
}

function commitMeetAttempt(lift, key, displayValue) {
  const roundedDisplay = roundMeetAttemptDisplay(displayValue);

  if (roundedDisplay === '') {
    updateMeetAttempt(lift, key, '');
    return;
  }

  const valueKg = statsWeightUnit === WEIGHT_UNITS.LB
    ? displayWeightToKg(roundedDisplay, statsWeightUnit)
    : roundedDisplay;

  updateMeetAttempt(lift, key, valueKg);
}

const suggestedMeetPlan = LIFT_ORDER.map(lift => {
  const e1rm = bestStats[lift]?.e1rm || 0;

  return {
    lift,
    e1rm,
    opener: roundAttempt(e1rm * 0.90),
    second: roundAttempt(e1rm * 0.975),
    third: roundAttempt(e1rm * 1.025),
  };
});

const meetPlan = suggestedMeetPlan.map(row => ({
  ...row,
  opener: meetAttemptValue(row.lift, 'opener', row.opener),
  second: meetAttemptValue(row.lift, 'second', row.second),
  third: meetAttemptValue(row.lift, 'third', row.third),
}));

const meetTotals = {
  opener: meetPlan.reduce((sum, row) => sum + (Number(row.opener) || 0), 0),
  second: meetPlan.reduce((sum, row) => sum + (Number(row.second) || 0), 0),
  third: meetPlan.reduce((sum, row) => sum + (Number(row.third) || 0), 0),
};

  function renderChart(data, dataKeys, colors) {
    if (!data || data.length === 0) {
      return (
        <p style={{ color: THEME.text, textAlign: 'center', padding: 14 }}>
          {t.noStatsData}
        </p>
      );
    }

    const visibleData = data.map((item, index) => ({
      ...item,
      chartIndex: index + 1,
    }));

    const allXTicks = [...new Set(
      visibleData
        .map(item => Number(item.chartIndex))
        .filter(value => Number.isFinite(value))
    )];

    const xTicks = allXTicks.length <= 4
      ? allXTicks
      : [
          allXTicks[0],
          allXTicks[Math.floor(allXTicks.length * 0.33)],
          allXTicks[Math.floor(allXTicks.length * 0.66)],
          allXTicks[allXTicks.length - 1],
        ].filter((value, index, arr) => value !== undefined && arr.indexOf(value) === index);

    const labelByX = visibleData.reduce((labels, item) => {
      labels[item.chartIndex] = item.label;
      return labels;
    }, {});

    return (
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={visibleData} margin={{ top: 4, right: 12, left: 4, bottom: 2 }}>
          <CartesianGrid stroke={THEME.border} vertical={false} />
          <XAxis
            dataKey="chartIndex"
            type="number"
            domain={[1, visibleData.length]}
            ticks={xTicks}
            tickFormatter={(value) => labelByX[value] || ''}
            allowDecimals={false}
            stroke={THEME.text}
            tick={{ fontSize: 8 }}
            interval={0}
            minTickGap={0}
          />
          <YAxis
            stroke={THEME.text}
            width={42}
            allowDecimals={false}
          />
          <Tooltip
  labelFormatter={(value, payload) => payload?.[0]?.payload?.label || labelByX[value] || value}
  formatter={(value, name) => [value, chartMetricLabel(name)]}
  contentStyle={{
    backgroundColor: THEME.card,
    border: `1px solid ${THEME.border}`,
    color: THEME.text
  }}
/>

<Legend wrapperStyle={{ color: THEME.text }} />
          
          {dataKeys.map((key, i) => (
          <Line
  key={key}
  type="linear"
  dataKey={key}
  stroke={colors[i] || THEME.primary}
  strokeWidth={3}
  connectNulls={true}
  isAnimationActive={false}
  dot={{ r: 3, fill: colors[i] || THEME.primary, stroke: colors[i] || THEME.primary }}
  activeDot={{ r: 5, fill: colors[i] || THEME.primary, stroke: '#ffffff' }}
  name={chartMetricLabel(key)}
/>
))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const statsTabs = [
    { key: 'lifts', label: t.lifts },
    { key: 'totaal', label: t.total },
    { key: 'lichaam', label: t.body },
    { key: 'compositie', label: t.composition },
    { key: 'scores', label: t.ratings },
    { key: 'meet', label: t.meetPlannerShort },
  ];

  function renderMetricChartCards(charts) {
    const visibleCharts = charts.filter(chart => chart.data.length > 0);

    if (visibleCharts.length === 0) {
      return (
        <p style={{ color: THEME.text, textAlign: 'center', padding: 14 }}>
          {t.noMetricData || t.noStatsData}
        </p>
      );
    }

    return (
      <div>
        {visibleCharts.map(chart => (
          <div
            key={chart.key}
            style={{
              background: THEME.card,
              border: `1px solid ${THEME.border}`,
              borderRadius: 8,
              padding: 12,
              marginBottom: 10
            }}
          >
            <h3 style={{ margin: '0 0 8px' }}>{chart.title}</h3>
            {renderChart(chart.data, [chart.key], [chart.color])}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <AppHeader
        t={t}
        title={t.stats}
        subtitle={`${t.cycle} ${currentCycle} · ${t.workoutProgress} ${Math.min(currentIndex + 1, totalWorkouts)} / ${totalWorkouts}`}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 8,
        marginBottom: 20
      }}>
        {statsTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActivescreen(tab.key)}
            style={{
              width: '100%',
              minHeight: 44,
              padding: '10px 6px',
              fontSize: 15,
              lineHeight: 1.2,
              background: THEME.card,
              color: activescreen === tab.key ? THEME.primary : THEME.text,
              border: `1px solid ${THEME.border}`,
              borderTop: activescreen === tab.key
                ? `2px solid ${THEME.primary}`
                : `2px solid ${THEME.border}`,
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: activescreen === tab.key ? 800 : 700,
              textAlign: 'center'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activescreen === 'lifts' && (
  <div>
    {LIFT_ORDER.map(lift => {
  const liftLabel =
    lift === 'Deadlift' ? t.deadlift :
    lift === 'Bench' ? t.bench :
    t.squat;

  return (
    <div
      key={lift}
      style={{
        background: THEME.card,
        border: `1px solid ${THEME.border}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 16
      }}
    >
      <h3 style={{ margin: '0 0 8px', color: COLORS[lift] }}>
        {liftLabel}
      </h3>
      {renderChart(
        liftData[lift] || [],
        ['oneRM', 'e1rm'],
        [THEME.muted, COLORS[lift]]
      )}
    </div>
  );
})}
  </div>
)}

      {activescreen === 'totaal' && (
        <div>
          <div style={{
            background: THEME.card,
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            padding: 16,
            marginBottom: 16
          }}>
            <h3 style={{ margin: '0 0 8px' }}>{t.totalSBD}</h3>
            {renderChart(totalData.map(entry => ({ ...entry, oneRM: chartWeightFromKg(entry.oneRM), e1rm: chartWeightFromKg(entry.e1rm) })), ['oneRM', 'e1rm'], [THEME.muted, THEME.primary])}
          </div>

          <div style={{
            background: THEME.card,
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            padding: 16
          }}>
            <h3 style={{ margin: '0 0 8px' }}>{t.strengthTotalBodyweight}</h3>
            {renderChart(strengthData, ['strength', 'eStrength'], [THEME.muted, THEME.primary])}
          </div>
        </div>
      )}

      {activescreen === 'lichaam' && renderMetricChartCards([
        {
          key: 'gewicht',
          title: t.bodyweight,
          data: bodyData,
          color: THEME.primary,
        },
        {
          key: 'bodyFat',
          title: t.bodyFatPercent,
          data: bodyMetricData.bodyFat,
          color: THEME.primary,
        },
        {
          key: 'bodyWater',
          title: t.bodyWaterPercent,
          data: bodyMetricData.bodyWater,
          color: THEME.primary,
        },
      ])}

      {activescreen === 'compositie' && renderMetricChartCards([
        {
          key: 'leanMass',
          title: t.leanMassKg,
          data: bodyMetricData.leanMass,
          color: THEME.primary,
        },
        {
          key: 'boneMass',
          title: t.boneMassKg,
          data: bodyMetricData.boneMass,
          color: THEME.primary,
        },
        {
          key: 'bmr',
          title: t.bmrKcal,
          data: bodyMetricData.bmr,
          color: THEME.primary,
        },
      ])}

      {activescreen === 'scores' && renderMetricChartCards([
        {
          key: 'visceralFat',
          title: t.visceralFatRating,
          data: bodyMetricData.visceralFat,
          color: THEME.primary,
        },
        {
          key: 'physiqueRating',
          title: t.physiqueRating,
          data: bodyMetricData.physiqueRating,
          color: THEME.primary,
        },
      ])}

{activescreen === 'meet' && (
  <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16 }}>
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14
    }}>
      <div>
        <h3 style={{ margin: '0 0 6px' }}>
          {t.meetPlanner}
        </h3>

        <p style={{
          margin: 0,
          color: THEME.muted,
          fontSize: 13,
          lineHeight: 1.4
        }}>
          {t.basedOnBestE1RM}
        </p>
      </div>

      <div style={{
        minWidth: 118,
        padding: '10px 12px',
        border: `1px solid ${THEME.primary}`,
        borderRadius: 10,
        background: THEME.bg,
        textAlign: 'center'
      }}>
        <div style={{ color: THEME.muted, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
          {t.projectedTotal}
        </div>

        <div style={{ color: THEME.text, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
          {meetTotals.third ? formatWeightFromKg(meetTotals.third, statsWeightUnit) : '—'}
        </div>
      </div>
    </div>

    <div style={{ display: 'grid', gap: 12 }}>
      {meetPlan.map(row => (
        <div
          key={row.lift}
          style={{
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            padding: 12,
            background: THEME.bg
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 8
          }}>
            <strong style={{ color: COLORS[row.lift], fontSize: 16 }}>
              {liftLabel(row.lift, t)}
            </strong>

            <span style={{
              color: THEME.muted,
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}>
              {t.e1RM} {row.e1rm ? formatWeightFromKg(row.e1rm, statsWeightUnit) : '—'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {[
              ['opener', t.opener, '90%', row.opener],
              ['second', t.secondAttempt, '97.5%', row.second],
              ['third', t.thirdAttempt, '102.5%', row.third],
            ].map(([key, label, pct, value]) => (
              <div
                key={key}
                style={{
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 8,
                  padding: 7,
                  textAlign: 'center',
                  background: THEME.card
                }}
              >
                <div style={{
                  color: THEME.text,
                  fontSize: 11,
                  fontWeight: 800,
                  lineHeight: 1.15,
                  minHeight: 25,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {label}
                </div>

                <div style={{
                  color: THEME.muted,
                  fontSize: 10,
                  fontWeight: 700,
                  margin: '2px 0 5px'
                }}>
                  {pct}
                </div>

                <input
                  key={`${statsWeightUnit}-${row.lift}-${key}-${value}`}
                  type="number"
                  inputMode="decimal"
                  step={statsWeightUnit === WEIGHT_UNITS.LB ? "5" : "2.5"}
                  defaultValue={formatMeetAttemptInput(value)}
                  onBlur={e => commitMeetAttempt(row.lift, key, e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '7px 4px',
                    borderRadius: 6,
                    border: `1px solid ${THEME.border}`,
                    background: THEME.bg,
                    color: THEME.text,
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: 800
                  }}
                />

                <div style={{ color: THEME.muted, fontSize: 10, marginTop: 3 }}>
                  {statsWeightUnit}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>

    <div style={{
      marginTop: 14,
      padding: 12,
      border: `1px solid ${THEME.border}`,
      borderRadius: 10,
      background: THEME.bg,
      display: 'grid',
      gap: 8,
      fontSize: 14
    }}>
      {[
        [t.totalAfterOpener, meetTotals.opener],
        [t.totalAfterSecond, meetTotals.second],
        [t.totalAfterThird, meetTotals.third],
      ].map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: THEME.text, fontWeight: 800 }}>{label}</span>
          <strong>{value ? formatWeightFromKg(value, statsWeightUnit) : '—'}</strong>
        </div>
      ))}
    </div>

    {hasCustomMeetAttempts && (
      <div style={{ marginTop: 10, textAlign: 'center' }}>
        <button
          onClick={() => setShowResetMeetPlannerConfirm(true)}
          style={{
            width: 'auto',
            minWidth: 170,
            padding: '8px 12px',
            fontSize: 13,
            fontWeight: 800,
            background: 'transparent',
            color: THEME.text,
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          {t.resetMeetPlanner}
        </button>
      </div>
    )}

  {showResetMeetPlannerConfirm && (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 800,
      padding: 16
    }}>
      <div style={{
        background: THEME.card,
        border: `1px solid ${THEME.border}`,
        borderRadius: 12,
        padding: 18,
        maxWidth: 420,
        width: '100%',
        color: THEME.text
      }}>
        <h3 style={{ margin: '0 0 10px', textAlign: 'center' }}>
          {t.resetMeetPlannerConfirmTitle}
        </h3>

        <p style={{ color: THEME.muted, fontSize: 14, lineHeight: 1.4, margin: '0 0 16px', textAlign: 'center' }}>
          {t.resetMeetPlannerConfirmText}
        </p>

        <button
          onClick={() => {
            setShowResetMeetPlannerConfirm(false);
            setMeetPlannerAttempts({});
          }}
          style={{
            width: '100%',
            padding: 12,
            fontSize: 15,
            fontWeight: 800,
            background: THEME.card,
            color: '#ffffff',
            border: `1px solid ${THEME.primary}`,
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          {t.resetMeetPlanner}
        </button>

        <button
          onClick={() => setShowResetMeetPlannerConfirm(false)}
          style={{
            width: '100%',
            marginTop: 8,
            padding: 10,
            fontSize: 14,
            fontWeight: 700,
            background: 'transparent',
            color: THEME.text,
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          {t.cancel}
        </button>
      </div>
    </div>
  )}

    </div>
)}

    </div>
  );
}

function StartNewCycleSection({ onStartNewCycle, t }) {
  const [showStartCycleConfirm, setShowStartCycleConfirm] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(''), 1800);
    return () => window.clearTimeout(id);
  }, [notice]);

  return (
    <>
      <Toast message={notice} />
      <div style={{
        marginTop: 6,
        padding: 12,
        border: `1px solid ${THEME.border}`,
        borderRadius: 10,
        background: THEME.card
      }}>
        <p style={{
          margin: '0 0 10px',
          color: THEME.muted,
          fontSize: 13,
          lineHeight: 1.4,
          textAlign: 'center'
        }}>
          {t.startNewCycleHint}
        </p>

        <button
          onClick={() => setShowStartCycleConfirm(true)}
          style={{
            width: '100%',
            padding: 12,
            fontSize: 14,
            fontWeight: 800,
            background: THEME.card,
            color: '#ffffff',
            border: `1px solid ${THEME.primary}`,
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          {t.startNewCycle}
        </button>
      </div>

      {showStartCycleConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 800,
          padding: 16
        }}>
          <div style={{
            background: THEME.card,
            border: `1px solid ${THEME.border}`,
            borderRadius: 12,
            padding: 18,
            maxWidth: 420,
            width: '100%',
            color: THEME.text
          }}>
            <h3 style={{ margin: '0 0 10px', textAlign: 'center' }}>
              {t.startNewCycleConfirmTitle}
            </h3>

            <p style={{
              color: THEME.muted,
              fontSize: 14,
              lineHeight: 1.4,
              margin: '0 0 16px',
              textAlign: 'center'
            }}>
              {t.startNewCycleConfirmText}
            </p>

            <button
              onClick={() => {
                setShowStartCycleConfirm(false);
                setNotice(t.startNewCycleStarted);
                onStartNewCycle();

                window.setTimeout(() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }, 0);
              }}
              style={{
                width: '100%',
                padding: 12,
                fontSize: 15,
                fontWeight: 800,
                background: THEME.card,
                color: '#ffffff',
                border: `1px solid ${THEME.primary}`,
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              {t.startNewCycle}
            </button>

            <button
              onClick={() => setShowStartCycleConfirm(false)}
              style={{
                width: '100%',
                marginTop: 8,
                padding: 10,
                fontSize: 14,
                fontWeight: 700,
                background: 'transparent',
                color: THEME.text,
                border: `1px solid ${THEME.border}`,
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function getWorkoutTitle(workout, t, benchPressVariant = 'standard') {
  const effectiveBenchPressVariant = workout?.type === 'meet' ? 'standard' : benchPressVariant;
  if (!workout || workout.type === 'rest') return t.deload;
  if (workout.type === 'meet') return t.sbdMeetDay || t.meetDay;

  const lifts = (workout.lifts || [])
    .map(liftBlock => liftBlock.lift)
    .filter(Boolean);

  if (lifts.length > 0) {
    return lifts.map(lift => workoutLiftLabel(lift, t, effectiveBenchPressVariant)).join(' + ');
  }

  return workoutLiftLabel(workout.lift, t, effectiveBenchPressVariant);
}

function getWorkoutPlanLines(workout, t, weightUnit = WEIGHT_UNITS.KG, benchPressVariant = 'standard') {
  const effectiveBenchPressVariant = workout?.type === 'meet' ? 'standard' : benchPressVariant;
  if (!workout || workout.type === 'rest') return [];

  const liftBlocks = (workout.lifts || []).length > 0
    ? workout.lifts
    : [{ lift: workout.lift, sets: workout.sets || [] }];

  return liftBlocks.flatMap(liftBlock => {
    const groups = [];

    (liftBlock.sets || []).forEach(set => {
      const labelKey = set.labelKey || null;
      const label = labelKey ? t[labelKey] : set.label || t.set;
      const last = groups[groups.length - 1];

      if (
        last &&
        last.labelKey === labelKey &&
        last.label === label &&
        last.reps === set.reps &&
        last.weight === set.weight
      ) {
        last.count += 1;
        return;
      }

      groups.push({
        labelKey,
        label,
        reps: set.reps,
        weight: set.weight,
        count: 1,
      });
    });

    const onlyBackoff = groups.length > 0 && groups.every(group => group.labelKey === 'backoff');
    const showLiftName = (workout.lifts || []).length > 1;
    const liftName = workoutLiftLabel(liftBlock.lift, t, effectiveBenchPressVariant);

    return groups.map(group => {
      const weightText = formatWorkoutWeightFromKg(group.weight, weightUnit, t, liftBlock.lift, effectiveBenchPressVariant);

      if (onlyBackoff || !group.labelKey) {
        return showLiftName
          ? `${liftName}: ${group.count}×${group.reps}×${weightText}`
          : `${group.count}×${group.reps}×${weightText}`;
      }

      return showLiftName
        ? `${liftName} · ${group.label}: ${group.count}×${group.reps}×${weightText}`
        : `${group.label}: ${group.count}×${group.reps}×${weightText}`;
    });
  });
}

function AppHeader({ t, title, subtitle, meta, children, titleStyle = {} }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 16 }}>
      <div style={{
        color: THEME.primary,
        fontSize: 15,
        fontWeight: 900,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 6
      }}>
        {t.appName}
      </div>

      <h2 style={{
        margin: 0,
        fontSize: 30,
        fontWeight: 900,
        lineHeight: 1.15,
        ...titleStyle
      }}>
        {title}
      </h2>

      {subtitle && (
        <div style={{
          color: THEME.muted,
          fontSize: 15,
          fontWeight: 700,
          lineHeight: 1.35,
          marginTop: 6
        }}>
          {subtitle}
        </div>
      )}

      {meta && (
        <div style={{
          color: THEME.muted,
          fontSize: 15,
          fontWeight: 700,
          lineHeight: 1.35,
          marginTop: 6
        }}>
          {meta}
        </div>
      )}

      {children}
    </div>
  );
}

function isCompletedHistoryEntry(entry) {
  return Boolean(entry?.workoutSnapshot?.completed);
}

function applyCompletedHistorySnapshotsToWorkouts(workouts = [], history = [], currentCycle) {
  const completedSnapshotsByWorkoutNumber = new Map();

  (history || []).forEach(entry => {
    if (
      Number(entry?.cycle) === Number(currentCycle) &&
      Number.isFinite(Number(entry?.workoutNumber)) &&
      entry?.workoutSnapshot?.completed
    ) {
      completedSnapshotsByWorkoutNumber.set(Number(entry.workoutNumber), entry.workoutSnapshot);
    }
  });

  if (!completedSnapshotsByWorkoutNumber.size) return workouts;

  let changed = false;

  const nextWorkouts = (workouts || []).map(workout => {
    const snapshot = completedSnapshotsByWorkoutNumber.get(Number(workout?.number));
    if (!snapshot) return workout;

    if (
      workout?.completed &&
      workout?.completedAt === snapshot.completedAt
    ) {
      return workout;
    }

    changed = true;
    return snapshot;
  });

  return changed ? nextWorkouts : workouts;
}

function AllWorkouts({ workouts, currentIndex, completedWorkoutCount, completedWorkoutNumbers = [], currentCycle, onSelect, onBack, onStats, onStartNewCycle, t, weightUnit = WEIGHT_UNITS.KG, benchPressVariant = 'standard' }) {
  const currentWorkoutRef = useRef(null);
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);
  const completedWorkoutNumberSet = new Set(completedWorkoutNumbers.map(Number));

  const visibleStart = Math.max(0, currentIndex - 3);
  const visibleEnd = Math.min(workouts.length, currentIndex + 4);
  const visibleWorkoutEntries = showAllWorkouts
    ? workouts.map((workout, idx) => ({ workout, idx }))
    : workouts.slice(visibleStart, visibleEnd).map((workout, offset) => ({
      workout,
      idx: visibleStart + offset,
    }));
  const hasHiddenWorkouts = workouts.length > (visibleEnd - visibleStart);

  useEffect(() => {
    if (!currentWorkoutRef.current) return;

    const id = window.setTimeout(() => {
      currentWorkoutRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'center',
      });
    }, 0);

    return () => window.clearTimeout(id);
  }, [currentIndex, workouts.length]);

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <AppHeader
        t={t}
        title={t.program}
        subtitle={`${t.cycle} ${currentCycle} · ${t.workoutProgress} ${Math.min(currentIndex + 1, workouts.length)} / ${workouts.length}`}
      />


      {visibleWorkoutEntries.map(({ workout, idx }) => {
        const isCurrent = idx === currentIndex;
        const isDone = completedWorkoutNumberSet.has(Number(workout.number)) || Boolean(workout.completed);
        const headerBg = isCurrent ? THEME.primary : workout.type === 'rest' ? THEME.brown : THEME.border;
        const planLines = getWorkoutPlanLines(workout, t, weightUnit, benchPressVariant);
        const typeLabel = getWorkoutTypeLabel(workout, t);
        const showTypeLabel = false;

        return (
          <div
            key={workout.number}
            ref={isCurrent ? currentWorkoutRef : null}
            onClick={() => {
              onSelect(idx);
              window.scrollTo({ top: 0, behavior: 'auto' });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              marginBottom: 10,
              borderRadius: 8,
              border: isCurrent ? `2px solid ${THEME.primary}` : `1px solid ${THEME.border}`,
              background: THEME.card,
              cursor: 'pointer',
              opacity: 1
            }}
          >
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: headerBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 16,
              marginRight: 14,
              flexShrink: 0
            }}>
              {workout.number}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: isCurrent ? 700 : 500, color: isCurrent ? THEME.primary : '#ffffff' }}>
                {getWorkoutTitle(workout, t, benchPressVariant)}
                {isCurrent && (
                  <span style={{
                    fontSize: 11,
                    background: THEME.primary,
                    color: '#ffffff',
                    padding: '1px 6px',
                    borderRadius: 3,
                    marginLeft: 8
                  }}>
                    {t.now}
                  </span>
                )}
              </div>

              {showTypeLabel && (
                <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
                  {typeLabel}
                </div>
              )}
            </div>

            {planLines.length > 0 && (
              <div style={{
                marginLeft: 10,
                display: 'grid',
                gap: 2,
                color: THEME.text,
                fontSize: 11,
                lineHeight: 1.2,
                textAlign: 'right',
                maxWidth: 210,
                flexShrink: 0
              }}>
                {planLines.map((line, lineIndex) => (
                  <div
                    key={lineIndex}
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'visible',
                      textOverflow: 'clip'
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            )}

            {isDone && <span style={{ color: THEME.primary, fontSize: 18, marginLeft: 8 }}>✅</span>}
          </div>
        );
      })}

      {hasHiddenWorkouts && (
        <button
          onClick={() => setShowAllWorkouts(value => !value)}
          style={{
            width: '100%',
            margin: '4px 0 6px',
            padding: 10,
            borderRadius: 8,
            border: `1px solid ${THEME.border}`,
            background: THEME.card,
            color: THEME.primary,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {showAllWorkouts ? t.showFewerWorkouts : t.showAllWorkouts}
        </button>
      )}

      <StartNewCycleSection
        onStartNewCycle={onStartNewCycle}
        t={t}
      />
    </div>
  );
}

function Onboarding({ onStart, t }) {
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingError, setOnboardingError] = useState('');
  const [onboardingWeightUnit, setOnboardingWeightUnit] = useState(() => normalizeWeightUnit(localStorage.getItem('weightUnit')));
  const [squat, setSquat] = useState('');
  const [bench, setBench] = useState('');
  const [deadlift, setDeadlift] = useState('');
  const [onboardingCalculators, setOnboardingCalculators] = useState({
    Squat: { weight: '', reps: '' },
    Bench: { weight: '', reps: '' },
    Deadlift: { weight: '', reps: '' },
  });
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState('');
  const [bodyForm, setBodyForm] = useState({
    bodyWeight: '',
    bodyFat: '',
    bodyWater: '',
    visceralFat: '',
    physiqueRating: '',
    boneMass: '',
  });

  function updateBodyField(field, value) {
    setBodyForm(prev => ({ ...prev, [field]: value }));
  }

  function updateOnboardingCalculator(lift, field, value) {
    setOnboardingCalculators(prev => ({
      ...prev,
      [lift]: {
        ...(prev[lift] || {}),
        [field]: value,
      },
    }));
  }

  function calculateOnboardingE1RM(lift, setter) {
    const selectedWeightUnit = normalizeWeightUnit(onboardingWeightUnit);
    const calculator = onboardingCalculators[lift] || {};
    const weightKg = displayWeightToKg(parseFloat(calculator.weight), selectedWeightUnit);
    const reps = parseInt(calculator.reps, 10);

    if (!Number(weightKg) || !Number.isFinite(reps) || reps < 1) return;

    const estimatedE1RM = roundKgForStorage(weightKg * (1 + reps / 30));
    const displayValue = kgToDisplayWeight(estimatedE1RM, selectedWeightUnit);

    if (displayValue === '') return;

    setter(formatWeightValue(displayValue, selectedWeightUnit));
  }

  function buildInitialBodyData() {
    const selectedWeightUnit = normalizeWeightUnit(onboardingWeightUnit);
    const bodyWeightInput = toOptionalNumber(bodyForm.bodyWeight);
    const bodyFat = toOptionalNumber(bodyForm.bodyFat);
    const bodyWater = toOptionalNumber(bodyForm.bodyWater);
    const visceralFat = toOptionalNumber(bodyForm.visceralFat);
    const physiqueRating = toOptionalNumber(bodyForm.physiqueRating);
    const boneMassInput = toOptionalNumber(bodyForm.boneMass);
    const bodyWeight = bodyWeightInput !== null ? displayWeightToKg(bodyWeightInput, selectedWeightUnit) : null;
    const boneMass = boneMassInput !== null ? displayWeightToKg(boneMassInput, selectedWeightUnit) : null;
    const leanMass = calculateLeanMassEstimate(bodyWeight, bodyFat, boneMass);
    const bmr = calculateBmrEstimate(leanMass);

    const bodyData = {
      bodyWeight,
      bodyFat,
      bodyWater,
      visceralFat,
      leanMass,
      physiqueRating,
      boneMass,
      bmr,
    };

    return Object.values(bodyData).some(value => value !== null) ? bodyData : null;
  }

  function parseBirthDateInput(value) {
    const trimmed = value.trim();
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return trimmed;

    const match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!match) return '';

    const [, dayRaw, monthRaw, yearRaw] = match;
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return '';
    }

    return `${yearRaw}-${monthRaw.padStart(2, '0')}-${dayRaw.padStart(2, '0')}`;
  }

  function hasRequiredTrainingDetails() {
    const selectedWeightUnit = normalizeWeightUnit(onboardingWeightUnit);
    const squatKg = displayWeightToKg(parseFloat(squat), selectedWeightUnit);
    const benchKg = displayWeightToKg(parseFloat(bench), selectedWeightUnit);
    const deadliftKg = displayWeightToKg(parseFloat(deadlift), selectedWeightUnit);

    return Boolean(squatKg && benchKg && deadliftKg);
  }

  function hasRequiredProfileDetails() {
    return Boolean(parseBirthDateInput(birthDate) && sex);
  }

  function goToNextOnboardingStep() {
    if (onboardingStep === 2 && !hasRequiredTrainingDetails()) {
      setOnboardingError(t.fillRequiredFields);
      return;
    }

    if (onboardingStep === 3 && !hasRequiredProfileDetails()) {
      setOnboardingError(t.fillRequiredFields);
      return;
    }

    setOnboardingError('');
    setOnboardingStep(step => Math.min(4, step + 1));
  }

  function handleStart() {
    const selectedWeightUnit = normalizeWeightUnit(onboardingWeightUnit);
    const s = displayWeightToKg(parseFloat(squat), selectedWeightUnit);
    const b = displayWeightToKg(parseFloat(bench), selectedWeightUnit);
    const d = displayWeightToKg(parseFloat(deadlift), selectedWeightUnit);

    const normalizedBirthDate = parseBirthDateInput(birthDate);

    if (!s || !b || !d || !normalizedBirthDate || !sex) {
      setOnboardingError(t.fillRequiredFields);
      return;
    }

    setOnboardingError('');
    onStart(s, b, d, { birthDate: normalizedBirthDate, sex, weightUnit: selectedWeightUnit }, buildInitialBodyData());
  }

  const bodyFields = [
    { key: 'bodyWeight', label: t.bodyweight, unit: onboardingWeightUnit },
    { key: 'bodyFat', label: t.bodyFatPercent, unit: '%' },
    { key: 'bodyWater', label: t.bodyWaterPercent, unit: '%' },
    { key: 'visceralFat', label: t.visceralFatRating },
    { key: 'physiqueRating', label: t.physiqueRating },
    { key: 'boneMass', label: t.boneMassKg, unit: onboardingWeightUnit },
  ];

  return (
    <div style={{
      maxWidth: 500,
      margin: '0 auto',
      padding: 24,
      paddingTop: 60,
      minHeight: '100vh',
      fontFamily: 'sans-serif',
      background: THEME.bg,
      color: THEME.text
    }}>
      <h1 style={{
        textAlign: 'center',
        marginTop: 0,
        marginBottom: 28,
        color: THEME.primary,
        fontSize: 34,
        fontWeight: 900,
        letterSpacing: 1.2,
        lineHeight: 1.05,
        textTransform: 'uppercase'
      }}>
        {t.appName}
      </h1>

      <div style={{
        padding: 0
      }}>
        {onboardingStep !== 1 && (
          <h2 style={{ marginTop: 0, marginBottom: 8, color: THEME.text, textAlign: 'center' }}>
            {onboardingStep === 2
              ? t.onboardingTrainingTitle
              : onboardingStep === 3
              ? t.onboardingProfileTitle
              : t.onboardingBodyTitle}
          </h2>
        )}

        {onboardingStep === 2 && (
          <p style={{
            margin: '0 0 14px',
            color: THEME.muted,
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.4,
            textAlign: 'center'
          }}>
            {t.onboardingMaxHelp}
          </p>
        )}


        {onboardingError && (
          <div style={{
            margin: '0 0 16px',
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${THEME.red}`,
            background: 'rgba(231, 76, 60, 0.12)',
            color: THEME.text,
            fontSize: 14,
            fontWeight: 800,
            lineHeight: 1.35,
            textAlign: 'center'
          }}>
            {onboardingError}
          </div>
        )}

        {onboardingStep === 1 && (
          <div style={{ marginBottom: 26, textAlign: 'left' }}>
            <h3 style={{
              margin: '4px 0 14px',
              color: THEME.red,
              fontSize: 30,
              fontWeight: 900,
              lineHeight: 1.15,
              textAlign: 'center'
            }}>
              {t.onboardingHeroTitle}
            </h3>

            <p style={{
              margin: '0 0 22px',
              maxWidth: 'none',
              color: THEME.text,
              fontSize: 18,
              fontWeight: 800,
              lineHeight: 1.55
            }}>
              {t.onboardingHeroText}
            </p>

            <div style={{
              display: 'grid',
              gap: 8,
              margin: '0 0 22px',
              maxWidth: 'none',
              textAlign: 'left'
            }}>
              {[t.onboardingBenefitWorkouts, t.onboardingBenefitProgress, t.onboardingBenefitMeetDay].map(item => (
                <div key={item} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  color: THEME.text,
                  fontSize: 15,
                  fontWeight: 800
                }}>
                  <span style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: THEME.primary,
                    color: THEME.bg,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 900,
                    flexShrink: 0
                  }}>✓</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <p style={{
              margin: 0,
              maxWidth: 'none',
              color: THEME.muted,
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.55
            }}>
              {t.onboardingResponsibilityText}
            </p>
          </div>
        )}

        {onboardingStep === 2 && (
          <>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, color: THEME.text }}>
            {t.weightUnit}
          </label>

          <select
            value={onboardingWeightUnit}
            onChange={e => setOnboardingWeightUnit(normalizeWeightUnit(e.target.value))}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              borderRadius: 4,
              border: `1px solid ${THEME.border}`,
              boxSizing: 'border-box',
              background: THEME.bg,
              color: THEME.text
            }}
          >
            <option value={WEIGHT_UNITS.KG}>{t.weightUnitKg}</option>
            <option value={WEIGHT_UNITS.LB}>{t.weightUnitLb}</option>
          </select>
        </div>

        {[
          ['Squat', t.squat1RM, squat, setSquat],
          ['Bench', t.bench1RM, bench, setBench],
          ['Deadlift', t.deadlift1RM, deadlift, setDeadlift],
        ].map(([lift, label, val, setter]) => (
          <div key={lift} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, color: THEME.text }}>
              {label}
            </label>

            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                type="number"
                min="0"
                step={onboardingWeightUnit === WEIGHT_UNITS.LB ? "5" : "2.5"}
                value={val}
                onChange={e => setter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 42px 10px 10px',
                  fontSize: 16,
                  borderRadius: 4,
                  border: `1px solid ${THEME.border}`,
                  boxSizing: 'border-box',
                  background: THEME.bg,
                  color: THEME.text
                }}
              />
              <span style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: THEME.text,
                fontSize: 16,
                pointerEvents: 'none'
              }}>
                {onboardingWeightUnit}
              </span>
            </div>

            <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: THEME.text, marginBottom: 8 }}>
                {t.estimateE1RM}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input
                  type="number"
                  min="0"
                  step={onboardingWeightUnit === WEIGHT_UNITS.LB ? "5" : "2.5"}
                  value={onboardingCalculators[lift]?.weight || ''}
                  onChange={e => updateOnboardingCalculator(lift, 'weight', e.target.value)}
                  placeholder={t.submaxWeight}
                  style={{
                    width: '100%',
                    padding: 10,
                    fontSize: 15,
                    borderRadius: 4,
                    border: `1px solid ${THEME.border}`,
                    boxSizing: 'border-box',
                    background: THEME.card,
                    color: THEME.text
                  }}
                />

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={onboardingCalculators[lift]?.reps || ''}
                  onChange={e => updateOnboardingCalculator(lift, 'reps', e.target.value)}
                  placeholder={t.submaxReps}
                  style={{
                    width: '100%',
                    padding: 10,
                    fontSize: 15,
                    borderRadius: 4,
                    border: `1px solid ${THEME.border}`,
                    boxSizing: 'border-box',
                    background: THEME.card,
                    color: THEME.text
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => calculateOnboardingE1RM(lift, setter)}
                style={{
                  width: '100%',
                  padding: 9,
                  fontSize: 14,
                  fontWeight: 800,
                  background: 'transparent',
                  color: THEME.text,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                {t.calculateE1RM}
              </button>
            </div>
          </div>
        ))}
          </>
        )}

        {onboardingStep === 3 && (
          <>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, color: THEME.text }}>
            {t.birthDate}
          </label>

          <div
            onClick={e => {
              const input = e.currentTarget.querySelector('input[type="date"]');
              if (input?.showPicker) {
                input.showPicker();
              } else {
                input?.focus();
                input?.click();
              }
            }}
            style={{
              position: 'relative',
              width: '100%',
              height: 42,
              borderRadius: 4,
              border: `1px solid ${THEME.border}`,
              boxSizing: 'border-box',
              background: THEME.bg,
              cursor: 'pointer'
            }}
          >
            <div style={{
              padding: '10px 42px 10px 10px',
              fontSize: 16,
              color: birthDate ? THEME.text : 'transparent',
              boxSizing: 'border-box'
            }}>
              {birthDate || ' '}
            </div>

            <span style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: THEME.text,
              fontSize: 16,
              pointerEvents: 'none'
            }}>
              📅
            </span>

            <input
              type="date"
              value={birthDate}
              onChange={e => setBirthDate(e.target.value)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                pointerEvents: 'none'
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, color: THEME.text }}>
            {t.sex}
          </label>

          <select
            value={sex}
            onChange={e => setSex(e.target.value)}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              borderRadius: 4,
              border: `1px solid ${THEME.border}`,
              boxSizing: 'border-box',
              background: THEME.bg,
              color: THEME.text
            }}
          >
            <option value="">{t.selectSex}</option>
            <option value="male">{t.male}</option>
            <option value="female">{t.female}</option>
            <option value="other">{t.other}</option>
          </select>
        </div>
          </>
        )}

        {onboardingStep === 4 && (
          <>
        {bodyFields.map(field => (
          <div key={field.key} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, color: THEME.text }}>
              {field.label}
            </label>

            <div style={{ position: 'relative' }}>
              <input
                type="number"
                value={bodyForm[field.key]}
                onChange={e => updateBodyField(field.key, e.target.value)}
                style={{
                  width: '100%',
                  padding: field.unit ? '10px 48px 10px 10px' : 10,
                  fontSize: 16,
                  borderRadius: 4,
                  border: `1px solid ${THEME.border}`,
                  boxSizing: 'border-box',
                  background: THEME.bg,
                  color: THEME.text
                }}
              />
              {field.unit && (
                <span style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: THEME.text,
                  fontSize: 16,
                  pointerEvents: 'none'
                }}>
                  {field.unit}
                </span>
              )}
            </div>
          </div>
        ))}
          </>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: onboardingStep === 1 ? '1fr' : '1fr 1fr',
          gap: 8,
          marginTop: 8
        }}>
          {onboardingStep > 1 && (
            <button
              type="button"
              onClick={() => { setOnboardingError(''); setOnboardingStep(step => Math.max(1, step - 1)); }}
              style={{
                width: '100%',
                padding: 14,
                fontSize: 16,
                background: 'transparent',
                color: THEME.text,
                border: `1px solid ${THEME.border}`,
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              {t.onboardingBack}
            </button>
          )}

          <button
            type="button"
            onClick={onboardingStep < 4 ? goToNextOnboardingStep : handleStart}
            style={{
              width: '100%',
              padding: 14,
              fontSize: 16,
              background: THEME.primary,
              color: '#ffffff',
              border: `1px solid ${THEME.primary}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            {onboardingStep === 1 ? t.onboardingStartSetup : onboardingStep < 4 ? t.onboardingNext : t.startProgram}
          </button>
        </div>
      </div>
    </div>
  );
}

function NavIcon({ type }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  if (type === 'dashboard') {
    return (
      <svg {...common}>
        <path d="M5 15a7 7 0 0 1 14 0" />
        <path d="M12 15l4-5" />
        <path d="M5 19h14" />
      </svg>
    );
  }

  if (type === 'program') {
    return (
      <svg {...common}>
        <line x1="8" y1="6" x2="20" y2="6" />
        <line x1="8" y1="12" x2="20" y2="12" />
        <line x1="8" y1="18" x2="20" y2="18" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </svg>
    );
  }

  if (type === 'workout') {
    return (
      <svg {...common}>
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="3" y1="8" x2="3" y2="16" />
        <line x1="6" y1="7" x2="6" y2="17" />
        <line x1="18" y1="7" x2="18" y2="17" />
        <line x1="21" y1="8" x2="21" y2="16" />
      </svg>
    );
  }

  if (type === 'stats') {
    return (
      <svg {...common}>
        <polyline points="4 17 9 12 13 15 20 7" />
        <line x1="4" y1="20" x2="20" y2="20" />
        <line x1="4" y1="4" x2="4" y2="20" />
      </svg>
    );
  }

  return (
    <span aria-hidden="true" style={{ fontSize: 25, lineHeight: 1 }}>
      ⚙
    </span>
  );
}

function BottomNav({ screen, onChange, t }) {
  const items = [
    { key: 'dashboard', label: t.dashboard, icon: 'dashboard' },
    { key: 'all', label: t.program, icon: 'program' },
    { key: 'current', label: t.workout, icon: 'workout' },
    { key: 'stats', label: t.stats, icon: 'stats' },
    { key: 'settings', label: t.settings, icon: 'settings' },
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      display: 'flex',
      zIndex: 100,
      background: THEME.card,
      borderTop: `1px solid ${THEME.border}`,
    }}>
      {items.map(item => (
        <button
          key={item.key}
          aria-label={item.label}
          title={item.label}
          onClick={() => {
            onChange(item.key);
            window.scrollTo({ top: 0, behavior: 'auto' });
          }}
          style={{
            flex: 1,
            padding: '11px 0',
            background: 'none',
            border: 'none',
            color: screen === item.key ? THEME.primary : '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <NavIcon type={item.icon} />
        </button>
      ))}
    </div>
  );
}

export default 
function App() {
  const [language, setLanguage] = useState(() => {
    const savedLanguage = localStorage.getItem('language');
    const supportedLanguages = ['ca', 'en', 'nl'];

    if (supportedLanguages.includes(savedLanguage)) {
      return savedLanguage;
    }

    const systemLanguage = (navigator.language || navigator.userLanguage || '').toLowerCase();

    if (systemLanguage.startsWith('ca')) return 'ca';
    if (systemLanguage.startsWith('nl')) return 'nl';
    if (systemLanguage.startsWith('en')) return 'en';

    return 'en';
  });

  const [timer, setTimer] = useState(null);
  const [restTimeSeconds, setRestTimeSeconds] = useState(DEFAULT_REST_TIME_SECONDS);
  const [accessoryMode, setAccessoryMode] = useState('off');
  const [preparationMode, setPreparationMode] = useState('basicFirst');
  const [benchPressVariant, setBenchPressVariant] = useState(() =>
    normalizeBenchPressVariant(localStorage.getItem('benchPressVariant'))
  );
  const [weightUnit, setWeightUnit] = useState(() => normalizeWeightUnit(localStorage.getItem('weightUnit')));

  function startTimer(seconds, placement = null) {
    setTimer({
      id: Date.now(),
      seconds,
      endTime: Date.now() + seconds * 1000,
      placement,
    });
  }

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('weightUnit', normalizeWeightUnit(weightUnit));
  }, [weightUnit]);

  useEffect(() => {
    localStorage.setItem('benchPressVariant', normalizeBenchPressVariant(benchPressVariant));
  }, [benchPressVariant]);

  const t = translations[language];
  const [screen, setScreen] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentWorkoutIndex, setCurrentWorkoutIndex] = useState(0);
  const [history, setHistory] = useState([]);
  const [prs, setPrs] = useState({});
  const [accessoryPRs, setAccessoryPRs] = useState({});
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [completedWorkout, setCompletedWorkout] = useState(null);
  const [completedWorkoutIndex, setCompletedWorkoutIndex] = useState(null);
  const [completedSummary, setCompletedSummary] = useState(null);
  const [showWorkoutEffortPrompt, setShowWorkoutEffortPrompt] = useState(false);
  const [currentCycle, setCurrentCycle] = useState(1);
  const [bodyWeights, setBodyWeights] = useState([]);
  const [userProfile, setUserProfile] = useState({});
  const [meetPlannerAttempts, setMeetPlannerAttempts] = useState({});
  const [meetPrepChecklist, setMeetPrepChecklist] = useState({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  useEffect(() => {
    if (!workouts.length) return;

    setWorkouts(prev => applyCompletedHistorySnapshotsToWorkouts(prev, history, currentCycle));
  }, [history, currentCycle, workouts.length]);

  const completedWorkoutCount = getCompletedWorkoutCount(history, currentCycle);
  const completedWorkoutNumbers = Array.from(new Set(
    (history || [])
      .filter(entry =>
        Number(entry.cycle) === Number(currentCycle) &&
        isCompletedHistoryEntry(entry)
      )
      .map(entry => Number(entry.workoutNumber))
      .filter(Number.isFinite)
  ));
  const currentIndex = Math.max(completedWorkoutCount, currentWorkoutIndex);
  const PROGRAM_VERSION = 'cube-27-v5';

  function updateMeetPlannerAttempts(next) {
    setMeetPlannerAttempts(prev => {
      const updated = typeof next === 'function' ? next(prev || {}) : (next || {});

      setWorkouts(prevWorkouts =>
        applyMeetPlannerAttemptsToWorkouts(prevWorkouts, updated, prs)
      );

      return updated;
    });
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [screen, selectedIndex]);

  useEffect(() => {
    const setupBackButton = async () => {
      const listener = await CapacitorApp.addListener('backButton', () => {
        if (screen === 'current') {
          setScreen('all');
          return;
        }

        if (screen === 'all') {
          setScreen('dashboard');
          return;
        }

        if (screen === 'stats') {
          setScreen('all');
          return;
        }

        if (screen === 'settings') {
          setScreen('dashboard');
          return;
        }

        if (screen === 'completed') {
          if (completedWorkoutIndex !== null) {
            setSelectedIndex(completedWorkoutIndex);
          }
          setScreen('current');
          return;
        }

        CapacitorApp.exitApp();
      });

      return listener;
    };

    let listener;

    setupBackButton().then(l => {
      listener = l;
    });

    return () => {
      if (listener) listener.remove();
    };
  }, [screen, completedWorkoutIndex]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      setScreen('onboarding');
      return;
    }

    try {
      const data = JSON.parse(saved);

      const savedPrs = data.prs || {};
      const squat = savedPrs.Squat || 0;
      const bench = savedPrs.Bench || 0;
      const deadlift = savedPrs.Deadlift || 0;

      if (!squat || !bench || !deadlift) {
        setScreen('onboarding');
        return;
      }

      const savedHistory = data.history || [];
      const savedCycle = data.currentCycle || 1;
      const savedPreparationMode = normalizePreparationMode(data.preparationMode);
      const generatedWorkouts = generateProgram(squat, bench, deadlift, normalizeAccessoryMode(data.accessoryMode), data.accessoryPRs || {}, savedPreparationMode);
      const savedInProgress = data.inProgress || null;
      const savedMeetPlannerAttempts = data.meetPlannerAttempts || {};
      const savedMeetPrepChecklist = data.meetPrepChecklist || {};

      const canRestoreInProgress =
        savedInProgress &&
        savedInProgress.programVersion === PROGRAM_VERSION &&
        savedInProgress.currentCycle === savedCycle &&
        Array.isArray(savedInProgress.workouts) &&
        savedInProgress.workouts.length === generatedWorkouts.length;

      const restoredWorkouts = canRestoreInProgress
        ? savedInProgress.workouts
        : hydrateWorkoutsWithHistory(generatedWorkouts, savedHistory, savedCycle);

      const normalizedWorkouts = mergeGeneratedWorkoutStructure(
        restoredWorkouts,
        generatedWorkouts,
        savedHistory,
        savedCycle
      );

      setWorkouts(applyMeetPlannerAttemptsToWorkouts(
        normalizedWorkouts,
        savedMeetPlannerAttempts,
        savedPrs
      ));
      setHistory(savedHistory);
      setPrs(savedPrs);
      setAccessoryPRs(data.accessoryPRs || {});
      setCurrentCycle(savedCycle);
      setBodyWeights(normalizeBodyWeights(data));
      setUserProfile(data.userProfile || {});
      setMeetPlannerAttempts(savedMeetPlannerAttempts);
      setMeetPrepChecklist(savedMeetPrepChecklist);
      setRestTimeSeconds(normalizeRestTimeSeconds(data.restTimeSeconds));
      setAccessoryMode(normalizeAccessoryMode(data.accessoryMode));
      setPreparationMode(savedPreparationMode);

      const completedWorkoutCount = getCompletedWorkoutCount(savedHistory, savedCycle);
      const restorableSelectedIndex = getRestorableSelectedIndex(
        savedInProgress,
        savedCycle,
        generatedWorkouts.length
      );
      const restorableCurrentIndex = getRestorableSelectedIndex(
        {
          ...savedInProgress,
          selectedIndex: savedInProgress?.currentIndex ?? savedInProgress?.selectedIndex,
        },
        savedCycle,
        generatedWorkouts.length
      );
      const restoredCurrentIndex = Math.max(
        completedWorkoutCount,
        restorableCurrentIndex ?? completedWorkoutCount
      );

      setCurrentWorkoutIndex(restoredCurrentIndex);
      setSelectedIndex(Math.max(
        restoredCurrentIndex,
        restorableSelectedIndex ?? restoredCurrentIndex
      ));

      setShowNewCycle(false);
      setScreen('dashboard');
    } catch (e) {
      console.error('Kon opgeslagen user data niet laden', e);
      setScreen('onboarding');
    }
  }, []);

  useEffect(() => {
    if (!prs.Squat || !prs.Bench || !prs.Deadlift) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      history,
      prs,
      accessoryPRs,
      currentCycle,
      bodyWeights,
      userProfile,
      meetPlannerAttempts,
      meetPrepChecklist,
      restTimeSeconds,
      accessoryMode,
      preparationMode,
      inProgress: {
        programVersion: PROGRAM_VERSION,
        currentCycle,
        currentIndex,
        selectedIndex,
        workouts,
      },
    }));
  }, [history, prs, accessoryPRs, currentCycle, currentIndex, bodyWeights, userProfile, meetPlannerAttempts, meetPrepChecklist, restTimeSeconds, accessoryMode, preparationMode, selectedIndex, workouts]);

  useEffect(() => {
    if (!prs.Squat || !prs.Bench || !prs.Deadlift) return;

    const generatedWorkouts = generateProgram(
      prs.Squat,
      prs.Bench,
      prs.Deadlift,
      accessoryMode,
      accessoryPRs,
      preparationMode
    );

    setWorkouts(prev => applyAccessoryPlanToWorkouts(
      prev,
      generatedWorkouts,
      getCompletedWorkoutCount(history, currentCycle)
    ));
  }, [accessoryMode, preparationMode, accessoryPRs, prs.Squat, prs.Bench, prs.Deadlift, history, currentCycle]);

  useEffect(() => {
    if (screen !== 'completed' || !completedWorkout) return;

    const timeoutId = setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;

        writeAutomaticBackup(JSON.parse(saved)).catch(error => {
          console.error('Automatic backup failed', error);
          localStorage.setItem(AUTO_BACKUP_STATUS_KEY, JSON.stringify({
            ok: false,
            exportedAt: new Date().toISOString(),
          }));
        });
      } catch (error) {
        console.error('Automatic backup failed', error);
        localStorage.setItem(AUTO_BACKUP_STATUS_KEY, JSON.stringify({
          ok: false,
          exportedAt: new Date().toISOString(),
        }));
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [screen, completedWorkout]);

  function handleStart(s, b, d, profile = {}, initialBodyData = null) {
    const today = new Date().toLocaleDateString('nl-NL');

    localStorage.removeItem('kel-powerlifting');
    localStorage.removeItem('app_version');

    const selectedWeightUnit = normalizeWeightUnit(profile.weightUnit || weightUnit);
    const defaultAccessoryMode = 'off';
    const defaultPreparationMode = 'off';
    const defaultBenchPressVariant = 'standard';

    setWeightUnit(selectedWeightUnit);
    localStorage.setItem('weightUnit', selectedWeightUnit);
    localStorage.setItem('benchPressVariant', defaultBenchPressVariant);

    setAccessoryMode(defaultAccessoryMode);
    setPreparationMode(defaultPreparationMode);
    setBenchPressVariant(defaultBenchPressVariant);

    setWorkouts(generateProgram(s, b, d, defaultAccessoryMode, {}, defaultPreparationMode));
    setCurrentWorkoutIndex(0);
    setSelectedIndex(0);
    setCurrentCycle(1);

    setHistory([
      {
        workoutNumber: 0,
        cycle: 0,
        seedMax: true,
        lift: 'Squat',
        topWeight: s,
        topReps: 1,
        e1rm: s,
        date: today,
      },
      {
        workoutNumber: 0,
        cycle: 0,
        seedMax: true,
        lift: 'Bench',
        topWeight: b,
        topReps: 1,
        e1rm: b,
        date: today,
      },
      {
        workoutNumber: 0,
        cycle: 0,
        seedMax: true,
        lift: 'Deadlift',
        topWeight: d,
        topReps: 1,
        e1rm: d,
        date: today,
      }
    ]);

    setPrs({ Squat: s, Bench: b, Deadlift: d });
    setAccessoryPRs({});
    setUserProfile({ ...profile, weightUnit: selectedWeightUnit });
    setMeetPlannerAttempts({});
    setMeetPrepChecklist({});
    setBodyWeights(initialBodyData ? [
      {
        workoutNumber: 0,
        cycle: 1,
        date: today,
        timestamp: new Date().toISOString(),
        ...initialBodyData,
      }
    ] : []);
    setShowNewCycle(false);
    setScreen('dashboard');
  }

function handleResetApp() {
  setShowResetConfirm(false);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('kel-powerlifting');
  localStorage.removeItem('app_version');
  localStorage.removeItem('bodyweight_prompt_date');

  localStorage.setItem('benchPressVariant', 'standard');

  setWorkouts([]);
  setCurrentWorkoutIndex(0);
  setSelectedIndex(0);
  setHistory([]);
  setPrs({});
  setAccessoryPRs({});
  setUserProfile({});
  setMeetPlannerAttempts({});
  setMeetPrepChecklist({});
  setShowNewCycle(false);
  setShowWorkoutEffortPrompt(false);
  setCompletedWorkout(null);
  setCompletedWorkoutIndex(null);
  setCompletedSummary(null);
  setCurrentCycle(1);
  setBodyWeights([]);
  setAccessoryMode('off');
  setPreparationMode('off');
  setBenchPressVariant('standard');
  setScreen('onboarding');
}


function handleSaveMaxes(lift, values) {
  if (!['Squat', 'Bench', 'Deadlift'].includes(lift)) return;

  const nextOneRM = Number(values?.oneRM);
  const nextE1RM = Number(values?.e1RM);

  if (!nextOneRM || !nextE1RM) return;

  const updatedPrs = {
    ...prs,
    [lift]: nextE1RM,
  };

  setPrs(updatedPrs);
  setWorkouts(generateProgram(updatedPrs.Squat, updatedPrs.Bench, updatedPrs.Deadlift, accessoryMode, accessoryPRs, preparationMode));
  setMeetPlannerAttempts({});

  setHistory(prev => {
    let updatedSeed = false;
    const today = new Date().toLocaleDateString('nl-NL');

    const updatedHistory = prev.map(entry => {
      if (entry?.workoutNumber === 0 && entry?.lift === lift) {
        updatedSeed = true;
        return {
          ...entry,
          topWeight: nextOneRM,
          topReps: 1,
          e1rm: nextE1RM,
          manualMax: true,
        };
      }

      return entry;
    });

    if (!updatedSeed) {
      updatedHistory.unshift({
        workoutNumber: 0,
        cycle: 1,
        lift,
        topWeight: nextOneRM,
        topReps: 1,
        e1rm: nextE1RM,
        date: today,
        manualMax: true,
      });
    }

    return updatedHistory;
  });
}

function handleStartNewCycle() {
  if (!prs.Squat || !prs.Bench || !prs.Deadlift) {
    setScreen('onboarding');
    return;
  }

  const nextCycle = currentCycle + 1;
  const newWorkouts = generateProgram(prs.Squat, prs.Bench, prs.Deadlift, accessoryMode, accessoryPRs, preparationMode);

  setCurrentCycle(nextCycle);
  setMeetPlannerAttempts({});
  setWorkouts(newWorkouts);
  setCurrentWorkoutIndex(0);
  setSelectedIndex(0);
  setCompletedWorkout(null);
  setCompletedSummary(null);
  setShowNewCycle(false);
  setShowWorkoutEffortPrompt(false);
  setScreen('all');
}

function shouldStartRestTimerAfterToggle(workout, type, index, accIndex = null) {
  const warmups = workout.warmups || [];
  const sets = workout.sets || [];
  const accessories = workout.accessories || [];

  if (type === 'warmup') {
    const current = warmups[index];
    if (!current || current.done) return false;

    const isLastWarmup = index === warmups.length - 1;
    return isLastWarmup && sets.length > 0;
  }

  if (type === 'main') {
    const current = sets[index];
    if (!current || current.done) return false;

    const hasMoreMainSets = index < sets.length - 1;
    const hasAccessories = accessories.some(a => (a.done || []).some(d => !d));

    return hasMoreMainSets || hasAccessories;
  }

  if (type === 'accessory') {
    const acc = accessories[accIndex];
    if (!acc) return false;

    const currentDone = acc.done[index];
    if (currentDone) return false;

    const hasMoreAccessorySets =
      accessories.some((a, ai) =>
        (a.done || []).some((d, si) => {
          if (ai < accIndex) return false;
          if (ai === accIndex && si <= index) return false;
          return !d;
        })
      );

    return hasMoreAccessorySets;
  }

  return false;
}

function togglePrepItem(index) {
  setTimer(null);

  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      const nextPrepItems = (w.prepItems || []).map((item, i) =>
        i === index ? { ...item, done: !item.done } : item
      );

      return {
        ...w,
        prepItems: nextPrepItems,
        lifts: (w.lifts || []).map((liftBlock, liftIndex) => {
          if (liftIndex !== 0) return liftBlock;

          return {
            ...liftBlock,
            prepItems: (liftBlock.prepItems || []).map((item, i) =>
              i === index ? { ...item, done: !item.done } : item
            ),
          };
        }),
      };
    })
  );
}

function toggleWarmup(wIndex) {
  const workout = workouts[selectedIndex];
  if (shouldStartRestTimerAfterToggle(workout, 'warmup', wIndex)) {
    startTimer(restTimeSeconds, {
      workoutNumber: workout.number,
      type: 'warmup',
      index: wIndex,
    });
  }

  setWorkouts(prev =>
    prev.map((w, wi) =>
      wi !== selectedIndex
        ? w
        : {
            ...w,
            warmups: w.warmups.map((wu, i) =>
              i === wIndex ? { ...wu, done: !wu.done } : wu
            ),
          }
    )
  );
}

function hasMoreWorkAfterMainSet(workout, setIndex) {
  const sets = workout.sets || [];
  const accessories = workout.accessories || [];

  const hasMoreMainSets = sets.some((set, index) =>
    index > setIndex && !set.done && !set.skipped
  );

  const hasAccessories = accessories.some(a => (a.done || []).some(d => !d));

  return hasMoreMainSets || hasAccessories;
}

function toggleSet(setIndex) {
  const workout = workouts[selectedIndex];
  const currentSet = workout?.sets?.[setIndex];

  const shouldComplete = currentSet && !currentSet.done && !currentSet.skipped;

  if (shouldComplete) {
    if (hasMoreWorkAfterMainSet(workout, setIndex)) {
      startTimer(restTimeSeconds, {
        workoutNumber: workout.number,
        type: 'main',
        index: setIndex,
      });
    } else {
      setTimer(null);
    }
  } else {
    setTimer(null);
  }

  setWorkouts(prev =>
    prev.map((w, wi) =>
      wi !== selectedIndex
        ? w
        : {
            ...w,
            sets: w.sets.map((s, si) => {
              if (si !== setIndex) return s;

              if (s.skipped) {
                const restoredWeight = Number(s.originalWeight ?? s.failedWeight ?? s.weight) || s.weight;
                const restoredPct = Number(s.originalPct ?? getSetPctForWeight(s, restoredWeight)) || s.pct;

                return {
                  ...s,
                  weight: restoredWeight,
                  pct: restoredPct,
                  done: false,
                  failed: false,
                  skipped: false,
                  failedAttempts: 0,
                  failedWeight: null,
                  adjustedWeight: null,
                  adjustedFromFailedSet: false,
                  adjustedFromOriginal: false,
                };
              }

              if (!s.done) {
                return {
                  ...s,
                  done: true,
                  failed: false,
                };
              }

              return {
                ...s,
                done: false,
                effort: null,
              };
            }),
          }
    )
  );
}

function markSetFailed(setIndex) {
  const workout = workouts[selectedIndex];

  if (workout) {
    startTimer(restTimeSeconds, {
      workoutNumber: workout.number,
      type: 'main',
      index: setIndex,
    });
  }

  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      const failedSet = w.sets[setIndex];
      const failedAttempts = (Number(failedSet?.failedAttempts) || 0) + 1;
      const isPreMeetWorkout = w.number >= 25 && w.number <= 27;
      const isAttemptSet = isAttemptSetLabel(failedSet?.labelKey);
      const isBackoff = failedSet?.labelKey === 'backoff';
      const isZeroWeightFailure = Number(failedSet?.weight) <= 0;

      const normalAdjustedWeight = getFailedSetSuggestedWeight(failedSet?.weight);
      const attemptAdjustedWeight = getAdjustedAttemptWeight(failedSet?.weight);
      const adjustedWeight = isPreMeetWorkout && isAttemptSet
        ? attemptAdjustedWeight
        : normalAdjustedWeight;

      const isTopSet = isTopSetLabel(failedSet?.labelKey);

      const shouldSkipAttempt =
        isPreMeetWorkout &&
        isAttemptSet &&
        failedAttempts >= 2;

      const shouldSkipTopSet =
        !isPreMeetWorkout &&
        isTopSet &&
        failedAttempts >= 2;

      return {
        ...w,
        sets: w.sets.map((s, si) => {
          const shouldAdjustThisSet = si === setIndex;

          const shouldAdjustLaterAttempt =
            isPreMeetWorkout &&
            isAttemptSet &&
            si > setIndex &&
            isAttemptSetLabel(s.labelKey) &&
            !s.done &&
            !s.skipped;

          const shouldAdjustLaterBackoff =
            (
              isBackoff ||
              (!isPreMeetWorkout && isTopSet)
            ) &&
            si > setIndex &&
            s.labelKey === 'backoff' &&
            !s.done &&
            !s.skipped;

          const shouldLowerBackoffIfTooHeavy =
            isPreMeetWorkout &&
            isAttemptSet &&
            si > setIndex &&
            s.labelKey === 'backoff' &&
            !s.done &&
            !s.skipped &&
            Number(s.weight) > adjustedWeight;

          if (
            !shouldAdjustThisSet &&
            !shouldAdjustLaterAttempt &&
            !shouldAdjustLaterBackoff &&
            !shouldLowerBackoffIfTooHeavy
          ) {
            return s;
          }

          const originalWeight = Number(s.originalWeight ?? s.weight) || 0;
          const originalPct = Number(s.originalPct ?? s.pct) || 0;

          if (shouldAdjustThisSet && (isZeroWeightFailure || shouldSkipAttempt || shouldSkipTopSet)) {
            return {
              ...s,
              done: true,
              failed: false,
              skipped: true,
              failedAttempts,
              failedWeight: Number(s.failedWeight ?? s.weight) || 0,
              originalWeight,
              originalPct,
              adjustedWeight: null,
              adjustedFromFailedSet: false,
              adjustedFromOriginal: false,
            };
          }

          let nextWeight = adjustedWeight;

          if (shouldAdjustLaterAttempt) {
            nextWeight = getAdjustedAttemptWeight(s.weight);
          }

          if (shouldAdjustLaterBackoff || shouldLowerBackoffIfTooHeavy) {
            nextWeight = Math.min(Number(s.weight) || adjustedWeight, adjustedWeight);
          }

          const adjustedPct = getSetPctForWeight(
            { ...s, originalWeight, originalPct },
            nextWeight
          );

          return {
            ...s,
            done: false,
            failed: shouldAdjustThisSet,
            skipped: false,
            failedAttempts: shouldAdjustThisSet ? failedAttempts : Number(s.failedAttempts) || 0,
            failedWeight: shouldAdjustThisSet ? Number(s.failedWeight ?? s.weight) || 0 : s.failedWeight ?? null,
            weight: nextWeight,
            pct: adjustedPct || s.pct,
            originalWeight,
            originalPct,
            adjustedWeight: shouldAdjustThisSet ? nextWeight : s.adjustedWeight ?? null,
            adjustedFromFailedSet: shouldAdjustThisSet,
            adjustedFromOriginal: Number(nextWeight) !== originalWeight,
          };
        }),
      };
    })
  );
}

function restoreSetWeight(setIndex) {
  setWorkouts(prev =>
    prev.map((w, wi) =>
      wi !== selectedIndex
        ? w
        : {
            ...w,
            sets: w.sets.map((s, si) => {
              if (si !== setIndex) return s;

              const hasRestoreTarget =
                s.failed ||
                s.skipped ||
                s.adjustedFromFailedSet ||
                s.adjustedFromOriginal ||
                s.failedWeight ||
                s.adjustedWeight;

              if (!hasRestoreTarget) return s;

              const restoredWeight = Number(s.failedWeight ?? s.originalWeight ?? s.weight) || s.weight;
              const restoredPct = Number(s.originalPct ?? getSetPctForWeight(s, restoredWeight)) || s.pct;

              return {
                ...s,
                weight: restoredWeight,
                pct: restoredPct,
                done: false,
                failed: false,
                skipped: false,
                failedAttempts: 0,
                failedWeight: null,
                adjustedWeight: null,
                adjustedFromFailedSet: false,
                adjustedFromOriginal: false,
              };
            }),
          }
    )
  );
}

function restoreMeetSetWeight(liftIndex, setIndex) {
  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        lifts: (w.lifts || []).map((liftBlock, li) => {
          if (li !== liftIndex) return liftBlock;

          return {
            ...liftBlock,
            sets: (liftBlock.sets || []).map((s, si) => {
              if (si !== setIndex) return s;

              const hasRestoreTarget =
                s.failed ||
                s.skipped ||
                s.adjustedFromFailedSet ||
                s.adjustedFromOriginal ||
                s.failedWeight ||
                s.adjustedWeight;

              if (!hasRestoreTarget) return s;

              const restoredWeight = Number(s.failedWeight ?? s.originalWeight ?? s.weight) || s.weight;
              const restoredPct = Number(s.originalPct ?? getSetPctForWeight(s, restoredWeight)) || s.pct;

              return {
                ...s,
                weight: restoredWeight,
                pct: restoredPct,
                done: false,
                failed: false,
                skipped: false,
                failedAttempts: 0,
                failedWeight: null,
                adjustedWeight: null,
                adjustedFromFailedSet: false,
                adjustedFromOriginal: false,
              };
            }),
          };
        }),
      };
    })
  );
}

function toggleAccessorySet(accIndex, setIndex) {
  const workout = workouts[selectedIndex];

  if (shouldStartRestTimerAfterToggle(workout, 'accessory', setIndex, accIndex)) {
    startTimer(restTimeSeconds, {
      workoutNumber: workout.number,
      type: 'accessory',
      accIndex,
      index: setIndex,
    });
  } else {
    const currentDone = workout?.accessories?.[accIndex]?.done?.[setIndex];
    if (currentDone === false) {
      setTimer(null);
    }
  }

  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        accessories: w.accessories.map((a, ai) => {
          if (ai !== accIndex) return a;

          const isCurrentlyDone = !!a.done?.[setIndex];

          return {
            ...a,
            done: a.done.map((d, di) => (di === setIndex ? !d : d)),
            failed: (a.failed || a.done.map(() => false)).map((failed, di) =>
              di === setIndex ? false : failed
            ),
            failedWeights: (a.failedWeights || a.done.map(() => null)).map((weight, di) =>
              di === setIndex ? null : weight
            ),
            skipped: (a.skipped || a.done.map(() => false)).map((skipped, di) =>
              di === setIndex ? false : skipped
            ),
            adjustedFromFailedSet: (a.adjustedFromFailedSet || a.done.map(() => false)).map((adjusted, di) =>
              di === setIndex ? false : adjusted
            ),
            adjustedFromOriginal: (a.adjustedFromOriginal || a.done.map(() => false)).map((adjusted, di) =>
              di === setIndex && !isCurrentlyDone ? false : adjusted
            ),
          };
        }),
      };
    })
  );
}

function changeWeight(type, index, val) {
  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      if (type === 'warmup') {
        return {
          ...w,
          warmups: w.warmups.map((wu, i) => i === index ? { ...wu, weight: val } : wu),
        };
      }

      if (type === 'set') {
        return {
          ...w,
          sets: w.sets.map((s, i) => {
            if (i !== index) return s;

            const originalWeight = Number(s.originalWeight ?? s.weight) || 0;
            const originalPct = Number(s.originalPct ?? s.pct) || 0;
            const nextPct = getSetPctForWeight(
              { ...s, originalWeight, originalPct },
              val
            );

            const nextWeight = Number(val) || originalWeight;

            return {
              ...s,
              weight: nextWeight,
              pct: nextPct || s.pct,
              done: false,
              failed: false,
              skipped: false,
              failedAttempts: 0,
              failedWeight: null,
              adjustedWeight: null,
              originalWeight,
              originalPct,
              adjustedFromFailedSet: false,
              adjustedFromOriginal: Number(nextWeight) !== originalWeight,
            };
          }),
        };
      }

      return w;
    })
  );
}

function changeSetEffort(setIndex, effort) {
  setWorkouts(prev =>
    prev.map((w, wi) =>
      wi !== selectedIndex
        ? w
        : {
            ...w,
            sets: w.sets.map((s, si) =>
              si === setIndex ? { ...s, effort } : s
            ),
          }
    )
  );
}

function changeMeetSetEffort(liftIndex, setIndex, effort) {
  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        lifts: (w.lifts || []).map((liftBlock, li) => {
          if (li !== liftIndex) return liftBlock;

          return {
            ...liftBlock,
            sets: (liftBlock.sets || []).map((s, si) =>
              si === setIndex ? { ...s, effort } : s
            ),
          };
        }),
      };
    })
  );
}

function toggleMeetPrepItem(liftIndex, prepIndex) {
  setTimer(null);

  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        lifts: (w.lifts || []).map((liftBlock, li) => {
          if (li !== liftIndex) return liftBlock;

          return {
            ...liftBlock,
            prepItems: (liftBlock.prepItems || []).map((item, i) =>
              i === prepIndex ? { ...item, done: !item.done } : item
            ),
          };
        }),
      };
    })
  );
}

function hasMoreWorkAfterLiftWarmup(workout, liftIndex, warmupIndex) {
  const liftBlock = workout?.lifts?.[liftIndex];
  if (!liftBlock) return false;

  const hasLaterWarmupsInSameLift = (liftBlock.warmups || []).some((w, wi) =>
    wi > warmupIndex && !w.done
  );

  if (hasLaterWarmupsInSameLift) {
    return false;
  }

  return (liftBlock.sets || []).some(s => !s.done && !s.skipped);
}

function toggleMeetWarmup(liftIndex, warmupIndex) {
  const workout = workouts[selectedIndex];
  const currentDone = workout?.lifts?.[liftIndex]?.warmups?.[warmupIndex]?.done;

  if (currentDone === false) {
    if (hasMoreWorkAfterLiftWarmup(workout, liftIndex, warmupIndex)) {
      startTimer(restTimeSeconds, {
        workoutNumber: workout.number,
        type: 'meetWarmup',
        liftIndex,
        index: warmupIndex,
      });
    } else {
      setTimer(null);
    }
  } else {
    setTimer(null);
  }

  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        lifts: w.lifts.map((liftBlock, li) => {
          if (li !== liftIndex) return liftBlock;

          return {
            ...liftBlock,
            warmups: liftBlock.warmups.map((wu, i) =>
              i === warmupIndex ? { ...wu, done: !wu.done } : wu
            ),
          };
        }),
      };
    })
  );
}

function hasMoreMeetSets(workout, liftIndex, setIndex) {
  const liftBlock = workout?.lifts?.[liftIndex];
  if (!liftBlock) return false;

  const hasMoreSetsInSameLift = (liftBlock.sets || []).some((s, si) =>
    si > setIndex && !s.done && !s.skipped
  );

  if (hasMoreSetsInSameLift) return true;

  const hasMoreAccessories = (workout?.accessories || []).some(accessory =>
    (accessory.done || []).some(done => !done)
  );

  return hasMoreAccessories;
}

function toggleMeetSet(liftIndex, setIndex) {
  const workout = workouts[selectedIndex];
  const currentSet = workout?.lifts?.[liftIndex]?.sets?.[setIndex];
  const shouldComplete = currentSet && !currentSet.done && !currentSet.skipped;

  if (shouldComplete) {
    if (hasMoreMeetSets(workout, liftIndex, setIndex)) {
      startTimer(restTimeSeconds, {
        workoutNumber: workout.number,
        type: 'meetSet',
        liftIndex,
        index: setIndex,
      });
    } else {
      setTimer(null);
    }
  } else {
    setTimer(null);
  }

  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        lifts: w.lifts.map((liftBlock, li) => {
          if (li !== liftIndex) return liftBlock;

          return {
            ...liftBlock,
            sets: liftBlock.sets.map((s, si) => {
              if (si !== setIndex) return s;

              if (s.failed && !s.skipped) {
                return {
                  ...s,
                  done: true,
                  failed: false,
                  skipped: false,
                  adjustedWeight: null,
                  adjustedFromFailedSet: false,
                  effort: null,
                };
              }

              if (s.skipped) {
                return {
                  ...s,
                  done: false,
                  failed: false,
                  skipped: false,
                  failedAttempts: 0,
                  failedWeight: null,
                  adjustedWeight: null,
                  adjustedFromFailedSet: false,
                  adjustedFromOriginal: false,
                  effort: null,
                };
              }

              return {
                ...s,
                done: !s.done,
                failed: false,
                skipped: false,
                adjustedWeight: s.done ? null : s.adjustedWeight,
                adjustedFromFailedSet: s.done ? false : s.adjustedFromFailedSet,
                effort: s.done ? null : s.effort,
              };
            }),
          };
        }),
      };
    })
  );
}

function markMeetSetFailed(liftIndex, setIndex) {
  const workout = workouts[selectedIndex];

  if (workout && hasMoreMeetSets(workout, liftIndex, setIndex)) {
    startTimer(restTimeSeconds, {
      workoutNumber: workout.number,
      type: 'meetSet',
      liftIndex,
      index: setIndex,
    });
  } else {
    setTimer(null);
  }

  if (workout?.type !== 'meet') {
    setWorkouts(prev =>
      prev.map((w, wi) => {
        if (wi !== selectedIndex) return w;

        return {
          ...w,
          lifts: w.lifts.map((liftBlock, li) => {
            if (li !== liftIndex) return liftBlock;

            const failedSet = liftBlock.sets[setIndex];
            const failedAttempts = (Number(failedSet?.failedAttempts) || 0) + 1;
            const isPreMeetWorkout = w.number >= 25 && w.number <= 27;
            const isAttemptSet = isAttemptSetLabel(failedSet?.labelKey);
            const isBackoff = failedSet?.labelKey === 'backoff';
            const isZeroWeightFailure = Number(failedSet?.weight) <= 0;
            const isTopSet = isTopSetLabel(failedSet?.labelKey);

            const normalAdjustedWeight = getFailedSetSuggestedWeight(failedSet?.weight);
            const attemptAdjustedWeight = getAdjustedAttemptWeight(failedSet?.weight);
            const adjustedWeight = isPreMeetWorkout && isAttemptSet
              ? attemptAdjustedWeight
              : normalAdjustedWeight;

            const shouldSkipAttempt =
              isPreMeetWorkout &&
              isAttemptSet &&
              failedAttempts >= 2;

            const shouldSkipTopSet =
              !isPreMeetWorkout &&
              isTopSet &&
              failedAttempts >= 2;

            return {
              ...liftBlock,
              sets: liftBlock.sets.map((s, si) => {
                const shouldAdjustThisSet = si === setIndex;

                const shouldAdjustLaterAttempt =
                  isPreMeetWorkout &&
                  isAttemptSet &&
                  si > setIndex &&
                  isAttemptSetLabel(s.labelKey) &&
                  !s.done &&
                  !s.skipped;

                const shouldAdjustLaterBackoff =
                  (
                    isBackoff ||
                    (!isPreMeetWorkout && isTopSet)
                  ) &&
                  si > setIndex &&
                  s.labelKey === 'backoff' &&
                  !s.done &&
                  !s.skipped;

                const shouldLowerBackoffIfTooHeavy =
                  isPreMeetWorkout &&
                  isAttemptSet &&
                  si > setIndex &&
                  s.labelKey === 'backoff' &&
                  !s.done &&
                  !s.skipped &&
                  Number(s.weight) > adjustedWeight;

                if (
                  !shouldAdjustThisSet &&
                  !shouldAdjustLaterAttempt &&
                  !shouldAdjustLaterBackoff &&
                  !shouldLowerBackoffIfTooHeavy
                ) {
                  return s;
                }

                const originalWeight = Number(s.originalWeight ?? s.weight) || 0;
                const originalPct = Number(s.originalPct ?? s.pct) || 0;

                if (shouldAdjustThisSet && (isZeroWeightFailure || shouldSkipAttempt || shouldSkipTopSet)) {
                  return {
                    ...s,
                    done: true,
                    failed: false,
                    skipped: true,
                    failedAttempts,
                    failedWeight: Number(s.failedWeight ?? s.weight) || 0,
                    originalWeight,
                    originalPct,
                    adjustedWeight: null,
                    adjustedFromFailedSet: false,
                    adjustedFromOriginal: false,
                  };
                }

                let nextWeight = adjustedWeight;

                if (shouldAdjustLaterAttempt) {
                  nextWeight = getAdjustedAttemptWeight(s.weight);
                }

                if (shouldAdjustLaterBackoff || shouldLowerBackoffIfTooHeavy) {
                  nextWeight = Math.min(Number(s.weight) || adjustedWeight, adjustedWeight);
                }

                const adjustedPct = getSetPctForWeight(
                  { ...s, originalWeight, originalPct },
                  nextWeight
                );

                return {
                  ...s,
                  done: false,
                  failed: shouldAdjustThisSet,
                  skipped: false,
                  failedAttempts: shouldAdjustThisSet ? failedAttempts : Number(s.failedAttempts) || 0,
                  failedWeight: shouldAdjustThisSet ? Number(s.failedWeight ?? s.weight) || 0 : s.failedWeight ?? null,
                  weight: nextWeight,
                  pct: adjustedPct || s.pct,
                  originalWeight,
                  originalPct,
                  adjustedWeight: shouldAdjustThisSet ? nextWeight : s.adjustedWeight ?? null,
                  adjustedFromFailedSet: shouldAdjustThisSet,
                  adjustedFromOriginal: Number(nextWeight) !== originalWeight,
                };
              }),
            };
          }),
        };
      })
    );

    return;
  }

  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        lifts: w.lifts.map((liftBlock, li) => {
          if (li !== liftIndex) return liftBlock;

          return {
            ...liftBlock,
            sets: liftBlock.sets.map((s, si) =>
              si === setIndex
                ? {
                    ...s,
                    done: true,
                    failed: true,
                    skipped: true,
                  }
                : s
            ),
          };
        }),
      };
    })
  );
}

function changeMeetWeight(liftIndex, setIndex, val) {
  const workout = workouts[selectedIndex];
  const lift = workout?.lifts?.[liftIndex]?.lift;
  const key = MEET_ATTEMPT_KEYS[setIndex];
  const roundedVal = roundMeetWeight(val);

  if (workout?.type === 'meet' && lift && key) {
    setMeetPlannerAttempts(prev => ({
      ...(prev || {}),
      [lift]: {
        ...((prev || {})[lift] || {}),
        [key]: roundedVal,
      },
    }));
  }

  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        lifts: w.lifts.map((liftBlock, li) => {
          if (li !== liftIndex) return liftBlock;

          return {
            ...liftBlock,
            sets: liftBlock.sets.map((s, si) => {
              if (si !== setIndex) return s;

              const originalWeight = Number(s.originalWeight ?? s.weight) || 0;
              const originalPct = Number(s.originalPct ?? s.pct) || 0;
              const nextPct = getSetPctForWeight(
                { ...s, originalWeight, originalPct },
                roundedVal
              );

              return {
                ...s,
                weight: roundedVal,
                pct: nextPct || s.pct,
                done: false,
                failed: false,
                skipped: false,
                failedAttempts: 0,
                failedWeight: null,
                adjustedWeight: null,
                originalWeight,
                originalPct,
                adjustedFromFailedSet: false,
                adjustedFromOriginal: Number(roundedVal) !== originalWeight,
              };
            }),
          };
        }),
      };
    })
  );
}

function hasMoreWorkAfterAccessoryFailure(workout, accIndex, setIndex) {
  const accessory = workout?.accessories?.[accIndex];
  if (!accessory) return false;

  const currentWeight = Number(accessory.weights?.[setIndex]) || 0;

  // If weight can still be lowered, the same set must be retried.
  if (currentWeight > 0) return true;

  const hasLaterSetsInSameAccessory = (accessory.done || []).some((done, index) =>
    index > setIndex && !done
  );

  if (hasLaterSetsInSameAccessory) return true;

  return (workout.accessories || []).some((nextAccessory, index) =>
    index > accIndex &&
    (nextAccessory.done || []).some(done => !done)
  );
}

function markAccessorySetFailed(accIndex, setIndex) {
  const workout = workouts[selectedIndex];

  if (workout && hasMoreWorkAfterAccessoryFailure(workout, accIndex, setIndex)) {
    startTimer(restTimeSeconds, {
      workoutNumber: workout.number,
      type: 'accessory',
      accIndex,
      index: setIndex,
    });
  } else {
    setTimer(null);
  }

  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        accessories: w.accessories.map((a, ai) => {
          if (ai !== accIndex) return a;

          const currentWeight = Number(a.weights?.[setIndex]) || 0;
          const adjustedWeight = getFailedSetSuggestedWeight(currentWeight);
          const shouldSkipAccessory = currentWeight <= 0;

          return {
            ...a,
            done: a.done.map((done, i) => i === setIndex && shouldSkipAccessory ? true : done),
            skipped: (a.skipped || a.done.map(() => false)).map((skipped, i) =>
              i === setIndex ? shouldSkipAccessory : skipped
            ),
            weights: a.weights.map((weight, i) => {
              const shouldLower =
                i >= setIndex &&
                !a.done?.[i] &&
                Number(weight) >= adjustedWeight;

              return shouldSkipAccessory ? weight : shouldLower ? adjustedWeight : weight;
            }),
            originalWeights: (a.originalWeights || a.weights).map((weight, i) => weight || a.weights?.[i]),
            failed: (a.failed || a.done.map(() => false)).map((failed, i) =>
              i === setIndex ? !shouldSkipAccessory : failed
            ),
            failedWeights: (a.failedWeights || a.done.map(() => null)).map((weight, i) =>
              i === setIndex ? (shouldSkipAccessory ? null : (weight || currentWeight)) : weight
            ),
            adjustedFromFailedSet: (a.adjustedFromFailedSet || a.done.map(() => false)).map((adjusted, i) =>
              i === setIndex ? !shouldSkipAccessory : adjusted
            ),
            adjustedFromOriginal: (a.adjustedFromOriginal || a.done.map(() => false)).map((adjusted, i) =>
              i >= setIndex && !a.done?.[i] && Number(a.weights?.[i]) >= adjustedWeight ? true : adjusted
            ),
          };
        }),
      };
    })
  );
}

function restoreAccessoryWeight(accIndex, setIndex) {
  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        accessories: w.accessories.map((a, ai) => {
          if (ai !== accIndex) return a;

          const restoredWeight =
            Number(a.originalWeights?.[setIndex] || a.failedWeights?.[setIndex] || a.weights?.[setIndex]) || 0;

          return {
            ...a,
            weights: a.weights.map((weight, i) => i === setIndex ? restoredWeight : weight),
            failed: (a.failed || a.done.map(() => false)).map((failed, i) => i === setIndex ? false : failed),
            failedWeights: (a.failedWeights || a.done.map(() => null)).map((weight, i) => i === setIndex ? null : weight),
            skipped: (a.skipped || a.done.map(() => false)).map((skipped, i) => i === setIndex ? false : skipped),
            adjustedFromFailedSet: (a.adjustedFromFailedSet || a.done.map(() => false)).map((adjusted, i) => i === setIndex ? false : adjusted),
            adjustedFromOriginal: (a.adjustedFromOriginal || a.done.map(() => false)).map((adjusted, i) => i === setIndex ? false : adjusted),
          };
        }),
      };
    })
  );
}

function changeAccessoryWeight(accIndex, setIndex, val) {
  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        accessories: w.accessories.map((a, ai) => {
          if (ai !== accIndex) return a;

          const originalWeights = a.originalWeights || a.weights;

          return {
            ...a,
            originalWeights,
            weights: a.weights.map((wt, i) => i === setIndex ? val : wt),
            adjustedFromOriginal: (a.adjustedFromOriginal || a.done.map(() => false)).map((adjusted, i) =>
              i === setIndex ? Number(val) !== Number(originalWeights?.[i]) : adjusted
            ),
          };
        }),
      };
    })
  );
}

  function toggleCooldownItem(index) {
    setWorkouts(prev =>
      prev.map((w, wi) => {
        if (wi !== selectedIndex) return w;

        const cooldownItems = (w.cooldownItems && w.cooldownItems.length > 0)
          ? w.cooldownItems
          : generateCooldownItems();

        return {
          ...w,
          cooldownItems: cooldownItems.map((item, i) =>
            i === index ? { ...item, done: !item.done } : item
          ),
        };
      })
    );
  }

  function completeWorkout(workoutEffortOverride = null) {
    const baseWorkout = workouts[selectedIndex];
    const workout = workoutEffortOverride
      ? { ...baseWorkout, workoutEffort: workoutEffortOverride }
      : baseWorkout;

    if (!workout?.workoutEffort) {
      setShowWorkoutEffortPrompt(true);
      return;
    }

    setShowWorkoutEffortPrompt(false);
    setTimer(null);

    const finishedWorkout = JSON.parse(JSON.stringify(workout));
    finishedWorkout.completed = true;
    finishedWorkout.completedAt = new Date().toISOString();

    if (workout.type === 'training' && (finishedWorkout.lifts || []).length > 0) {
      const primaryLiftBlock = finishedWorkout.lifts[0];

      finishedWorkout.lift = primaryLiftBlock.lift;
      finishedWorkout.prepItems = primaryLiftBlock.prepItems || [];
      finishedWorkout.warmups = primaryLiftBlock.warmups || [];
      finishedWorkout.sets = primaryLiftBlock.sets || [];
    }

    if (workout.type === 'meet') {
  const today = new Date().toLocaleDateString('nl-NL');

  const results = (workout.lifts || []).map(liftBlock => {
    const sets = (liftBlock.sets || []).filter(s => s.done && !s.failed && !s.skipped);

    const topSet = sets.length
      ? sets.reduce(
          (best, s) =>
            epley(Number(s.weight) || 0, Number(s.reps) || 0) >
            epley(Number(best.weight) || 0, Number(best.reps) || 0)
              ? s
              : best,
          sets[0]
        )
      : null;

    const oneRMToday = sets.length
      ? Math.max(...sets.map(s => Number(s.weight) || 0))
      : 0;

    const e1RMToday = sets.length
      ? oneRMToday
      : 0;

    const previousLiftHistory = history.filter(h =>
      h.lift === liftBlock.lift &&
      !(h.cycle === currentCycle && h.workoutNumber === workout.number)
    );

    const previousBestE1RM = Math.max(
      Number(prs[liftBlock.lift]) || 0,
      ...previousLiftHistory.map(h => Number(h.e1rm) || 0)
    );

    const previousBest1RM = Math.max(
      0,
      ...previousLiftHistory.map(h => Number(h.topWeight) || 0)
    );

    return {
      lift: liftBlock.lift,
      oneRMToday,
      e1RMToday,
      previousBest1RM,
      previousBestE1RM,
      best1RM: Math.max(previousBest1RM, oneRMToday),
      bestE1RM: Math.max(previousBestE1RM, e1RMToday),
      is1RMPR: oneRMToday > previousBest1RM,
      isE1RMPR: e1RMToday > previousBestE1RM,
      topSet,
    };
  });

  const primaryResult = results[0];

  setCompletedSummary({
    type: workout.type === 'meet' ? 'meet' : 'multiTraining',
    results,
    lift: primaryResult?.lift,
    oneRMToday: primaryResult?.oneRMToday || 0,
    e1RMToday: primaryResult?.e1RMToday || 0,
    previousBest1RM: primaryResult?.previousBest1RM || 0,
    previousBestE1RM: primaryResult?.previousBestE1RM || 0,
    best1RM: primaryResult?.best1RM || 0,
    bestE1RM: primaryResult?.bestE1RM || 0,
    is1RMPR: !!primaryResult?.is1RMPR,
    isE1RMPR: !!primaryResult?.isE1RMPR,
    topSet: primaryResult?.topSet || null,
    bodyWeight: latestBodyWeight,
  });

    const withoutCurrentMeet = history.filter(
    h => h.workoutNumber !== workout.number
  );

  const newEntries = results.map(result => ({
    workoutNumber: workout.number,
    cycle: currentCycle,
    lift: result.lift,
    topWeight: result.oneRMToday,
    topReps: 1,
    e1rm: result.e1RMToday,
    date: today,
    workoutEffort: finishedWorkout.workoutEffort,
    workoutSnapshot: finishedWorkout,
  }));

  const nextHistory = [...withoutCurrentMeet, ...newEntries];

  setHistory(nextHistory);
  setPrs(calculatePrsFromHistory(nextHistory));

  setWorkouts(prev =>
    prev.map((w, wi) => wi === selectedIndex ? finishedWorkout : w)
  );

  setCompletedWorkout(finishedWorkout);
  setCompletedWorkoutIndex(selectedIndex);
  const nextWorkoutIndex = Math.min(selectedIndex + 1, workouts.length - 1);
  if (selectedIndex === currentIndex) {
    setCurrentWorkoutIndex(nextWorkoutIndex);
  }
  setSelectedIndex(nextWorkoutIndex);
  setShowNewCycle(workout.type === 'meet');
  setScreen('completed');

  return;

}
  
    if (workout.type === 'training' && (workout.lifts || []).length > 0) {
      const today = new Date().toLocaleDateString('nl-NL');

      const results = (workout.lifts || []).map(liftBlock => {
        const trackStrength = shouldTrackWorkoutStrength(liftBlock.lift, benchPressVariant);
        const sets = trackStrength
          ? (liftBlock.sets || []).filter(s => s.done && !s.failed && !s.skipped)
          : [];

        const topSet = sets.length
          ? sets.reduce(
              (best, s) =>
                epley(Number(s.weight) || 0, Number(s.reps) || 0) >
                epley(Number(best.weight) || 0, Number(best.reps) || 0)
                  ? s
                  : best,
              sets[0]
            )
          : null;

        const oneRMToday = sets.length
          ? Math.max(...sets.map(s => Number(s.weight) || 0))
          : 0;

        const e1RMToday = sets.length
          ? Math.max(...sets.map(s => epley(Number(s.weight) || 0, Number(s.reps) || 0)))
          : 0;

        const previousLiftHistory = history.filter(h =>
          h.lift === liftBlock.lift &&
          !(h.cycle === currentCycle && h.workoutNumber === workout.number)
        );

        const previousBestE1RM = Math.max(
          Number(prs[liftBlock.lift]) || 0,
          ...previousLiftHistory.map(h => Number(h.e1rm) || 0)
        );

        const previousBest1RM = Math.max(
          0,
          ...previousLiftHistory.map(h => Number(h.topWeight) || 0)
        );

        return {
          lift: liftBlock.lift,
          trackStrength,
          oneRMToday,
          e1RMToday,
          previousBest1RM,
          previousBestE1RM,
          best1RM: Math.max(previousBest1RM, oneRMToday),
          bestE1RM: Math.max(previousBestE1RM, e1RMToday),
          is1RMPR: oneRMToday > previousBest1RM,
          isE1RMPR: e1RMToday > previousBestE1RM,
          topSet,
        };
      });

      const primaryResult = results[0];

      setCompletedSummary({
        type: 'multiTraining',
        results,
        lift: primaryResult?.lift,
        oneRMToday: primaryResult?.oneRMToday || 0,
        e1RMToday: primaryResult?.e1RMToday || 0,
        previousBest1RM: primaryResult?.previousBest1RM || 0,
        previousBestE1RM: primaryResult?.previousBestE1RM || 0,
        best1RM: primaryResult?.best1RM || 0,
        bestE1RM: primaryResult?.bestE1RM || 0,
        is1RMPR: !!primaryResult?.is1RMPR,
        isE1RMPR: !!primaryResult?.isE1RMPR,
        topSet: primaryResult?.topSet || null,
        bodyWeight: latestBodyWeight,
      });

      const withoutCurrentWorkout = history.filter(
        h => !(h.cycle === currentCycle && h.workoutNumber === workout.number)
      );

      const newEntries = results.map(result => ({
        completionOnly: result.trackStrength === false,
        workoutNumber: workout.number,
        cycle: currentCycle,
        lift: result.lift,
        topWeight: result.trackStrength === false ? 0 : result.oneRMToday,
        topReps: result.trackStrength === false ? 0 : (result.topSet?.reps || 0),
        e1rm: result.trackStrength === false ? 0 : result.e1RMToday,
        date: today,
        workoutEffort: finishedWorkout.workoutEffort,
        workoutSnapshot: finishedWorkout,
      }));

      const nextHistory = [...withoutCurrentWorkout, ...newEntries];

      setHistory(nextHistory);
      setPrs(calculatePrsFromHistory(nextHistory));
    }

  
    if (workout.type === 'training' && LIFT_ORDER.includes(workout.lift) && !shouldTrackWorkoutStrength(workout.lift, benchPressVariant)) {
  setCompletedSummary(null);

  setHistory(prev => {
    const withoutCurrent = prev.filter(
      h => !(Number(h.cycle) === Number(currentCycle) && Number(h.workoutNumber) === Number(workout.number) && h.lift === workout.lift)
    );

    return [
      ...withoutCurrent,
      {
        workoutNumber: workout.number,
        cycle: currentCycle,
        lift: workout.lift,
        topWeight: 0,
        topReps: 0,
        e1rm: 0,
        date: new Date().toLocaleDateString('nl-NL'),
        workoutEffort: finishedWorkout.workoutEffort,
        workoutSnapshot: finishedWorkout,
        completionOnly: true,
      },
    ];
  });
}

if (workout.type === 'training' && LIFT_ORDER.includes(workout.lift) && shouldTrackWorkoutStrength(workout.lift, benchPressVariant)) {
    const sets = (workout.sets || []).filter(s => s.done && !s.failed && !s.skipped);

if (sets.length > 0) {

const topSet = sets.reduce(
  (best, s) => epley(s.weight, s.reps) > epley(best.weight, best.reps) ? s : best,
  sets[0]
);

const oneRMToday = sets.length
  ? Math.max(...sets.map(s => Number(s.weight) || 0))
  : 0;

const e1RMToday = sets.length
  ? Math.max(...sets.map(s => epley(Number(s.weight) || 0, Number(s.reps) || 0)))
  : 0;

const previousBestE1RM = prs[workout.lift] || 0;

const previousBest1RM = Math.max(
  0,
  ...history
    .filter(h => h.lift === workout.lift)
    .map(h => Number(h.topWeight) || 0)
);

const is1RMPR = oneRMToday > previousBest1RM;
const isE1RMPR = e1RMToday > previousBestE1RM;

const best1RM = Math.max(previousBest1RM, oneRMToday);
const bestE1RM = Math.max(previousBestE1RM, e1RMToday);

setCompletedSummary({
  lift: workout.lift,
  oneRMToday,
  e1RMToday,
  previousBest1RM,
  previousBestE1RM,
  best1RM,
  bestE1RM,
  is1RMPR,
  isE1RMPR,
  topSet,
  bodyWeight: latestBodyWeight,
});

  setPrs(prev => {
  const current = prev[workout.lift] || 0;
  return e1RMToday > current ? { ...prev, [workout.lift]: e1RMToday } : prev;
});

    setHistory(prev => {
  const existingIndex = prev.findIndex(
    h => h.workoutNumber === workout.number && h.lift === workout.lift
  );

  const newEntry = {
    workoutNumber: workout.number,
    cycle: currentCycle,
    lift: workout.lift,
    topWeight: oneRMToday,
    topReps: sets.find(s => Number(s.weight) === oneRMToday)?.reps || topSet.reps,
    e1rm: e1RMToday,
    date: new Date().toLocaleDateString('nl-NL'),
    workoutEffort: finishedWorkout.workoutEffort,
    workoutSnapshot: finishedWorkout,
  };

  if (existingIndex !== -1) {
    const updated = [...prev];
    updated[existingIndex] = newEntry;
    return updated;
  }

  return [...prev, newEntry];
});
}
}

  if (workout.accessories) {
    workout.accessories.forEach(acc => {
      const bestWeight = Math.max(...acc.weights);
      const name = acc.key || acc.name;

      setAccessoryPRs(prev => {
        const current = prev[name] || 0;
        return bestWeight > current ? { ...prev, [name]: bestWeight } : prev;
      });
    });
  }

  setWorkouts(prev =>
    prev.map((w, wi) => wi === selectedIndex ? finishedWorkout : w)
  );

  setCompletedWorkout(finishedWorkout);
  setCompletedWorkoutIndex(selectedIndex);

  const nextWorkoutIndex = Math.min(selectedIndex + 1, workouts.length - 1);
  if (selectedIndex === currentIndex) {
    setCurrentWorkoutIndex(nextWorkoutIndex);
  }
  setSelectedIndex(nextWorkoutIndex);

  setScreen('completed');
}

if (screen === null) {
  return (
    <div style={{
      minHeight: '100vh',
      background: THEME.bg
    }} />
  );
}

if (screen === 'onboarding') return <Onboarding onStart={handleStart} t={t}/>;

if (screen !== 'onboarding' && !workouts.length) {
  return <Onboarding onStart={handleStart} t={t}/>;
}

function activateSelectedWorkout() {
  if (selectedIndex <= currentIndex) return;

  setCurrentWorkoutIndex(selectedIndex);
  setSelectedIndex(selectedIndex);
}

if (screen === 'current' && !workouts[selectedIndex]) {
  return <Onboarding onStart={handleStart} t={t}/>;
}

function saveBodyWeight(data) {
  const today = new Date().toLocaleDateString('nl-NL');

  const bodyData = {
    bodyWeight: data.bodyWeight || null,
    bodyFat: data.bodyFat || null,
    bodyWater: data.bodyWater || null,
    visceralFat: data.visceralFat || null,
    leanMass: data.leanMass || null,
    physiqueRating: data.physiqueRating || null,
    boneMass: data.boneMass || null,
    bmr: data.bmr || null,
  };

  const hasAnyValue = Object.values(bodyData).some(value => value !== null);
  if (!hasAnyValue) return;

  setBodyWeights(prev => [
    ...prev.filter(entry => entry.date !== today),
    {
      workoutNumber: currentIndex,
      cycle: currentCycle,
      date: today,
      timestamp: new Date().toISOString(),
      ...bodyData,
    },
  ]);
}

function changeScreen(nextScreen) {
  if (nextScreen === 'current') {
    const safeIndex = Math.min(currentIndex, workouts.length - 1);
    setSelectedIndex(Math.max(0, safeIndex));
  }

  setScreen(nextScreen);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function latestManualMax(lift) {
  return [...history]
    .reverse()
    .find(entry => entry?.lift === lift && entry?.manualMax);
}

const best1RMs = {
  Squat: latestManualMax('Squat')?.topWeight || Math.max(
    0,
    ...history.filter(h => h.lift === 'Squat').map(h => h.topWeight || 0)
  ),
  Bench: latestManualMax('Bench')?.topWeight || Math.max(
    0,
    ...history.filter(h => h.lift === 'Bench').map(h => h.topWeight || 0)
  ),
  Deadlift: latestManualMax('Deadlift')?.topWeight || Math.max(
    0,
    ...history.filter(h => h.lift === 'Deadlift').map(h => h.topWeight || 0)
  ),
};

const bestE1RMs = {
  Squat: latestManualMax('Squat')?.e1rm || Math.max(prs.Squat || 0, ...history.filter(h => h.lift === 'Squat').map(h => h.e1rm || 0)),
  Bench: latestManualMax('Bench')?.e1rm || Math.max(prs.Bench || 0, ...history.filter(h => h.lift === 'Bench').map(h => h.e1rm || 0)),
  Deadlift: latestManualMax('Deadlift')?.e1rm || Math.max(prs.Deadlift || 0, ...history.filter(h => h.lift === 'Deadlift').map(h => h.e1rm || 0)),
};

const total1RM = best1RMs.Squat + best1RMs.Bench + best1RMs.Deadlift;
const totalE1RM = bestE1RMs.Squat + bestE1RMs.Bench + bestE1RMs.Deadlift;

const latestBodyDataEntry = [...bodyWeights].slice(-1)[0];
const latestBodyWeightEntry = [...bodyWeights].filter(entry => entry.bodyWeight).slice(-1)[0];
const latestBodyWeight = latestBodyWeightEntry?.bodyWeight || null;

const strengthRatio = latestBodyWeight
  ? Math.round((total1RM / latestBodyWeight) * 100) / 100
  : null;

const eStrengthRatio = latestBodyWeight
  ? Math.round((totalE1RM / latestBodyWeight) * 100) / 100
  : null;

function bodyMetricValue(value, suffix = '') {
  if (!value) return null;
  return suffix ? `${value} ${suffix}` : `${value}`;
}

function calculateAge(birthDate) {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
}

function makeStatus(label, color, symbol = '•') {
  return { label, color, symbol };
}

function bodyFatStatus(value) {
  if (!value || !userProfile?.birthDate || !userProfile?.sex) return null;

  const age = calculateAge(userProfile.birthDate);
  const sex = userProfile.sex;

  if (!age || age < 18 || age > 99 || !['male', 'female'].includes(sex)) return null;

  const ranges = {
    male: [
      { minAge: 18, maxAge: 39, healthyMin: 8, healthyMax: 20, overfatMax: 25 },
      { minAge: 40, maxAge: 59, healthyMin: 11, healthyMax: 22, overfatMax: 28 },
      { minAge: 60, maxAge: 99, healthyMin: 13, healthyMax: 25, overfatMax: 30 },
    ],
    female: [
      { minAge: 18, maxAge: 39, healthyMin: 21, healthyMax: 33, overfatMax: 39 },
      { minAge: 40, maxAge: 59, healthyMin: 23, healthyMax: 34, overfatMax: 40 },
      { minAge: 60, maxAge: 99, healthyMin: 24, healthyMax: 36, overfatMax: 41 },
    ],
  };

  const range = ranges[sex].find(r => age >= r.minAge && age <= r.maxAge);
  if (!range) return null;

  if (value < range.healthyMin) return makeStatus(t.bodyMetricUnderfat, THEME.primary, '');
  if (value <= range.healthyMax) return makeStatus(t.bodyMetricHealthy, THEME.yellow, '');
  if (value <= range.overfatMax) return makeStatus(t.bodyMetricOverfat, THEME.primary, '');
  return makeStatus(t.bodyMetricObese, THEME.red, '');
}

function bodyWaterStatus(value) {
  if (!value || !userProfile?.sex) return null;

  if (userProfile.sex === 'male' && value >= 50 && value <= 65) {
    return makeStatus(t.bodyMetricHealthy, THEME.yellow, '');
  }

  if (userProfile.sex === 'female' && value >= 45 && value <= 60) {
    return makeStatus(t.bodyMetricHealthy, THEME.yellow, '');
  }

  return null;
}

function visceralFatStatus(value) {
  if (!value) return null;

  if (value >= 1 && value <= 12) {
    return makeStatus(t.bodyMetricNormal, THEME.yellow, '');
  }

  if (value >= 13) {
    return makeStatus(t.bodyMetricExcessive, THEME.red, '');
  }

  return null;
}

function physiqueStatus(value) {
  if (!value) return null;

  const key = `physique${Math.round(value)}`;
  if (!t[key]) return null;

  return makeStatus(t[key], THEME.primary, '');
}

function boneMassAverage(bodyWeight, sex) {
  if (!bodyWeight || !['male', 'female'].includes(sex)) return null;

  if (sex === 'female') {
    if (bodyWeight < 50) return 1.95;
    if (bodyWeight < 75) return 2.4;
    return 2.95;
  }

  if (bodyWeight < 65) return 2.66;
  if (bodyWeight < 95) return 3.29;
  return 3.69;
}

function boneMassStatus(value) {
  if (!value || !latestBodyDataEntry?.bodyWeight || !userProfile?.sex) return null;

  const average = boneMassAverage(latestBodyDataEntry.bodyWeight, userProfile.sex);
  if (!average) return null;

  const diff = Math.round((value - average) * 10) / 10;

  if (Math.abs(diff) < 0.1) {
    return makeStatus(t.bodyMetricAverage, THEME.yellow, '');
  }

  if (diff > 0) {
    return makeStatus(t.bodyMetricAboveAverage, THEME.yellow, '');
  }

  return makeStatus(t.bodyMetricBelowAverage, THEME.red, '');
}

const latestBodyDataRows = [
  {
    key: 'bodyWeight',
    label: t.bodyweight,
    value: latestBodyDataEntry?.bodyWeight ? formatWeightFromKg(latestBodyDataEntry.bodyWeight, weightUnit, { body: true }) : null,
  },
  {
    key: 'bodyFat',
    label: t.bodyFatPercent,
    value: bodyMetricValue(latestBodyDataEntry?.bodyFat, '%'),
    status: bodyFatStatus(latestBodyDataEntry?.bodyFat),
  },
  {
    key: 'bodyWater',
    label: t.bodyWaterPercent,
    value: bodyMetricValue(latestBodyDataEntry?.bodyWater, '%'),
    status: bodyWaterStatus(latestBodyDataEntry?.bodyWater),
  },
  {
    key: 'leanMass',
    label: t.leanMassKg,
    value: latestBodyDataEntry?.leanMass ? formatWeightFromKg(latestBodyDataEntry.leanMass, weightUnit, { body: true }) : null,
  },
  {
    key: 'visceralFat',
    label: t.visceralFatRating,
    value: bodyMetricValue(latestBodyDataEntry?.visceralFat),
    status: visceralFatStatus(latestBodyDataEntry?.visceralFat),
  },
  {
    key: 'physiqueRating',
    label: t.physiqueRating,
    value: bodyMetricValue(latestBodyDataEntry?.physiqueRating),
    status: physiqueStatus(latestBodyDataEntry?.physiqueRating),
  },
  {
    key: 'boneMass',
    label: t.boneMassKg,
    value: latestBodyDataEntry?.boneMass ? formatWeightFromKg(latestBodyDataEntry.boneMass, weightUnit, { body: true }) : null,
    status: boneMassStatus(latestBodyDataEntry?.boneMass),
  },
  {
    key: 'bmr',
    label: t.bmrKcal,
    value: bodyMetricValue(latestBodyDataEntry?.bmr, 'kcal'),
  },
].filter(row => row.value);

    return (
  <div style={{
    paddingBottom: 70,
    background: THEME.bg,
    minHeight: '100vh',
    color: THEME.text
  }}>
      {screen === 'current' && (
        <CurrentWorkout
          workout={workouts[selectedIndex]}
          currentCycle={currentCycle}
          totalWorkouts={workouts.length}
          isReadOnly={selectedIndex > currentIndex}
          onTogglePrepItem={togglePrepItem}
          onToggleWarmup={toggleWarmup}
          onToggleSet={toggleSet}
          onMarkSetFailed={markSetFailed}
          onRestoreSetWeight={restoreSetWeight}
          onToggleAccessorySet={toggleAccessorySet}
          onMarkAccessorySetFailed={markAccessorySetFailed}
          onRestoreAccessoryWeight={restoreAccessoryWeight}
          onToggleCooldownItem={toggleCooldownItem}
          onWeightChange={changeWeight}
          onSetEffortChange={changeSetEffort}
          onAccessoryWeightChange={changeAccessoryWeight}
          onComplete={completeWorkout}
          onViewAll={() => setScreen('all')}
          onActivateWorkout={activateSelectedWorkout}
          showNewCycle={showNewCycle}
          newCyclePRs={prs}
          onStartNewCycle={handleStartNewCycle}
          t={t}
          weightUnit={weightUnit}
          benchPressVariant={benchPressVariant}
          timer={timer}
          setTimer={setTimer}
          onToggleMeetPrepItem={toggleMeetPrepItem}
          onToggleMeetWarmup={toggleMeetWarmup}
          onToggleMeetSet={toggleMeetSet}
          onMarkMeetSetFailed={markMeetSetFailed}
          onRestoreMeetSetWeight={restoreMeetSetWeight}
          onMeetWeightChange={changeMeetWeight}
          onMeetSetEffortChange={changeMeetSetEffort}
        />
      )}

      {screen === 'dashboard' && (
  <div style={{ maxWidth: 500, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
    <AppHeader
      t={t}
      title={t.dashboard}
      subtitle={`${t.cycle} ${currentCycle} · ${t.workoutProgress} ${Math.min(currentIndex + 1, workouts.length)} / ${workouts.length}`}
    />

    {workouts[currentIndex] && (
      <div style={{
        background: THEME.card,
        border: `1px solid ${THEME.border}`,
        borderRadius: 10,
        padding: 14,
        marginBottom: 12,
        textAlign: 'center'
      }}>
        <div style={{
          color: THEME.primary,
          fontSize: 14,
          fontWeight: 900,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginBottom: 6
        }}>
          {t.nextWorkout} · W{workouts[currentIndex].number}
        </div>

        <div style={{
          color: THEME.text,
          fontSize: 22,
          fontWeight: 900
        }}>
          {getWorkoutTitle(workouts[currentIndex], t, benchPressVariant)}
        </div>
      </div>
    )}
    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 18, marginBottom: 12 }}>
      {[
        [t.squat, THEME.red, best1RMs.Squat, bestE1RMs.Squat],
        [t.bench, THEME.primary, best1RMs.Bench, bestE1RMs.Bench],
        [t.deadlift, THEME.yellow, best1RMs.Deadlift, bestE1RMs.Deadlift],
      ].map(([lift, color, oneRM, e1RM]) => (
        <div key={lift} style={{ marginBottom: lift === t.deadlift ? 0 : 14 }}>
          <div style={{ marginBottom: 6 }}>
            <strong style={{ color, fontSize: 18 }}>{lift}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: THEME.text, fontWeight: 700, fontSize: 15 }}>{t.oneRM}:</span>
            <strong style={{ fontSize: 15 }}>{oneRM ? formatWeightFromKg(oneRM, weightUnit) : '—'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: THEME.text, fontWeight: 700, fontSize: 15 }}>{t.e1RM}:</span>
            <strong style={{ fontSize: 15 }}>{e1RM ? formatWeightFromKg(e1RM, weightUnit) : '—'}</strong>
          </div>
        </div>
      ))}
    </div>

    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 18, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: THEME.text, fontWeight: 700, fontSize: 15 }}>{t.total1rm}</span>
        <strong style={{ color: '#ffffff', fontSize: 15 }}>{total1RM ? formatWeightFromKg(total1RM, weightUnit) : '—'}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: THEME.text, fontWeight: 700, fontSize: 15 }}>{t.totalE1rm}</span>
        <strong style={{ color: '#ffffff', fontSize: 15 }}>{totalE1RM ? formatWeightFromKg(totalE1RM, weightUnit) : '—'}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: THEME.text, fontWeight: 700, fontSize: 15 }}>{t.strength}</span>
        <strong style={{ color: '#ffffff', fontSize: 15 }}>{strengthRatio || '—'}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: THEME.text, fontWeight: 700, fontSize: 15 }}>{t.eStrength}</span>
        <strong style={{ color: '#ffffff', fontSize: 15 }}>{eStrengthRatio || '—'}</strong>
      </div>
    </div>

    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16 }}>
      {latestBodyDataRows.length > 0 ? (
        latestBodyDataRows.map((row, index) => (
          <div
            key={row.key}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 70px 150px',
              alignItems: 'center',
              columnGap: 8,
              marginBottom: index === latestBodyDataRows.length - 1 ? 0 : 10
            }}
          >
            <span style={{ color: THEME.text, fontWeight: 700, fontSize: 15 }}>
              {row.label}:
            </span>

            <strong style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 70, fontSize: 15 }}>
              {row.value}
            </strong>

            <span style={{ minWidth: 160, textAlign: 'right' }}>
              {row.status && (
                <span style={{
                  color: row.status.color,
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: 'nowrap'
                }}>
                  {row.status.label}
                </span>
              )}
            </span>
          </div>
        ))
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: THEME.text, fontWeight: 700 }}>{t.bodyweight}</span>
          <strong>—</strong>
        </div>
      )}
    </div>
  </div>
)}

      {screen === 'all' && (
        <AllWorkouts
          workouts={workouts}
          currentIndex={currentIndex}
          completedWorkoutCount={completedWorkoutCount}
          completedWorkoutNumbers={completedWorkoutNumbers}
          currentCycle={currentCycle}
          onSelect={(idx) => {
            setSelectedIndex(idx);
            setScreen('current');
          }}
          onBack={() => setScreen('current')}
          onStats={() => setScreen('stats')}
          onStartNewCycle={handleStartNewCycle}
          t={t}
          weightUnit={weightUnit}
          benchPressVariant={benchPressVariant}
        />
      )}

      {screen === 'stats' && (
        <StatsScreen
          history={history}
          bodyWeights={bodyWeights}
          currentCycle={currentCycle}
          currentIndex={currentIndex}
          totalWorkouts={workouts.length}
          meetPlannerAttempts={meetPlannerAttempts}
          setMeetPlannerAttempts={updateMeetPlannerAttempts}
          onBack={() => setScreen('all')}
          t={t}
          weightUnit={weightUnit}
          best1RMs={best1RMs}
          bestE1RMs={bestE1RMs}
          benchPressVariant={benchPressVariant}
        />
)}

      {screen === 'settings' && (
       <div style={{ maxWidth: 500, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
  <AppHeader
    t={t}
    title={t.settings}
    meta={`${t.appName} · ${process.env.REACT_APP_VERSION ? `v${process.env.REACT_APP_VERSION}` : 'dev'}`}
  />

  <div style={{
    background: THEME.card,
    border: `1px solid ${THEME.border}`,
    borderRadius: 8,
    padding: '5px 14px',
    marginBottom: 10
  }}>
    <ProfileSection
      userProfile={userProfile}
      onSave={setUserProfile}
      weightUnit={weightUnit}
      setWeightUnit={setWeightUnit}
      t={t}
    />

    <MaxesSection
      best1RMs={best1RMs}
      bestE1RMs={bestE1RMs}
      prs={prs}
      onSaveMaxes={handleSaveMaxes}
      t={t}
      weightUnit={weightUnit}
    />

    <BodyDataSection
      bodyData={latestBodyDataEntry}
      onSave={saveBodyWeight}
      t={t}
      weightUnit={weightUnit}
    />

    <RestTimeSection
      restTimeSeconds={restTimeSeconds}
      setRestTimeSeconds={setRestTimeSeconds}
      t={t}
    />

    <WorkoutSection
      preparationMode={preparationMode}
      setPreparationMode={setPreparationMode}
      accessoryMode={accessoryMode}
      setAccessoryMode={setAccessoryMode}
      benchPressVariant={benchPressVariant}
      setBenchPressVariant={setBenchPressVariant}
      t={t}
    />

    <LanguageSection
      language={language}
      setLanguage={setLanguage}
      t={t}
    />

    <DataSection
      meetPrepChecklist={meetPrepChecklist}
      setMeetPrepChecklist={setMeetPrepChecklist}
      t={t}
    />

    <SupportSection t={t} />

    <SettingsListRow
      label={t.restart}
      actionLabel={t.startFromScratch || t.restart}
      onAction={() => setShowResetConfirm(true)}
      danger={true}
      noBorder={true}
    />

  </div>

</div>
      )}      
    {screen === 'completed' && (
  <div style={{
    maxWidth: 500,
    margin: '0 auto',
    padding: 24,
    minHeight: '100vh',
    background: THEME.bg,
    color: THEME.text,
    fontFamily: 'sans-serif'
  }}>
    {completedWorkout?.type === 'meet' ? (
      <div style={{
        background: THEME.card,
        border: `1px solid ${THEME.border}`,
        borderRadius: 12,
        padding: 24,
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>

        <h2 style={{ margin: '0 0 8px', color: THEME.text }}>
          {t.workoutAndCycleCompleted}
        </h2>

        <p style={{ color: THEME.muted, margin: '0 0 16px' }}>
          {t.workoutAndCycleSaved}
        </p>

        {getCompletedWorkoutSuggestions(completedWorkout, t, 'standard').length > 0 && (
          <div style={{
            margin: '0 auto 16px',
            padding: '12px 14px',
            borderRadius: 10,
            border: `1px solid ${THEME.primary}`,
            background: THEME.bg,
            textAlign: 'left'
          }}>
            <div style={{
              color: THEME.primary,
              fontSize: 13,
              fontWeight: 900,
              marginBottom: 7
            }}>
              {t.kelaniSuggestion || 'Kelani suggestion'}
            </div>

            <div style={{ display: 'grid', gap: 7 }}>
              {getCompletedWorkoutSuggestions(completedWorkout, t, 'standard').map((suggestion, index) => (
                <div
                  key={`meet-suggestion-${index}`}
                  style={{
                    color: THEME.text,
                    fontSize: 14,
                    fontWeight: 800,
                    lineHeight: 1.4
                  }}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          </div>
        )}

        {(() => {
          const achievedLiftResults = (completedWorkout?.lifts || []).map(liftBlock => {
            const successfulSets = (liftBlock.sets || []).filter(set =>
              set.done && !set.failed && !set.skipped
            );

            const bestSet = successfulSets.reduce((best, set) => {
              if (!best) return set;
              return Number(set.weight) > Number(best.weight) ? set : best;
            }, null);

            return {
              lift: liftBlock.lift,
              weight: Number(bestSet?.weight) || 0,
            };
          });

          const achievedTotal = achievedLiftResults.reduce(
            (total, result) => total + result.weight,
            0
          );

          return (
            <div style={{
              background: THEME.bg,
              border: `1px solid ${THEME.primary}`,
              color: THEME.text,
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
              textAlign: 'center'
            }}>
              <div style={{
                color: THEME.muted,
                fontSize: 13,
                fontWeight: 800,
                marginBottom: 4
              }}>
                {t.achievedTotal || t.total}
              </div>

              <div style={{
                color: THEME.primary,
                fontSize: 28,
                fontWeight: 900,
                lineHeight: 1,
                marginBottom: 12
              }}>
                {achievedTotal ? formatWeightFromKg(achievedTotal, weightUnit) : '—'}
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 8
              }}>
                {achievedLiftResults.map(result => (
                  <div
                    key={`achieved-${result.lift}`}
                    style={{
                      padding: '8px 6px',
                      borderRadius: 8,
                      border: `1px solid ${THEME.border}`,
                      background: THEME.card
                    }}
                  >
                    <div style={{
                      color: THEME.muted,
                      fontSize: 11,
                      fontWeight: 800,
                      marginBottom: 3
                    }}>
                      {liftLabel(result.lift, t)}
                    </div>
                    <div style={{
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: 900
                    }}>
                      {result.weight ? formatWeightFromKg(result.weight, weightUnit) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div style={{
          background: THEME.card,
          border: `1px solid ${THEME.border}`,
          color: THEME.text,
          borderRadius: 8,
          padding: 14,
          marginBottom: 16,
          textAlign: 'left'
        }}>
          <div style={{
            color: THEME.primary,
            fontWeight: 900,
            marginBottom: 8,
            textAlign: 'center'
          }}>
            {t.cycleCompleted}
          </div>

          <div style={{
            color: THEME.muted,
            fontSize: 13,
            lineHeight: 1.4,
            marginBottom: 10,
            textAlign: 'center'
          }}>
            {t.cycleNewE1RMs}
          </div>

          {(completedSummary?.results || []).map(result => (
            <div
              key={result.lift}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}
            >
              <span style={{ color: THEME.text, fontWeight: 700 }}>
                {liftLabel(result.lift, t)} {t.e1RM}
              </span>
              <strong style={{ color: '#ffffff', whiteSpace: 'nowrap' }}>
                {formatWeightFromKg(result.bestE1RM, weightUnit)}
              </strong>
            </div>
          ))}
        </div>

        <div style={{
          background: THEME.card,
          border: `1px solid ${THEME.border}`,
          color: THEME.text,
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          textAlign: 'left'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ color: THEME.text, fontWeight: 700 }}>{t.lift}</span>
            <strong>{completedWorkout?.lift || 'SBD'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ color: THEME.text, fontWeight: 700 }}>{t.workout}</span>
            <strong>{completedWorkout?.number || '—'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ color: THEME.text, fontWeight: 700 }}>{t.cycle}</span>
            <strong>{currentCycle}</strong>
          </div>

          <div style={{
            fontSize: 16,
            fontWeight: 900,
            color: THEME.primary,
            marginBottom: 10,
            textAlign: 'center'
          }}>
            {t.meetAttemptsCompleted}
          </div>

          {(completedWorkout?.lifts || []).map(liftBlock => (
            <div key={liftBlock.lift} style={{ marginBottom: 14 }}>
              <div style={{
                color: THEME.primary,
                fontWeight: 900,
                marginBottom: 6
              }}>
                {workoutLiftLabel(liftBlock.lift, t, benchPressVariant)}
              </div>

              {(liftBlock.sets || []).map((set, i) => {
                const setLabel = set.labelKey ? t[set.labelKey] : `${t.set} ${i + 1}`;
                const isInvalidSet = set.failed || set.skipped || !set.done;

                return (
                  <div
                    key={`${liftBlock.lift}-${i}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '8px 10px',
                      color: '#ffffff',
                      opacity: isInvalidSet ? 0.8 : 1,
                      borderLeft: isInvalidSet ? '3px solid #e74c3c' : '3px solid transparent'
                    }}
                  >
                    <span style={{ color: '#ffffff', fontWeight: 700 }}>
                      {isInvalidSet ? '✕ ' : '✓ '}
                      {setLabel}
                    </span>

                    <strong style={{ color: isInvalidSet ? '#e74c3c' : '#ffffff', whiteSpace: 'nowrap' }}>
                      {formatWeightFromKg(set.weight, weightUnit)}
                    </strong>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <button
          onClick={handleStartNewCycle}
          style={{
            width: '100%',
            padding: 14,
            fontSize: 16,
            fontWeight: 800,
            background: THEME.primary,
            color: '#ffffff',
            border: `1px solid ${THEME.primary}`,
            borderRadius: 8,
            cursor: 'pointer',
            marginBottom: 10
          }}
        >
          {t.startNewCycle} 🚀
        </button>

        <button
          onClick={() => setScreen('stats')}
          style={{
            width: '100%',
            padding: 14,
            fontSize: 16,
            fontWeight: 600,
            background: 'transparent',
            color: '#ffffff',
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            cursor: 'pointer',
            marginBottom: 10
          }}
        >
          {t.viewProgress}
        </button>

        <button
          onClick={() => {
            const targetIndex = Number.isInteger(completedWorkoutIndex)
              ? completedWorkoutIndex
              : Math.max(0, (completedWorkout?.number || 1) - 1);

            setSelectedIndex(targetIndex);
            setScreen('current');
          }}
          style={{
            width: '100%',
            padding: 14,
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 0,
            background: 'transparent',
            color: '#ffffff',
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          {t.backToWorkout}
        </button>
      </div>
    ) : (
      <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>

        <h2 style={{ margin: '0 0 8px', color: THEME.text }}>{t.workoutCompleted}</h2>

        <p style={{ color: THEME.muted, margin: '0 0 12px' }}>
          {t.goodJobSaved}
        </p>

        {(completedWorkout?.lifts || []).length > 0 && (() => {
          const liftNames = (completedWorkout.lifts || [])
            .map(liftBlock => workoutLiftLabel(liftBlock.lift, t, benchPressVariant))
            .filter(Boolean)
            .join(' + ');

          const effortLabel = getWorkoutEffortLabel(completedWorkout?.workoutEffort, t);

          const summaryRow = (label, value) => (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 10
            }}>
              <span style={{ color: THEME.text, fontWeight: 700 }}>{label}</span>
              <strong style={{ color: '#ffffff', textAlign: 'right' }}>{value}</strong>
            </div>
          );

          return (
            <div style={{
              background: THEME.card,
              border: `1px solid ${THEME.border}`,
              color: THEME.text,
              borderRadius: 8,
              padding: 12,
              marginBottom: 10,
              textAlign: 'left'
            }}>
              {summaryRow(t.lifts || t.lift, liftNames || '—')}
              {summaryRow(t.workout, completedWorkout?.number || '—')}
              {summaryRow(t.cycle, currentCycle)}
              {summaryRow(t.workoutEffortWas, effortLabel || '—')}
            </div>
          );
        })()}


        {(completedWorkout?.lifts || []).length === 0 && getWorkoutEffortText(completedWorkout?.workoutEffort, t) && (
          <div style={{
            margin: '0 auto 16px',
            padding: '10px 14px',
            borderRadius: 10,
            border: `1px solid ${THEME.border}`,
            background: THEME.bg,
            maxWidth: 260,
            textAlign: 'center'
          }}>
            <div style={{
              color: THEME.muted,
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 3
            }}>
              {t.workoutEffort}
            </div>

            <div style={{
              color: THEME.primary,
              fontSize: 18,
              fontWeight: 900,
              lineHeight: 1.1
            }}>
              {getWorkoutEffortText(completedWorkout.workoutEffort, t)}
            </div>
          </div>
        )}

        {getCompletedWorkoutSuggestions(completedWorkout, t, benchPressVariant).length > 0 && (
          <div style={{
            margin: '0 auto 16px',
            padding: '12px 14px',
            borderRadius: 10,
            border: `1px solid ${THEME.primary}`,
            background: THEME.bg,
            textAlign: 'left'
          }}>
            <div style={{
              color: THEME.primary,
              fontSize: 13,
              fontWeight: 900,
              marginBottom: 7
            }}>
              {t.kelaniSuggestion || 'Kelani suggestion'}
            </div>

            <div style={{
              display: 'grid',
              gap: 7
            }}>
              {getCompletedWorkoutSuggestions(completedWorkout, t, benchPressVariant).map((suggestion, index) => (
                <div
                  key={`completed-suggestion-${index}`}
                  style={{
                    color: THEME.text,
                    fontSize: 14,
                    fontWeight: 800,
                    lineHeight: 1.4
                  }}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{
          background: THEME.card,
          border: `1px solid ${THEME.border}`,
          color: THEME.text,
          borderRadius: 8,
          padding: 12,
          marginBottom: 20,
          textAlign: 'left'
        }}>
          <div style={{
            color: ({
              Squat: THEME.red,
              Bench: THEME.primary,
              Deadlift: THEME.yellow,
            }[completedSummary?.results?.[0]?.lift || completedWorkout?.lift] || THEME.primary),
            fontSize: 16,
            fontWeight: 900,
            marginBottom: 10,
            textAlign: 'center'
          }}>
            {liftLabel(completedSummary?.results?.[0]?.lift || completedWorkout?.lift, t)} · 1RM / e1RM
          </div>

          {(() => {
            const row = (label, value, isPR) => (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: THEME.text, fontWeight: 700 }}>{label}</span>
                <strong style={{ color: '#ffffff' }}>
                  {formatWeightFromKg(value, weightUnit)} {isPR ? '🚀' : ''}
                </strong>
              </div>
            );

            const primaryResult = completedSummary?.type === 'multiTraining'
              ? completedSummary.results?.[0]
              : null;

            const sets = (completedWorkout?.sets || []).filter(s => s.done && !s.failed && !s.skipped);

            const calculatedOneRMToday = sets.length
              ? Math.max(...sets.map(s => Number(s.weight) || 0))
              : 0;

            const calculatedE1RMToday = sets.length
              ? Math.max(...sets.map(s => epley(Number(s.weight) || 0, Number(s.reps) || 0)))
              : 0;

            const oneRMToday = primaryResult?.oneRMToday ?? calculatedOneRMToday;
            const e1RMToday = primaryResult?.e1RMToday ?? calculatedE1RMToday;

            const primaryLift = primaryResult?.lift || completedWorkout?.lift;

            const previousBest1RM = Number(best1RMs?.[primaryLift]) || 0;
            const previousBestE1RM = Number(bestE1RMs?.[primaryLift]) || Number(prs?.[primaryLift]) || 0;

            const best1RM = Math.max(previousBest1RM, oneRMToday || 0);
            const bestE1RM = Math.max(previousBestE1RM, e1RMToday || 0);

            const is1RMPR = oneRMToday > previousBest1RM && oneRMToday > 0;
            const isE1RMPR = e1RMToday > previousBestE1RM && e1RMToday > 0;

            return (
              <>
                {row(t.oneRMToday, oneRMToday, is1RMPR)}
                {row(t.e1RMToday, e1RMToday, isE1RMPR)}
                {row(t.best1RM, best1RM, is1RMPR)}
                {row(t.bestE1RM, bestE1RM, isE1RMPR)}
              </>
            );
          })()}
        </div>

        {/* FORCE_MULTI_LIFT_COMPLETED_SETS_START */}
        {(completedWorkout?.lifts || []).length > 0 && (
          <div style={{
            background: THEME.card,
            border: `1px solid ${THEME.border}`,
            color: THEME.text,
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
            textAlign: 'left'
          }}>
            {(completedWorkout.lifts || []).map((liftBlock, liftIndex) => (
              <div
                key={`force-completed-lift-${liftBlock.lift}`}
                style={{
                  marginTop: liftIndex === 0 ? 0 : 16,
                  paddingTop: liftIndex === 0 ? 0 : 14,
                  borderTop: liftIndex === 0 ? 'none' : `1px solid ${THEME.border}`
                }}
              >
                <div style={{
                  color: ({
                    Squat: THEME.red,
                    Bench: THEME.primary,
                    Deadlift: THEME.yellow,
                  }[liftBlock.lift] || THEME.primary),
                  fontSize: 16,
                  fontWeight: 900,
                  marginBottom: 8
                }}>
                  {workoutLiftLabel(liftBlock.lift, t, benchPressVariant)}
                </div>

                {(liftBlock.sets || []).map((set, i) => {
                  const setLabel = set.labelKey ? t[set.labelKey] : set.label || `${t.set} ${i + 1}`;
                  const isInvalidSet = set.failed || set.skipped || !set.done;
                  const effortLabel = getSetEffortLabel(set.effort, t);

                  return (
                    <div
                      key={`force-${liftBlock.lift}-${i}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 12,
                        padding: '7px 0',
                        borderTop: i === 0 ? 'none' : `1px solid ${THEME.border}`,
                        opacity: isInvalidSet ? 0.75 : 1
                      }}
                    >
                      <div>
                        <div style={{ color: THEME.text, fontWeight: 800 }}>
                          {isInvalidSet ? '✕ ' : '✓ '}
                          {setLabel}
                        </div>

                        <div style={{
                          color: THEME.muted,
                          fontSize: 12,
                          fontWeight: 700,
                          marginTop: 2
                        }}>
                          {set.reps} {t.reps}
                          {effortLabel ? ` · ${effortLabel}` : ''}
                        </div>
                      </div>

                      <strong style={{
                        color: isInvalidSet ? '#e74c3c' : '#ffffff',
                        whiteSpace: 'nowrap'
                      }}>
                        {formatWeightFromKg(set.weight, weightUnit)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {/* FORCE_MULTI_LIFT_COMPLETED_SETS_END */}

        <button
          onClick={() => setScreen('stats')}
          style={{
            width: '100%',
            padding: 14,
            fontSize: 16,
            fontWeight: 600,
            background: THEME.primary,
            color: '#ffffff',
            border: `1px solid ${THEME.primary}`,
            borderRadius: 8,
            cursor: 'pointer',
            marginBottom: 10
          }}
        >
          {t.viewProgress}
        </button>

        <button
          onClick={() => {
            const targetIndex = Number.isInteger(completedWorkoutIndex)
              ? completedWorkoutIndex
              : Math.max(0, (completedWorkout?.number || 1) - 1);

            setSelectedIndex(targetIndex);
            setScreen('current');
          }}
          style={{
            width: '100%',
            padding: 14,
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 0,
            background: 'transparent',
            color: '#ffffff',
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          {t.backToWorkout}
        </button>
      </div>
    )}
  </div>
)}

{false && showNewCycle && screen === 'completed' && (
  <NewCycleModal
    prs={prs}
    onStart={handleStartNewCycle}
    t={t}
  />
)}

{showWorkoutEffortPrompt && (
  <div style={{
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 650,
    padding: 16
  }}>
    <div style={{
      background: THEME.card,
      border: `1px solid ${THEME.border}`,
      borderRadius: 12,
      padding: 20,
      maxWidth: 380,
      width: '100%',
      color: THEME.text
    }}>
      <h3 style={{
        margin: '0 0 8px',
        color: THEME.text,
        textAlign: 'center'
      }}>
        {t.workoutEffortQuestion}
      </h3>

      <p style={{
        margin: '0 0 16px',
        color: THEME.muted,
        fontSize: 13,
        lineHeight: 1.4,
        textAlign: 'center'
      }}>
        {t.workoutEffortRequired}
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 8
      }}>
        {WORKOUT_EFFORT_OPTIONS.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => completeWorkout(option)}
            style={{
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${THEME.primary}`,
              background: THEME.card,
              color: THEME.text,
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            {t[`workoutEffort${option[0].toUpperCase()}${option.slice(1)}`]}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowWorkoutEffortPrompt(false)}
        style={{
          width: '100%',
          marginTop: 10,
          padding: 10,
          fontSize: 14,
          fontWeight: 700,
          background: 'transparent',
          color: THEME.text,
          border: `1px solid ${THEME.border}`,
          borderRadius: 8,
          cursor: 'pointer'
        }}
      >
        {t.cancel}
      </button>
    </div>
  </div>
)}

{showResetConfirm && (
  <div style={{
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 600,
    padding: 16
  }}>
    <div style={{
      background: THEME.card,
      border: `1px solid ${THEME.border}`,
      borderRadius: 12,
      padding: 20,
      maxWidth: 380,
      width: '100%',
      color: THEME.text
    }}>
      <h3 style={{ margin: '0 0 10px', color: THEME.text }}>
        {t.resetConfirmTitle}
      </h3>

      <p style={{ margin: '0 0 18px', color: THEME.muted, fontSize: 14, lineHeight: 1.45 }}>
        {t.resetConfirmText}
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setShowResetConfirm(false)}
          style={{
            flex: 1,
            padding: 12,
            fontSize: 14,
            fontWeight: 700,
            background: 'transparent',
            color: THEME.text,
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          {t.resetConfirmCancel}
        </button>

        <button
          onClick={handleResetApp}
          style={{
            flex: 1,
            padding: 12,
            fontSize: 14,
            fontWeight: 800,
            background: THEME.red,
            color: '#ffffff',
            border: `1px solid ${THEME.red}`,
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          {t.resetConfirmConfirm}
        </button>
      </div>
    </div>
  </div>
)}

      <BottomNav screen={screen} onChange={changeScreen} t={t} />
    </div>
  );
}
