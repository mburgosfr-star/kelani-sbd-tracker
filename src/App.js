import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { translations } from './translations';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';

const STORAGE_KEY = 'kel-powerlifting-user-data-v1';
const REST_TIME_OPTIONS = [90, 180, 300];
const ACCESSORY_MODES = ['off', 'standard', 'upperBackFriendly', 'lowerBodyFriendly'];
const SET_EFFORT_OPTIONS = ['easy', 'good', 'hard', 'max'];
const WORKOUT_EFFORT_OPTIONS = ['easy', 'good', 'hard', 'tooMuch'];
const LIFT_ORDER = ['Squat', 'Bench', 'Deadlift'];
const DEFAULT_REST_TIME_SECONDS = 300;
const AUTO_BACKUP_PATH = 'Kelani/kelani-sbd-tracker-autosave.json';
const AUTO_BACKUP_STATUS_KEY = 'kelani-sbd-tracker-auto-backup-status';
const REST_TIMER_NOTIFICATION_ID = 1208;
const REST_TIMER_NOTIFICATION_CHANNEL_ID = 'kelani_rest_timer_v4';
const REST_TIMER_NOTIFICATION_SOUND = 'kelani_rest_timer_quiet.wav';

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

async function cancelRestTimerNotification() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: REST_TIMER_NOTIFICATION_ID }],
    });
  } catch (e) {}
}

async function ensureRestTimerNotificationChannel() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.createChannel({
      id: REST_TIMER_NOTIFICATION_CHANNEL_ID,
      name: 'Kelani rest timer',
      description: 'Rest timer alerts',
      importance: 5,
      visibility: 1,
      sound: REST_TIMER_NOTIFICATION_SOUND,
      vibration: true,
    });
  } catch (e) {}
}

async function scheduleRestTimerNotification(
  endTime,
  doneTitle = 'Rest finished',
  doneText = 'Your next set is ready.'
) {
  if (!Capacitor.isNativePlatform() || !endTime) return;

  try {
    const permissions = await LocalNotifications.checkPermissions();
    if (permissions.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions();
      if (requested.display !== 'granted') return;
    }

    await cancelRestTimerNotification();
    await ensureRestTimerNotificationChannel();

    await LocalNotifications.schedule({
      notifications: [{
        id: REST_TIMER_NOTIFICATION_ID,
        title: doneTitle,
        body: doneText,
        channelId: REST_TIMER_NOTIFICATION_CHANNEL_ID,
        sound: REST_TIMER_NOTIFICATION_SOUND,
        schedule: { at: new Date(endTime) },
      }],
    });
  } catch (e) {}
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
  green: '#2ecc71',
  brown: '#a86f45'
  
};


const WORKOUT_CIRCLE_SIZE = 44;
const WORKOUT_CIRCLE_FONT_SIZE = 18;
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
  if (value === 'basic' || value === 'full') return 'standard';
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
  return getCompletedWorkoutNumbers(history, currentCycle).size;
}

function getCompletedWorkoutNumbers(history, currentCycle) {
  return new Set(
    (history || [])
      .filter(entry => Number(entry.cycle) === Number(currentCycle))
      .filter(isCompletedHistoryEntry)
      .map(entry => Number(entry.workoutNumber))
      .filter(number => Number.isFinite(number))
  );
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
  const completedWorkoutNumbers = getCompletedWorkoutNumbers(history, cycle);

  return workouts.map((workout, index) => {
    const generated = generatedWorkouts[index];
    if (!generated) return workout;

    const isCompleted = completedWorkoutNumbers.has(Number(generated.number || workout.number));
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
  if (variant === 'standingLandminePress') return 'standingLandminePress';
  if (variant === 'shoulderPress') return 'shoulderPress';
  if (variant === 'machineAlternative') return 'machineAlternative';
  if (variant === 'goodMorning') return 'goodMorning';
  return 'standard';
}

function normalizeSquatVariant(variant) {
  if (variant === 'beltSquat') return 'beltSquat';
  if (variant === 'zercherSquat') return 'zercherSquat';
  return 'standard';
}

function normalizeDeadliftVariant(variant) {
  if (variant === 'alternative') return 'alternative';
  if (variant === 'hipThrust') return 'hipThrust';
  return 'standard';
}

const PROGRAM_PROFILES = {
  kelaniSbd: {
    preparationMode: 'off',
    accessoryMode: 'off',
    squatVariant: 'standard',
    benchPressVariant: 'standard',
    deadliftVariant: 'standard',
    includeCooldown: false,
  },
  kelaniSbdPlus: {
    preparationMode: 'basicFirst',
    accessoryMode: 'standard',
    squatVariant: 'standard',
    benchPressVariant: 'standard',
    deadliftVariant: 'standard',
    includeCooldown: true,
  },
  kelaniSbdLower: {
    preparationMode: 'shoulderThoracic',
    accessoryMode: 'off',
    squatVariant: 'standard',
    benchPressVariant: 'goodMorning',
    deadliftVariant: 'hipThrust',
    includeCooldown: true,
  },
  kelaniSbdLowerPlus: {
    preparationMode: 'shoulderThoracic',
    accessoryMode: 'lowerBodyFriendly',
    squatVariant: 'standard',
    benchPressVariant: 'goodMorning',
    deadliftVariant: 'hipThrust',
    includeCooldown: true,
  },
};

function normalizeProgramProfile(profile) {
  if (profile === 'kelaniSbdSafe') return 'kelaniSbdLower';
  if (profile === 'kelaniSbdSafePlus') return 'kelaniSbdLowerPlus';

  return Object.prototype.hasOwnProperty.call(PROGRAM_PROFILES, profile)
    ? profile
    : 'kelaniSbd';
}

function settingsForProgramProfile(profile) {
  return PROGRAM_PROFILES[normalizeProgramProfile(profile)] || PROGRAM_PROFILES.kelaniSbd;
}

function detectProgramProfile({ preparationMode, accessoryMode, squatVariant, benchPressVariant, deadliftVariant }) {
  const normalizedSettings = {
    preparationMode: normalizePreparationMode(preparationMode),
    accessoryMode: normalizeAccessoryMode(accessoryMode),
    squatVariant: normalizeSquatVariant(squatVariant),
    benchPressVariant: normalizeBenchPressVariant(benchPressVariant),
    deadliftVariant: normalizeDeadliftVariant(deadliftVariant),
  };

  const match = Object.entries(PROGRAM_PROFILES).find(([, profile]) =>
    profile.preparationMode === normalizedSettings.preparationMode &&
    profile.accessoryMode === normalizedSettings.accessoryMode &&
    profile.squatVariant === normalizedSettings.squatVariant &&
    profile.benchPressVariant === normalizedSettings.benchPressVariant &&
    profile.deadliftVariant === normalizedSettings.deadliftVariant
  );

  return match?.[0] || 'kelaniSbd';
}

function isStandingLandminePress(lift, benchPressVariant = 'standard') {
  return lift === 'Bench' && normalizeBenchPressVariant(benchPressVariant) === 'standingLandminePress';
}

function isBenchMachineAlternative(lift, benchPressVariant = 'standard') {
  return lift === 'Bench' && normalizeBenchPressVariant(benchPressVariant) === 'machineAlternative';
}

function isBenchHomeAlternative(lift, benchPressVariant = 'standard') {
  const normalizedBenchPressVariant = normalizeBenchPressVariant(benchPressVariant);

  return lift === 'Bench' && (
    normalizedBenchPressVariant === 'shoulderPress' ||
    normalizedBenchPressVariant === 'goodMorning'
  );
}

function workoutLiftLabel(lift, t, benchPressVariant = 'standard', squatVariant = 'standard') {
  const normalizedBenchPressVariant = normalizeBenchPressVariant(benchPressVariant);
  const normalizedSquatVariant = normalizeSquatVariant(squatVariant);

  if (lift === 'Squat' && normalizedSquatVariant === 'beltSquat') {
    return t.squatAlternativeWorkout || 'Belt Squat';
  }

  if (lift === 'Squat' && normalizedSquatVariant === 'zercherSquat') {
    return t.squatAlternativeZercherSquat || 'Zercher Squat';
  }

  if (lift === 'Bench' && normalizedBenchPressVariant === 'standingLandminePress') {
    return t.benchPressStandingLandminePress || 'Landmine';
  }

  if (lift === 'Bench' && normalizedBenchPressVariant === 'shoulderPress') {
    return t.benchPressShoulderPress || 'Shoulder Press';
  }

  if (lift === 'Bench' && normalizedBenchPressVariant === 'goodMorning') {
    return t.benchPressGoodMorning || 'Good Morning';
  }

  if (lift === 'Bench' && normalizedBenchPressVariant === 'machineAlternative') {
    return t.benchPressMachineAlternativeWorkout || 'Chest Press';
  }

  return liftLabel(lift, t);
}

function workoutLiftBlockLabel(liftBlock, t, benchPressVariant = 'standard') {
  if (liftBlock?.lift === 'Squat' && normalizeSquatVariant(liftBlock?.squatVariant) !== 'standard') {
    return workoutLiftLabel(
      liftBlock?.lift,
      t,
      liftBlock?.benchPressVariant || 'standard',
      liftBlock?.squatVariant || 'standard'
    );
  }

  if (liftBlock?.lift === 'Deadlift' && normalizeDeadliftVariant(liftBlock?.deadliftVariant) === 'hipThrust') {
    return t.deadliftHipThrustWorkout || 'Barbell Hip Thrust';
  }

  if (isDeadliftAlternativeLiftBlock(liftBlock)) {
    return t.deadliftAlternativeWorkout || 'Posterior Chain';
  }

  return workoutLiftLabel(
    liftBlock?.lift,
    t,
    liftBlock?.benchPressVariant || 'standard',
    liftBlock?.squatVariant || 'standard'
  );
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
  if (isStandingLandminePress(lift, benchPressVariant)) return false;
  if (isBenchHomeAlternative(lift, benchPressVariant)) return false;
  if (isBenchMachineAlternative(lift, benchPressVariant)) return false;
  return true;
}

function isSquatBeltAlternativeLiftBlock(liftBlock = {}) {
  return liftBlock?.lift === 'Squat' && (
    liftBlock.squatVariant === 'beltSquat' ||
    liftBlock.squatVariant === 'zercherSquat' ||
    (liftBlock.sets || []).some(set => String(set.groupKey || '').startsWith('squatAlternative'))
  );
}

function isDeadliftAlternativeLiftBlock(liftBlock = {}) {
  return liftBlock?.lift === 'Deadlift' && (
    liftBlock.deadliftVariant === 'alternative' ||
    liftBlock.deadliftVariant === 'hipThrust' ||
    (liftBlock.sets || []).some(set => String(set.groupKey || '').startsWith('deadliftAlternative')) ||
    (liftBlock.sets || []).some(set => String(set.groupKey || '').startsWith('deadliftHomeAlternative'))
  );
}

function isBenchMachineAlternativeLiftBlock(liftBlock = {}) {
  return liftBlock?.lift === 'Bench' && (
    liftBlock.benchPressVariant === 'machineAlternative' ||
    (liftBlock.sets || []).some(set => String(set.groupKey || '').startsWith('benchMachineAlternative'))
  );
}

function isBenchHomeAlternativeLiftBlock(liftBlock = {}) {
  return liftBlock?.lift === 'Bench' && (
    liftBlock.benchPressVariant === 'shoulderPress' ||
    liftBlock.benchPressVariant === 'goodMorning' ||
    (liftBlock.sets || []).some(set => String(set.groupKey || '').startsWith('benchHomeAlternative'))
  );
}

function shouldTrackLiftBlockStrength(liftBlock = {}, benchPressVariant = 'standard') {
  if (isSquatBeltAlternativeLiftBlock(liftBlock)) return false;
  if (isDeadliftAlternativeLiftBlock(liftBlock)) return false;
  if (isBenchMachineAlternativeLiftBlock(liftBlock)) return false;
  if (isBenchHomeAlternativeLiftBlock(liftBlock)) return false;

  return shouldTrackWorkoutStrength(
    liftBlock.lift,
    liftBlock.benchPressVariant || benchPressVariant
  );
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

function decimalLocale() {
  const savedLanguage = localStorage.getItem('language');
  const browserLanguage = (navigator.language || navigator.userLanguage || '').toLowerCase();
  const language = savedLanguage || (
    browserLanguage.startsWith('nl')
      ? 'nl'
      : browserLanguage.startsWith('ca')
        ? 'ca'
        : 'en'
  );

  if (language === 'nl') return 'nl-NL';
  if (language === 'ca') return 'ca-ES';
  return 'en-US';
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

function formatDecimalDisplay(value, { minimumFractionDigits, maximumFractionDigits = 1 } = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '—';

  const hasDecimal = !Number.isInteger(numericValue);
  const minDigits = minimumFractionDigits ?? (hasDecimal ? 1 : 0);

  return numericValue.toLocaleString(decimalLocale(), {
    minimumFractionDigits: minDigits,
    maximumFractionDigits,
  });
}

function formatWeightDisplayValue(value, unit = WEIGHT_UNITS.KG, options = {}) {
  const rawValue = formatWeightValue(value, unit, options);
  return formatDecimalDisplay(rawValue, { maximumFractionDigits: 1 });
}

function formatWeightFromKg(weightKg, unit = WEIGHT_UNITS.KG, options = {}) {
  const displayWeight = kgToDisplayWeight(weightKg, unit);
  if (displayWeight === '') return '—';

  return `${formatWeightDisplayValue(displayWeight, unit, options)} ${normalizeWeightUnit(unit)}`;
}


function normalizePreparationMode(mode) {
  if (mode === 'off') return 'off';
  if (mode === 'basicAll') return 'basicAll';
  if (mode === 'shoulderThoracic') return 'shoulderThoracic';

  // Backwards compatibility: old "basic" means first big lift only.
  if (mode === 'basic' || mode === 'basicFirst') return 'basicFirst';

  return 'basicFirst';
}

const DEPRECATED_PREP_LABEL_KEYS = new Set([
  'prepThoracicRotationSideLying',
]);

function removeDeprecatedPrepItemsFromWorkout(workout) {
  if (!workout) return workout;

  const cleanPrepItems = items => Array.isArray(items)
    ? items.filter(item => !DEPRECATED_PREP_LABEL_KEYS.has(item?.labelKey))
    : items;

  const cleanLiftBlock = liftBlock => liftBlock
    ? {
        ...liftBlock,
        prepItems: cleanPrepItems(liftBlock.prepItems),
      }
    : liftBlock;

  return {
    ...workout,
    prepItems: cleanPrepItems(workout.prepItems),
    liftBlocks: Array.isArray(workout.liftBlocks)
      ? workout.liftBlocks.map(cleanLiftBlock)
      : workout.liftBlocks,
  };
}

function removeDeprecatedPrepItemsFromWorkouts(workouts) {
  return Array.isArray(workouts)
    ? workouts.map(removeDeprecatedPrepItemsFromWorkout)
    : workouts;
}

function generatePrepItems(lift, preparationMode = 'basicFirst') {
  const normalizedPreparationMode = normalizePreparationMode(preparationMode);

  if (normalizedPreparationMode === 'off') return [];

  if (normalizedPreparationMode === 'shoulderThoracic') {
    return [
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

function isGroupedWorkoutSet(set = {}) {
  return Boolean(set.groupKey) || ['backoff', 'workSets'].includes(set.labelKey);
}

function getWorkoutSetGroupEntries(sets = [], currentSet = {}) {
  if (currentSet.groupKey) {
    return sets
      .map((groupSet, groupIndex) => ({ set: groupSet, index: groupIndex }))
      .filter(({ set }) => set.groupKey === currentSet.groupKey);
  }

  return sets
    .map((groupSet, groupIndex) => ({ set: groupSet, index: groupIndex }))
    .filter(({ set }) => ['backoff', 'workSets'].includes(set.labelKey));
}

function getWorkoutSetGroupLabel(currentSet = {}, sets = [], t) {
  if (currentSet.groupLabelKey) {
    return t[currentSet.groupLabelKey] || currentSet.groupLabelKey;
  }

  if (currentSet.groupKey && currentSet.labelKey) {
    return t[currentSet.labelKey] || currentSet.label || currentSet.groupKey;
  }

  if (currentSet.groupKey) {
    return currentSet.label || currentSet.groupKey;
  }

  return getBackoffGroupLabelForSets(sets, t);
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
  standard: {
    Squat: [
      { key: 'pulldown', labelKey: 'accessoryPulldown', sets: 3, reps: 10, source: 'deadlift', pct: 0.25 },
      { key: 'legCurl', labelKey: 'accessoryLegCurl', sets: 3, reps: 12, source: 'squat', pct: 0.20 },
    ],
    Bench: [
      { key: 'hipThrust', labelKey: 'accessoryHipThrust', sets: 3, reps: 8, source: 'deadlift', pct: 0.40 },
      { key: 'shoulderRotations', labelKey: 'accessoryShoulderRotations', sets: 2, reps: 15, source: 'fixed', weight: 2.5, perSide: true },
    ],
    Deadlift: [
      { key: 'row', labelKey: 'accessoryRow', sets: 3, reps: 10, source: 'deadlift', pct: 0.25 },
      { key: 'legExtension', labelKey: 'accessoryLegExtension', sets: 2, reps: 12, source: 'squat', pct: 0.15 },
    ],
  },
  upperBackFriendly: {
    Squat: [
      { key: 'hipAbduction', labelKey: 'accessoryHipAbduction', sets: 3, reps: 12, source: 'fixed', weight: 20 },
      { key: 'hipAdduction', labelKey: 'accessoryHipAdduction', sets: 3, reps: 12, source: 'fixed', weight: 20 },
    ],
    Bench: [
      { key: 'lateralRaise', labelKey: 'accessoryLateralRaise', sets: 3, reps: 12, source: 'fixed', weight: 5, perSide: true },
    ],
    Deadlift: [
      { key: 'machineCrunch', labelKey: 'accessoryMachineCrunch', sets: 3, reps: 12, source: 'fixed', weight: 20 },
      { key: 'seatedCalfRaise', labelKey: 'accessorySeatedCalfRaise', sets: 3, reps: 12, source: 'fixed', weight: 20 },
    ],
  },
  lowerBodyFriendly: {
    Squat: [
      { key: 'hipAbduction', labelKey: 'accessoryHipAbduction', sets: 3, reps: 12, source: 'fixed', weight: 20 },
      { key: 'hipAdduction', labelKey: 'accessoryHipAdduction', sets: 3, reps: 12, source: 'fixed', weight: 20 },
    ],
    Bench: [
      { key: 'legExtension', labelKey: 'accessoryLegExtension', sets: 3, reps: 12, source: 'squat', pct: 0.15 },
    ],
    Deadlift: [
      { key: 'legCurl', labelKey: 'accessoryLegCurl', sets: 3, reps: 12, source: 'squat', pct: 0.20 },
      { key: 'seatedCalfRaise', labelKey: 'accessorySeatedCalfRaise', sets: 3, reps: 12, source: 'fixed', weight: 20 },
    ],
  },
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

function generateSquatAlternativeSets(oneRMs = {}) {
  const beltSquatWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Squat) || 0) * 0.50));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'squatAlternativeBeltSquat',
    groupKey: 'squatAlternativeBeltSquat',
    reps: 10,
    weight: beltSquatWeight,
  }));
}

function generateSquatHomeAlternativeSets(oneRMs = {}) {
  const zercherSquatWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Squat) || 0) * 0.40));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'squatAlternativeZercherSquat',
    groupKey: 'squatAlternativeZercherSquat',
    reps: 6,
    weight: zercherSquatWeight,
  }));
}

function generateBenchMachineAlternativeSets(oneRMs = {}) {
  const chestPressWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Bench) || 0) * 0.50));
  const pecDeckWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Bench) || 0) * 0.20));
  const tricepsPushdownWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Bench) || 0) * 0.15));

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

function generateBenchHomeAlternativeSets(oneRMs = {}) {
  const shoulderPressWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Bench) || 0) * 0.35));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'benchHomeAlternativeShoulderPress',
    groupKey: 'benchHomeAlternativeShoulderPress',
    reps: 6,
    weight: shoulderPressWeight,
  }));
}

function generateBenchGoodMorningSets(oneRMs = {}) {
  const goodMorningWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Squat) || 0) * 0.35));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'benchHomeAlternativeGoodMorning',
    groupKey: 'benchHomeAlternativeGoodMorning',
    reps: 8,
    weight: goodMorningWeight,
  }));
}

function generateDeadliftAlternativeSets(oneRMs = {}) {
  const legPressWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Squat) || 0) * 0.60));
  const cablePullThroughWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Deadlift) || 0) * 0.20));
  const cableGluteKickbackWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Squat) || 0) * 0.10));

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

function generateDeadliftHomeAlternativeSets(oneRMs = {}) {
  const hipThrustWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Deadlift) || 0) * 0.50));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'deadliftHomeAlternativeBarbellHipThrust',
    groupKey: 'deadliftHomeAlternativeBarbellHipThrust',
    reps: 8,
    weight: hipThrustWeight,
  }));
}

function generateAccessoriesForLift(lift, accessoryMode = 'off', accessoryPRs = {}, oneRMs = {}) {
  const normalizedMode = normalizeAccessoryMode(accessoryMode);
  if (normalizedMode === 'off') return [];

  return (ACCESSORY_TEMPLATES[normalizedMode]?.[lift] || [])
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

function applyAccessoryPlanToWorkouts(workouts, generatedWorkouts, completedWorkoutNumbers = new Set()) {
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

  function setHasUserState(set) {
    if (!set) return false;

    return Boolean(
      set.done ||
      set.failed ||
      set.skipped ||
      set.failedAttempts ||
      set.failedWeight != null ||
      set.adjustedWeight != null ||
      set.adjustedFromFailedSet ||
      set.adjustedFromOriginal ||
      set.effort ||
      Number(set.weight) !== Number(set.originalWeight ?? set.weight)
    );
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

  function mergeLiftBlock(currentLiftBlock, generatedLiftBlock) {
    if (!currentLiftBlock) return generatedLiftBlock;

    const sameVariant =
      currentLiftBlock.deadliftVariant === generatedLiftBlock.deadliftVariant &&
      currentLiftBlock.benchPressVariant === generatedLiftBlock.benchPressVariant;

    if (!sameVariant) return generatedLiftBlock;

    return {
      ...generatedLiftBlock,
      prepItems: mergePrepItems(currentLiftBlock.prepItems, generatedLiftBlock.prepItems),
      warmups: (generatedLiftBlock.warmups || []).map((warmup, index) =>
        mergeWarmup(currentLiftBlock.warmups?.[index], warmup)
      ),
      sets: (generatedLiftBlock.sets || []).map((set, index) =>
        mergeSet(currentLiftBlock.sets?.[index], set)
      ),
    };
  }

  return (workouts || []).map((workout, index) => {
    const generated = generatedWorkouts[index];
    if (completedWorkoutNumbers.has(Number(generated?.number || workout.number))) return workout;
    if (!generated || workout.type === 'meet') return workout;

    const currentAccessoriesByKey = new Map(
      (workout.accessories || []).map(accessory => [accessoryKey(accessory), accessory])
    );

    const mergedLifts = (generated.lifts || []).map((generatedLiftBlock, liftIndex) =>
      mergeLiftBlock((workout.lifts || [])[liftIndex], generatedLiftBlock)
    );
    const primaryLiftBlock = mergedLifts[0] || {};
    const mergedCooldownItems = mergeCooldownItems(workout.cooldownItems, generated.cooldownItems);

    return {
      ...generated,
      prepItems: primaryLiftBlock.prepItems || mergePrepItems(workout.prepItems, generated.prepItems),
      warmups: primaryLiftBlock.warmups || generated.warmups || [],
      sets: primaryLiftBlock.sets || generated.sets || [],
      lifts: mergedLifts,
      cooldownItems: mergedCooldownItems,
      accessories: (generated.accessories || []).map(generatedAccessory =>
        mergeAccessory(currentAccessoriesByKey.get(accessoryKey(generatedAccessory)), generatedAccessory)
      ),
    };
  });
}


function generateProgram(s, b, d, accessoryMode = 'off', accessoryPRs = {}, preparationMode = 'basicFirst', deadliftVariant = 'standard', benchPressVariant = 'standard', squatVariant = 'standard', includeCooldown = true) {
  function round25(w) {
    return Math.round(w / 2.5) * 2.5;
  }

  const oneRMs = {
    Squat: s,
    Bench: b,
    Deadlift: d,
  };

  const normalizedPreparationMode = normalizePreparationMode(preparationMode);
  const normalizedDeadliftVariant = normalizeDeadliftVariant(deadliftVariant);
  const normalizedBenchPressVariant = normalizeBenchPressVariant(benchPressVariant);
  const normalizedSquatVariant = normalizeSquatVariant(squatVariant);

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
    }

    const firstWorkWeight = sets.length ? sets[0].weight : 20;

    const includePreparation =
      liftIndex === 0 ||
      normalizedPreparationMode === 'basicAll';

    return {
      lift: liftConfig.lift,
      squatVariant: liftConfig.lift === 'Squat' ? normalizedSquatVariant : undefined,
      deadliftVariant: liftConfig.lift === 'Deadlift' ? normalizedDeadliftVariant : undefined,
      benchPressVariant: liftConfig.lift === 'Bench' ? normalizedBenchPressVariant : undefined,
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
      cooldownItems: includeCooldown ? generateCooldownItems() : [],
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
  const wasHiddenRef = useRef(false);
  const restTimerDoneTitle = t.restTimerDone || 'Rest finished';
  const restTimerDoneMessage = t.restTimerDoneMessage || 'Your next set is ready.';
  const restTimerActiveTitle = t.restTimerActive || 'Rest timer active';
  const restTimerActiveMessage = t.restTimerActiveMessage || 'Resting…';

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

      if (document.hidden) {
        hasBeepedRef.current = true;
        return;
      }

      cancelRestTimerNotification();

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

      if (document.hidden) {
        wasHiddenRef.current = true;
        updateRemaining();
        return;
      }

      if (wasHiddenRef.current && Date.now() >= endTime) {
        hasBeepedRef.current = true;
        setRemaining(0);
        cancelRestTimerNotification();
        return;
      }

      updateRemaining();

      if (Date.now() < endTime) {
        intervalRef.current = setInterval(updateRemaining, 1000);
      }
    };

    hasBeepedRef.current = false;
    wasHiddenRef.current = document.hidden;
    setRemaining(seconds);

    clearFinishTimeout();
    timeoutRef.current = setTimeout(finishTimer, seconds * 1000);
    scheduleRestTimerNotification(
      endTime,
      restTimerDoneTitle,
      restTimerDoneMessage,
      restTimerActiveTitle,
      restTimerActiveMessage
    );

    startVisibleTick();
    document.addEventListener('visibilitychange', startVisibleTick);

    return () => {
      clearTick();
      clearFinishTimeout();
      cancelRestTimerNotification();
      document.removeEventListener('visibilitychange', startVisibleTick);
    };
  }, [
    seconds,
    endTime,
    restTimerDoneTitle,
    restTimerDoneMessage,
    restTimerActiveTitle,
    restTimerActiveMessage,
  ]);

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

function CooldownBlock({ items = [], onToggleItem = () => {}, t, isReadOnly = false, activeEnabled = true }) {
  const cooldownItems = items.length > 0 ? items : generateCooldownItems();
  const firstIncompleteIndex = cooldownItems.findIndex(item => !item.done);

  return (
    <div style={{
      background: 'transparent',
      border: 'none',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 10
    }}>
      <div style={{
        padding: '5px 10px',
        fontSize: WORKOUT_SECTION_TITLE_FONT_SIZE,
        fontWeight: 900,
        color: THEME.brown || '#a67c52',
        textAlign: 'center',
      }}>
        {t.cooldownTitle}
      </div>

      <div style={{ padding: '6px 10px' }}>
        {cooldownItems.map((item, index) => (
          <PrepRow
            key={index}
            item={item}
            isActive={!isReadOnly && activeEnabled && index === firstIncompleteIndex}
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
      margin: '7px 10px 9px',
      padding: '10px',
      display: 'grid',
      gap: 8,
      borderRadius: 12,
      border: `1px solid ${THEME.primary}`,
      background: 'rgba(243, 156, 18, 0.14)',
      boxShadow: '0 0 0 1px rgba(243, 156, 18, 0.08)'
    }}>
      <div style={{
        color: THEME.text,
        fontSize: 13,
        fontWeight: 900,
        lineHeight: 1.25,
        textAlign: 'center'
      }}>
        {t.setEffortQuestion}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 7
      }}>
        {SET_EFFORT_OPTIONS.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            style={{
              minHeight: 36,
              padding: '8px 4px',
              borderRadius: 10,
              border: `1px solid ${value === option ? THEME.primary : THEME.border}`,
              background: value === option ? THEME.primary : 'rgba(255, 255, 255, 0.06)',
              color: value === option ? THEME.bg : THEME.text,
              fontSize: 12,
              fontWeight: 900,
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
    const liftName = workoutLiftBlockLabel(liftBlock, t, benchPressVariant);
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

  const borderStyle = {};

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
        background: 'transparent',
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
  const displayPct = set.pct ? formatDecimalDisplay(Number((set.pct * 100).toFixed(1))) : null;
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
      1 × {set.reps} × {formatWorkoutWeightFromKg(set.weight, weightUnit, t, lift, benchPressVariant)}{set.perSide ? ` ${t.perSideSuffix || '/ side'}` : ''}{displayPct ? ` (${displayPct}%)` : ''}
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
      gap: 10,
      padding: compact ? '4px 0' : '7px 0',
      borderBottom: 'none'
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
            lineHeight: 1.25,
            marginTop: 3
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
                padding: '7px 9px',
                fontSize: 14,
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
        padding: 9,
        fontSize: 15,
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
                padding: '7px 9px',
                fontSize: 14,
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
                padding: '7px 9px',
                fontSize: 14,
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
      url: 'https://github.com/mburgosfr-star/kelani-sbd-tracker/issues/new?template=feedback.md',
    },
    {
      label: t.reportIssueShort || t.reportBug,
      url: 'https://github.com/mburgosfr-star/kelani-sbd-tracker/issues/new?template=bug_report.md',
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
            <label style={{ display: 'block', marginBottom: 12, fontWeight: 700, fontSize: 14 }}>{t.birthDate}</label>
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

          <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 16, padding: 12, marginBottom: 14 }}>
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
                marginBottom: 6
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
  const displayPct = firstSet.pct ? formatDecimalDisplay(Number((firstSet.pct * 100).toFixed(1))) : null;
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
      {entries.length} × {allSameReps ? firstSet.reps : '—'} × {allSameWeight ? formatWorkoutWeightFromKg(firstSet.weight, weightUnit, t, lift, benchPressVariant) : normalizeWeightUnit(weightUnit)}{firstSet.perSide ? ` ${t.perSideSuffix || '/ side'}` : ''}{displayPct ? ` (${displayPct}%)` : ''}
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
      {(acc.done || []).length} × {acc.reps} × {allSameWeight ? formatWeightFromKg(firstWeight, weightUnit) : normalizeWeightUnit(weightUnit)}{acc.perSide ? ` ${t.perSideSuffix || '/ side'}` : ''}
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

function getExerciseGuide(lift, t) {
  const guides = {
    Squat: {
      title: t.squat,
      videoUrl: '',
      steps: [
        t.squatGuideStep1 || 'Set the bar on your upper back and grip it firmly.',
        t.squatGuideStep2 || 'Step out, set your feet, breathe in and brace.',
        t.squatGuideStep3 || 'Squat down with knees and hips moving together.',
        t.squatGuideStep4 || 'Reach consistent depth, then drive back up with control.',
      ],
      safety: [
        t.squatGuideSafety1 || 'Use safety arms or spotters when training heavy.',
        t.squatGuideSafety2 || 'Do not cut depth by using more weight than you can control.',
      ],
    },
    Bench: {
      title: t.bench,
      videoUrl: '',
      steps: [
        t.benchGuideStep1 || 'Set your feet and pull your shoulder blades back and down.',
        t.benchGuideStep2 || 'Grip the bar evenly and unrack with control.',
        t.benchGuideStep3 || 'Lower the bar to your chest with a stable upper back.',
        t.benchGuideStep4 || 'Press up to lockout without losing position.',
      ],
      safety: [
        t.benchGuideSafety1 || 'Use safeties or a spotter when benching heavy.',
        t.benchGuideSafety2 || 'Do not bounce the bar off your chest.',
      ],
    },
    Deadlift: {
      title: t.deadlift,
      videoUrl: '',
      steps: [
        t.deadliftGuideStep1 || 'Stand with the bar over the middle of your foot.',
        t.deadliftGuideStep2 || 'Grip the bar, brace, and build tension before pulling.',
        t.deadliftGuideStep3 || 'Push the floor away and keep the bar close.',
        t.deadliftGuideStep4 || 'Stand tall at lockout, then lower the bar with control.',
      ],
      safety: [
        t.deadliftGuideSafety1 || 'Do not jerk the bar from a loose position.',
        t.deadliftGuideSafety2 || 'Stop the set if your position breaks down.',
      ],
    },
  };

  return guides[lift] || null;
}

function isExerciseGuideAvailableForLiftBlock(liftBlock, benchPressVariant = 'standard') {
  if (!liftBlock || !['Squat', 'Bench', 'Deadlift'].includes(liftBlock.lift)) return false;
  if (isSquatBeltAlternativeLiftBlock(liftBlock)) return false;
  if (isDeadliftAlternativeLiftBlock(liftBlock)) return false;
  if (isBenchMachineAlternativeLiftBlock(liftBlock)) return false;

  if (liftBlock.lift === 'Bench') {
    return normalizeBenchPressVariant(liftBlock.benchPressVariant || benchPressVariant) === 'standard';
  }

  return true;
}

function getYouTubeVideoId(url = '') {
  const value = String(url || '').trim();
  if (!value) return '';

  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }

  return '';
}

function buildYouTubeEmbedUrl(url = '') {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return '';

  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    loop: '1',
    playlist: videoId,
    playsinline: '1',
    controls: '0',
    modestbranding: '1',
    rel: '0',
  });

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

function ExerciseGuideModal({ lift, t, onClose }) {
  const guide = getExerciseGuide(lift, t);
  if (!guide) return null;

  const embedUrl = buildYouTubeEmbedUrl(guide.videoUrl);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.68)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 950,
      padding: 16
    }}>
      <div style={{
        background: THEME.card,
        border: `1px solid ${THEME.border}`,
        borderRadius: 14,
        padding: 18,
        maxWidth: 420,
        width: '100%',
        color: THEME.text
      }}>
        <h3 style={{
          margin: '0 0 10px',
          textAlign: 'center',
          color: getLiftThemeColor(lift),
          fontSize: 22,
          fontWeight: 900
        }}>
          {guide.title}
        </h3>

        {guide.videoUrl && embedUrl ? (
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            marginBottom: 14,
            borderRadius: 10,
            overflow: 'hidden',
            border: `1px solid ${THEME.border}`,
            background: '#000'
          }}>
            <iframe
              title={`${guide.title} video`}
              src={embedUrl}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 0
              }}
            />
          </div>
        ) : guide.videoUrl ? (
          <button
            type="button"
            onClick={() => window.open(guide.videoUrl, '_blank', 'noopener,noreferrer')}
            style={{
              width: '100%',
              padding: 11,
              marginBottom: 14,
              borderRadius: 8,
              border: `1px solid ${THEME.primary}`,
              background: THEME.card,
              color: '#ffffff',
              fontWeight: 900,
              cursor: 'pointer'
            }}
          >
            {t.watchVideo || 'Watch video'}
          </button>
        ) : (
          <div style={{
            padding: 11,
            marginBottom: 14,
            borderRadius: 8,
            border: `1px solid ${THEME.border}`,
            color: THEME.muted,
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 800
          }}>
            {t.videoComingSoon || 'Video coming soon'}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{ color: THEME.primary, fontWeight: 900, marginBottom: 8 }}>
            {t.howToPerform || 'How to perform'}
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, color: THEME.text, lineHeight: 1.45, fontSize: 14 }}>
            {guide.steps.map((step, index) => (
              <li key={`step-${index}`} style={{ marginBottom: 6 }}>{step}</li>
            ))}
          </ol>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ color: THEME.primary, fontWeight: 900, marginBottom: 8 }}>
            {t.safetyNotes || 'Safety notes'}
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, color: THEME.muted, lineHeight: 1.45, fontSize: 14 }}>
            {guide.safety.map((note, index) => (
              <li key={`safety-${index}`} style={{ marginBottom: 6 }}>{note}</li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            padding: 11,
            borderRadius: 8,
            border: `1px solid ${THEME.border}`,
            background: 'transparent',
            color: THEME.text,
            fontWeight: 800,
            cursor: 'pointer'
          }}
        >
          {t.close || 'Close'}
        </button>
      </div>
    </div>
  );
}

function CurrentWorkout({ workout, currentCycle, totalWorkouts, onTogglePrepItem, onToggleWarmup, onToggleSet, onMarkSetFailed, onRestoreSetWeight, onToggleAccessorySet, onMarkAccessorySetFailed, onRestoreAccessoryWeight, onToggleCooldownItem, onToggleMeetPrepItem, onToggleMeetWarmup, onToggleMeetSet, onMarkMeetSetFailed, onRestoreMeetSetWeight, onMeetWeightChange, onMeetSetEffortChange, onWeightChange, onSetEffortChange, onAccessoryWeightChange, onComplete, onViewAll, onActivateWorkout, showNewCycle, newCyclePRs, onStartNewCycle, isReadOnly, t, weightUnit = WEIGHT_UNITS.KG, benchPressVariant = 'standard', timer, setTimer, startTimer }) {
  const effectiveBenchPressVariant = workout?.type === 'meet' ? 'standard' : benchPressVariant;
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  const [selectedExerciseGuideLift, setSelectedExerciseGuideLift] = useState(null);

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
        onDismiss={() => {
          cancelRestTimerNotification();
          setTimer(null);
        }}
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
    const allAccessoriesDone = (workout.accessories || []).every(acc =>
      (acc.done || []).every(Boolean)
    );

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
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '10px 14px 16px', fontFamily: 'sans-serif' }}>
        {selectedExerciseGuideLift && (
          <ExerciseGuideModal
            lift={selectedExerciseGuideLift}
            t={t}
            onClose={() => setSelectedExerciseGuideLift(null)}
          />
        )}

        <AppHeader
          t={t}
          title={<WorkoutTitle workout={workout} t={t} benchPressVariant={effectiveBenchPressVariant} />}
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
  border: 'none',
  borderRadius: 10,
  background: 'transparent',
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
              style={{ background: 'transparent', border: 'none', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}
            >
              <div style={{
                padding: '6px 10px',
                textAlign: 'center',
              }}>
                {(() => {
                  const guideAvailable = isExerciseGuideAvailableForLiftBlock(liftBlock, effectiveBenchPressVariant);
                  const liftColor = ({
                    Squat: THEME.red,
                    Bench: THEME.primary,
                    Deadlift: THEME.yellow,
                  }[liftBlock.lift] || THEME.text);

                  return (
                    <button
                      type="button"
                      disabled={!guideAvailable}
                      onClick={() => guideAvailable && setSelectedExerciseGuideLift(liftBlock.lift)}
                      title={guideAvailable ? (t.exerciseGuide || 'Guide') : undefined}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        padding: 0,
                        border: 'none',
                        background: 'transparent',
                        color: liftColor,
                        fontSize: WORKOUT_SECTION_TITLE_FONT_SIZE,
                        fontWeight: 900,
                        cursor: guideAvailable ? 'pointer' : 'default',
                      }}
                    >
                      <span>{workoutLiftBlockLabel(liftBlock, t, effectiveBenchPressVariant)}</span>
                      {guideAvailable && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 11,
                          height: 11,
                          borderRadius: 999,
                          border: `1px solid ${liftColor}`,
                          color: liftColor,
                          fontSize: 8,
                          fontWeight: 900,
                          lineHeight: 1,
                          transform: 'translateY(-7px)',
                          marginLeft: 1,
                        }}>
                          i
                        </span>
                      )}
                    </button>
                  );
                })()}
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
                const groupedSetEntries = getWorkoutSetGroupEntries(liftBlock.sets || [], set);
                const groupedSetLabel = getWorkoutSetGroupLabel(set, liftBlock.sets || [], t);

                const secondarySetEntries = (liftBlock.sets || [])
                  .map((secondarySet, secondaryIndex) => ({ set: secondarySet, index: secondaryIndex }));

                const isSecondaryTrainingLift =
                  !isMeetDay &&
                  li > 0 &&
                  secondarySetEntries.length > 1 &&
                  !secondarySetEntries.some(({ set }) => isGroupedWorkoutSet(set));

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
                        label={groupedSetLabel}
                        t={t}
                        weightUnit={weightUnit}
                        lift={liftBlock.lift}
                        benchPressVariant={effectiveBenchPressVariant}
                      />
                    </React.Fragment>
                  );
                }

                if (isGroupedWorkoutSet(set)) {
                  if (groupedSetEntries[0]?.index !== si) return null;

                  const firstIncompleteBackoff = groupedSetEntries.find(({ set: groupedSet }) => !groupedSet.done && !groupedSet.skipped)?.index ?? -1;
                  const groupContainsNextSet = groupedSetEntries.some(({ index }) => index === firstIncompleteSet);

                  return (
                    <React.Fragment key={`set-group-${li}-${si}`}>
                      <BackoffGroup
                        entries={groupedSetEntries}
                        activeIndex={
                          !isReadOnly &&
                          li === firstIncompleteLiftIndex &&
                          allPrepDone &&
                          allWarmupsDone &&
                          groupContainsNextSet
                            ? firstIncompleteBackoff
                            : -1
                        }
                        isReadOnly={isReadOnly}
                        onToggle={index => handleToggle(() => onToggleMeetSet(li, index))}
                        onEditAll={val => groupedSetEntries.forEach(({ index }) => onMeetWeightChange(li, index, val))}
                        onRestoreAll={() => groupedSetEntries.forEach(({ index }) => onRestoreMeetSetWeight(li, index))}
                        onMarkFailed={index => handleToggle(() => onMarkMeetSetFailed(li, index))}
                        renderTimer={index => renderInlineTimer({ type: 'meetSet', liftIndex: li, index })}
                        label={groupedSetLabel}
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
            background: 'transparent',
            border: 'none',
            borderRadius: 8,
            overflow: 'hidden',
            marginBottom: 10
          }}>
            <div style={{
              padding: '6px 10px',
              fontSize: WORKOUT_SECTION_TITLE_FONT_SIZE,
              fontWeight: 900,
              color: THEME.brown || '#a67c52',
              textAlign: 'center',
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

        {!isMeetDay && (workout.cooldownItems || []).length > 0 && (
          <CooldownBlock
            items={workout.cooldownItems}
            onToggleItem={index => handleToggle(() => onToggleCooldownItem(index))}
            t={t}
            isReadOnly={isReadOnly}
            activeEnabled={allMainLiftSetsDone && allAccessoriesDone}
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
  const allAccessoriesDone = (workout.accessories || []).every(acc =>
    (acc.done || []).every(Boolean)
  );
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
        <div style={{ background: 'transparent', border: 'none', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            padding: '6px 10px',
            fontSize: WORKOUT_SECTION_TITLE_FONT_SIZE,
            fontWeight: 900,
            color: THEME.brown || '#a67c52',
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
          background: 'transparent',
          border: 'none',
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
        background: 'transparent',
        border: 'none',
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
          const groupedSetEntries = getWorkoutSetGroupEntries(workout.sets || [], set);
          const groupedSetLabel = getWorkoutSetGroupLabel(set, workout.sets || [], t);
          const firstIncomplete = workout.sets.findIndex(s => !s.done);
          const hasLaterSetAction = workout.sets.some((laterSet, laterIndex) =>
            laterIndex > i && (laterSet.done || laterSet.failed || laterSet.skipped)
          );
          const showSetNotice = set.failed || (set.skipped && !hasLaterSetAction);

          if (isGroupedWorkoutSet(set)) {
            if (groupedSetEntries[0]?.index !== i) return null;

            const firstIncompleteBackoff = groupedSetEntries.find(({ set: groupedSet }) => !groupedSet.done && !groupedSet.skipped)?.index ?? -1;
            const groupContainsNextSet = groupedSetEntries.some(({ index }) => index === firstIncomplete);

            return (
              <React.Fragment key={`set-group-${i}`}>
                <BackoffGroup
                  entries={groupedSetEntries}
                  activeIndex={!isReadOnly && allWarmupsDone && groupContainsNextSet ? firstIncompleteBackoff : -1}
                  isReadOnly={isReadOnly}
                  onToggle={index => handleToggle(() => onToggleSet(index))}
                  onEditAll={val => groupedSetEntries.forEach(({ index }) => onWeightChange('set', index, val))}
                  onRestoreAll={() => groupedSetEntries.forEach(({ index }) => onRestoreSetWeight(index))}
                  onMarkFailed={index => handleToggle(() => onMarkSetFailed(index))}
                  renderTimer={index => renderInlineTimer({ type: 'main', index })}
                  label={groupedSetLabel}
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
                  gap: 8
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
          background: 'transparent',
          border: 'none',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 10
        }}>
          <div style={{
            padding: '6px 10px',
            fontSize: WORKOUT_SECTION_TITLE_FONT_SIZE,
            fontWeight: 900,
            color: THEME.brown || '#a67c52',
            textAlign: 'center',
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

      {(workout.cooldownItems || []).length > 0 && (
        <CooldownBlock
          items={workout.cooldownItems}
          onToggleItem={index => handleToggle(() => onToggleCooldownItem(index))}
          t={t}
          isReadOnly={isReadOnly}
          activeEnabled={allDone && allAccessoriesDone}
        />
      )}

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
const neutralChartColor = THEME.brown || '#a67c52';

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

function ensureStrictMeetAttempts(attempts) {
  const minStep = 2.5;
  const opener = Number(attempts.opener) || 0;
  let second = Number(attempts.second) || 0;
  let third = Number(attempts.third) || 0;

  if (opener > 0 && second <= opener) {
    second = opener + minStep;
  }

  if (second > 0 && third <= second) {
    third = second + minStep;
  }

  return {
    ...attempts,
    opener,
    second,
    third,
  };
}

const suggestedMeetPlan = LIFT_ORDER.map(lift => {
  const e1rm = bestStats[lift]?.e1rm || 0;

  return ensureStrictMeetAttempts({
    lift,
    e1rm,
    opener: roundAttempt(e1rm * 0.90),
    second: roundAttempt(e1rm * 0.975),
    third: roundAttempt(e1rm * 1.025),
  });
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

  function renderChart(data, dataKeys, colors, emptyMessage = t.noStatsData) {
    if (!data || data.length === 0) {
      return (
        <p style={{ color: THEME.text, textAlign: 'center', padding: 14 }}>
          {emptyMessage}
        </p>
      );
    }

    const visibleSourceData = data.length <= 10
      ? data
      : Array.from({ length: 10 }, (_, index) => {
          const sourceIndex = Math.round(index * (data.length - 1) / 9);
          return data[sourceIndex];
        });

    const visibleData = visibleSourceData.map((item, index) => ({
      ...item,
      chartIndex: index + 1,
    }));

    const yValues = visibleData
      .flatMap(item => dataKeys.map(key => Number(item[key])))
      .filter(value => Number.isFinite(value));

    let yDomain = ['auto', 'auto'];
    let yTicks = undefined;

    function midpointTicks(lower, upper) {
      const midpoint = (lower + upper) / 2;
      return [lower, midpoint, upper].map(value => {
        const rounded = Math.round(value * 100) / 100;
        return Object.is(rounded, -0) ? 0 : rounded;
      });
    }

    function chooseDomainUnit(minY, maxY) {
      const largest = Math.max(Math.abs(minY), Math.abs(maxY));

      if (largest >= 1000) return 100;
      if (largest >= 100) return 10;
      if (largest >= 10) return 10;
      if (largest >= 2) return 1;
      return 0.1;
    }

    if (yValues.length > 0) {
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);
      const unit = chooseDomainUnit(minY, maxY);

      let lower = Math.floor(minY / unit) * unit;
      let upper = Math.ceil(maxY / unit) * unit;

      if (lower === upper) {
        lower -= unit;
        upper += unit;
      }

      if (minY <= lower) lower -= unit;
      if (maxY >= upper) upper += unit;

      lower = Math.round(lower * 100) / 100;
      upper = Math.round(upper * 100) / 100;

      yDomain = [lower, upper];

      yTicks = midpointTicks(lower, upper);
    }

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

    const isStrengthChart = dataKeys.some(key => ['strength', 'eStrength'].includes(key));

    function formatChartValue(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return value;

      return formatDecimalDisplay(numericValue, {
        maximumFractionDigits: isStrengthChart ? 2 : 1,
      });
    }

    return (
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={visibleData} margin={{ top: 2, right: 12, left: 10, bottom: 0 }}>
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
            width={58}
            domain={yDomain}
            ticks={yTicks}
            tickFormatter={formatChartValue}
            tickMargin={4}
            allowDecimals={true}
          />
          <Tooltip
  labelFormatter={(value, payload) => payload?.[0]?.payload?.label || labelByX[value] || value}
  formatter={(value, name) => [formatChartValue(value), chartMetricLabel(name)]}
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
              background: `${neutralChartColor}14`,
              border: `1px solid ${neutralChartColor}`,
              borderRadius: 10,
              padding: 8,
              marginBottom: 6
            }}
          >
            <h3 style={{ margin: '0 0 4px', color: neutralChartColor }}>{chart.title}</h3>
            {renderChart(chart.data, [chart.key], [chart.color])}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '10px 14px 16px', fontFamily: 'sans-serif' }}>
      <AppHeader
        t={t}
        title={t.stats}
        subtitle={`${t.cycle} ${currentCycle} · ${t.workoutProgress} ${Math.min(currentIndex + 1, totalWorkouts)} / ${totalWorkouts}`}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 6,
        marginBottom: 8
      }}>
        {statsTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActivescreen(tab.key)}
            style={{
              width: '100%',
              minHeight: 38,
              padding: '8px 6px',
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
        background: `${COLORS[lift]}14`,
        border: `1px solid ${COLORS[lift]}`,
        borderRadius: 10,
        padding: 10,
        marginBottom: 8
      }}
    >
      <h3 style={{ margin: '0 0 6px', color: COLORS[lift] }}>
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
            background: `${neutralChartColor}14`,
            border: `1px solid ${neutralChartColor}`,
            borderRadius: 10,
            padding: 10,
            marginBottom: 8
          }}>
            <h3 style={{ margin: '0 0 6px', color: neutralChartColor }}>{t.totalSBD}</h3>
            {renderChart(totalData.map(entry => ({ ...entry, oneRM: chartWeightFromKg(entry.oneRM), e1rm: chartWeightFromKg(entry.e1rm) })), ['oneRM', 'e1rm'], [THEME.muted, THEME.primary])}
          </div>

          <div style={{
            background: `${neutralChartColor}14`,
            border: `1px solid ${neutralChartColor}`,
            borderRadius: 10,
            padding: 8
          }}>
            <h3 style={{ margin: '0 0 4px', color: neutralChartColor }}>{t.strengthTotalBodyweight}</h3>
            {renderChart(strengthData, ['strength', 'eStrength'], [THEME.muted, THEME.primary], t.noMetricData || t.noStatsData)}
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
  <div style={{ background: 'transparent', border: 'none', borderRadius: 8, padding: 0 }}>
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
      padding: 10,
      border: `1px solid ${neutralChartColor}`,
      borderRadius: 10,
      background: `${neutralChartColor}14`
    }}>
      <div>
        <h3 style={{ margin: '0 0 6px', color: neutralChartColor }}>
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
        minWidth: 108,
        padding: '8px 10px',
        border: `1px solid ${neutralChartColor}`,
        borderRadius: 10,
        background: `${neutralChartColor}1f`,
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

    <div style={{ display: 'grid', gap: 8 }}>
      {meetPlan.map(row => (
        <div
          key={row.lift}
          style={{
            border: `1px solid ${COLORS[row.lift]}`,
            borderRadius: 10,
            padding: 10,
            background: `${COLORS[row.lift]}14`
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
                  border: 'none',
                  borderRadius: 8,
                  padding: 4,
                  textAlign: 'center',
                  background: 'transparent'
                }}
              >
                <div style={{
                  color: THEME.text,
                  fontSize: 11,
                  fontWeight: 800,
                  lineHeight: 1.15,
                  minHeight: 22,
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
                    padding: '6px 4px',
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
      marginTop: 8,
      padding: 10,
      border: `1px solid ${neutralChartColor}`,
      borderRadius: 10,
      background: `${neutralChartColor}14`,
      display: 'grid',
      gap: 6,
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
        <h3 style={{ margin: '0 0 10px', textAlign: 'center', color: THEME.brown || '#a67c52' }}>
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

function programActionButtonStyle(accentColor = THEME.primary, margin = '0') {
  return {
    width: '100%',
    margin,
    padding: 12,
    fontSize: 14,
    fontWeight: 800,
    background: THEME.card,
    color: '#ffffff',
    border: `1px solid ${accentColor}`,
    borderRadius: 8,
    cursor: 'pointer',
  };
}

function ProgramProfileSection({ programProfile, onChangeProgramProfile, t }) {
  const [showProgramOptions, setShowProgramOptions] = useState(false);
  const profile = normalizeProgramProfile(programProfile);

  const labels = {
    kelaniSbd: t.programProfileKelaniSbd || 'Kelani SBD',
    kelaniSbdPlus: t.programProfileKelaniSbdPlus || 'Kelani SBD Plus',
    kelaniSbdLower: t.programProfileKelaniSbdLower || 'Kelani SBD Lower',
    kelaniSbdLowerPlus: t.programProfileKelaniSbdLowerPlus || 'Kelani SBD Lower Plus',
  };

  const descriptions = {
    kelaniSbd: t.programProfileKelaniSbdText || 'Basic Squat, Bench Press and Deadlift. No preparation, accessories, alternatives or cooldown.',
    kelaniSbdPlus: t.programProfileKelaniSbdPlusText || 'Adds general preparation, standard accessories and cooldown. Best for regular gym training.',
    kelaniSbdLower: t.programProfileKelaniSbdLowerText || 'Lower-body focused version with Squat, Good Morning and Hip Thrust. No upper-body main lifts.',
    kelaniSbdLowerPlus: t.programProfileKelaniSbdLowerPlusText || 'Kelani SBD Lower with lower-body friendly accessories added.',
  };

  const profiles = ['kelaniSbd', 'kelaniSbdPlus', 'kelaniSbdLower', 'kelaniSbdLowerPlus'];

  return (
    <>
      <button
        type="button"
        onClick={() => setShowProgramOptions(true)}
        style={programActionButtonStyle(THEME.primary, '8px 0 0')}
      >
        {t.adjustProgram || 'Adjust program'}
      </button>

      {showProgramOptions && (
        <SettingsModal
          title={t.adjustProgram || 'Adjust program'}
          onClose={() => setShowProgramOptions(false)}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            {profiles.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChangeProgramProfile(option);
                  setShowProgramOptions(false);
                }}
                style={{
                  width: '100%',
                  padding: 12,
                  fontSize: 15,
                  fontWeight: 800,
                  textAlign: 'left',
                  borderRadius: 8,
                  border: `1px solid ${profile === option ? THEME.primary : THEME.border}`,
                  background: profile === option ? THEME.primary : THEME.card,
                  color: profile === option ? THEME.bg : THEME.text,
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 900 }}>
                  {labels[option]}
                </div>
                <div style={{
                  marginTop: 4,
                  color: profile === option ? THEME.bg : THEME.muted,
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1.35
                }}>
                  {descriptions[option]}
                </div>
              </button>
            ))}
          </div>

          <div style={{
            marginTop: 12,
            color: THEME.muted,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.35,
            textAlign: 'center'
          }}>
            {t.programProfileChangeNote || 'Program changes apply to current and future workouts. Completed workouts stay unchanged.'}
          </div>

          <button
            type="button"
            onClick={() => setShowProgramOptions(false)}
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
            {t.cancel || t.back || 'Cancel'}
          </button>
        </SettingsModal>
      )}
    </>
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
      <button
        onClick={() => setShowStartCycleConfirm(true)}
        style={programActionButtonStyle(THEME.primary, '6px 0 0')}
      >
        {t.startNewCycle}
      </button>

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
            <h3 style={{ margin: '0 0 10px', textAlign: 'center', color: THEME.brown || '#a67c52' }}>
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

function getLiftThemeColor(lift) {
  return ({
    Squat: THEME.red,
    Bench: THEME.primary,
    Deadlift: THEME.yellow,
  }[lift] || THEME.text);
}

function WorkoutTitle({ workout, t, benchPressVariant = 'standard' }) {
  const effectiveBenchPressVariant = workout?.type === 'meet' ? 'standard' : benchPressVariant;

  if (!workout || workout.type === 'rest') return t.deload;
  if (workout.type === 'meet') return t.sbdMeetDay || t.meetDay;

  const liftBlocks = (workout.lifts || []).length > 0
    ? workout.lifts
    : [{ lift: workout.lift }];

  return (
    <>
      {liftBlocks.map((liftBlock, index) => (
        <React.Fragment key={`workout-title-${liftBlock.lift}-${index}`}>
          {index > 0 && (
            <span style={{ color: THEME.muted }}> + </span>
          )}
          <span style={{ color: getLiftThemeColor(liftBlock.lift) }}>
            {workoutLiftBlockLabel(liftBlock, t, effectiveBenchPressVariant)}
          </span>
        </React.Fragment>
      ))}
    </>
  );
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
      const groupLabelKey = set.groupLabelKey || null;
      const label = groupLabelKey
        ? t[groupLabelKey]
        : labelKey
          ? t[labelKey]
          : set.label || t.set;
      const last = groups[groups.length - 1];

      if (
        last &&
        last.labelKey === labelKey &&
        last.groupLabelKey === groupLabelKey &&
        last.label === label &&
        last.reps === set.reps &&
        last.weight === set.weight
      ) {
        last.count += 1;
        return;
      }

      groups.push({
        labelKey,
        groupLabelKey,
        label,
        reps: set.reps,
        weight: set.weight,
        count: 1,
      });
    });

    const onlyBackoff = groups.length > 0 && groups.every(group => group.labelKey === 'backoff');
    const showLiftName = (workout.lifts || []).length > 1;
    const liftName = workoutLiftBlockLabel(liftBlock, t, effectiveBenchPressVariant);

    return groups.map(group => {
      const weightText = formatWorkoutWeightFromKg(group.weight, weightUnit, t, liftBlock.lift, liftBlock.benchPressVariant || effectiveBenchPressVariant);

      if (group.groupLabelKey) {
        return `${group.label}: ${group.count}×${group.reps}×${weightText}`;
      }

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
    <div style={{ textAlign: 'center', marginBottom: 8 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 3
      }}>
        <img
          src="/kelani-banner.png"
          alt=""
          aria-hidden="true"
          style={{
            width: 'min(340px, 82vw)',
            maxHeight: 98,
            objectFit: 'contain',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none'
          }}
        />
      </div>

      <div style={{
        color: THEME.muted,
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1,
        marginBottom: 7
      }}>
        {process.env.REACT_APP_VERSION ? `v${process.env.REACT_APP_VERSION}` : 'dev'}
      </div>

      <h2 style={{
        margin: 0,
        fontSize: 30,
        fontWeight: 900,
        lineHeight: 1.15,
        color: THEME.brown || '#a67c52',
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
  if (!entry) return false;

  const hasWorkoutNumber =
    Number.isFinite(Number(entry.workoutNumber)) &&
    Number(entry.workoutNumber) > 0;

  if (entry.workoutSnapshot) {
    return hasWorkoutNumber;
  }

  return Boolean(hasWorkoutNumber && entry.lift);
}

function applyCompletedHistorySnapshotsToWorkouts(workouts = [], history = [], currentCycle) {
  const completedSnapshotsByWorkoutNumber = new Map();

  (history || []).forEach(entry => {
    if (
      Number(getEntryCycle(entry)) === Number(currentCycle) &&
      Number.isFinite(Number(entry?.workoutNumber)) &&
      entry?.workoutSnapshot &&
      isCompletedHistoryEntry(entry)
    ) {
      completedSnapshotsByWorkoutNumber.set(Number(entry.workoutNumber), {
        ...entry.workoutSnapshot,
        completed: true,
        completedAt: entry.workoutSnapshot.completedAt || entry.completedAt || null,
        completedDate: entry.workoutSnapshot.completedDate || entry.date || null,
      });
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

function AllWorkouts({ workouts, currentIndex, completedWorkoutCount, completedWorkoutNumbers = [], currentCycle, onSelect, onBack, onStats, onStartNewCycle, programProfile, onChangeProgramProfile, t, weightUnit = WEIGHT_UNITS.KG, benchPressVariant = 'standard' }) {
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

  function formatCompletedAt(value, fallbackDate = null) {
    if (!value && fallbackDate) return fallbackDate;
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallbackDate;

    return date.toLocaleString(decimalLocale(), {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

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

  function renderWorkoutListToggleButton(position = 'top') {
    if (!hasHiddenWorkouts) return null;
    return (
      <button
        type="button"
        onClick={() => setShowAllWorkouts(value => !value)}
        style={programActionButtonStyle(THEME.primary, position === 'top' ? '0 0 8px' : '2px 0 6px')}
      >
        {showAllWorkouts ? t.showFewerWorkouts : t.showAllWorkouts}
      </button>
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '10px 14px 16px', fontFamily: 'sans-serif' }}>
      <AppHeader
        t={t}
        title={t.program}
        subtitle={`${t.cycle} ${currentCycle} · ${t.workoutProgress} ${Math.min(currentIndex + 1, workouts.length)} / ${workouts.length}`}
      />

      {renderWorkoutListToggleButton('top')}

      {visibleWorkoutEntries.map(({ workout, idx }) => {
        const isCurrent = idx === currentIndex;
        const isDone = completedWorkoutNumberSet.has(Number(workout.number)) || Boolean(workout.completed);
        const completedAtLabel = isDone ? formatCompletedAt(workout.completedAt, workout.completedDate || workout.date) : null;
        const focusColor = getLiftThemeColor(workout.lift);
        const headerBg = isCurrent ? focusColor : workout.type === 'rest' ? THEME.brown : THEME.border;
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
              padding: '9px 12px',
              marginBottom: 6,
              borderRadius: 8,
              border: isCurrent ? `2px solid ${focusColor}` : 'none',
              background: 'transparent',
              cursor: 'pointer',
              opacity: 1
            }}
          >
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: headerBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 16,
              marginRight: 10,
              flexShrink: 0
            }}>
              {workout.number}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: isCurrent ? 800 : 700 }}>
                <WorkoutTitle workout={workout} t={t} benchPressVariant={benchPressVariant} />
                {isCurrent && (
                  <span style={{
                    fontSize: 11,
                    background: focusColor,
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

              {completedAtLabel && (
                <div style={{
                  fontSize: 11,
                  color: THEME.muted,
                  fontWeight: 700,
                  marginTop: 3
                }}>
                  ✓ {completedAtLabel}
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

            {isDone && !completedAtLabel && <span style={{ color: THEME.primary, fontSize: 18, marginLeft: 8 }}>✅</span>}
          </div>
        );
      })}

      {renderWorkoutListToggleButton('bottom')}

      <StartNewCycleSection
        onStartNewCycle={onStartNewCycle}
        t={t}
      />

      <ProgramProfileSection
        programProfile={programProfile}
        onChangeProgramProfile={onChangeProgramProfile}
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

  function goToNextOnboardingStep() {
    if (onboardingStep === 2 && !hasRequiredTrainingDetails()) {
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

    const normalizedBirthDate = birthDate ? parseBirthDateInput(birthDate) : '';

    if (!s || !b || !d || (birthDate && !normalizedBirthDate)) {
      setOnboardingError(t.fillRequiredFields);
      return;
    }

    setOnboardingError('');
    onStart(s, b, d, { birthDate: normalizedBirthDate, sex, weightUnit: selectedWeightUnit }, buildInitialBodyData());
  }

  const bodyFields = [
    { key: 'bodyWeight', label: `${t.bodyweight} (${t.optional})`, unit: onboardingWeightUnit },
    { key: 'bodyFat', label: `${t.bodyFatPercent} (${t.optional})`, unit: '%' },
    { key: 'bodyWater', label: `${t.bodyWaterPercent} (${t.optional})`, unit: '%' },
    { key: 'visceralFat', label: `${t.visceralFatRating} (${t.optional})` },
    { key: 'physiqueRating', label: `${t.physiqueRating} (${t.optional})` },
    { key: 'boneMass', label: `${t.boneMassKg} (${t.optional})`, unit: onboardingWeightUnit },
  ];

  return (
    <div style={{
      maxWidth: 500,
      margin: '0 auto',
      padding: 24,
      paddingTop: 24,
      minHeight: '100vh',
      fontFamily: 'sans-serif',
      background: THEME.bg,
      color: THEME.text
    }}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <img
          src="/kelani-banner.png"
          alt={t.appName}
          style={{
            width: 'min(360px, 92vw)',
            height: 'auto',
            display: 'block',
            margin: '0 auto 4px'
          }}
        />
        <div style={{
          color: THEME.muted,
          fontSize: 11,
          fontWeight: 800,
          lineHeight: 1
        }}>
          {process.env.REACT_APP_VERSION ? `v${process.env.REACT_APP_VERSION}` : 'dev'}
        </div>
      </div>

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

        {onboardingStep !== 1 && (
          <p style={{
            margin: '0 0 14px',
            color: THEME.muted,
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.4,
            textAlign: 'center'
          }}>
            {onboardingStep === 2
              ? t.onboardingMaxHelp
              : onboardingStep === 3
              ? t.onboardingProfileHelp
              : t.onboardingBodyHelp}
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
              margin: '0 0 10px',
              color: THEME.red,
              fontSize: 30,
              fontWeight: 900,
              lineHeight: 1.15,
              textAlign: 'left'
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
        ].map(([lift, label, val, setter]) => {
          const liftColor = lift === 'Squat'
            ? THEME.red
            : lift === 'Deadlift'
              ? THEME.yellow
              : THEME.primary;

          return (
          <div
            key={lift}
            style={{
              marginBottom: 16,
              padding: 10,
              borderRadius: 10,
              border: `1px solid ${liftColor}`,
              background: `${liftColor}14`
            }}
          >
            <label style={{ display: 'block', marginBottom: 10, fontWeight: 800, color: liftColor }}>
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
                  border: `1px solid ${liftColor}`,
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

            <div style={{ background: THEME.bg, border: `1px solid ${liftColor}`, borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: liftColor, marginBottom: 8 }}>
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
                  border: `1px solid ${liftColor}`,
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                {t.calculateE1RM}
              </button>
            </div>
          </div>
          );
        })}
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
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setShowLaunchSplash(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, []);

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
  const [programProfile, setProgramProfile] = useState(() =>
    normalizeProgramProfile(localStorage.getItem('programProfile'))
  );
  const [accessoryMode, setAccessoryMode] = useState('off');
  const [preparationMode, setPreparationMode] = useState('basicFirst');
  const [squatVariant, setSquatVariant] = useState(() =>
    normalizeSquatVariant(localStorage.getItem('squatVariant'))
  );
  const [benchPressVariant, setBenchPressVariant] = useState(() =>
    normalizeBenchPressVariant(localStorage.getItem('benchPressVariant'))
  );
  const [deadliftVariant, setDeadliftVariant] = useState(() =>
    normalizeDeadliftVariant(localStorage.getItem('deadliftVariant'))
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
    localStorage.setItem('programProfile', normalizeProgramProfile(programProfile));
  }, [programProfile]);

  useEffect(() => {
    localStorage.setItem('squatVariant', normalizeSquatVariant(squatVariant));
  }, [squatVariant]);

  useEffect(() => {
    localStorage.setItem('benchPressVariant', normalizeBenchPressVariant(benchPressVariant));
  }, [benchPressVariant]);

  useEffect(() => {
    localStorage.setItem('deadliftVariant', normalizeDeadliftVariant(deadliftVariant));
  }, [deadliftVariant]);

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
        Number(getEntryCycle(entry)) === Number(currentCycle) &&
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
      const hasSavedProgramProfile = Boolean(data.programProfile);
      const savedProgramProfile = hasSavedProgramProfile
        ? normalizeProgramProfile(data.programProfile)
        : detectProgramProfile({
            preparationMode: data.preparationMode,
            accessoryMode: data.accessoryMode,
            squatVariant: data.squatVariant || localStorage.getItem('squatVariant'),
            benchPressVariant: data.benchPressVariant || localStorage.getItem('benchPressVariant'),
            deadliftVariant: data.deadliftVariant,
          });
      const profileSettings = settingsForProgramProfile(savedProgramProfile);
      const savedAccessoryMode = hasSavedProgramProfile
        ? normalizeAccessoryMode(profileSettings.accessoryMode)
        : normalizeAccessoryMode(data.accessoryMode);
      const savedPreparationMode = hasSavedProgramProfile
        ? normalizePreparationMode(profileSettings.preparationMode)
        : normalizePreparationMode(data.preparationMode);
      const savedSquatVariant = hasSavedProgramProfile
        ? normalizeSquatVariant(profileSettings.squatVariant)
        : normalizeSquatVariant(data.squatVariant || localStorage.getItem('squatVariant'));
      const savedDeadliftVariant = hasSavedProgramProfile
        ? normalizeDeadliftVariant(profileSettings.deadliftVariant)
        : normalizeDeadliftVariant(data.deadliftVariant);
      const savedBenchPressVariant = hasSavedProgramProfile
        ? normalizeBenchPressVariant(profileSettings.benchPressVariant)
        : normalizeBenchPressVariant(data.benchPressVariant || localStorage.getItem('benchPressVariant'));
      const includeCooldown = hasSavedProgramProfile
        ? profileSettings.includeCooldown
        : true;
      const generatedWorkouts = generateProgram(squat, bench, deadlift, savedAccessoryMode, data.accessoryPRs || {}, savedPreparationMode, savedDeadliftVariant, savedBenchPressVariant, savedSquatVariant, includeCooldown);
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

      const cleanedWorkouts = removeDeprecatedPrepItemsFromWorkouts(normalizedWorkouts);

      setWorkouts(applyMeetPlannerAttemptsToWorkouts(
        cleanedWorkouts,
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
      setProgramProfile(savedProgramProfile);
      setAccessoryMode(savedAccessoryMode);
      setPreparationMode(savedPreparationMode);
      setSquatVariant(savedSquatVariant);
      setDeadliftVariant(savedDeadliftVariant);
      setBenchPressVariant(savedBenchPressVariant);

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
      programProfile,
      accessoryMode,
      preparationMode,
      squatVariant,
      deadliftVariant,
      benchPressVariant,
      inProgress: {
        programVersion: PROGRAM_VERSION,
        currentCycle,
        currentIndex,
        selectedIndex,
        workouts,
      },
    }));
  }, [history, prs, accessoryPRs, currentCycle, currentIndex, bodyWeights, userProfile, meetPlannerAttempts, meetPrepChecklist, restTimeSeconds, programProfile, accessoryMode, preparationMode, squatVariant, deadliftVariant, benchPressVariant, selectedIndex, workouts]);

  useEffect(() => {
    if (!prs.Squat || !prs.Bench || !prs.Deadlift) return;

    const generatedWorkouts = generateProgram(
      prs.Squat,
      prs.Bench,
      prs.Deadlift,
      accessoryMode,
      accessoryPRs,
      preparationMode,
      deadliftVariant,
      benchPressVariant,
      squatVariant,
      settingsForProgramProfile(programProfile).includeCooldown
    );

    setWorkouts(prev => removeDeprecatedPrepItemsFromWorkouts(applyAccessoryPlanToWorkouts(
      prev,
      generatedWorkouts,
      getCompletedWorkoutNumbers(history, currentCycle)
    )));
  }, [accessoryMode, preparationMode, squatVariant, deadliftVariant, benchPressVariant, programProfile, accessoryPRs, prs.Squat, prs.Bench, prs.Deadlift, history, currentCycle]);

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
    const defaultProgramProfile = 'kelaniSbd';
    const defaultSettings = settingsForProgramProfile(defaultProgramProfile);
    const defaultAccessoryMode = defaultSettings.accessoryMode;
    const defaultPreparationMode = defaultSettings.preparationMode;
    const defaultSquatVariant = defaultSettings.squatVariant;
    const defaultBenchPressVariant = defaultSettings.benchPressVariant;
    const defaultDeadliftVariant = defaultSettings.deadliftVariant;

    setWeightUnit(selectedWeightUnit);
    localStorage.setItem('weightUnit', selectedWeightUnit);
    localStorage.setItem('programProfile', defaultProgramProfile);
    localStorage.setItem('squatVariant', defaultSquatVariant);
    localStorage.setItem('benchPressVariant', defaultBenchPressVariant);
    localStorage.setItem('deadliftVariant', defaultDeadliftVariant);

    setProgramProfile(defaultProgramProfile);
    setAccessoryMode(defaultAccessoryMode);
    setPreparationMode(defaultPreparationMode);
    setSquatVariant(defaultSquatVariant);
    setBenchPressVariant(defaultBenchPressVariant);
    setDeadliftVariant(defaultDeadliftVariant);

    setWorkouts(generateProgram(s, b, d, defaultAccessoryMode, {}, defaultPreparationMode, defaultDeadliftVariant, defaultBenchPressVariant, defaultSquatVariant, defaultSettings.includeCooldown));
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

  localStorage.setItem('squatVariant', 'standard');
  localStorage.setItem('benchPressVariant', 'standard');
  localStorage.setItem('deadliftVariant', 'standard');

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
  setSquatVariant('standard');
  setBenchPressVariant('standard');
  setDeadliftVariant('standard');
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
  setWorkouts(generateProgram(updatedPrs.Squat, updatedPrs.Bench, updatedPrs.Deadlift, accessoryMode, accessoryPRs, preparationMode, deadliftVariant, benchPressVariant, squatVariant, settingsForProgramProfile(programProfile).includeCooldown));
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
  const newWorkouts = generateProgram(prs.Squat, prs.Bench, prs.Deadlift, accessoryMode, accessoryPRs, preparationMode, deadliftVariant, benchPressVariant, squatVariant, settingsForProgramProfile(programProfile).includeCooldown);

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

  function changeProgramProfile(nextProfile) {
    const normalizedProfile = normalizeProgramProfile(nextProfile);
    const settings = settingsForProgramProfile(normalizedProfile);

    setProgramProfile(normalizedProfile);
    setAccessoryMode(settings.accessoryMode);
    setPreparationMode(settings.preparationMode);
    setSquatVariant(settings.squatVariant);
    setBenchPressVariant(settings.benchPressVariant);
    setDeadliftVariant(settings.deadliftVariant);
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
        const trackStrength = shouldTrackLiftBlockStrength(liftBlock, benchPressVariant);
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

      const primaryResult = results.find(result => result.trackStrength !== false);

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

if (showLaunchSplash) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#000000',
      color: THEME.text,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
      overflow: 'hidden'
    }}>
      <style>
        {`
          @keyframes kelaniSplashIn {
            0% {
              opacity: 0;
              transform: scale(0.88);
              filter: blur(2px);
            }
            45% {
              opacity: 1;
              transform: scale(1.03);
              filter: blur(0);
            }
            100% {
              opacity: 1;
              transform: scale(1);
              filter: blur(0);
            }
          }
        `}
      </style>
      <img
        src="/kelani-banner.png"
        alt="Kelani"
        style={{
          width: 'min(185vw, 1320px)',
          height: 'auto',
          display: 'block',
          animation: 'kelaniSplashIn 1150ms ease-out both'
        }}
      />
    </div>
  );
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

  const formattedValue = Number.isInteger(Number(value))
    ? formatDecimalDisplay(value, { maximumFractionDigits: 0 })
    : formatDecimalDisplay(value, { maximumFractionDigits: 1 });

  return suffix ? `${formattedValue} ${suffix}` : formattedValue;
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
  if (!value) return null;

  const age = calculateAge(userProfile?.birthDate);
  const sex = userProfile?.sex;

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

  const range = age && age >= 18 && age <= 99 && ['male', 'female'].includes(sex)
    ? ranges[sex].find(r => age >= r.minAge && age <= r.maxAge)
    : null;

  if (range) {
    if (value < range.healthyMin) return makeStatus(t.bodyMetricUnderfat, THEME.red, '');
    if (value <= range.healthyMax) return makeStatus(t.bodyMetricHealthy, THEME.yellow, '');
    if (value <= range.overfatMax) return makeStatus(t.bodyMetricOverfat, THEME.primary, '');
    return makeStatus(t.bodyMetricObese, THEME.red, '');
  }

  if (value >= 8 && value <= 25) return makeStatus(t.bodyMetricHealthy, THEME.yellow, '');
  if (value > 25 && value <= 35) return makeStatus(t.bodyMetricOverfat, THEME.primary, '');
  return makeStatus(t.bodyMetricObese, THEME.red, '');
}

function bodyWaterStatus(value) {
  if (!value) return null;

  if (userProfile?.sex === 'male') {
    return value >= 50 && value <= 65
      ? makeStatus(t.bodyMetricHealthy, THEME.yellow, '')
      : makeStatus(t.bodyMetricAverage, THEME.primary, '');
  }

  if (userProfile?.sex === 'female') {
    return value >= 45 && value <= 60
      ? makeStatus(t.bodyMetricHealthy, THEME.yellow, '')
      : makeStatus(t.bodyMetricAverage, THEME.primary, '');
  }

  return value >= 45 && value <= 65
    ? makeStatus(t.bodyMetricHealthy, THEME.yellow, '')
    : makeStatus(t.bodyMetricAverage, THEME.primary, '');
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

  const rounded = Math.round(value);
  const color = rounded >= 9
    ? THEME.yellow
    : rounded >= 5
      ? THEME.primary
      : THEME.red;

  return makeStatus(t[key], color, '');
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
  if (!value || !latestBodyDataEntry?.bodyWeight) return null;

  const bodyWeight = latestBodyDataEntry.bodyWeight;
  const average = ['male', 'female'].includes(userProfile?.sex)
    ? boneMassAverage(bodyWeight, userProfile.sex)
    : bodyWeight < 65
      ? 2.6
      : bodyWeight < 95
        ? 3.1
        : 3.5;

  if (!average) return null;

  const diff = Math.round((value - average) * 10) / 10;

  if (Math.abs(diff) < 0.1) {
    return makeStatus(t.bodyMetricAverage, THEME.primary, '');
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
    key: 'strength',
    label: t.strength,
    value: strengthRatio ? formatDecimalDisplay(strengthRatio, { maximumFractionDigits: 2 }) : null,
  },
  {
    key: 'eStrength',
    label: t.eStrength,
    value: eStrengthRatio ? formatDecimalDisplay(eStrengthRatio, { maximumFractionDigits: 2 }) : null,
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
          programProfile={programProfile}
          onChangeProgramProfile={changeProgramProfile}
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
  <div style={{ maxWidth: 500, margin: '0 auto', padding: '10px 14px 16px', fontFamily: 'sans-serif' }}>
    <AppHeader
      t={t}
      title={t.dashboard}
      subtitle={`${t.cycle} ${currentCycle} · ${t.workoutProgress} ${Math.min(currentIndex + 1, workouts.length)} / ${workouts.length}`}
    />

    {workouts[currentIndex] && (
      <div style={{
        background: 'transparent',
        border: 'none',
        borderRadius: 10,
        padding: 8,
        marginBottom: 6,
        textAlign: 'center'
      }}>
        <div style={{
          color: '#ffffff',
          fontSize: 14,
          fontWeight: 900,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginBottom: 3
        }}>
          {t.nextWorkout}
        </div>

        <div style={{
          color: THEME.text,
          fontSize: 22,
          fontWeight: 900
        }}>
          <WorkoutTitle workout={workouts[currentIndex]} t={t} benchPressVariant={benchPressVariant} />
        </div>
      </div>
    )}
    <div style={{ background: 'transparent', border: 'none', borderRadius: 8, padding: 6, marginBottom: 6 }}>
      {(() => {
        const cards = [
          {
            key: 'Squat',
            label: t.squat,
            color: THEME.red,
            background: 'rgba(231, 76, 60, 0.08)',
            oneRM: best1RMs.Squat,
            e1RM: bestE1RMs.Squat,
          },
          {
            key: 'Bench',
            label: t.bench,
            color: THEME.primary,
            background: 'rgba(243, 156, 18, 0.08)',
            oneRM: best1RMs.Bench,
            e1RM: bestE1RMs.Bench,
          },
          {
            key: 'Deadlift',
            label: t.deadlift,
            color: THEME.yellow,
            background: 'rgba(241, 196, 15, 0.08)',
            oneRM: best1RMs.Deadlift,
            e1RM: bestE1RMs.Deadlift,
          },
          {
            key: 'Total',
            label: t.total || 'Total',
            color: '#a67c52',
            background: 'rgba(166, 124, 82, 0.10)',
            oneRM: total1RM,
            e1RM: totalE1RM,
          },
        ];

        const value = weight => weight ? formatWeightFromKg(weight, weightUnit) : '—';

        return (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10
            }}>
              {cards.map(card => (
                <div
                  key={card.key}
                  style={{
                    border: `1px solid ${card.color}`,
                    borderRadius: 10,
                    padding: 9,
                    background: card.background,
                    minHeight: 82
                  }}
                >
                  <div style={{
                    color: card.color,
                    fontSize: 17,
                    fontWeight: 900,
                    marginBottom: 6,
                    lineHeight: 1.1
                  }}>
                    {card.label}
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '5px 8px',
                    alignItems: 'baseline'
                  }}>
                    <span style={{ color: THEME.muted, fontSize: 12, fontWeight: 900 }}>
                      {t.oneRM}
                    </span>
                    <strong style={{ color: '#ffffff', fontSize: 15, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {value(card.oneRM)}
                    </strong>

                    <span style={{ color: THEME.muted, fontSize: 12, fontWeight: 900 }}>
                      {t.e1RM}
                    </span>
                    <strong style={{ color: '#ffffff', fontSize: 15, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {value(card.e1RM)}
                    </strong>
                  </div>
                </div>
              ))}
            </div>

          </>
        );
      })()}
    </div>

    <div style={{ background: 'transparent', border: 'none', borderRadius: 8, padding: 8 }}>
      {latestBodyDataRows.length > 0 ? (
        latestBodyDataRows.map((row, index) => (
          <div
            key={row.key}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              columnGap: 12,
              marginBottom: index === latestBodyDataRows.length - 1 ? 0 : 6
            }}
          >
            <span style={{ color: THEME.text, fontWeight: 700, fontSize: 15 }}>
              {row.label}
            </span>

            <strong style={{
              textAlign: 'right',
              whiteSpace: 'nowrap',
              minWidth: 70,
              fontSize: 15,
              color: row.status?.color || THEME.primary
            }}>
              {row.value}
            </strong>
          </div>
        ))
      ) : (
        <div style={{
          color: THEME.muted,
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1.4,
          textAlign: 'center'
        }}>
          {t.noBodyDataYet}
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
          programProfile={programProfile}
          onChangeProgramProfile={changeProgramProfile}
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
       <div style={{ maxWidth: 500, margin: '0 auto', padding: '10px 14px 16px', fontFamily: 'sans-serif' }}>
  <AppHeader
    t={t}
    title={t.settings}
  />

  <div style={{
    background: 'transparent',
    border: 'none',
    borderRadius: 8,
    padding: '0 8px',
    marginBottom: 6
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
        background: 'transparent',
        border: 'none',
        borderRadius: 12,
        padding: 24,
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>

        <h2 style={{ margin: '0 0 8px', color: THEME.brown || '#a67c52' }}>
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
            border: 'none',
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
              background: 'transparent',
              border: 'none',
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
                      border: 'none',
                      background: 'transparent'
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
          background: 'transparent',
          border: 'none',
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
          background: 'transparent',
          border: 'none',
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
                {workoutLiftBlockLabel(liftBlock, t, benchPressVariant)}
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
      <div style={{ background: 'transparent', border: 'none', borderRadius: 12, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>

        <h2 style={{ margin: '0 0 8px', color: THEME.brown || '#a67c52' }}>{t.workoutCompleted}</h2>

        <p style={{ color: THEME.muted, margin: '0 0 12px' }}>
          {t.goodJobSaved}
        </p>

        {(completedWorkout?.lifts || []).length > 0 && (() => {
          const liftNames = (completedWorkout.lifts || [])
            .map(liftBlock => workoutLiftBlockLabel(liftBlock, t, benchPressVariant))
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
              background: 'transparent',
              border: 'none',
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
            border: 'none',
            background: 'transparent',
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
            border: 'none',
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
          display: !(completedSummary?.results || []).some(result => result.trackStrength !== false) ? 'none' : undefined,
          background: 'transparent',
          border: 'none',
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
            }[(completedSummary?.results || []).find(result => result.trackStrength !== false)?.lift || completedWorkout?.lift] || THEME.primary),
            fontSize: 16,
            fontWeight: 900,
            marginBottom: 10,
            textAlign: 'center'
          }}>
            {liftLabel((completedSummary?.results || []).find(result => result.trackStrength !== false)?.lift || completedWorkout?.lift, t)} · 1RM / e1RM
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

            const primaryResult = (completedSummary?.results || []).find(result => result.trackStrength !== false);
            if (!primaryResult) return null;

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
            background: 'transparent',
            border: 'none',
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
                  {workoutLiftBlockLabel(liftBlock, t, benchPressVariant)}
                </div>

                {(() => {
                  const groups = [];

                  (liftBlock.sets || []).forEach((set, i) => {
                    const setLabel = set.labelKey ? t[set.labelKey] : set.label || `${t.set} ${i + 1}`;
                    const isInvalidSet = set.failed || set.skipped || !set.done;
                    const effortLabel = getSetEffortLabel(set.effort, t);
                    const weightText = `${formatWorkoutWeightFromKg(
                      set.weight,
                      weightUnit,
                      t,
                      liftBlock.lift,
                      liftBlock.benchPressVariant || benchPressVariant
                    )}${set.perSide ? ` ${t.perSideSuffix || '/ side'}` : ''}`;
                    const key = [
                      setLabel,
                      set.reps,
                      weightText,
                      isInvalidSet ? 'invalid' : 'done',
                      effortLabel || '',
                    ].join('|');

                    const previous = groups[groups.length - 1];
                    if (previous?.key === key) {
                      previous.count += 1;
                      return;
                    }

                    groups.push({
                      key,
                      label: setLabel,
                      reps: set.reps,
                      weightText,
                      isInvalidSet,
                      effortLabel,
                      count: 1,
                    });
                  });

                  return groups.map((group, i) => (
                    <div
                      key={`force-${liftBlock.lift}-${i}-${group.key}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 12,
                        padding: '7px 0',
                        opacity: group.isInvalidSet ? 0.75 : 1
                      }}
                    >
                      <div>
                        <div style={{ color: THEME.text, fontWeight: 800 }}>
                          {group.isInvalidSet ? '✕ ' : '✓ '}
                          {group.label}
                        </div>

                        {group.effortLabel && (
                          <div style={{
                            color: THEME.muted,
                            fontSize: 12,
                            fontWeight: 700,
                            marginTop: 2
                          }}>
                            {group.effortLabel}
                          </div>
                        )}
                      </div>

                      <strong style={{
                        color: group.isInvalidSet ? '#e74c3c' : '#ffffff',
                        whiteSpace: 'nowrap'
                      }}>
                        {group.count}×{group.reps}×{group.weightText}
                      </strong>
                    </div>
                  ));
                })()}
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
        color: THEME.brown || '#a67c52',
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
      <h3 style={{ margin: '0 0 10px', color: THEME.brown || '#a67c52' }}>
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
