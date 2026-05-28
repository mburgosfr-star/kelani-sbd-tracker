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

      return {
        ...savedSnapshot.workoutSnapshot,
        prepItems: (savedSnapshot.workoutSnapshot.prepItems || workout.prepItems || []).map(item => ({
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

function getWorkoutTypeLabel(workout, t) {
  const key = getWorkoutTypeKey(workout);
  return key ? t[key] : '—';
}

function generatePrepItems(lift) {
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
  return roundMeetWeight((Number(weight) || 0) * 0.925);
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
  return (workouts || []).map((workout, index) => {
    if (index < completedCount) return workout;

    const generated = generatedWorkouts[index];
    if (!generated || workout.type === 'meet') return workout;

    return {
      ...workout,
      accessories: generated.accessories || [],
    };
  });
}


function generateProgram(s, b, d, accessoryMode = 'off', accessoryPRs = {}) {
  function round25(w) {
    return Math.round(w / 2.5) * 2.5;
  }

  const oneRMs = {
    Squat: s,
    Bench: b,
    Deadlift: d,
  };

  const program = [
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 3, pct: 0.750, labelKey: 'topTriple' }, { sets: 4, reps: 5, pct: 0.650, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 5, pct: 0.600, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 3, pct: 0.750, labelKey: 'topTriple' }, { sets: 3, reps: 5, pct: 0.675, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 3, pct: 0.750, labelKey: 'topTriple' }, { sets: 4, reps: 6, pct: 0.650, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 3, pct: 0.775, labelKey: 'topTriple' }, { sets: 4, reps: 5, pct: 0.700, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 3, pct: 0.800, labelKey: 'topTriple' }, { sets: 4, reps: 5, pct: 0.700, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 3, pct: 0.700, labelKey: 'topTriple' }, { sets: 3, reps: 4, pct: 0.625, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 3, reps: 5, pct: 0.600, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 4, reps: 5, pct: 0.625, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 2, pct: 0.825, labelKey: 'topDouble' }, { sets: 4, reps: 4, pct: 0.750, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 5, pct: 0.650, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 2, pct: 0.800, labelKey: 'topDouble' }, { sets: 3, reps: 4, pct: 0.725, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 2, pct: 0.825, labelKey: 'topDouble' }, { sets: 4, reps: 4, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 2, pct: 0.825, labelKey: 'topDouble' }, { sets: 4, reps: 4, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 2, pct: 0.850, labelKey: 'topDouble' }, { sets: 4, reps: 4, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 2, pct: 0.775, labelKey: 'topDouble' }, { sets: 3, reps: 4, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 3, reps: 4, pct: 0.650, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 4, reps: 4, pct: 0.675, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.875, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.775, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 4, pct: 0.700, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.850, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.775, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.850, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.875, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.775, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.800, labelKey: 'topSingle' }, { sets: 3, reps: 4, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 3, reps: 4, pct: 0.625, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 3, reps: 4, pct: 0.700, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'opener' }, { sets: 1, reps: 1, pct: 0.930, labelKey: 'secondAttempt' }, { sets: 1, reps: 1, pct: 0.950, labelKey: 'thirdAttempt' }, { sets: 3, reps: 5, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'opener' }, { sets: 1, reps: 1, pct: 0.930, labelKey: 'secondAttempt' }, { sets: 1, reps: 1, pct: 0.950, labelKey: 'thirdAttempt' }, { sets: 3, reps: 5, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'opener' }, { sets: 1, reps: 1, pct: 0.930, labelKey: 'secondAttempt' }, { sets: 1, reps: 1, pct: 0.950, labelKey: 'thirdAttempt' }, { sets: 3, reps: 5, pct: 0.750, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.800, labelKey: 'topSingle' }, { sets: 2, reps: 4, pct: 0.650, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 4, pct: 0.600, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.750, labelKey: 'topSingle' }, { sets: 2, reps: 4, pct: 0.600, labelKey: 'backoff' }] }] },
    { type: 'training', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.800, labelKey: 'topSingle' }, { sets: 2, reps: 4, pct: 0.650, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 2, reps: 4, pct: 0.600, labelKey: 'backoff' }] }] },
  ];

  const workouts = [];

  function buildLiftBlock(liftConfig) {
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

    return {
      lift: liftConfig.lift,
      prepItems: generatePrepItems(liftConfig.lift),
      warmups: generateWarmups(firstWorkWeight),
      sets,
    };
  }

  program.forEach((day, dayIndex) => {
    const liftBlocks = day.lifts.map((liftConfig, liftIndex) =>
      buildLiftBlock({
        ...liftConfig,
        isSecondaryLight: liftIndex > 0,
      })
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
      prepItems: generatePrepItems(lift),
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

function PrepRow({ item, isActive, isReadOnly, onToggle, t }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '12px 16px',
      borderTop: `1px solid ${THEME.border}`,
      background: item.done ? 'rgba(255, 138, 61, 0.08)' : THEME.card,
      boxShadow: isActive ? 'inset 0 0 0 1px #f39c12' : 'none'
    }}>
      <button
        onClick={onToggle}
        disabled={isReadOnly}
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: `2px solid ${item.done ? THEME.primary : THEME.border}`,
          background: item.done ? THEME.primary : THEME.card,
          color: item.done ? THEME.bg : THEME.text,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
          flexShrink: 0,
          cursor: isReadOnly ? 'not-allowed' : 'pointer',
          fontWeight: 900
        }}
      >
        {item.done ? '✓' : ''}
      </button>

      <div style={{ flex: 1 }}>
        <div style={{ color: THEME.text, fontWeight: 800, fontSize: 14 }}>
          {t[item.labelKey]}
        </div>
        <div style={{ color: THEME.muted, fontSize: 12, marginTop: 2 }}>
          {formatPrepPrescription(item, t)}
        </div>
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
      padding: '10px 12px',
      display: 'grid',
      gap: 8
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
              padding: '7px 4px',
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

function SetRow({ set, index, label, isWarmup = false, onToggle, onWeightChange, onMarkFailed, onRestoreWeight, isActive, isReadOnly, t }) {
const isFailed = Boolean(set.failed);
const isAdjusted = Boolean(set.adjustedFromFailedSet || set.adjustedFromOriginal || set.failed);
const displayPct = set.pct ? Math.round(set.pct * 100) : null;
const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(set.weight));
  const inputRef = useRef(null);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);
  
  function handleEditClick(e) {
    e.stopPropagation();
    setInputVal(String(set.weight));
    setEditing(true);
  }

  function handleConfirm() {
    const val = parseFloat(inputVal);

    if (!isNaN(val) && val > 0) {
      onWeightChange(val);
    } else {
      setInputVal(String(set.weight));
    }

    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') setEditing(false);
  }
  return (
    <div
      ref={el => {
  if (isActive && el && !el.dataset.scrolled) {
    el.dataset.scrolled = 'true';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}}
      style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', border: `1px solid ${THEME.border}`, boxShadow: isActive ? 'inset 0 0 0 1px #f39c12' : 'none', borderLeft: isActive && !isWarmup ? `4px solid ${THEME.primary}` : '4px solid transparent'}}>
      <div
  onClick={isReadOnly ? undefined : onToggle}
  style={{
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: `2px solid ${set.skipped ? '#e74c3c' : set.done ? THEME.primary : THEME.border}`,
    background: set.skipped ? '#e74c3c' : set.done ? THEME.primary : THEME.card,
    color: (set.skipped || set.done) ? THEME.bg : THEME.text,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
    cursor: isReadOnly ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    transform: set.done ? 'scale(1.08)' : 'scale(1)',
    fontWeight: 900,
  }}
>
        {set.skipped ? '✕' : set.done ? '✓' : ''}
      </div>
      <div
        onClick={isReadOnly ? undefined : onToggle}
        style={{
          flex: 1,
          cursor: isReadOnly ? 'not-allowed' : 'pointer'
        }}
      >
        <div style={{ fontWeight: 500, color: THEME.text, textDecoration: set.done && !isFailed && !set.skipped ? 'line-through' : 'none' }}>
          {label}
        </div>
        <div style={{ color: THEME.text, fontSize: 14, fontWeight: 700, marginTop: 2 }}>
          {set.repsLabel || `${set.reps} ${t.reps}`}
        </div>

        {getSetEffortLabel(set.effort, t) && (
          <div style={{
            display: 'inline-flex',
            marginTop: 5,
            padding: '2px 7px',
            borderRadius: 999,
            border: `1px solid ${THEME.primary}`,
            color: THEME.primary,
            fontSize: 11,
            fontWeight: 800,
            lineHeight: 1.2
          }}>
            {getSetEffortLabel(set.effort, t)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input ref={inputRef} type="number" step="2.5" value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleConfirm}
              style={{ width: 70, padding: '4px 8px', fontSize: 16, fontWeight: 700, borderRadius: 4, border: '2px solid #e74c3c', textAlign: 'right' }} />
            <span style={{ fontSize: 16, color: THEME.text }}>{t.kg}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: isAdjusted ? '#f39c12' : '#ffffff' }}>{set.weight} kg</span>
            {displayPct && <span style={{ color: isAdjusted ? '#f39c12' : '#ffffff', fontSize: 12 }}>{displayPct}%</span>}
            {!isWarmup && !set.done && (
  <button
    onClick={handleEditClick}
    style={{
      background: 'none',
      border: `1px solid ${THEME.primary}`,
      cursor: 'pointer',
      fontSize: 16,
      padding: '2px 4px',
      color: '#ffffff',
      lineHeight: 1
    }}
  >
    ✎
  </button>
)}
            {onRestoreWeight && !set.done && !isReadOnly && (
              <button
                type="button"
                title={t.restoreOriginalWeight}
                aria-label={t.restoreOriginalWeight}
                onClick={(e) => {
                  e.stopPropagation();
                  onRestoreWeight();
                }}
                style={{
                  background: 'none',
                  border: '1px solid #f39c12',
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: '2px 5px',
                  color: '#ffffff',
                  lineHeight: 1,
                  fontWeight: 900
                }}
              >
                ↺
              </button>
            )}
            {onMarkFailed && !set.done && !isReadOnly && (
              <button
                type="button"
                title={t.markSetFailed}
                aria-label={t.markSetFailed}
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkFailed();
                }}
                style={{
                  background: 'none',
                  border: '1px solid #e74c3c',
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: '2px 5px',
                  color: '#ffffff',
                  lineHeight: 1,
                  fontWeight: 900
                }}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function SettingsCard({ title, actionLabel, onAction, children, centerTitle = false }) {
  return (
    <div style={{
      background: THEME.card,
      border: `1px solid ${THEME.border}`,
      borderRadius: 8,
      padding: 14,
      marginBottom: 12
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: children ? 10 : 0
      }}>
        <h3 style={{
          margin: 0,
          color: THEME.text,
          fontSize: 16,
          textAlign: centerTitle ? 'center' : 'left',
          flex: centerTitle ? 1 : 'initial'
        }}>
          {title}
        </h3>

        {actionLabel && (
          <button
            onClick={onAction}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 700,
              background: THEME.card,
              color: '#ffffff',
              border: `1px solid ${THEME.primary}`,
              borderRadius: 8,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>

      {children}
    </div>
  );
}

function SettingsRow({ label, value }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 6,
      fontSize: 14
    }}>
      <span style={{ color: THEME.muted, fontWeight: 700 }}>{label}</span>
      <strong style={{ color: THEME.text, textAlign: 'right' }}>{value || '—'}</strong>
    </div>
  );
}

function SettingsListRow({ label, value, valueColor = THEME.text, actionLabel, onAction, actionContent, danger = false, noBorder = false, compact = false }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      alignItems: 'center',
      gap: 12,
      padding: compact ? '5px 0' : '8px 0',
      borderBottom: noBorder ? 'none' : `1px solid ${THEME.border}`
    }}>
      <div style={{
        color: danger ? THEME.red : THEME.text,
        fontSize: 14,
        fontWeight: 800,
        minWidth: 0
      }}>
        {label}
      </div>

      <div style={{
        color: valueColor,
        fontSize: 13,
        fontWeight: 800,
        textAlign: 'center',
        width: 132
      }}>
        {actionContent || (
          actionLabel ? (
            <button
              type="button"
              onClick={onAction}
              style={{
                width: 132,
                padding: '6px 8px',
                fontSize: 12,
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
        padding: 10,
        fontSize: 14,
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
    ['shoes', 'meetPrepShoes'],
    ['socks', 'meetPrepSocks'],
    ['clothing', 'meetPrepClothing'],
    ['food', 'meetPrepFood'],
    ['attempts', 'meetPrepAttempts'],
    ['rackHeights', 'meetPrepRackHeights'],
    ['pen', 'meetPrepPen'],
    ['phone', 'meetPrepPhone'],
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
                    textDecoration: checked ? 'line-through' : 'none'
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
            justifyItems: 'end'
          }}>
            <button
              type="button"
              onClick={exportData}
              style={{
                width: 132,
                padding: '6px 8px',
                fontSize: 12,
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
                width: 132,
                padding: '6px 8px',
                fontSize: 12,
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
        padding: '7px 6px',
        fontSize: 11,
        fontWeight: 700,
        background: THEME.card,
        color: '#ffffff',
        border: `1px solid ${THEME.primary}`,
        borderRadius: 8,
        cursor: 'pointer',
        minHeight: 34,
        width: 132,
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
      label: t.sendFeedbackShort || t.sendFeedback,
      url: 'mailto:mburgosfr@gmail.com?subject=Kelani%20SBD%20Tracker%20feedback',
    },
    {
      label: t.reportBugShort || t.reportBug,
      url: 'https://github.com/mburgosfr-star/kelani-sbd-tracker/issues/new',
    },
    {
      label: t.supportDevelopmentShort || t.supportDevelopment,
      url: 'https://kelani-site.mburgosfr.workers.dev/',
    },
    {
      label: t.joinTestingOrCoachingShort || t.joinTestingOrCoaching,
      url: 'mailto:mburgosfr@gmail.com?subject=Kelani%20SBD%20Tracker%20testing%20or%20coaching%20interest',
    },
  ];

  function openLink(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <SettingsListRow
      label={t.support}
      actionContent={(
        <div style={{
          display: 'grid',
          gridTemplateColumns: '132px',
          gap: 6,
          width: 132
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

function ProfileSection({ userProfile, onSave, t }) {
  const [isEditing, setIsEditing] = useState(false);
  const [birthDate, setBirthDate] = useState(userProfile?.birthDate || '');
  const [sex, setSex] = useState(userProfile?.sex || '');
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    setBirthDate(userProfile?.birthDate || '');
    setSex(userProfile?.sex || '');
  }, [userProfile?.birthDate, userProfile?.sex]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 1800);
    return () => window.clearTimeout(id);
  }, [notice]);

  function openEdit() {
    setBirthDate(userProfile?.birthDate || '');
    setSex(userProfile?.sex || '');
    setIsEditing(true);
  }

  function handleSave() {
    onSave({ birthDate, sex });
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

function BodyDataSection({ bodyData, onSave, t }) {
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

  function enteredValue(field) {
    return toOptionalNumber(form[field]);
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
    { key: 'bodyWeight', label: `${t.bodyweight} (${t.kg})` },
    { key: 'bodyFat', label: t.bodyFatPercent },
    { key: 'bodyWater', label: t.bodyWaterPercent },
    { key: 'visceralFat', label: t.visceralFatRating },
    { key: 'physiqueRating', label: t.physiqueRating },
    { key: 'boneMass', label: t.boneMassKg },
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
              <input
                type="number"
                value={form[field.key]}
                onChange={e => updateField(field.key, e.target.value)}
                placeholder={previous[field.key] ? String(previous[field.key]) : ''}
                style={modalInputStyle()}
              />
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
                  fontSize: 14,
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
                  fontSize: 14,
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

            <button
              type="button"
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

function NewCycleModal({ prs, onStart, t }) {
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
              <span style={{ fontWeight: 700 }}>{prs[lift] || '—'} kg</span>
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

function CurrentWorkout({ workout, currentCycle, totalWorkouts, onTogglePrepItem, onToggleWarmup, onToggleSet, onMarkSetFailed, onRestoreSetWeight, onToggleAccessorySet, onMarkAccessorySetFailed, onRestoreAccessoryWeight, onToggleMeetPrepItem, onToggleMeetWarmup, onToggleMeetSet, onMarkMeetSetFailed, onMeetWeightChange, onMeetSetEffortChange, onWeightChange, onSetEffortChange, onAccessoryWeightChange, onComplete, onViewAll, showNewCycle, newCyclePRs, onStartNewCycle, isReadOnly, t, timer, setTimer, startTimer }) {

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
        <button onClick={onStartNewCycle} style={{ marginTop: 16, width: '100%', padding: 14, fontSize: 16, background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.primary}`, borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
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

    const meetDayProjectedTotal = (workout.lifts || []).reduce((total, liftBlock) => {
      const thirdAttempt = liftBlock.sets?.[2]?.weight;
      return total + (Number(thirdAttempt) || 0);
    }, 0);

    const firstIncompleteLiftIndex = (workout.lifts || []).findIndex(liftBlock =>
      (liftBlock.prepItems || []).some(item => !item.done) ||
      (liftBlock.warmups || []).some(w => !w.done) ||
      (liftBlock.sets || []).some(s => !s.done)
    );

    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '8px 12px 12px', paddingBottom: 16, fontFamily: 'sans-serif' }}>
        <AppHeader
          t={t}
          title={`${t.workout} ${workout.number} — ${getWorkoutTitle(workout, t)}`}
          subtitle={`${t.cycle} ${currentCycle} · ${t.workoutProgress} ${workout.number} / ${totalWorkouts}${isMeetDay ? ` · ${t.meetDay}` : ''}`}
        />

{isMeetDay && (
<div style={{
  marginBottom: 14,
  padding: 14,
  border: `1px solid ${THEME.primary}`,
  borderRadius: 10,
  background: THEME.card,
  textAlign: 'center'
}}>
  <div style={{ color: THEME.muted, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
    {t.projectedTotal}
  </div>
  <div style={{ color: THEME.text, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
    {meetDayProjectedTotal ? `${meetDayProjectedTotal} ${t.kg}` : '—'}
  </div>
</div>
)}

        {(workout.lifts || []).map((liftBlock, li) => {
          const firstIncompletePrepItem = (liftBlock.prepItems || []).findIndex(item => !item.done);
          const firstIncompleteWarmup = (liftBlock.warmups || []).findIndex(w => !w.done);
          const firstIncompleteSet = (liftBlock.sets || []).findIndex(s => !s.done);
          const allPrepDone = (liftBlock.prepItems || []).every(item => item.done);
          const allWarmupsDone = (liftBlock.warmups || []).every(w => w.done);

          return (
            <div
              key={liftBlock.lift}
              style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}
            >
              <div style={{
                padding: '8px 16px',
                fontSize: 16,
                fontWeight: 800,
                color: THEME.text,
                textAlign: 'center',
                borderBottom: `1px solid ${THEME.border}`,
              }}>
                {liftLabel(liftBlock.lift, t)}
              </div>

              {(liftBlock.prepItems || []).length > 0 && (
                <div>
                  <div style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    fontWeight: 800,
                    color: THEME.text,
                    textAlign: 'center',
                    borderTop: `1px solid ${THEME.border}`,
                    background: THEME.card
                  }}>
                    {t.prepTitle}
                  </div>

                  {(liftBlock.prepItems || []).map((item, pi) => (
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
              )}

              {(liftBlock.warmups || []).map((w, wi) => (
                <React.Fragment key={`warmup-${wi}`}>
                  <SetRow
                    set={w}
                    index={wi}
                    label={`${t.warmup} ${wi + 1}`}
                    isWarmup={true}
                    isActive={
                      !isReadOnly &&
                      li === firstIncompleteLiftIndex &&
                      allPrepDone &&
                      wi === firstIncompleteWarmup
                    }
                    isReadOnly={isReadOnly}
                    onToggle={() => handleToggle(() => onToggleMeetWarmup(li, wi))}
                    t={t}
                  />
                  {renderInlineTimer({ type: 'meetWarmup', liftIndex: li, index: wi })}
                </React.Fragment>
              ))}

              {(liftBlock.sets || []).map((set, si) => (
                <React.Fragment key={`attempt-${si}`}>
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
                    onWeightChange={val => onMeetWeightChange(li, si, val)}
                    t={t}
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
              ))}
            </div>
          );
        })}

        <button
          onClick={() => {
            if (isReadOnly) return;
            onComplete();
          }}
          disabled={!allMeetDone || isReadOnly}
          style={{
            width: '100%',
            padding: 14,
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
        {t.workout} {workout.number} — {liftLabel(workout.lift, t)}

        {isReadOnly && (
          <span style={{
            marginLeft: 8,
            fontSize: 12,
            background: '#999',
            color: 'white',
            padding: '2px 6px',
            borderRadius: 4
          }}>
            {t.preview}
          </span>
        )}
      </h2>

      <div style={{ textAlign: 'center', color: THEME.muted, fontSize: 13, marginBottom: 12 }}>
        {t.cycle} {currentCycle} · {t.workoutProgress} {workout.number} / {totalWorkouts}
      </div>

      {(workout.prepItems || []).length > 0 && (
        <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{
            padding: '8px 16px',
            fontSize: 16,
            fontWeight: 700,
            color: THEME.text,
            textAlign: 'center'
          }}>
            {t.prepTitle}
          </div>

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
      )}

      {(workout.warmups || []).length > 0 && (
        <div style={{
          background: THEME.card,
          border: `1px solid ${THEME.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 16
        }}>
          <div style={{
            padding: '8px 16px',
            fontSize: 16,
            fontWeight: 700,
            color: THEME.text,
            textAlign: 'center'
          }}>
            {t.warmup}
          </div>
          {workout.warmups.map((w, i) => (
            <React.Fragment key={i}>
              <SetRow
                set={w}
                index={i}
                label={`${t.warmup} ${i + 1}`}
                isWarmup={true}
                isActive={!isReadOnly && allPrepDone && i === workout.warmups.findIndex(wu => !wu.done)}
                isReadOnly={isReadOnly}
                onToggle={() => handleToggle(() => onToggleWarmup(i))}
                t={t}
              />
              {renderInlineTimer({ type: 'warmup', index: i })}
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={{
        background: THEME.card,
        border: `1px solid ${THEME.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 16
      }}>
        <div style={{
          padding: '8px 16px',
          fontSize: 16,
          fontWeight: 700,
          color: THEME.text,
          textAlign: 'center'
        }}>
          {liftLabel(workout.lift, t)}
        </div>

        {workout.sets.map((set, i) => {
          const allWarmupsDone = allPrepDone && (workout.warmups || []).every(w => w.done);
          const firstIncomplete = workout.sets.findIndex(s => !s.done);
          const hasLaterSetAction = workout.sets.some((laterSet, laterIndex) =>
            laterIndex > i && (laterSet.done || laterSet.failed || laterSet.skipped)
          );
          const showSetNotice = set.failed || (set.skipped && !hasLaterSetAction);

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
                      : t.failedSetAdjusted.replace('{weight}', `${set.adjustedWeight} ${t.kg}`)}
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
              />
              {!set.failed && renderInlineTimer({ type: 'main', index: i })}
              {set.done && !set.failed && !set.skipped && !set.effort && (
                <EffortPicker
                  value={set.effort}
                  onChange={effort => handleToggle(() => onSetEffortChange(i, effort))}
                  t={t}
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
          marginBottom: 16
        }}>
          {workout.accessories.map((acc, ai) => (
            <div key={ai}>
              <div style={{
                padding: '8px 16px',
                background: THEME.card,
                borderBottom: `1px solid ${THEME.border}`,
                textAlign: 'center'
              }}>
                <span style={{ fontWeight: 800, color: THEME.text }}>
                  {acc.nameKey ? t[acc.nameKey] : acc.name}
                </span>
              </div>

              {acc.done.map((done, si) => {
                const allMainSetsDone = (workout.sets || []).every(s => s.done);
                const firstIncompleteAccessoryGroup = (workout.accessories || []).findIndex(a =>
                  (a.done || []).some(d => !d)
                );
                const firstIncompleteAccessorySet = (acc.done || []).findIndex(d => !d);

                return (
                  <React.Fragment key={si}>
                    <SetRow
                      set={{
                        done,
                        weight: acc.weights[si],
                        reps: acc.reps,
                        repsLabel: acc.perSide ? `${acc.reps} ${t.perSide}` : null,
                        failed: !!acc.failed?.[si],
                        failedWeight: acc.failedWeights?.[si] || null,
                        adjustedFromFailedSet: !!acc.adjustedFromFailedSet?.[si],
                        adjustedFromOriginal: !!acc.adjustedFromOriginal?.[si],
                      }}
                      index={si}
                      label={`${t.set} ${si + 1}`}
                      isWarmup={false}
                      isActive={
                        !isReadOnly &&
                        allMainSetsDone &&
                        ai === firstIncompleteAccessoryGroup &&
                        si === firstIncompleteAccessorySet
                      }
                      isReadOnly={isReadOnly}
                      onToggle={() => handleToggle(() => onToggleAccessorySet(ai, si))}
                      onMarkFailed={() => handleToggle(() => onMarkAccessorySetFailed(ai, si))}
                      onRestoreWeight={() => handleToggle(() => onRestoreAccessoryWeight(ai, si))}
                      onWeightChange={val => onAccessoryWeightChange(ai, si, val)}
                      t={t}
                    />
                    {renderInlineTimer({ type: 'accessory', accIndex: ai, index: si })}
                  </React.Fragment>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          if (isReadOnly) return;
          onComplete();
        }}
        disabled={!allDone || isReadOnly}
        style={{
          width: '100%',
          padding: 14,
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

      {showNewCycle && <NewCycleModal prs={newCyclePRs} onStart={onStartNewCycle} t={t} />}
    </div>
  );
}

function StatsScreen({ history, bodyWeights, currentCycle, currentIndex, totalWorkouts, meetPlannerAttempts, setMeetPlannerAttempts, onBack, t }) {
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

    if (getEntryWorkoutNumber(entry) > 0) {
      liftData[entry.lift].push({
        label,
        absoluteWorkoutIndex: getAbsoluteWorkoutIndex(entry),
        oneRM: bestStats[entry.lift].oneRM || null,
        e1rm: bestStats[entry.lift].e1rm || null,
      });
    }
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

  if (getEntryWorkoutNumber(entry) > 0 && bestPerLift.Squat && bestPerLift.Bench && bestPerLift.Deadlift) {
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
      gewicht: entry.bodyWeight,
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
      [key]: value,
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

  return latest?.bodyWeight || null;
}

totalData.forEach(entry => {
  const bodyWeightForWorkout = getBodyWeightForWorkoutIndex(entry.absoluteWorkoutIndex);

  if (!bodyWeightForWorkout) return;

  strengthData.push({
    label: entry.label,
    absoluteWorkoutIndex: entry.absoluteWorkoutIndex,
    strength: Math.round((entry.e1rm / bodyWeightForWorkout) * 100) / 100,
  });
});

function chartMetricLabel(key) {
  if (key === 'oneRM') return '1RM';
  if (key === 'e1rm') return t.e1RM;
  if (key === 'gewicht') return `${t.bodyweight} (${t.kg})`;
  if (key === 'strength') return t.strength;
  if (key === 'bodyFat') return t.bodyFatPercent;
  if (key === 'bodyWater') return t.bodyWaterPercent;
  if (key === 'leanMass') return t.leanMassKg;
  if (key === 'visceralFat') return t.visceralFatRating;
  if (key === 'physiqueRating') return t.physiqueRating;
  if (key === 'boneMass') return t.boneMassKg;
  if (key === 'bmr') return t.bmrKcal;

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

    const visibleData = data.length > 10 ? data.slice(-10) : data;

    const allXTicks = [...new Set(
      visibleData
        .map(item => Number(item.absoluteWorkoutIndex))
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
      labels[item.absoluteWorkoutIndex] = item.label;
      return labels;
    }, {});

    return (
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={visibleData} margin={{ top: 4, right: 12, left: 4, bottom: 2 }}>
          <CartesianGrid stroke={THEME.border} vertical={false} />
          <XAxis
            dataKey="absoluteWorkoutIndex"
            type="number"
            domain={['dataMin', 'dataMax']}
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
    return (
      <div>
        {charts.filter(chart => chart.data.length > 0).map(chart => (
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
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 12, fontFamily: 'sans-serif' }}>
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
              minHeight: 38,
              padding: '8px 4px',
              fontSize: 13,
              lineHeight: 1.15,
              background: THEME.card,
              color: activescreen === tab.key ? THEME.primary : THEME.text,
              border: `1px solid ${THEME.border}`,
              borderTop: activescreen === tab.key
                ? `2px solid ${THEME.primary}`
                : `2px solid ${THEME.border}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: activescreen === tab.key ? 700 : 500,
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
            {renderChart(totalData, ['oneRM', 'e1rm'], [THEME.muted, THEME.primary])}
          </div>

          <div style={{
            background: THEME.card,
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            padding: 16
          }}>
            <h3 style={{ margin: '0 0 8px' }}>{t.strengthTotalBodyweight}</h3>
            {renderChart(strengthData, ['strength'], [THEME.primary])}
          </div>
        </div>
      )}

      {activescreen === 'lichaam' && renderMetricChartCards([
        {
          key: 'gewicht',
          title: `${t.bodyweight} (${t.kg})`,
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
          {meetTotals.third ? `${meetTotals.third} ${t.kg}` : '—'}
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
              {t.e1RM} {row.e1rm ? `${row.e1rm} ${t.kg}` : '—'}
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
                  type="number"
                  inputMode="decimal"
                  step="2.5"
                  value={value}
                  onChange={e => updateMeetAttempt(row.lift, key, e.target.value)}
                  onBlur={e => {
                    const rounded = roundAttempt(e.target.value);
                    updateMeetAttempt(row.lift, key, rounded || '');
                  }}
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
                  {t.kg}
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
          <strong>{value ? `${value} ${t.kg}` : '—'}</strong>
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

function getWorkoutTitle(workout, t) {
  if (!workout || workout.type === 'rest') return t.deload;
  if (workout.type === 'meet') return t.sbdMeetDay || t.meetDay;

  const lifts = (workout.lifts || [])
    .map(liftBlock => liftBlock.lift)
    .filter(Boolean);

  if (lifts.length > 0) {
    return lifts.map(lift => liftLabel(lift, t)).join(' + ');
  }

  return liftLabel(workout.lift, t);
}

function getWorkoutPlanLines(workout, t) {
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

    return groups.map(group => {
      if (onlyBackoff || !group.labelKey) {
        return `${liftLabel(liftBlock.lift, t)}: ${group.count}×${group.reps}×${group.weight} ${t.kg}`;
      }

      return `${liftLabel(liftBlock.lift, t)} · ${group.label}: ${group.count}×${group.reps}×${group.weight} ${t.kg}`;
    });
  });
}

function AppHeader({ t, title, subtitle, children }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 12 }}>
      <div style={{
        color: THEME.primary,
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 4
      }}>
        {t.appName}
      </div>

      <h2 style={{ margin: 0, fontSize: 24 }}>
        {title}
      </h2>

      {subtitle && (
        <div style={{ color: THEME.muted, fontSize: 13, marginTop: 6 }}>
          {subtitle}
        </div>
      )}

      {children}
    </div>
  );
}

function AllWorkouts({ workouts, currentIndex, currentCycle, onSelect, onBack, onStats, onStartNewCycle, t }) {
  const currentWorkoutRef = useRef(null);
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);

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
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 12, fontFamily: 'sans-serif' }}>
      <AppHeader
        t={t}
        title={t.program}
        subtitle={`${t.cycle} ${currentCycle} · ${t.workoutProgress} ${Math.min(currentIndex + 1, workouts.length)} / ${workouts.length}`}
      />


      {visibleWorkoutEntries.map(({ workout, idx }) => {
        const isCurrent = idx === currentIndex;
        const isDone = idx < currentIndex;
        const headerBg = isCurrent ? THEME.primary : workout.type === 'rest' ? THEME.brown : THEME.border;
        const planLines = getWorkoutPlanLines(workout, t);
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
                {getWorkoutTitle(workout, t)}
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
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
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
  const [squat, setSquat] = useState('');
  const [bench, setBench] = useState('');
  const [deadlift, setDeadlift] = useState('');
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

  function buildInitialBodyData() {
    const bodyWeight = toOptionalNumber(bodyForm.bodyWeight);
    const bodyFat = toOptionalNumber(bodyForm.bodyFat);
    const bodyWater = toOptionalNumber(bodyForm.bodyWater);
    const visceralFat = toOptionalNumber(bodyForm.visceralFat);
    const physiqueRating = toOptionalNumber(bodyForm.physiqueRating);
    const boneMass = toOptionalNumber(bodyForm.boneMass);
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

  function handleStart() {
    const s = parseFloat(squat);
    const b = parseFloat(bench);
    const d = parseFloat(deadlift);

    if (!s || !b || !d || !birthDate || !sex) {
      alert(t.fillRequiredFields);
      return;
    }

    onStart(s, b, d, { birthDate, sex }, buildInitialBodyData());
  }

  const bodyFields = [
    { key: 'bodyWeight', label: `${t.bodyweight} (${t.kg})` },
    { key: 'bodyFat', label: t.bodyFatPercent },
    { key: 'bodyWater', label: t.bodyWaterPercent },
    { key: 'visceralFat', label: t.visceralFatRating },
    { key: 'physiqueRating', label: t.physiqueRating },
    { key: 'boneMass', label: t.boneMassKg },
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
      <h1 style={{ textAlign: 'center', marginTop: 0, marginBottom: 24 }}>
        {t.appName}
      </h1>

      <div style={{
        background: THEME.card,
        padding: 24,
        borderRadius: 8,
        border: `1px solid ${THEME.border}`
      }}>
        <h2 style={{ marginTop: 0, color: THEME.text, textAlign: 'center' }}>
          {t.enterDetails}
        </h2>

        {[
          [t.squat1RM, squat, setSquat],
          [t.bench1RM, bench, setBench],
          [t.deadlift1RM, deadlift, setDeadlift],
        ].map(([label, val, setter]) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, color: THEME.text }}>
              {label}
            </label>

            <input
              type="number"
              value={val}
              onChange={e => setter(e.target.value)}
              placeholder={t.kg}
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
            />
          </div>
        ))}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, color: THEME.text }}>
            {t.birthDate}
          </label>

          <input
            type="date"
            value={birthDate}
            onChange={e => setBirthDate(e.target.value)}
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
          />
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

        <h3 style={{ margin: '4px 0 16px', color: THEME.text, textAlign: 'center' }}>
          {t.optionalBodyData}
        </h3>

        {bodyFields.map(field => (
          <div key={field.key} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, color: THEME.text }}>
              {field.label}
            </label>

            <input
              type="number"
              value={bodyForm[field.key]}
              onChange={e => updateBodyField(field.key, e.target.value)}
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
            />
          </div>
        ))}

        <button
          onClick={handleStart}
          style={{
            width: '100%',
            padding: 14,
            fontSize: 16,
            background: THEME.primary,
            color: '#ffffff',
            border: `1px solid ${THEME.primary}`,
            borderRadius: 4,
            cursor: 'pointer',
            marginTop: 8,
            fontWeight: 600
          }}
        >
          {t.startProgram}
        </button>
      </div>
    </div>
  );
}

function BottomNav({ screen, onChange, t }) {
  const items = [
    { key: 'dashboard', label: t.dashboard },
    { key: 'all', label: t.program },
    { key: 'current', label: t.workout },
    { key: 'stats', label: t.stats },
    { key: 'settings', label: t.settings },
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
          onClick={() => {
            onChange(item.key);
            window.scrollTo({ top: 0, behavior: 'auto' });
          }}
          style={{
            flex: 1,
            padding: '12px 0',
            background: 'none',
            border: 'none',
            color: screen === item.key ? THEME.primary : '#ffffff',
            fontWeight: screen === item.key ? 700 : 500,
            cursor: 'pointer'
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
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

  const t = translations[language];
  const [screen, setScreen] = useState('onboarding');
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
  const currentIndex = Math.max(getCompletedWorkoutCount(history, currentCycle), currentWorkoutIndex);
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
      const generatedWorkouts = generateProgram(squat, bench, deadlift, normalizeAccessoryMode(data.accessoryMode), data.accessoryPRs || {});
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
      inProgress: {
        programVersion: PROGRAM_VERSION,
        currentCycle,
        currentIndex,
        selectedIndex,
        workouts,
      },
    }));
  }, [history, prs, accessoryPRs, currentCycle, currentIndex, bodyWeights, userProfile, meetPlannerAttempts, meetPrepChecklist, restTimeSeconds, accessoryMode, selectedIndex, workouts]);

  useEffect(() => {
    if (!prs.Squat || !prs.Bench || !prs.Deadlift) return;

    const generatedWorkouts = generateProgram(
      prs.Squat,
      prs.Bench,
      prs.Deadlift,
      accessoryMode,
      accessoryPRs
    );

    setWorkouts(prev => applyAccessoryPlanToWorkouts(
      prev,
      generatedWorkouts,
      getCompletedWorkoutCount(history, currentCycle)
    ));
  }, [accessoryMode, accessoryPRs, prs.Squat, prs.Bench, prs.Deadlift, history, currentCycle]);

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

    setWorkouts(generateProgram(s, b, d, accessoryMode, accessoryPRs));
    setCurrentWorkoutIndex(0);
  setSelectedIndex(0);
    setCurrentCycle(1);

    setHistory([
      {
        workoutNumber: 0,
        cycle: 1,
        lift: 'Squat',
        topWeight: s,
        topReps: 1,
        e1rm: s,
        date: today,
      },
      {
        workoutNumber: 0,
        cycle: 1,
        lift: 'Bench',
        topWeight: b,
        topReps: 1,
        e1rm: b,
        date: today,
      },
      {
        workoutNumber: 0,
        cycle: 1,
        lift: 'Deadlift',
        topWeight: d,
        topReps: 1,
        e1rm: d,
        date: today,
      }
    ]);

    setPrs({ Squat: s, Bench: b, Deadlift: d });
    setAccessoryPRs({});
    setUserProfile(profile);
    setMeetPlannerAttempts({});
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

  setWorkouts([]);
  setCurrentWorkoutIndex(0);
  setSelectedIndex(0);
  setHistory([]);
  setPrs({});
  setAccessoryPRs({});
  setUserProfile({});
  setMeetPlannerAttempts({});
  setShowNewCycle(false);
  setShowWorkoutEffortPrompt(false);
  setCurrentCycle(1);
  setBodyWeights([]);
  setScreen('onboarding');
}

function handleStartNewCycle() {
  if (!prs.Squat || !prs.Bench || !prs.Deadlift) {
    setScreen('onboarding');
    return;
  }

  const nextCycle = currentCycle + 1;
  const newWorkouts = generateProgram(prs.Squat, prs.Bench, prs.Deadlift, accessoryMode, accessoryPRs);

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
    prev.map((w, wi) =>
      wi !== selectedIndex
        ? w
        : {
            ...w,
            prepItems: (w.prepItems || []).map((item, i) =>
              i === index ? { ...item, done: !item.done } : item
            ),
          }
    )
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

      const normalAdjustedWeight = getFailedSetSuggestedWeight(failedSet?.weight);
      const attemptAdjustedWeight = getAdjustedAttemptWeight(failedSet?.weight);
      const adjustedWeight = isPreMeetWorkout && isAttemptSet
        ? attemptAdjustedWeight
        : normalAdjustedWeight;

      const nextBackoff = (w.sets || []).find((set, index) =>
        index > setIndex && set.labelKey === 'backoff' && !set.done
      );
      const nextBackoffWeight = Number(nextBackoff?.weight) || 0;
      const isTopSet = isTopSetLabel(failedSet?.labelKey);

      const shouldSkipAttempt =
        isPreMeetWorkout &&
        isAttemptSet &&
        failedAttempts >= 2;

      const shouldSkipTopSet =
        !isPreMeetWorkout &&
        isTopSet &&
        (failedAttempts >= 2 || (nextBackoffWeight > 0 && adjustedWeight <= nextBackoffWeight));

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

          if (shouldAdjustThisSet && (shouldSkipAttempt || shouldSkipTopSet)) {
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
            adjustedFromOriginal: true,
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

              const restoredWeight = Number(s.failedWeight ?? s.originalWeight ?? s.weight) || s.weight;
              const restoredPct = Number(s.originalPct ?? getSetPctForWeight(s, restoredWeight)) || s.pct;

              return {
                ...s,
                weight: restoredWeight,
                pct: restoredPct,
                done: false,
                failed: false,
                skipped: false,
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

          return {
            ...a,
            done: a.done.map((d, di) => (di === setIndex ? !d : d)),
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

            return {
              ...s,
              weight: val,
              pct: nextPct || s.pct,
              originalWeight,
              originalPct,
              adjustedFromOriginal: Number(val) !== originalWeight,
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

  return (liftBlock.sets || []).some((s, si) =>
    si > setIndex && !s.done && !s.skipped
  );
}

function toggleMeetSet(liftIndex, setIndex) {
  const workout = workouts[selectedIndex];

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

              if (s.failed || s.skipped) {
                return {
                  ...s,
                  done: false,
                  failed: false,
                  skipped: false,
                  effort: null,
                };
              }

              return {
                ...s,
                done: !s.done,
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
            sets: liftBlock.sets.map((s, si) =>
              si === setIndex ? { ...s, weight: roundedVal } : s
            ),
          };
        }),
      };
    })
  );
}

function markAccessorySetFailed(accIndex, setIndex) {
  const workout = workouts[selectedIndex];

  if (workout) {
    startTimer(restTimeSeconds, {
      workoutNumber: workout.number,
      type: 'accessory',
      accIndex,
      index: setIndex,
    });
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

          return {
            ...a,
            weights: a.weights.map((weight, i) => {
              const shouldLower =
                i >= setIndex &&
                !a.done?.[i] &&
                Number(weight) >= adjustedWeight;

              return shouldLower ? adjustedWeight : weight;
            }),
            originalWeights: (a.originalWeights || a.weights).map((weight, i) => weight || a.weights?.[i]),
            failed: (a.failed || a.done.map(() => false)).map((failed, i) =>
              i === setIndex ? true : failed
            ),
            failedWeights: (a.failedWeights || a.done.map(() => null)).map((weight, i) =>
              i === setIndex ? (weight || currentWeight) : weight
            ),
            adjustedFromFailedSet: (a.adjustedFromFailedSet || a.done.map(() => false)).map((adjusted, i) =>
              i === setIndex ? true : adjusted
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
        workoutNumber: workout.number,
        cycle: currentCycle,
        lift: result.lift,
        topWeight: result.oneRMToday,
        topReps: result.topSet?.reps || 0,
        e1rm: result.e1RMToday,
        date: today,
        workoutEffort: finishedWorkout.workoutEffort,
        workoutSnapshot: finishedWorkout,
      }));

      const nextHistory = [...withoutCurrentWorkout, ...newEntries];

      setHistory(nextHistory);
      setPrs(calculatePrsFromHistory(nextHistory));
    }

  
    if (workout.type === 'training' && LIFT_ORDER.includes(workout.lift)) {
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

  setCompletedWorkout(finishedWorkout);
  setCompletedWorkoutIndex(selectedIndex);

  const nextWorkoutIndex = Math.min(selectedIndex + 1, workouts.length - 1);
  if (selectedIndex === currentIndex) {
    setCurrentWorkoutIndex(nextWorkoutIndex);
  }
  setSelectedIndex(nextWorkoutIndex);

  setScreen('completed');
}

if (screen === 'onboarding') return <Onboarding onStart={handleStart} t={t}/>;

if (screen !== 'onboarding' && !workouts.length) {
  return <Onboarding onStart={handleStart} t={t}/>;
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

const best1RMs = {
  Squat: Math.max(
    0,
    ...history.filter(h => h.lift === 'Squat').map(h => h.topWeight || 0)
  ),
  Bench: Math.max(
    0,
    ...history.filter(h => h.lift === 'Bench').map(h => h.topWeight || 0)
  ),
  Deadlift: Math.max(
    0,
    ...history.filter(h => h.lift === 'Deadlift').map(h => h.topWeight || 0)
  ),
};

const bestE1RMs = {
  Squat: Math.max(prs.Squat || 0, ...history.filter(h => h.lift === 'Squat').map(h => h.e1rm || 0)),
  Bench: Math.max(prs.Bench || 0, ...history.filter(h => h.lift === 'Bench').map(h => h.e1rm || 0)),
  Deadlift: Math.max(prs.Deadlift || 0, ...history.filter(h => h.lift === 'Deadlift').map(h => h.e1rm || 0)),
};

const total1RM = best1RMs.Squat + best1RMs.Bench + best1RMs.Deadlift;
const totalE1RM = bestE1RMs.Squat + bestE1RMs.Bench + bestE1RMs.Deadlift;

const latestBodyDataEntry = [...bodyWeights].slice(-1)[0];
const latestBodyWeightEntry = [...bodyWeights].filter(entry => entry.bodyWeight).slice(-1)[0];
const latestBodyWeight = latestBodyWeightEntry?.bodyWeight || null;

const strengthRatio = latestBodyWeight
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
    label: `${t.bodyweight} (${t.kg})`,
    value: bodyMetricValue(latestBodyDataEntry?.bodyWeight, t.kg),
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
    value: bodyMetricValue(latestBodyDataEntry?.leanMass, t.kg),
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
    value: bodyMetricValue(latestBodyDataEntry?.boneMass, t.kg),
    status: boneMassStatus(latestBodyDataEntry?.boneMass),
  },
  {
    key: 'bmr',
    label: t.bmrKcal,
    value: bodyMetricValue(latestBodyDataEntry?.bmr),
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
          onWeightChange={changeWeight}
          onSetEffortChange={changeSetEffort}
          onAccessoryWeightChange={changeAccessoryWeight}
          onComplete={completeWorkout}
          onViewAll={() => setScreen('all')}
          showNewCycle={showNewCycle}
          newCyclePRs={prs}
          onStartNewCycle={handleStartNewCycle}
          t={t}
          timer={timer}
          setTimer={setTimer}
          onToggleMeetPrepItem={toggleMeetPrepItem}
          onToggleMeetWarmup={toggleMeetWarmup}
          onToggleMeetSet={toggleMeetSet}
          onMarkMeetSetFailed={markMeetSetFailed}
          onMeetWeightChange={changeMeetWeight}
          onMeetSetEffortChange={changeMeetSetEffort}
        />
      )}

      {screen === 'dashboard' && (
  <div style={{ maxWidth: 500, margin: '0 auto', padding: 16, background: THEME.bg, minHeight: '100vh', color: THEME.text }}>
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
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginBottom: 6
        }}>
          {t.nextWorkout} · W{workouts[currentIndex].number}
        </div>

        <div style={{
          color: THEME.text,
          fontSize: 17,
          fontWeight: 900
        }}>
          {getWorkoutTitle(workouts[currentIndex], t)}
        </div>
      </div>
    )}
    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
      {[
        [t.squat, THEME.red, best1RMs.Squat, bestE1RMs.Squat],
        [t.bench, THEME.primary, best1RMs.Bench, bestE1RMs.Bench],
        [t.deadlift, THEME.yellow, best1RMs.Deadlift, bestE1RMs.Deadlift],
      ].map(([lift, color, oneRM, e1RM]) => (
        <div key={lift} style={{ marginBottom: lift === t.deadlift ? 0 : 12 }}>
          <div style={{ marginBottom: 6 }}>
            <strong style={{ color }}>{lift}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: THEME.text, fontWeight: 700 }}>{t.oneRM}:</span>
            <strong>{oneRM ? `${oneRM} kg` : '—'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: THEME.text, fontWeight: 700 }}>{t.e1RM}:</span>
            <strong>{e1RM ? `${e1RM} ${t.kg}` : '—'}</strong>
          </div>
        </div>
      ))}
    </div>

    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: THEME.text, fontWeight: 700 }}>{t.total1rm}</span>
        <strong style={{ color: '#ffffff' }}>{total1RM ? `${total1RM} kg` : '—'}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: THEME.text, fontWeight: 700 }}>{t.totalE1rm}</span>
        <strong style={{ color: '#ffffff' }}>{totalE1RM ? `${totalE1RM} kg` : '—'}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: THEME.text, fontWeight: 700 }}>{t.strength}</span>
        <strong style={{ color: '#ffffff' }}>{strengthRatio || '—'}</strong>
      </div>
    </div>

    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16 }}>
      {latestBodyDataRows.length > 0 ? (
        latestBodyDataRows.map((row, index) => (
          <div
            key={row.key}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 56px 160px',
              alignItems: 'center',
              columnGap: 8,
              marginBottom: index === latestBodyDataRows.length - 1 ? 0 : 8
            }}
          >
            <span style={{ color: THEME.text, fontWeight: 700 }}>
              {row.label}:
            </span>

            <strong style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 56 }}>
              {row.value}
            </strong>

            <span style={{ minWidth: 160, textAlign: 'right' }}>
              {row.status && (
                <span style={{
                  color: row.status.color,
                  fontSize: 12,
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
          currentCycle={currentCycle}
          onSelect={(idx) => {
            setSelectedIndex(idx);
            setScreen('current');
          }}
          onBack={() => setScreen('current')}
          onStats={() => setScreen('stats')}
          onStartNewCycle={handleStartNewCycle}
          t={t}
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
        />
)}

      {screen === 'settings' && (
       <div style={{ maxWidth: 500, margin: '0 auto', padding: 12, fontFamily: 'sans-serif' }}>
  <AppHeader
    t={t}
    title={t.settings}
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
      t={t}
    />

    <BodyDataSection
      bodyData={latestBodyDataEntry}
      onSave={saveBodyWeight}
      t={t}
    />

    <RestTimeSection
      restTimeSeconds={restTimeSeconds}
      setRestTimeSeconds={setRestTimeSeconds}
      t={t}
    />

    <AccessorySection
      accessoryMode={accessoryMode}
      setAccessoryMode={setAccessoryMode}
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

  <div style={{
    marginTop: 10,
    color: THEME.muted,
    fontSize: 12,
    textAlign: 'center'
  }}>
    {t.appName} · {process.env.REACT_APP_VERSION ? `v${process.env.REACT_APP_VERSION}` : 'dev'}
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

        {getWorkoutEffortText(completedWorkout?.workoutEffort, t) && (
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
              color: THEME.primary,
              fontSize: 18,
              fontWeight: 900,
              lineHeight: 1.15
            }}>
              {getWorkoutEffortText(completedWorkout.workoutEffort, t)}
            </div>
          </div>
        )}

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
                {result.bestE1RM} {t.kg}
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
                {liftLabel(liftBlock.lift, t)}
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
                      {set.weight} {t.kg}
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
                key={`completed-lift-${liftBlock.lift}`}
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
                  {liftLabel(liftBlock.lift, t)}
                </div>

                {(liftBlock.sets || []).map((set, i) => {
                  const setLabel = set.labelKey ? t[set.labelKey] : set.label || `${t.set} ${i + 1}`;
                  const isInvalidSet = set.failed || set.skipped || !set.done;
                  const effortLabel = getSetEffortLabel(set.effort, t);

                  return (
                    <div
                      key={`${liftBlock.lift}-${i}`}
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
                        {set.weight} {t.kg}
                      </strong>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

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
            .map(liftBlock => liftLabel(liftBlock.lift, t))
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
              {summaryRow(t.workoutEffortWas || 'Ha estat', effortLabel || '—')}
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
                  {value} kg {isPR ? '🚀' : ''}
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
                  {liftLabel(liftBlock.lift, t)}
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
                        {set.weight} {t.kg}
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