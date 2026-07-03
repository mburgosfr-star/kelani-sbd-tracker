import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { translations } from './translations';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';

const STORAGE_KEY = 'kel-powerlifting-user-data-v1';
const REST_TIME_OPTIONS = [90, 180, 300, 480];
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

async function checkRestTimerAlertReadiness() {
  if (!Capacitor.isNativePlatform()) {
    return {
      native: false,
      display: 'web',
      exactAlarm: 'web',
      message: 'Rest timer alerts are only needed on the installed Android app.',
    };
  }

  try {
    let permissions = await LocalNotifications.checkPermissions();

    if (permissions.display !== 'granted') {
      permissions = await LocalNotifications.requestPermissions();
    }

    let exactAlarm = 'unknown';

    if (typeof LocalNotifications.checkExactNotificationSetting === 'function') {
      try {
        const exactStatus = await LocalNotifications.checkExactNotificationSetting();
        exactAlarm = exactStatus?.exact_alarm || exactStatus?.exactAlarm || 'unknown';

        if (exactAlarm !== 'granted' && typeof LocalNotifications.changeExactNotificationSetting === 'function') {
          const changedStatus = await LocalNotifications.changeExactNotificationSetting();
          exactAlarm = changedStatus?.exact_alarm || changedStatus?.exactAlarm || exactAlarm;
        }
      } catch (e) {
        exactAlarm = 'unknown';
      }
    }

    return {
      native: true,
      display: permissions.display,
      exactAlarm,
      message: permissions.display === 'granted'
        ? 'Notification permission is allowed. For screen-off alerts, also allow lock screen notifications and unrestricted battery use in Android settings.'
        : 'Notification permission is not allowed yet. Rest timer alerts may be blocked.',
    };
  } catch (e) {
    return {
      native: true,
      display: 'unknown',
      exactAlarm: 'unknown',
      message: 'Could not check notification settings. Please allow notifications, lock screen notifications and unrestricted battery use in Android settings.',
    };
  }
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
        schedule: {
          at: new Date(endTime),
          allowWhileIdle: true,
        },
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
  bg: '#080808',
  card: '#101010',
  border: '#3a1f1f',
  text: '#fff4e6',
  muted: '#fff4e6',

  primary: '#ff8a3d',
  red: '#ff5c45',
  yellow: '#ffd166',
  meet: '#c62828',
  green: '#2ecc71',
  brown: '#c62828'
  
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


const COOLDOWN_MODES = ['off', 'upperBackFriendly'];

function normalizeCooldownMode(value) {
  if (value === true) return 'upperBackFriendly';
  if (value === false) return 'off';
  return COOLDOWN_MODES.includes(value) ? value : 'off';
}

function normalizeAccessoryMode(value) {
  if (value === 'basic' || value === 'full') return 'standard';
  return ACCESSORY_MODES.includes(value) ? value : 'off';
}

function normalizeRestTimeSeconds(value) {
  return REST_TIME_OPTIONS.includes(Number(value)) ? Number(value) : DEFAULT_REST_TIME_SECONDS;
}

function epley(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;

  if (w <= 0 || r <= 0) return 0;
  if (r <= 1) return w;

  return w * (1 + r / 30);
}

function getRecommendedRestTimeSeconds({ workouts = [], placement = null, fallbackSeconds = 180 } = {}) {
  if (!placement) return fallbackSeconds;

  const workout = (workouts || []).find(item =>
    Number(item?.number) === Number(placement.workoutNumber)
  );

  let set = null;

  if (placement.type === 'main') {
    set = workout?.sets?.[placement.index];
  }

  if (placement.type === 'meetSet') {
    set = workout?.lifts?.[placement.liftIndex]?.sets?.[placement.index];
  }

  const labelKey = set?.labelKey;
  const isRealMeetDay = workout?.type === 'meet';

  // Real meet day and real attempt labels need long attempt-style rest.
  if (isRealMeetDay || isAttemptSetLabel(labelKey)) return 480;

  // Accessories stay short, successful or failed.
  if (placement.type === 'accessory') return 90;

  if (placement.type === 'warmup') return 90;
  if (placement.type === 'cooldown') return 90;

  // Failed training work needs extra recovery, but not attempt-level rest.
  if (placement.failed) return 300;

  if (isTopSetLabel(labelKey)) return 300;

  if (labelKey === 'backoff' || labelKey === 'workSets') return 180;

  // Multi-lift secondary/light training sets often have no labelKey.
  // They are training work, not meet attempts.
  if (placement.type === 'main' || placement.type === 'meetSet') return 180;

  return fallbackSeconds;
}

function getHistoryMaxCandidates(entry) {
  if (!entry || !LIFT_ORDER.includes(entry.lift)) {
    return { oneRM: 0, e1rm: 0 };
  }

  if (entry.manualMax) {
    const manualOneRM = Number(entry.topWeight) || Number(entry.oneRMToday) || 0;
    const manualE1RM = Number(entry.e1rm) || Number(entry.e1RMToday) || manualOneRM;

    return { oneRM: manualOneRM, e1rm: manualE1RM };
  }

  const oneRMCandidates = [
    Number(entry.topWeight) || 0,
    Number(entry.oneRMToday) || 0,
    Number(entry.best1RM) || 0,
    Number(entry.previousBest1RM) || 0,
  ];

  const e1RMCandidates = [
    Number(entry.e1rm) || 0,
    Number(entry.e1RMToday) || 0,
    Number(entry.bestE1RM) || 0,
    Number(entry.previousBestE1RM) || 0,
  ];

  const summary = entry.workoutSnapshot?.completedSummary;
  const summaryResults = Array.isArray(summary?.results)
    ? summary.results
    : summary?.lift
      ? [summary]
      : [];

  summaryResults
    .filter(result => result?.lift === entry.lift)
    .forEach(result => {
      oneRMCandidates.push(
        Number(result.oneRMToday) || 0,
        Number(result.best1RM) || 0,
        Number(result.previousBest1RM) || 0
      );
      e1RMCandidates.push(
        Number(result.e1RMToday) || 0,
        Number(result.bestE1RM) || 0,
        Number(result.previousBestE1RM) || 0
      );
    });

  return {
    oneRM: Math.max(0, ...oneRMCandidates),
    e1rm: Math.max(0, ...e1RMCandidates),
  };
}

function calculateBestMaxesFromHistory(history = []) {
  const best = LIFT_ORDER.reduce((acc, lift) => ({
    ...acc,
    [lift]: { oneRM: 0, e1rm: 0 },
  }), {});

  (history || []).forEach(entry => {
    if (!entry || !LIFT_ORDER.includes(entry.lift)) return;

    const candidates = getHistoryMaxCandidates(entry);

    best[entry.lift] = entry.manualMax
      ? {
          oneRM: candidates.oneRM,
          e1rm: candidates.e1rm,
        }
      : {
          oneRM: Math.max(best[entry.lift].oneRM, candidates.oneRM),
          e1rm: Math.max(best[entry.lift].e1rm, candidates.e1rm),
        };
  });

  return best;
}

function calculatePrsFromHistory(history = []) {
  const best = calculateBestMaxesFromHistory(history);

  return {
    Squat: best.Squat.e1rm || 0,
    Bench: best.Bench.e1rm || 0,
    Deadlift: best.Deadlift.e1rm || 0,
  };
}

function mergeHigherPrs(current = {}, candidate = {}) {
  return LIFT_ORDER.reduce((next, lift) => {
    next[lift] = Math.max(
      Number(current?.[lift]) || 0,
      Number(candidate?.[lift]) || 0
    );

    return next;
  }, { ...(current || {}) });
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

function formatWorkoutProgressLabel({ t, workoutNumber, totalWorkouts = null, smartModel = false }) {
  const safeWorkoutNumber = Math.max(Number(workoutNumber) || 1, 1);

  if (smartModel) {
    return `${t.workoutProgress} ${safeWorkoutNumber}`;
  }

  const safeTotalWorkouts = Math.max(Number(totalWorkouts) || safeWorkoutNumber, safeWorkoutNumber);

  return `${t.workoutProgress} ${Math.min(safeWorkoutNumber, safeTotalWorkouts)} / ${safeTotalWorkouts}`;
}

function formatCycleWorkoutSubtitle({ t, currentCycle, workoutNumber, totalWorkouts = null, smartModel = false, suffix = '' }) {
  return `${t.cycle} ${currentCycle} · ${formatWorkoutProgressLabel({
    t,
    workoutNumber,
    totalWorkouts,
    smartModel,
  })}${suffix}`;
}

function formatSetPercentDisplay(pct) {
  const value = Number(pct);

  if (!Number.isFinite(value) || value <= 0) return null;

  const percent = value * 100;
  const roundedStep = Math.round(percent / 2.5) * 2.5;

  return formatDecimalDisplay(roundedStep, {
    minimumFractionDigits: Number.isInteger(roundedStep) ? 0 : 1,
    maximumFractionDigits: 1,
  });
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
  if (workout.type === 'rest') return 'restAndRecovery';
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
  if (variant === 'goodMorning') return 'machineAlternative';
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
    cooldownMode: 'off',
  },
  kelaniSbdPlus: {
    preparationMode: 'basicFirst',
    accessoryMode: 'standard',
    squatVariant: 'standard',
    benchPressVariant: 'standard',
    deadliftVariant: 'standard',
    includeCooldown: true,
    cooldownMode: 'upperBackFriendly',
  },
  kelaniSbdUltra: {
    preparationMode: 'off',
    accessoryMode: 'off',
    squatVariant: 'standard',
    benchPressVariant: 'standard',
    deadliftVariant: 'standard',
    includeCooldown: false,
    cooldownMode: 'off',
  },
  kelaniSbdLower: {
    preparationMode: 'shoulderThoracic',
    accessoryMode: 'off',
    squatVariant: 'standard',
    benchPressVariant: 'machineAlternative',
    deadliftVariant: 'hipThrust',
    includeCooldown: true,
    cooldownMode: 'upperBackFriendly',
  },
  kelaniSbdLowerPlus: {
    preparationMode: 'shoulderThoracic',
    accessoryMode: 'lowerBodyFriendly',
    squatVariant: 'standard',
    benchPressVariant: 'machineAlternative',
    deadliftVariant: 'hipThrust',
    includeCooldown: true,
    cooldownMode: 'upperBackFriendly',
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

const TRAINING_MODELS = {
  CLASSIC: 'classic',
  SMART: 'smart',
};

function normalizeTrainingModel(model) {
  return model === TRAINING_MODELS.SMART
    ? TRAINING_MODELS.SMART
    : TRAINING_MODELS.CLASSIC;
}

function isSmartTrainingModel(model) {
  return normalizeTrainingModel(model) === TRAINING_MODELS.SMART;
}


const SMART_DAY_TYPES = {
  TRAINING: 'training',
  RECOVERY: 'recovery',
  DELOAD: 'deload',
  MEET: 'meet',
};

const SMART_DECISION_REASONS = {
  FATIGUE_RECOVERY: 'fatigue-recovery',
  TRAINING_STREAK_RECOVERY: 'training-streak-recovery',
  TRAINING_FALLBACK: 'training-fallback',
  FAILED_SET_DELOAD: 'failed-set-deload',
  MEETDAY_READY: 'meetday-ready',
  POST_MEET_RECOVERY: 'post-meet-recovery',
};

const SMART_OVERRIDES = {
  RECOVERY: 'recovery',
  TRAINING_FALLBACK: 'training-fallback',
  POST_RECOVERY_LIGHT_TRAINING: 'post-recovery-light-training',
  MEETDAY: 'meetday',
};

const SMART_THRESHOLDS = {
  RECENT_DAYS: 3,
  FATIGUE_RECOVERY_SCORE: 2,
  TRAINING_STREAK_RECOVERY_DAYS: 3,
  FAILED_SET_FATIGUE_CAP: 2,
  FAILED_SET_DELOAD_COUNT: 2,
  MEETDAY_MIN_ACTIVE_BLOCK_DAYS: 8,
  MEETDAY_CURRENT_CYCLE_READINESS_RATIO: 0.97,
  POST_MEET_RECOVERY_MAX_DAYS: 3,
};

const SMART_DELOAD = {
  LOAD_FACTOR: 0.9,
  MIN_PCT: 0.5,
};

const SMART_GENERATED_FLAGS = {
  RECOVERY: 'smartGeneratedRecovery',
  TRAINING: 'smartGeneratedTraining',
  MEET: 'smartGeneratedMeet',
};

function getProgramProfileTitle(profile, t = {}) {
  const normalizedProfile = normalizeProgramProfile(profile);

  if (normalizedProfile === 'kelaniSbdUltra') {
    return t.programProfileKelaniSbdUltra || 'Kelani SBD Ultra';
  }

  if (
    normalizedProfile === 'kelaniSbdLower' ||
    normalizedProfile === 'kelaniSbdLowerPlus'
  ) {
    return t.programProfileKelaniSbdLower || 'Kelani Adapt';
  }

  return t.programProfileKelaniSbd || 'Kelani SBD';
}
function getProgramProfileDescription(profile, t = {}) {
  const normalizedProfile = normalizeProgramProfile(profile);

  if (normalizedProfile === 'kelaniSbdUltra') {
    return t.programProfileKelaniSbdUltraText || 'Goal: stronger meet-day readiness. Frequency: high · Volume: high · Intensity: controlled.';
  }

  if (
    normalizedProfile === 'kelaniSbdLower' ||
    normalizedProfile === 'kelaniSbdLowerPlus'
  ) {
    return t.programProfileKelaniSbdLowerText || 'Goal: adapted training with Squat, Chest Press and Hip Thrust. Frequency: moderate · Volume: moderate · Intensity: controlled.';
  }

  return t.programProfileKelaniSbdText || 'Goal: balanced meet prep. Frequency: moderate · Volume: moderate · Intensity: controlled high.';
}


function summarizeProgramWorkouts(workouts = []) {
  const byLift = LIFT_ORDER.reduce((acc, lift) => ({
    ...acc,
    [lift]: {
      exposures: 0,
      reps: 0,
      pctRepSum: 0,
      avgIntensity: 0,
    },
  }), {});

  let trainingDays = 0;
  let restDays = 0;

  (workouts || []).forEach(workout => {
    if (!workout || workout.type === 'meet') return;

    if (workout.type === 'rest') {
      restDays += 1;
      return;
    }

    trainingDays += 1;

    (workout.lifts || []).forEach(liftBlock => {
      const lift = liftBlock?.lift;

      if (!LIFT_ORDER.includes(lift)) return;

      byLift[lift].exposures += 1;

      (liftBlock.sets || []).forEach(set => {
        const reps = Number(set?.reps) || 0;
        const pct = Number(set?.originalPct ?? set?.pct) || 0;

        byLift[lift].reps += reps;
        byLift[lift].pctRepSum += pct * reps;
      });
    });
  });

  LIFT_ORDER.forEach(lift => {
    byLift[lift].avgIntensity = byLift[lift].reps
      ? Math.round((byLift[lift].pctRepSum / byLift[lift].reps) * 100)
      : 0;
  });

  return { trainingDays, restDays, byLift };
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

function generateWarmups(workPlan, lift = '') {
  const workSets = Array.isArray(workPlan)
    ? workPlan.filter(set => Number(set?.weight) > 0)
    : [{ weight: Number(workPlan) || 0, reps: null }];
  if (!workSets.length) return [];

  const targetWeight = Math.max(...workSets.map(set => Number(set.weight) || 0));
  const normalizedLift = String(lift || '');
  const MAX_WARMUP_JUMP_KG = ['Squat', 'Deadlift'].includes(normalizedLift) ? 50 : 40;
  if (targetWeight < 30) return [];

  function roundTo10(weight) {
    return Math.round((Number(weight) || 0) / 10) * 10;
  }

  function roundDown10(weight) {
    return Math.floor((Number(weight) || 0) / 10) * 10;
  }

  function isTopWarmupTarget(set = {}) {
    return (
      isTopSetLabel(set.labelKey) ||
      set.labelKey === 'opener' ||
      set.labelKey === 'secondAttempt' ||
      set.labelKey === 'thirdAttempt'
    );
  }

  const topSet = workSets.find(isTopWarmupTarget);
  const targetSet = topSet || workSets.find(set => Number(set.weight) === targetWeight) || workSets[0];
  const targetReps = Math.max(Number(targetSet?.reps) || 1, 1);
  const hasTopSet = Boolean(topSet);

  function finalWarmupWeight() {
    if (hasTopSet) {
      const closeBackoff = workSets
        .filter(set => !isTopWarmupTarget(set))
        .map(set => Number(set.weight) || 0)
        .filter(weight => weight >= 40 && weight < targetWeight)
        .sort((a, b) => b - a)[0];

      if (closeBackoff && targetWeight - closeBackoff <= 25 && targetReps > 1) {
        return roundTo10(closeBackoff);
      }

      if (targetReps <= 1) return roundTo10(targetWeight * 0.92);
      if (targetReps === 2) return roundTo10(targetWeight * 0.88);
      return roundTo10(targetWeight * 0.82);
    }

    return roundDown10(targetWeight - 10);
  }

  function cleanWarmupWeight(weight) {
    const rounded = roundTo10(weight);
    if (rounded <= 20) return null;
    if (rounded >= targetWeight) return null;
    if (targetWeight - rounded < 7.5) return null;
    return rounded;
  }

  function repsForWarmup(weight, isFinalWarmup) {
    if (weight === 20) return 5;
    if (!hasTopSet) return Math.min(5, Math.max(targetReps, 3));

    const distanceToTarget = targetWeight - weight;
    if (targetReps <= 1) {
      if (isFinalWarmup || distanceToTarget <= 20) return 1;
      if (distanceToTarget <= 50) return 3;
      return 5;
    }

    if (targetReps === 2) {
      if (isFinalWarmup || distanceToTarget <= 35) return 1;
      if (distanceToTarget <= 60) return 2;
      return 5;
    }

    if (isFinalWarmup) return Math.min(3, targetReps);
    if (distanceToTarget <= 60) return 3;
    return 5;
  }

  const finalWeight = cleanWarmupWeight(finalWarmupWeight());
  const warmupWeights = [20];

  if (finalWeight) {
    let last = 20;
    while (finalWeight - last > MAX_WARMUP_JUMP_KG) {
      const bridge = cleanWarmupWeight(last + MAX_WARMUP_JUMP_KG);
      if (!bridge || bridge <= last || bridge >= finalWeight) break;
      warmupWeights.push(bridge);
      last = bridge;
    }
    if (!warmupWeights.includes(finalWeight)) {
      warmupWeights.push(finalWeight);
    }
  }

  return warmupWeights
    .filter((weight, index, weights) => weight > 0 && weights.indexOf(weight) === index)
    .sort((a, b) => a - b)
    .map((weight, index, weights) => {
      const isFinalWarmup = index === weights.length - 1 && weight !== 20;
      return {
        reps: repsForWarmup(weight, isFinalWarmup),
        weight,
        originalWeight: weight,
        done: false,
      };
    });
}

function roundMeetWeight(weight) {
  return Math.round((Number(weight) || 0) / 2.5) * 2.5;
}

function ceilMeetWeight(weight) {
  return Math.ceil(((Number(weight) || 0) - 1e-9) / 2.5) * 2.5;
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



const MEET_ATTEMPT_KEYS = ['opener', 'secondAttempt', 'thirdAttempt'];

const MEET_ATTEMPT_PCTS = {
  opener: 0.9,
  secondAttempt: 0.975,
  thirdAttempt: 1.025,
};

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
      { key: 'legExtension', labelKey: 'accessoryLegExtension', sets: 3, reps: 12, source: 'squat', pct: 0.35 },
    ],
    Bench: [
      { key: 'hipThrust', labelKey: 'accessoryHipThrust', sets: 3, reps: 8, source: 'deadlift', pct: 0.40 },
      { key: 'shoulderRotations', labelKey: 'accessoryShoulderRotations', sets: 2, reps: 15, source: 'fixed', weight: 2.5, perSide: true },
    ],
    Deadlift: [
      { key: 'row', labelKey: 'accessoryRow', sets: 3, reps: 10, source: 'deadlift', pct: 0.25 },
      { key: 'legCurl', labelKey: 'accessoryLegCurl', sets: 3, reps: 12, source: 'squat', pct: 0.35 },
    ],
  },
  upperBackFriendly: {
    Squat: [
      { key: 'hipAbduction', labelKey: 'accessoryHipAbduction', sets: 3, reps: 12, source: 'squat', pct: 0.45 },
      { key: 'legCurl', labelKey: 'accessoryLegCurl', sets: 3, reps: 12, source: 'squat', pct: 0.35 },
    ],
    Bench: [
      { key: 'lateralRaise', labelKey: 'accessoryLateralRaise', sets: 3, reps: 12, source: 'fixed', weight: 5, perSide: true },
    ],
    Deadlift: [
      { key: 'machineCrunch', labelKey: 'accessoryMachineCrunch', sets: 3, reps: 12, source: 'squat', pct: 0.40 },
      { key: 'seatedCalfRaise', labelKey: 'accessorySeatedCalfRaise', sets: 3, reps: 12, source: 'squat', pct: 0.55 },
    ],
  },
  lowerBodyFriendly: {
    Squat: [
      { key: 'hipAbduction', labelKey: 'accessoryHipAbduction', sets: 3, reps: 12, source: 'squat', pct: 0.45 },
      { key: 'machineCrunch', labelKey: 'accessoryMachineCrunch', sets: 3, reps: 12, source: 'squat', pct: 0.40 },
    ],
    Bench: [
      { key: 'legExtension', labelKey: 'accessoryLegExtension', sets: 3, reps: 12, source: 'squat', pct: 0.35 },
    ],
    Deadlift: [
      { key: 'legCurl', labelKey: 'accessoryLegCurl', sets: 3, reps: 12, source: 'squat', pct: 0.35 },
      { key: 'seatedCalfRaise', labelKey: 'accessorySeatedCalfRaise', sets: 3, reps: 12, source: 'squat', pct: 0.55 },
    ],
  },
};

function getAccessoryBaseWeight(template, oneRMs, accessoryPRs = {}) {
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

function generateSquatAlternativeSets(oneRMs = {}) {
  const beltSquatWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Squat) || 0) * 0.60));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'squatAlternativeBeltSquat',
    groupKey: 'squatAlternativeBeltSquat',
    reps: 10,
    weight: beltSquatWeight,
  }));
}

function generateSquatHomeAlternativeSets(oneRMs = {}) {
  const zercherSquatWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Squat) || 0) * 0.45));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'squatAlternativeZercherSquat',
    groupKey: 'squatAlternativeZercherSquat',
    reps: 6,
    weight: zercherSquatWeight,
  }));
}

function generateBenchMachineAlternativeSets(oneRMs = {}) {
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
  const goodMorningWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Deadlift) || 0) * 0.40));

  return Array.from({ length: 4 }, () => makeWorkoutSet({
    labelKey: 'benchHomeAlternativeGoodMorning',
    groupKey: 'benchHomeAlternativeGoodMorning',
    reps: 8,
    weight: goodMorningWeight,
  }));
}

function generateDeadliftAlternativeSets(oneRMs = {}) {
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

function generateDeadliftHomeAlternativeSets(oneRMs = {}) {
  const hipThrustWeight = Math.max(2.5, roundMeetWeight((Number(oneRMs.Deadlift) || 0) * 0.60));

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


function generateProgram(s, b, d, accessoryMode = 'off', accessoryPRs = {}, preparationMode = 'basicFirst', deadliftVariant = 'standard', benchPressVariant = 'standard', squatVariant = 'standard', cooldownMode = 'upperBackFriendly', programOverride = null) {
  function round25(w) {
    return Math.round(w / 2.5) * 2.5;
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


function generateUltraProgram(s, b, d, accessoryMode = 'off', accessoryPRs = {}, preparationMode = 'basicFirst', deadliftVariant = 'standard', benchPressVariant = 'standard', squatVariant = 'standard', cooldownMode = 'upperBackFriendly') {
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
    { type: 'training', label: 'Ultra Bench Strength', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 2, pct: 0.825, labelKey: 'topDouble' }, { sets: 3, reps: 4, pct: 0.725, labelKey: 'backoff' }] }, { lift: 'Deadlift', blocks: [{ sets: 2, reps: 3, pct: 0.625, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Deadlift Strength', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 2, pct: 0.775, labelKey: 'topDouble' }, { sets: 2, reps: 3, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 3, reps: 4, pct: 0.625, labelKey: 'workSets' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },

    { type: 'training', label: 'Ultra Heavy Squat Practice', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 2, pct: 0.850, labelKey: 'topDouble' }, { sets: 2, reps: 3, pct: 0.750, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 3, pct: 0.700, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Heavy Bench Practice', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 2, pct: 0.850, labelKey: 'topDouble' }, { sets: 3, reps: 3, pct: 0.750, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 2, reps: 3, pct: 0.650, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Deadlift + Bench Volume', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 2, pct: 0.800, labelKey: 'topDouble' }, { sets: 1, reps: 3, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 4, reps: 3, pct: 0.700, labelKey: 'workSets' }] }] },
    { type: 'rest', labelKey: 'restAndRecovery', workoutEffort: 'easy', lifts: [], sets: [], warmups: [], accessories: [], cooldownItems: [] },

    // Ultra block 3: meet-specific singles without max testing.
    { type: 'training', label: 'Ultra Squat Single', labelKey: 'practice', lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.850, labelKey: 'topSingle' }, { sets: 1, reps: 3, pct: 0.725, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 3, reps: 3, pct: 0.700, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Bench Single', labelKey: 'practice', lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.850, labelKey: 'topSingle' }, { sets: 2, reps: 3, pct: 0.750, labelKey: 'backoff' }] }, { lift: 'Deadlift', blocks: [{ sets: 2, reps: 2, pct: 0.650, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra Deadlift Single', labelKey: 'practice', lifts: [{ lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.825, labelKey: 'topSingle' }, { sets: 1, reps: 2, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Squat', blocks: [{ sets: 2, reps: 3, pct: 0.625, labelKey: 'workSets' }] }] },
    { type: 'training', label: 'Ultra SBD Confidence', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.875, labelKey: 'topSingle' }, { sets: 1, reps: 2, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.825, labelKey: 'topSingle' }, { sets: 1, reps: 2, pct: 0.700, labelKey: 'backoff' }] }, { lift: 'Deadlift', blocks: [{ sets: 1, reps: 1, pct: 0.750, labelKey: 'topSingle' }, { sets: 1, reps: 2, pct: 0.650, labelKey: 'backoff' }] }] },

    // Peak and taper: openers, then freshness.
    { type: 'training', label: 'Ultra Squat Opener', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Squat', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'opener' }, { sets: 1, reps: 2, pct: 0.600, labelKey: 'backoff' }] }] },
    { type: 'training', label: 'Ultra Bench Opener', labelKey: 'practice', disableAccessories: true, lifts: [{ lift: 'Bench', blocks: [{ sets: 1, reps: 1, pct: 0.900, labelKey: 'opener' }, { sets: 1, reps: 2, pct: 0.650, labelKey: 'backoff' }] }] },
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

function generateProgramForProfile(programProfile, s, b, d, accessoryMode = 'off', accessoryPRs = {}, preparationMode = 'basicFirst', deadliftVariant = 'standard', benchPressVariant = 'standard', squatVariant = 'standard', cooldownMode = 'upperBackFriendly') {
  if (normalizeProgramProfile(programProfile) === 'kelaniSbdUltra') {
    return generateUltraProgram(s, b, d, accessoryMode, accessoryPRs, preparationMode, deadliftVariant, benchPressVariant, squatVariant, cooldownMode);
  }

  return generateProgram(s, b, d, accessoryMode, accessoryPRs, preparationMode, deadliftVariant, benchPressVariant, squatVariant, cooldownMode);
}

function buildSmartTrainingContext({
  history = [],
  currentIndex = 0,
  currentCycle = 1,
} = {}) {
  const normalizedCycle = Number(currentCycle) || 1;
  const normalizedCurrentIndex = Math.max(0, Number(currentIndex) || 0);
  const cycleHistory = (history || []).filter(entry =>
    Number(entry?.cycle) === normalizedCycle
  );
  const completedWorkoutNumbers = [...new Set(
    cycleHistory
      .map(entry => Number(entry?.workoutNumber))
      .filter(number => Number.isFinite(number) && number > 0)
  )].sort((a, b) => a - b);

  const usedSmartSourceWorkoutNumbers = [...new Set(
    cycleHistory
      .map(entry => Number(entry?.workoutSnapshot?.smartSourceWorkoutNumber))
      .filter(number => Number.isFinite(number) && number > 0)
  )];

  return {
    history: cycleHistory,
    currentIndex: normalizedCurrentIndex,
    currentCycle: normalizedCycle,
    completedWorkoutNumbers,
    usedSmartSourceWorkoutNumbers,
  };
}

function getSmartEffortScore(effort) {
  if (effort === 'easy') return -1;
  if (effort === 'good' || effort === 'normal') return 0;
  if (effort === 'hard') return 1;
  if (effort === 'tooMuch' || ['veryHard', 'max'].includes(effort)) return 2;
  return 0;
}

function isSmartHardEffort(effort) {
  return getSmartEffortScore(effort) > 0;
}

function isSmartEasyOrNormalEffort(effort) {
  return effort === 'easy' || effort === 'good' || effort === 'normal';
}

function countFailedOrSkippedSetsFromSnapshot(snapshot = {}) {
  const liftSets = (snapshot?.lifts || []).flatMap(liftBlock => liftBlock?.sets || []);
  const directSets = snapshot?.sets || [];
  const allSets = liftSets.length > 0 ? liftSets : directSets;

  return allSets.filter(set => set?.failed || set?.skipped).length;
}

function countFailedOrSkippedSetsForLiftFromSnapshot(snapshot = {}, lift = null) {
  if (!lift) return 0;

  const liftBlock = (snapshot?.lifts || []).find(block => block?.lift === lift);
  const sets = liftBlock
    ? (liftBlock.sets || [])
    : snapshot?.lift === lift
      ? (snapshot?.sets || [])
      : [];

  return sets.filter(set => set?.failed || set?.skipped).length;
}


function getWorkoutLiftNames(workout = {}) {
  const liftBlocks = workout?.lifts || [];
  const liftNames = liftBlocks
    .map(liftBlock => liftBlock?.lift)
    .filter(lift => LIFT_ORDER.includes(lift));

  if (liftNames.length > 0) return [...new Set(liftNames)];

  return LIFT_ORDER.includes(workout?.lift) ? [workout.lift] : [];
}

function countSharedWorkoutLifts(workout = {}, lifts = []) {
  const liftSet = new Set(lifts || []);
  return getWorkoutLiftNames(workout).filter(lift => liftSet.has(lift)).length;
}

function getSmartPostMeetRecoveryTarget(day = {}) {
  const effort = day?.workoutEffort;
  const failedCount = Number(day?.failedOrSkippedSetCount) || 0;

  let target = 1;

  if (effort === 'easy') target = 0;
  if (effort === 'good') target = 1;
  if (effort === 'hard') target = 2;
  if (effort === 'tooMuch') target = 3;

  if (failedCount >= 2) target = 3;
  else if (failedCount >= 1) target = Math.max(target, 2);

  return Math.min(
    Math.max(target, 0),
    SMART_THRESHOLDS.POST_MEET_RECOVERY_MAX_DAYS
  );
}

function getSmartPostMeetRecoveryReason(day = {}) {
  if (!day) return null;

  const effort = day?.workoutEffort || 'good';
  const failedCount = Number(day?.failedOrSkippedSetCount) || 0;

  if (failedCount >= 2) return 'failed-skipped-2-plus';
  if (failedCount >= 1) return 'failed-skipped-1';

  return `meet-effort-${effort}`;
}


function isSmartCycleCompleteAfterHistory(history = [], currentCycle = 1) {
  const readiness = buildSmartReadinessSignals({
    history,
    currentCycle,
  });

  return Boolean(
    readiness.lastMeetWorkoutNumber &&
    readiness.postMeetRecoveryTargetReached &&
    !readiness.inPostMeetRecovery
  );
}


function buildSmartReadinessSignals(context = {}) {
  const targetCycle = Number(context.currentCycle) || 1;
  const smartMeetPlanReadiness = buildSmartMeetPlanReadiness({
    history: context.history || [],
    prs: context.prs || {},
    meetPlannerAttempts: context.meetPlannerAttempts || {},
    currentCycle: targetCycle,
  });

  const completedEntries = (context.history || [])
    .filter(entry =>
      Number(getEntryCycle(entry)) === targetCycle &&
      Number(entry?.workoutNumber) > 0 &&
      !entry?.manualMax &&
      !entry?.seedMax &&
      (entry?.workoutSnapshot || entry?.restDay)
    )
    .sort((a, b) => Number(a.workoutNumber) - Number(b.workoutNumber));

  const workoutDays = [...completedEntries.reduce((map, entry) => {
    const workoutNumber = Number(entry?.workoutNumber);
    if (!Number.isFinite(workoutNumber) || workoutNumber <= 0) return map;

    const current = map.get(workoutNumber) || {
      workoutNumber,
      entries: [],
      workoutEffort: null,
      restDay: false,
      smartDayType: null,
      failedOrSkippedSetCount: 0,
      failedOrSkippedSetCountsByLift: LIFT_ORDER.reduce((counts, lift) => ({
        ...counts,
        [lift]: 0,
      }), {}),
      lifts: [],
    };

    const entryFailedCount =
      Number(entry?.failedOrSkippedSetCount) ||
      countFailedOrSkippedSetsFromSnapshot(entry?.workoutSnapshot);

    current.entries.push(entry);
    current.lifts = [...new Set([
      ...(current.lifts || []),
      ...getWorkoutLiftNames(entry?.workoutSnapshot || entry),
    ])];
    current.workoutEffort = current.workoutEffort || entry?.workoutEffort || null;
    current.smartDayType = current.smartDayType || entry?.smartDayType || null;
    current.restDay =
      current.restDay ||
      Boolean(entry?.restDay) ||
      entry?.smartDayType === SMART_DAY_TYPES.RECOVERY;
    current.failedOrSkippedSetCount = Math.max(
      current.failedOrSkippedSetCount,
      entryFailedCount
    );

    LIFT_ORDER.forEach(lift => {
      const liftFailedCount = countFailedOrSkippedSetsForLiftFromSnapshot(
        entry?.workoutSnapshot,
        lift
      );

      current.failedOrSkippedSetCountsByLift[lift] = Math.max(
        Number(current.failedOrSkippedSetCountsByLift[lift]) || 0,
        liftFailedCount
      );
    });

    if (
      entry?.lift &&
      LIFT_ORDER.includes(entry.lift) &&
      !(entry?.workoutSnapshot?.lifts || []).length
    ) {
      current.failedOrSkippedSetCountsByLift[entry.lift] = Math.max(
        Number(current.failedOrSkippedSetCountsByLift[entry.lift]) || 0,
        entryFailedCount
      );
    }

    map.set(workoutNumber, current);
    return map;
  }, new Map()).values()].sort((a, b) => a.workoutNumber - b.workoutNumber);

  const lastDay = workoutDays[workoutDays.length - 1] || null;
  const lastMeetDayIndex = workoutDays.findLastIndex(day =>
    day.smartDayType === SMART_DAY_TYPES.MEET
  );
  const lastMeetDay = lastMeetDayIndex >= 0 ? workoutDays[lastMeetDayIndex] : null;
  const postMeetDays = lastMeetDayIndex >= 0
    ? workoutDays.slice(lastMeetDayIndex + 1)
    : [];
  const postMeetRecoveryTarget = lastMeetDay
    ? getSmartPostMeetRecoveryTarget(lastMeetDay)
    : 0;
  const postMeetRecoveryReason = lastMeetDay
    ? getSmartPostMeetRecoveryReason(lastMeetDay)
    : null;
  const postMeetRecoveryDaysCompleted = postMeetDays.filter(day =>
    day.restDay || day.smartDayType === SMART_DAY_TYPES.RECOVERY
  ).length;
  const inPostMeetRecovery = Boolean(
    lastMeetDay &&
    postMeetRecoveryDaysCompleted < postMeetRecoveryTarget
  );
  const postMeetRecoveryTargetReached = Boolean(
    lastMeetDay &&
    postMeetRecoveryDaysCompleted >= postMeetRecoveryTarget
  );

  const lastRecoveryInterventionIndex = workoutDays.findLastIndex(day =>
    day.restDay ||
    day.smartDayType === SMART_DAY_TYPES.RECOVERY ||
    day.smartDayType === SMART_DAY_TYPES.DELOAD
  );
  const activeBlockDays = lastRecoveryInterventionIndex >= 0
    ? workoutDays.slice(lastRecoveryInterventionIndex + 1)
    : workoutDays;
  const activeBlockLiftExposureCounts = LIFT_ORDER.reduce((counts, lift) => ({
    ...counts,
    [lift]: activeBlockDays.filter(day => (day.lifts || []).includes(lift)).length,
  }), {});

  const recentDays = activeBlockDays.slice(-SMART_THRESHOLDS.RECENT_DAYS);

  const recentHardCount = recentDays.filter(day =>
    isSmartHardEffort(day.workoutEffort)
  ).length;

  const recentEasyCount = recentDays.filter(day =>
    isSmartEasyOrNormalEffort(day.workoutEffort)
  ).length;

  const recentFailedOrSkippedSetCount = recentDays.reduce(
    (total, day) => total + day.failedOrSkippedSetCount,
    0
  );

  const recentFailedOrSkippedSetCountsByLift = LIFT_ORDER.reduce((counts, lift) => ({
    ...counts,
    [lift]: recentDays.reduce(
      (total, day) => total + (Number(day.failedOrSkippedSetCountsByLift?.[lift]) || 0),
      0
    ),
  }), {});

  const effortFatigueScore = recentDays.reduce(
    (score, day) => score + getSmartEffortScore(day.workoutEffort),
    0
  );

  const failedSetFatigueScore = Math.min(
    recentFailedOrSkippedSetCount,
    SMART_THRESHOLDS.FAILED_SET_FATIGUE_CAP
  );

  const recentFatigueScore =
    Math.max(effortFatigueScore, 0) + failedSetFatigueScore;

  return {
    completedCount: workoutDays.length,
    activeBlockCompletedCount: activeBlockDays.length,
    activeBlockLiftExposureCounts,
    meetPlanReady: Boolean(smartMeetPlanReadiness.ready),
    meetPlanHasCurrentCycleEvidence: smartMeetPlanReadiness.hasCurrentCycleMeetEvidence,
    meetPlanReadiness: smartMeetPlanReadiness.byLift,
    meetPlanWeakestLift: smartMeetPlanReadiness.weakestLift || null,
    meetPlanWeakestRatio: smartMeetPlanReadiness.weakestRatio || 0,
    meetPlanWeakestTarget: smartMeetPlanReadiness.weakestTarget || 0,
    meetPlanWeakestBestE1RM: smartMeetPlanReadiness.weakestBestE1RM || 0,
    meetdayBlockers: getSmartMeetdayBlockers({
      activeBlockCompletedCount: activeBlockDays.length,
      activeBlockLiftExposureCounts,
      recentFatigueScore,
      recentFailedOrSkippedSetCount,
      meetPlanReady: Boolean(smartMeetPlanReadiness.ready),
      meetPlanReadiness: smartMeetPlanReadiness.byLift,
      lastWorkoutEffort: lastDay?.workoutEffort || null,
      lastWasRecoveryIntervention: Boolean(
        lastDay?.restDay ||
        lastDay?.smartDayType === SMART_DAY_TYPES.RECOVERY ||
        lastDay?.smartDayType === SMART_DAY_TYPES.DELOAD
      ),
    }),
    lastWorkoutNumber: Number(lastDay?.workoutNumber) || 0,
    lastMeetWorkoutNumber: Number(lastMeetDay?.workoutNumber) || 0,
    lastWorkoutEffort: lastDay?.workoutEffort || null,
    lastWorkoutLifts: lastDay?.lifts || [],
    lastSmartDayType: lastDay?.smartDayType || null,
    lastWasRestDay: Boolean(lastDay?.restDay || lastDay?.smartDayType === SMART_DAY_TYPES.RECOVERY),
    lastWasRecoveryIntervention: Boolean(
      lastDay?.restDay ||
      lastDay?.smartDayType === SMART_DAY_TYPES.RECOVERY ||
      lastDay?.smartDayType === SMART_DAY_TYPES.DELOAD
    ),
    inPostMeetRecovery,
    postMeetRecoveryTarget,
    postMeetRecoveryReason,
    postMeetRecoveryDaysCompleted,
    postMeetRecoveryTargetReached,
    recentHardCount,
    recentEasyCount,
    recentFailedOrSkippedSetCount,
    recentFailedOrSkippedSetCountsByLift,
    effortFatigueScore,
    failedSetFatigueScore,
    recentFatigueScore,
  };
}

function isHeavySmartTrainingCandidate(workout = {}) {
  if (workout.smartDayType === SMART_DAY_TYPES.DELOAD) return false;

  const label = String(workout.labelKey || workout.label || '').toLowerCase();
  const type = String(workout.type || '').toLowerCase();

  if (type === 'meet') return true;

  if (
    label.includes('heavy') ||
    label.includes('peak') ||
    label.includes('opener') ||
    label.includes('attempt') ||
    label.includes('max')
  ) {
    return true;
  }

  const allSets = [
    ...(workout.sets || []),
    ...(workout.lifts || []).flatMap(liftBlock => liftBlock.sets || []),
  ];

  return allSets.some(set => {
    const setLabel = String(set?.labelKey || set?.label || '').toLowerCase();
    const pct = Number(set?.pct) || 0;
    const reps = Number(set?.reps) || 0;

    return (
      setLabel.includes('opener') ||
      setLabel.includes('attempt') ||
      setLabel.includes('max') ||
      setLabel.includes('topsingle') ||
      setLabel.includes('topdouble') ||
      (reps <= 2 && pct >= 0.80) ||
      pct >= 0.85
    );
  });
}

function getSmartMeetPlanAttemptWeight({ lift, key, prs = {}, meetPlannerAttempts = {} }) {
  const custom = Number(meetPlannerAttempts?.[lift]?.[key]);

  if (Number.isFinite(custom) && custom > 0) {
    return roundMeetWeight(custom);
  }

  const base = Number(prs?.[lift]) || 0;
  const pct = Number(MEET_ATTEMPT_PCTS?.[key]) || 1;

  return base > 0 ? roundMeetWeight(base * pct) : 0;
}

function buildSmartMeetPlanReadiness({
  history = [],
  prs = {},
  meetPlannerAttempts = {},
  currentCycle = 1,
} = {}) {
  const bestMaxes = calculateBestMaxesFromHistory(history);
  const currentCycleEntries = (history || []).filter(entry =>
    Number(entry?.cycle) === Number(currentCycle) &&
    Number(entry?.workoutNumber) > 0 &&
    !entry?.manualMax &&
    !entry?.seedMax
  );
  const currentCycleBestMaxes = calculateBestMaxesFromHistory(currentCycleEntries);

  const byLift = LIFT_ORDER.reduce((acc, lift) => {
    const bestE1RM = Math.max(
      Number(prs?.[lift]) || 0,
      Number(bestMaxes?.[lift]?.e1rm) || 0
    );
    const currentCycleBestE1RM = Number(currentCycleBestMaxes?.[lift]?.e1rm) || 0;

    const attempts = MEET_ATTEMPT_KEYS.reduce((attemptAcc, key) => ({
      ...attemptAcc,
      [key]: getSmartMeetPlanAttemptWeight({
        lift,
        key,
        prs,
        meetPlannerAttempts,
      }),
    }), {});

    const plannedTopAttempt = Math.max(
      Number(attempts.opener) || 0,
      Number(attempts.secondAttempt) || 0,
      Number(attempts.thirdAttempt) || 0
    );

    const readinessRatio = plannedTopAttempt > 0
      ? bestE1RM / plannedTopAttempt
      : 0;
    const currentCycleReadinessRatio = plannedTopAttempt > 0
      ? currentCycleBestE1RM / plannedTopAttempt
      : 0;
    const hasCurrentCycleEvidence = currentCycleBestE1RM > 0;
    const currentCycleTarget = plannedTopAttempt * SMART_THRESHOLDS.MEETDAY_CURRENT_CYCLE_READINESS_RATIO;
    const currentCycleShortfall = hasCurrentCycleEvidence
      ? Math.max(0, currentCycleTarget - currentCycleBestE1RM)
      : null;

    return {
      ...acc,
      [lift]: {
        bestE1RM,
        currentCycleBestE1RM,
        hasCurrentCycleEvidence,
        attempts,
        plannedTopAttempt,
        currentCycleTarget,
        currentCycleShortfall,
        readinessRatio,
        currentCycleReadinessRatio,
        ready: plannedTopAttempt > 0 && currentCycleReadinessRatio >= SMART_THRESHOLDS.MEETDAY_CURRENT_CYCLE_READINESS_RATIO,
      },
    };
  }, {});

  const hasCurrentCycleMeetEvidence = LIFT_ORDER.some(lift =>
    Number(byLift[lift]?.currentCycleBestE1RM) > 0
  );

  const weakestLift = hasCurrentCycleMeetEvidence
    ? LIFT_ORDER
      .filter(lift => byLift[lift]?.plannedTopAttempt > 0)
      .sort((a, b) =>
        (byLift[a]?.currentCycleReadinessRatio || 0) - (byLift[b]?.currentCycleReadinessRatio || 0)
      )[0] || null
    : null;

  return {
    byLift,
    hasCurrentCycleMeetEvidence,
    ready: LIFT_ORDER.every(lift => byLift[lift]?.ready),
    weakestLift,
    weakestRatio: weakestLift ? byLift[weakestLift]?.currentCycleReadinessRatio || 0 : 0,
    weakestTarget: weakestLift ? byLift[weakestLift]?.plannedTopAttempt || 0 : 0,
    weakestBestE1RM: weakestLift ? byLift[weakestLift]?.currentCycleBestE1RM || 0 : 0,
  };
}

function getSmartMeetdayBlockers(readiness = {}) {
  const blockers = [];
  const meetPlanReadiness = readiness.meetPlanReadiness || {};
  const missingLifts = LIFT_ORDER.filter(lift =>
    !meetPlanReadiness?.[lift]?.hasCurrentCycleEvidence
  );
  const isClean = (
    Number(readiness.recentFatigueScore) === 0 &&
    Number(readiness.recentFailedOrSkippedSetCount) === 0 &&
    !isSmartHardEffort(readiness.lastWorkoutEffort)
  );

  if (
    readiness.lastWasRecoveryIntervention &&
    readiness.meetPlanReady &&
    isClean
  ) {
    return [];
  }

  if (Number(readiness.completedCount) < LIFT_ORDER.length) {
    blockers.push('active-block-too-short');
  }

  if (Number(readiness.recentFatigueScore) > 0) {
    blockers.push('fatigue');
  }

  if (Number(readiness.recentFailedOrSkippedSetCount) > 0) {
    blockers.push('failed-skipped');
  }

  if (missingLifts.length > 0) {
    blockers.push('missing-lift-exposure');
  }

  if (!readiness.meetPlanReady) {
    blockers.push('meet-plan-not-ready');
  }

  if (isSmartHardEffort(readiness.lastWorkoutEffort)) {
    blockers.push('last-workout-hard');
  }

  if (readiness.lastWasRecoveryIntervention) {
    blockers.push('after-recovery-intervention');
  }

  return blockers;
}

function isSmartMeetdayReady(readiness = {}) {
  const meetPlanReadiness = readiness.meetPlanReadiness || {};
  const hasSeenAllCompetitionLifts = LIFT_ORDER.every(lift =>
    meetPlanReadiness?.[lift]?.hasCurrentCycleEvidence
  );
  const isClean = (
    Number(readiness.recentFatigueScore) === 0 &&
    Number(readiness.recentFailedOrSkippedSetCount) === 0 &&
    !isSmartHardEffort(readiness.lastWorkoutEffort)
  );

  if (
    readiness.lastWasRecoveryIntervention &&
    Boolean(readiness.meetPlanReady) &&
    isClean
  ) {
    return true;
  }

  return (
    Number(readiness.completedCount) >= LIFT_ORDER.length &&
    isClean &&
    hasSeenAllCompetitionLifts &&
    Boolean(readiness.meetPlanReady)
  );
}

function shouldAccelerateSmartEasyReadiness(readiness = {}) {
  const completedCount = Number(readiness.completedCount) || 0;
  const recentEasyCount = Number(readiness.recentEasyCount) || 0;
  const fatigueScore = Number(readiness.recentFatigueScore) || 0;
  const failedCount = Number(readiness.recentFailedOrSkippedSetCount) || 0;
  const meetPlanReadiness = readiness.meetPlanReadiness || {};
  const hasAllLiftEvidence = LIFT_ORDER.every(lift =>
    meetPlanReadiness?.[lift]?.hasCurrentCycleEvidence
  );

  return (
    completedCount >= LIFT_ORDER.length &&
    recentEasyCount >= LIFT_ORDER.length &&
    fatigueScore === 0 &&
    failedCount === 0 &&
    hasAllLiftEvidence &&
    !Boolean(readiness.meetPlanReady)
  );
}

function decideSmartNextDayType(readiness = {}) {
  if (readiness.inPostMeetRecovery) return SMART_DAY_TYPES.RECOVERY;
  if (readiness.postMeetRecoveryTargetReached) return SMART_DAY_TYPES.TRAINING;

  if (Number(readiness.recentFailedOrSkippedSetCount) >= SMART_THRESHOLDS.FAILED_SET_DELOAD_COUNT) {
    return SMART_DAY_TYPES.DELOAD;
  }

  if (Number(readiness.recentFatigueScore) >= SMART_THRESHOLDS.FATIGUE_RECOVERY_SCORE) {
    return SMART_DAY_TYPES.RECOVERY;
  }

  if (isSmartMeetdayReady(readiness)) {
    return SMART_DAY_TYPES.MEET;
  }

  if (readiness.lastWasRecoveryIntervention) return SMART_DAY_TYPES.TRAINING;

  if (shouldPreferSmartPeakCandidate(readiness) || shouldAccelerateSmartEasyReadiness(readiness)) {
    return SMART_DAY_TYPES.TRAINING;
  }

  if (Number(readiness.activeBlockCompletedCount) >= SMART_THRESHOLDS.TRAINING_STREAK_RECOVERY_DAYS) {
    return SMART_DAY_TYPES.RECOVERY;
  }

  return SMART_DAY_TYPES.TRAINING;
}

function decideSmartNextWorkoutIndex(context, generatedWorkouts = []) {
  const readiness = buildSmartReadinessSignals(context);
  const maxIndex = Math.max(generatedWorkouts.length - 1, 0);

  const nextIndex = Math.min(
    Math.max(Number(context?.currentIndex) || 0, 0),
    maxIndex
  );

  const dayType = decideSmartNextDayType(readiness);
  const reason = dayType === SMART_DAY_TYPES.DELOAD
    ? SMART_DECISION_REASONS.FAILED_SET_DELOAD
    : dayType === SMART_DAY_TYPES.MEET
      ? SMART_DECISION_REASONS.MEETDAY_READY
      : dayType === SMART_DAY_TYPES.RECOVERY
        ? readiness.inPostMeetRecovery
          ? SMART_DECISION_REASONS.POST_MEET_RECOVERY
          : Number(readiness.recentFatigueScore) >= SMART_THRESHOLDS.FATIGUE_RECOVERY_SCORE
            ? SMART_DECISION_REASONS.FATIGUE_RECOVERY
            : SMART_DECISION_REASONS.TRAINING_STREAK_RECOVERY
        : SMART_DECISION_REASONS.TRAINING_FALLBACK;

  return {
    index: nextIndex,
    dayType,
    readiness,
    reason,
    overrideType: dayType === SMART_DAY_TYPES.RECOVERY ? 'rest' : null,
  };
}

function resetSmartSetProgress(set = {}) {
  return {
    ...set,
    done: false,
    failed: false,
    skipped: false,
    effort: null,
    failedAttempts: 0,
    failedWeight: null,
    adjustedWeight: null,
    adjustedFromFailedSet: false,
    adjustedFromOriginal: false,
  };
}

function resetSmartChecklistProgress(item = {}) {
  return {
    ...item,
    done: false,
  };
}

function resetSmartWorkoutProgress(workout = {}) {
  return {
    ...workout,
    completed: false,
    completedAt: null,
    completedDate: null,
    completedSummary: null,
    smartSelectable: false,
    workoutEffort: null,
    smartDecision: null,
    smartDecisionSummary: null,
    smartDayType: null,
    smartOverride: null,
    smartVisible: false,
    smartCurrentIndex: null,
    smartCurrentCycle: null,
    smartSourceWorkoutNumber: null,
    smartGeneratedDeload: false,
    [SMART_GENERATED_FLAGS.RECOVERY]: false,
    [SMART_GENERATED_FLAGS.TRAINING]: false,
    prepItems: (workout.prepItems || []).map(resetSmartChecklistProgress),
    warmups: (workout.warmups || []).map(resetSmartChecklistProgress),
    sets: (workout.sets || []).map(resetSmartSetProgress),
    cooldownItems: (workout.cooldownItems || []).map(resetSmartChecklistProgress),
    lifts: (workout.lifts || []).map(liftBlock => ({
      ...liftBlock,
      prepItems: (liftBlock.prepItems || []).map(resetSmartChecklistProgress),
      warmups: (liftBlock.warmups || []).map(resetSmartChecklistProgress),
      sets: (liftBlock.sets || []).map(resetSmartSetProgress),
    })),
    accessories: (workout.accessories || []).map(accessory => ({
      ...accessory,
      done: (accessory.done || []).map(() => false),
    })),
  };
}

function buildSmartRecoveryWorkout(sourceWorkout = {}) {
  return {
    ...resetSmartWorkoutProgress(sourceWorkout),
    type: 'rest',
    labelKey: 'restAndRecovery',
    workoutEffort: 'easy',
    lift: null,
    lifts: [],
    sets: [],
    warmups: [],
    accessories: [],
    cooldownItems: [],
    prepItems: [],
    [SMART_GENERATED_FLAGS.RECOVERY]: true,
  };
}

function buildSmartTrainingWorkout(sourceWorkout = {}, trainingCandidate = null, options = {}) {
  if (!trainingCandidate || trainingCandidate?.type !== 'training') {
    return sourceWorkout;
  }

  if (
    sourceWorkout?.type === 'training' &&
    !options.forceReplacement
  ) {
    return resetSmartWorkoutProgress(sourceWorkout);
  }

  return {
    ...resetSmartWorkoutProgress(trainingCandidate),
    number: sourceWorkout.number,
    smartSourceWorkoutNumber: trainingCandidate.number,
    [SMART_GENERATED_FLAGS.TRAINING]: true,
  };
}

function adjustSmartTrainingSet(set = {}, loadFactor = 1, adjustment = {}) {
  const factor = Number(loadFactor) || 1;
  if (factor === 1) return set;

  const nextSet = { ...set };
  const weight = Number(nextSet.weight);
  const pct = Number(nextSet.pct);
  const targetTopWeight = Number(adjustment.easySuccessTargetTopWeight) || 0;
  const shouldForceEvidenceTarget =
    adjustment.easySuccessProgression === true &&
    targetTopWeight > 0 &&
    isTopSetLabel(nextSet.labelKey);

  if (Number.isFinite(weight) && weight > 0) {
    const factorWeight = Math.max(2.5, Math.round((weight * factor) / 2.5) * 2.5);
    const targetWeight = shouldForceEvidenceTarget
      ? Math.max(2.5, ceilMeetWeight(targetTopWeight))
      : factorWeight;

    nextSet.weight = Math.max(factorWeight, targetWeight);
    nextSet.originalWeight = nextSet.weight;
  }

  if (Number.isFinite(pct) && pct > 0) {
    nextSet.pct = Math.max(0.01, Math.round(pct * factor * 1000) / 1000);
    nextSet.originalPct = nextSet.pct;
  }

  nextSet.failedWeight = null;
  nextSet.adjustedWeight = null;
  nextSet.adjustedFromFailedSet = false;
  nextSet.adjustedFromOriginal = false;

  return nextSet;
}

function adjustSmartTrainingSets(sets = [], adjustment = {}) {
  const cappedSets = adjustment.maxMainSets
    ? (sets || []).slice(0, adjustment.maxMainSets)
    : (sets || []);

  return cappedSets.map(set => adjustSmartTrainingSet(set, adjustment.loadFactor, adjustment));
}


function getSmartTopSetForProgression(sets = []) {
  return (sets || [])
    .filter(set => Number(set?.weight) > 0 && Number(set?.reps) > 0)
    .map(set => ({
      set,
      e1rm: epley(Number(set.weight) || 0, Number(set.reps) || 1),
    }))
    .sort((a, b) => b.e1rm - a.e1rm)[0]?.set || null;
}

function getSmartEasySuccessProgressionPlan(readiness = {}, liftBlock = {}) {
  const lift = liftBlock?.lift || null;
  const liftReadiness = readiness.meetPlanReadiness?.[lift] || null;
  const recentEasyCount = Number(readiness.recentEasyCount) || 0;
  const recentFatigueScore = Number(readiness.recentFatigueScore) || 0;
  const recentFailedOrSkippedSetCount = Number(readiness.recentFailedOrSkippedSetCount) || 0;
  const topSet = getSmartTopSetForProgression(liftBlock?.sets || []);

  const empty = {
    loadFactor: 1,
    targetTopWeight: null,
    targetTopE1RM: null,
    topReps: null,
    isSingle: false,
  };

  if (!lift || !liftReadiness || liftReadiness.ready === true || !topSet) return empty;
  if (recentEasyCount < 2) return empty;
  if (recentFatigueScore > 0 || recentFailedOrSkippedSetCount > 0) return empty;
  if (isSmartHardEffort(readiness.lastWorkoutEffort)) return empty;

  const topWeight = Number(topSet.weight) || 0;
  const topReps = Math.max(Number(topSet.reps) || 1, 1);
  if (topWeight <= 0) return empty;

  const currentBestE1RM = Number(liftReadiness.currentCycleBestE1RM) || 0;
  const liftTarget = Math.max(
    Number(liftReadiness.currentCycleTarget) || 0,
    Number(liftReadiness.plannedTopAttempt) || 0,
    lift === readiness.meetPlanWeakestLift
      ? Number(readiness.meetPlanWeakestTarget) || 0
      : 0
  );
  const acceleratedEasyBuild = shouldAccelerateSmartEasyReadiness(readiness);
  const e1rmStep = acceleratedEasyBuild
    ? (lift === 'Bench' ? 5 : 10)
    : (lift === 'Bench' ? 2.5 : 5);

  const nextTargetE1RM = currentBestE1RM > 0
    ? Math.min(
      liftTarget > 0 ? liftTarget : currentBestE1RM + e1rmStep,
      currentBestE1RM + e1rmStep
    )
    : 0;

  const targetTopWeight = nextTargetE1RM > 0
    ? nextTargetE1RM / (1 + topReps / 30)
    : topWeight * 1.025;

  const minimumBumpFactor = 1.025;
  const isSingle = topReps <= 1;
  const desiredFactor = Math.max(minimumBumpFactor, targetTopWeight / topWeight);

  if (isSingle) {
    return {
      loadFactor: Math.max(1, desiredFactor),
      targetTopWeight,
      targetTopE1RM: nextTargetE1RM || null,
      topReps,
      isSingle,
    };
  }

  const maxBumpFactor = acceleratedEasyBuild
    ? (lift === 'Bench' ? 1.12 : 1.16)
    : (lift === 'Bench' ? 1.05 : 1.06);

  return {
    loadFactor: Math.max(1, Math.min(maxBumpFactor, desiredFactor)),
    targetTopWeight,
    targetTopE1RM: nextTargetE1RM || null,
    topReps,
    isSingle,
  };
}

function getSmartLiftTrainingAutoregulation(readiness = {}, liftBlock = {}) {
  const hasPerLiftFailedCounts = Boolean(readiness.recentFailedOrSkippedSetCountsByLift);
  const recentFailedCount = hasPerLiftFailedCounts
    ? Number(readiness.recentFailedOrSkippedSetCountsByLift?.[liftBlock?.lift]) || 0
    : Number(readiness.recentFailedOrSkippedSetCount) || 0;
  const hasRecentFailedSets = recentFailedCount > 0;
  const hasHardLiftOverlap =
    isSmartHardEffort(readiness.lastWorkoutEffort) &&
    (readiness.lastWorkoutLifts || []).includes(liftBlock?.lift);

  const easySuccessProgressionPlan = getSmartEasySuccessProgressionPlan(readiness, liftBlock);
  const easySuccessProgressionFactor = easySuccessProgressionPlan.loadFactor;

  const loadFactor = hasRecentFailedSets && hasHardLiftOverlap
    ? 0.9
    : hasHardLiftOverlap
      ? 0.95
      : easySuccessProgressionFactor;

  const maxMainSets = hasRecentFailedSets ? 2 : null;

  return {
    lift: liftBlock?.lift || null,
    recentFailedCount,
    hasRecentFailedSets,
    hasHardLiftOverlap,
    easySuccessProgression: loadFactor > 1,
    easySuccessTargetTopWeight: loadFactor > 1 ? easySuccessProgressionPlan.targetTopWeight : null,
    easySuccessTargetTopE1RM: loadFactor > 1 ? easySuccessProgressionPlan.targetTopE1RM : null,
    loadFactor,
    maxMainSets,
    hasAdjustment: loadFactor !== 1 || Boolean(maxMainSets),
  };
}

function applySmartTrainingAutoregulation(workout = {}, readiness = {}) {
  if (workout?.type !== 'training') return workout;

  const liftAdjustments = {};
  const adjustedLifts = (workout.lifts || []).map(liftBlock => {
    const adjustment = getSmartLiftTrainingAutoregulation(readiness, liftBlock);
    liftAdjustments[liftBlock.lift] = adjustment;

    if (!adjustment.hasAdjustment) {
      return {
        ...liftBlock,
        warmups: generateWarmups(liftBlock.sets || [], liftBlock.lift),
      };
    }

    const adjustedSets = adjustSmartTrainingSets(liftBlock.sets || [], adjustment);

    return {
      ...liftBlock,
      sets: adjustedSets,
      warmups: generateWarmups(adjustedSets, liftBlock.lift),
    };
  });

  const adjustedPrimaryLift = adjustedLifts[0] || null;
  const adjustedPrimarySets = adjustedPrimaryLift?.sets || workout.sets || [];
  const appliedAdjustments = Object.values(liftAdjustments).filter(adjustment =>
    adjustment?.hasAdjustment
  );

  if (!appliedAdjustments.length) {
    return {
      ...workout,
      smartTrainingAutoregulationByLift: liftAdjustments,
      warmups: generateWarmups(workout.sets || [], workout.lift),
      lifts: adjustedLifts,
    };
  }

  return {
    ...workout,
    smartAutoregulatedTraining: true,
    smartTrainingLoadFactor: Math.min(...appliedAdjustments.map(adjustment => adjustment.loadFactor)),
    smartTrainingVolumeCap: appliedAdjustments.some(adjustment => adjustment.maxMainSets)
      ? 2
      : null,
    smartTrainingAdjustedLifts: appliedAdjustments.map(adjustment => adjustment.lift).filter(Boolean),
    smartTrainingAutoregulationByLift: liftAdjustments,
    sets: adjustedPrimarySets,
    warmups: adjustedPrimaryLift?.warmups || generateWarmups(adjustedPrimarySets, workout.lift),
    lifts: adjustedLifts,
  };
}

function reduceSmartDeloadSet(set = {}) {
  const nextSet = { ...set };
  const weight = Number(nextSet.weight);
  const pct = Number(nextSet.pct);

  if (Number.isFinite(weight) && weight > 0) {
    nextSet.weight = Math.round((weight * SMART_DELOAD.LOAD_FACTOR) / 2.5) * 2.5;
    nextSet.originalWeight = nextSet.weight;
  }

  if (Number.isFinite(pct) && pct > 0) {
    nextSet.pct = Math.max(
      SMART_DELOAD.MIN_PCT,
      Math.round(pct * SMART_DELOAD.LOAD_FACTOR * 1000) / 1000
    );
    nextSet.originalPct = nextSet.pct;
  }

  nextSet.failedWeight = null;
  nextSet.adjustedWeight = null;
  nextSet.adjustedFromFailedSet = false;
  nextSet.adjustedFromOriginal = false;

  return nextSet;
}

function limitSmartDeloadSets(sets = []) {
  return (sets || [])
    .slice(0, 2)
    .map(reduceSmartDeloadSet);
}

function buildSmartDeloadSelectionSummary(candidate = null, readiness = {}) {
  if (!candidate || candidate?.type !== 'training') return null;

  const candidateLifts = getWorkoutLiftNames(candidate);
  const recentFailedLifts = LIFT_ORDER.filter(lift =>
    Number(readiness.recentFailedOrSkippedSetCountsByLift?.[lift]) > 0
  );
  const selectedFailedLifts = candidateLifts.filter(lift => recentFailedLifts.includes(lift));

  return {
    sourceWorkoutNumber: candidate.number || null,
    candidateLifts,
    recentFailedLifts,
    selectedFailedLifts,
    primaryLift: candidateLifts[0] || null,
    primaryFailedLift: selectedFailedLifts.includes(candidateLifts[0] || null),
    reasonFlags: [
      'failed-set-deload',
      selectedFailedLifts.length ? 'includes-recent-failed-lift' : null,
      selectedFailedLifts.includes(candidateLifts[0] || null) ? 'failed-lift-primary' : null,
    ].filter(Boolean),
  };
}

function buildSmartDeloadWorkout(sourceWorkout = {}, trainingCandidate = null, readiness = {}) {
  const trainingWorkout = buildSmartTrainingWorkout(sourceWorkout, trainingCandidate, {
    forceReplacement: true,
  });
  const smartDeloadSelectionSummary = buildSmartDeloadSelectionSummary(trainingCandidate, readiness);
  const smartDeloadByLift = {};

  const deloadLifts = (trainingWorkout.lifts || []).map(liftBlock => {
    const originalSets = liftBlock.sets || [];
    const deloadSets = limitSmartDeloadSets(originalSets);

    smartDeloadByLift[liftBlock.lift] = {
      lift: liftBlock.lift,
      originalSetCount: originalSets.length,
      deloadSetCount: deloadSets.length,
      loadFactor: SMART_DELOAD.LOAD_FACTOR,
      minPct: SMART_DELOAD.MIN_PCT,
    };

    return {
      ...liftBlock,
      sets: deloadSets,
      warmups: generateWarmups(deloadSets, liftBlock.lift),
    };
  });

  const primaryDeloadSets = deloadLifts[0]?.sets || limitSmartDeloadSets(trainingWorkout.sets || []);
  const primaryDeloadWarmups = deloadLifts[0]?.warmups || generateWarmups(primaryDeloadSets, trainingWorkout.lift);

  return {
    ...trainingWorkout,
    labelKey: 'deload',
    label: null,
    smartDayType: SMART_DAY_TYPES.DELOAD,
    smartGeneratedDeload: true,
    smartDeloadSelectionSummary,
    smartDeloadByLift,
    sets: primaryDeloadSets,
    warmups: primaryDeloadWarmups,
    lifts: deloadLifts,
  };
}

function buildSmartMeetWorkout(sourceWorkout = {}, meetCandidate = null) {
  const template = meetCandidate?.type === 'meet' ? meetCandidate : sourceWorkout;

  return {
    ...resetSmartWorkoutProgress(template),
    number: sourceWorkout.number,
    type: 'meet',
    labelKey: 'meetDay',
    smartDayType: SMART_DAY_TYPES.MEET,
    smartSourceWorkoutNumber: template.number,
    [SMART_GENERATED_FLAGS.MEET]: true,
  };
}


function buildSmartWorkoutPool(generatedWorkouts = [], currentIndex = 0) {
  const targetLength = Math.max(
    generatedWorkouts.length,
    (Math.max(Number(currentIndex) || 0, 0) + 1)
  );

  if (generatedWorkouts.length >= targetLength) return generatedWorkouts;

  const repeatableWorkouts = generatedWorkouts.filter(workout => workout?.type !== 'meet');
  const fallbackPool = repeatableWorkouts.length > 0 ? repeatableWorkouts : generatedWorkouts;
  const nextWorkouts = [...generatedWorkouts];

  while (nextWorkouts.length < targetLength) {
    const source = fallbackPool[(nextWorkouts.length - generatedWorkouts.length) % fallbackPool.length];

    nextWorkouts.push({
      ...resetSmartWorkoutProgress(source),
      number: nextWorkouts.length + 1,
    });
  }

  return nextWorkouts;
}

function buildSmartTrainingCandidateDebug({
  generatedWorkouts = [],
  visibleThroughIndex = 0,
  readiness = {},
  usedSmartSourceWorkoutNumbers = [],
} = {}) {
  const usedSourceSet = new Set((usedSmartSourceWorkoutNumbers || []).map(Number));
  const fallbackTrainingPool = generatedWorkouts.slice(visibleThroughIndex);

  return fallbackTrainingPool
    .filter(candidate => candidate?.type === 'training')
    .slice(0, 12)
    .map(candidate => {
      const lifts = getWorkoutLiftNames(candidate);
      const overlapCount = countSharedWorkoutLifts(candidate, readiness.lastWorkoutLifts || []);
      const isUnused = !usedSourceSet.has(Number(candidate?.number));
      const isHeavy = isHeavySmartTrainingCandidate(candidate);

      const failedLiftCount = lifts.reduce(
        (total, lift) => total + (Number(readiness.recentFailedOrSkippedSetCountsByLift?.[lift]) || 0),
        0
      );

      return {
        number: candidate.number,
        labelKey: candidate.labelKey,
        lifts,
        liftCount: lifts.length,
        overlapCount,
        failedLiftCount,
        isUnused,
        isHeavy,
      };
    });
}

function selectSmartDeloadCandidate({
  generatedWorkouts = [],
  visibleThroughIndex = 0,
  readiness = {},
  usedSmartSourceWorkoutNumbers = [],
} = {}) {
  const usedSourceSet = new Set((usedSmartSourceWorkoutNumbers || []).map(Number));
  const failedLifts = LIFT_ORDER.filter(lift =>
    Number(readiness.recentFailedOrSkippedSetCountsByLift?.[lift]) > 0
  );

  const pool = [
    ...generatedWorkouts.slice(visibleThroughIndex),
    ...generatedWorkouts.slice(0, visibleThroughIndex + 1).reverse(),
  ].filter(candidate => candidate?.type === 'training');

  const scored = pool
    .map(candidate => {
      const lifts = getWorkoutLiftNames(candidate);
      const failedLiftMatches = lifts.filter(lift => failedLifts.includes(lift)).length;
      const primaryFailedLiftBonus = failedLifts.includes(lifts[0]) ? 12 : 0;
      const isUnused = !usedSourceSet.has(Number(candidate?.number));
      const isHeavy = isHeavySmartTrainingCandidate(candidate);
      const liftCountPenalty = Math.max(lifts.length - 1, 0);

      return {
        candidate,
        score:
          (failedLiftMatches * 20) +
          primaryFailedLiftBonus +
          (isUnused ? 3 : 0) -
          (isHeavy ? 8 : 0) -
          liftCountPenalty,
      };
    })
    .filter(item => item.candidate && item.score > -100)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.candidate || null;
}

function shouldPreferSmartPeakCandidate(readiness = {}) {
  const completedCount = Number(readiness.completedCount) || 0;

  return (
    Boolean(readiness.meetPlanHasCurrentCycleEvidence) &&
    !readiness.meetPlanReady &&
    Boolean(readiness.meetPlanWeakestLift) &&
    completedCount >= Math.max(6, LIFT_ORDER.length * 2) &&
    Number(readiness.recentFatigueScore) === 0 &&
    Number(readiness.recentFailedOrSkippedSetCount) === 0 &&
    !isSmartHardEffort(readiness.lastWorkoutEffort)
  );
}

function isSmartPeakCandidateForLift(candidate = {}, lift = null) {
  if (!candidate || candidate?.type !== 'training' || !lift) return false;

  const candidateLifts = getWorkoutLiftNames(candidate);
  if (!candidateLifts.includes(lift)) return false;

  const allSets = [
    ...(candidate.sets || []),
    ...(candidate.lifts || []).flatMap(liftBlock => liftBlock?.sets || []),
  ];

  return allSets.some(set => {
    const label = String(set?.labelKey || set?.label || '').toLowerCase();
    const pct = Number(set?.pct) || 0;
    const reps = Number(set?.reps) || 0;

    return (
      label.includes('opener') ||
      label.includes('topsingle') ||
      label.includes('topdouble') ||
      (reps <= 2 && pct >= 0.80) ||
      pct >= 0.85
    );
  });
}

function selectSmartTrainingCandidate({
  generatedWorkouts = [],
  visibleThroughIndex = 0,
  readiness = {},
  usedSmartSourceWorkoutNumbers = [],
} = {}) {
  const usedSourceSet = new Set((usedSmartSourceWorkoutNumbers || []).map(Number));
  const isUnusedTraining = candidate =>
    candidate?.type === 'training' &&
    !usedSourceSet.has(Number(candidate?.number));

  const fallbackTrainingPool = generatedWorkouts.slice(visibleThroughIndex);
  const previousTrainingPool = generatedWorkouts.slice(0, visibleThroughIndex + 1).reverse();

  function scoreCandidate(candidate) {
    const candidateLifts = getWorkoutLiftNames(candidate);
    const liftExposureCounts = readiness.activeBlockLiftExposureCounts || {};
    const meetPlanReadiness = readiness.meetPlanReadiness || {};
    const exposureValues = LIFT_ORDER.map(lift => Number(liftExposureCounts[lift]) || 0);
    const minExposure = Math.min(...exposureValues);
    const totalExposurePenalty = candidateLifts.reduce(
      (total, lift) => total + (Number(liftExposureCounts[lift]) || 0),
      0
    );
    const undertrainedBonus = candidateLifts.filter(lift =>
      (Number(liftExposureCounts[lift]) || 0) === minExposure
    ).length * 4;
    const shouldUseMeetPlanTrainingBias =
      Number(readiness.completedCount) > 0 &&
      Number(readiness.activeBlockCompletedCount) > 0;

    const meetPlanNeedsWorkBonus = shouldUseMeetPlanTrainingBias
      ? candidateLifts.filter(lift =>
        meetPlanReadiness?.[lift] && !meetPlanReadiness[lift].ready
      ).length * 5
      : 0;
    const weakestLiftBonus =
      shouldUseMeetPlanTrainingBias &&
      !readiness.meetPlanReady &&
      readiness.meetPlanWeakestLift &&
      candidateLifts.includes(readiness.meetPlanWeakestLift)
        ? 8
        : 0;
    const overlapCount = countSharedWorkoutLifts(candidate, readiness.lastWorkoutLifts || []);
    const overlapPenalty = overlapCount * (isSmartHardEffort(readiness.lastWorkoutEffort) ? 8 : 2);
    const failedLiftPenalty = candidateLifts.reduce(
      (total, lift) => total + ((Number(readiness.recentFailedOrSkippedSetCountsByLift?.[lift]) || 0) * 7),
      0
    );
    const liftCountPenalty = Math.max(getWorkoutLiftNames(candidate).length - 1, 0);
    const heavyPenalty = isHeavySmartTrainingCandidate(candidate) ? 1 : 0;

    return weakestLiftBonus + meetPlanNeedsWorkBonus + undertrainedBonus - totalExposurePenalty - overlapPenalty - failedLiftPenalty - liftCountPenalty - heavyPenalty;
  }

  function pickBestCandidate(pool = [], predicate = () => true) {
    return (pool || [])
      .filter(candidate => candidate?.type === 'training' && predicate(candidate))
      .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0] || null;
  }

  function pickLowestOverlapCandidate(pool = [], predicate = () => true) {
    return (pool || [])
      .filter(candidate => candidate?.type === 'training' && predicate(candidate))
      .sort((a, b) => {
        const overlapDiff =
          countSharedWorkoutLifts(a, readiness.lastWorkoutLifts || []) -
          countSharedWorkoutLifts(b, readiness.lastWorkoutLifts || []);

        if (overlapDiff !== 0) return overlapDiff;

        return scoreCandidate(b) - scoreCandidate(a);
      })[0] || null;
  }

  function pickPeakCandidateForLift(lift = null) {
    const targetWorkoutNumber = Math.max(Number(visibleThroughIndex) || 0, 0) + 1;
    const maxLookahead = 8;
    const candidates = orderedPools
      .flatMap(pool => pool || [])
      .filter(candidate =>
        candidate?.type === 'training' &&
        isSmartPeakCandidateForLift(candidate, lift)
      );

    const nearbyCandidates = candidates.filter(candidate => {
      const distance = Math.abs((Number(candidate.number) || 0) - targetWorkoutNumber);
      return distance <= maxLookahead;
    });

    return (nearbyCandidates.length ? nearbyCandidates : candidates)
      .sort((a, b) => {
        const distanceA = Math.abs((Number(a.number) || 0) - targetWorkoutNumber);
        const distanceB = Math.abs((Number(b.number) || 0) - targetWorkoutNumber);

        if (distanceA !== distanceB) return distanceA - distanceB;

        const heavyDiff = Number(isHeavySmartTrainingCandidate(a)) - Number(isHeavySmartTrainingCandidate(b));
        if (heavyDiff !== 0) return heavyDiff;

        return scoreCandidate(b) - scoreCandidate(a);
      })[0] || null;
  }

  const orderedPools = [
    fallbackTrainingPool.filter(isUnusedTraining),
    previousTrainingPool.filter(isUnusedTraining),
    fallbackTrainingPool.filter(candidate => candidate?.type === 'training'),
    previousTrainingPool.filter(candidate => candidate?.type === 'training'),
  ];

  function pickFromPools(predicate = () => true) {
    return orderedPools
      .map(pool => pickBestCandidate(pool, predicate))
      .find(Boolean) || null;
  }

  const defaultTrainingCandidate = pickFromPools();

  if (shouldPreferSmartPeakCandidate(readiness)) {
    const weakestLift = readiness.meetPlanWeakestLift;

    return pickPeakCandidateForLift(weakestLift) || defaultTrainingCandidate;
  }

  if (readiness.lastWasRestDay || readiness.lastWasRecoveryIntervention) {
    const lastWorkoutLifts = readiness.lastWorkoutLifts || [];

    return pickFromPools(candidate =>
      !isHeavySmartTrainingCandidate(candidate) &&
      countSharedWorkoutLifts(candidate, lastWorkoutLifts) === 0
    ) || pickFromPools(candidate =>
      !isHeavySmartTrainingCandidate(candidate) &&
      countSharedWorkoutLifts(candidate, lastWorkoutLifts) <= 1
    ) || pickFromPools(candidate =>
      !isHeavySmartTrainingCandidate(candidate)
    ) || defaultTrainingCandidate;
  }

  if (isSmartHardEffort(readiness.lastWorkoutEffort)) {
    const lastWorkoutLifts = readiness.lastWorkoutLifts || [];

    return pickFromPools(candidate =>
      countSharedWorkoutLifts(candidate, lastWorkoutLifts) === 0
    ) || pickFromPools(candidate =>
      countSharedWorkoutLifts(candidate, lastWorkoutLifts) <= 1 &&
      !isHeavySmartTrainingCandidate(candidate)
    ) || orderedPools
      .map(pool => pickLowestOverlapCandidate(pool, candidate =>
        !isHeavySmartTrainingCandidate(candidate)
      ))
      .find(Boolean) || defaultTrainingCandidate;
  }

  return defaultTrainingCandidate;
}

function buildSmartTrainingSelectionSummary(candidate = null, readiness = {}) {
  if (!candidate || candidate?.type !== 'training') return null;

  const candidateLifts = getWorkoutLiftNames(candidate);
  const meetPlanReadiness = readiness.meetPlanReadiness || {};
  const exposureCounts = readiness.activeBlockLiftExposureCounts || {};
  const lastWorkoutLifts = readiness.lastWorkoutLifts || [];
  const isNewCycleStart =
    Number(readiness.completedCount) === 0 &&
    Number(readiness.activeBlockCompletedCount) === 0;
  const recentFailedLifts = LIFT_ORDER.filter(lift =>
    Number(readiness.recentFailedOrSkippedSetCountsByLift?.[lift]) > 0
  );
  const selectedFailedLifts = candidateLifts.filter(lift => recentFailedLifts.includes(lift));
  const avoidedFailedLifts = recentFailedLifts.filter(lift => !candidateLifts.includes(lift));
  const meetPlanNeeds = candidateLifts.filter(lift =>
    meetPlanReadiness?.[lift] && !meetPlanReadiness[lift].ready
  );
  const overlapLifts = candidateLifts.filter(lift => lastWorkoutLifts.includes(lift));
  const undertrainedLifts = (() => {
    const exposureValues = LIFT_ORDER.map(lift => Number(exposureCounts[lift]) || 0);
    const minExposure = Math.min(...exposureValues);

    return candidateLifts.filter(lift =>
      (Number(exposureCounts[lift]) || 0) === minExposure
    );
  })();

  const usesPeakPreference = shouldPreferSmartPeakCandidate(readiness);
  const peakTargetLift = usesPeakPreference ? readiness.meetPlanWeakestLift || null : null;

  return {
    sourceWorkoutNumber: candidate.number || null,
    candidateLifts,
    usesPeakPreference,
    peakTargetLift,
    isPeakCandidateForTarget: usesPeakPreference
      ? isSmartPeakCandidateForLift(candidate, peakTargetLift)
      : false,
    weakestLift: isNewCycleStart ? null : readiness.meetPlanWeakestLift || null,
    meetPlanNeeds: isNewCycleStart ? [] : meetPlanNeeds,
    recentFailedLifts,
    selectedFailedLifts,
    avoidedFailedLifts,
    undertrainedLifts,
    overlapLifts,
    exposureCounts,
    lastWorkoutLifts,
    reasonFlags: [
      isNewCycleStart ? 'new-cycle-start' : null,
      undertrainedLifts.length ? 'undertrained-lift-balance' : null,
      meetPlanNeeds.length && !isNewCycleStart ? 'meet-plan-needs-work' : null,
      usesPeakPreference ? 'peak-readiness-preference' : null,
      avoidedFailedLifts.length ? 'avoided-recent-failed-lift' : null,
      selectedFailedLifts.length ? 'selected-recent-failed-lift-capped' : null,
      overlapLifts.length ? 'last-workout-overlap' : null,
    ].filter(Boolean),
  };
}

function generateSmartWorkouts({
  programProfile,
  squat,
  bench,
  deadlift,
  accessoryMode = 'off',
  accessoryPRs = {},
  preparationMode = 'basicFirst',
  deadliftVariant = 'standard',
  benchPressVariant = 'standard',
  squatVariant = 'standard',
  cooldownMode = 'upperBackFriendly',
  history = [],
  currentIndex = 0,
  currentCycle = 1,
  meetPlannerAttempts = {},
}) {
  const smartContext = buildSmartTrainingContext({
    history,
    currentIndex,
    currentCycle,
  });

  const baseGeneratedWorkouts = generateProgramForProfile(
    programProfile,
    squat,
    bench,
    deadlift,
    accessoryMode,
    accessoryPRs,
    preparationMode,
    deadliftVariant,
    benchPressVariant,
    squatVariant,
    cooldownMode
  );

  const generatedWorkouts = buildSmartWorkoutPool(
    baseGeneratedWorkouts,
    smartContext.currentIndex
  );
  const smartMeetCandidate = baseGeneratedWorkouts.find(workout => workout?.type === 'meet') || null;

  if (!Number.isFinite(smartContext.currentIndex)) {
    return generatedWorkouts.map(workout => ({
      ...workout,
      smartVisible: true,
      smartSelectable: true,
    }));
  }

  const smartDecision = decideSmartNextWorkoutIndex({
    ...smartContext,
    prs: {
      Squat: squat,
      Bench: bench,
      Deadlift: deadlift,
    },
    meetPlannerAttempts,
  }, generatedWorkouts);
  const visibleThroughIndex = Math.min(
    Math.max(smartDecision.index, 0),
    Math.max(generatedWorkouts.length - 1, 0)
  );

  const smartTrainingCandidateDebug = buildSmartTrainingCandidateDebug({
    generatedWorkouts,
    visibleThroughIndex,
    readiness: smartDecision.readiness,
    usedSmartSourceWorkoutNumbers: smartContext.usedSmartSourceWorkoutNumbers,
  });

  const fallbackTrainingCandidate = smartDecision.dayType === SMART_DAY_TYPES.DELOAD
    ? selectSmartDeloadCandidate({
      generatedWorkouts,
      visibleThroughIndex,
      readiness: smartDecision.readiness,
      usedSmartSourceWorkoutNumbers: smartContext.usedSmartSourceWorkoutNumbers,
    }) || selectSmartTrainingCandidate({
      generatedWorkouts,
      visibleThroughIndex,
      readiness: smartDecision.readiness,
      usedSmartSourceWorkoutNumbers: smartContext.usedSmartSourceWorkoutNumbers,
    })
    : selectSmartTrainingCandidate({
      generatedWorkouts,
      visibleThroughIndex,
      readiness: smartDecision.readiness,
      usedSmartSourceWorkoutNumbers: smartContext.usedSmartSourceWorkoutNumbers,
    });

  return generatedWorkouts.map((workout, index) => {
    const isDecisionWorkout = index === visibleThroughIndex;
    const shouldBuildRecoveryDay =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.RECOVERY;
    const shouldBuildDeloadDay =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.DELOAD;
    const shouldBuildMeetDay =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.MEET;
    const shouldBlockSmartMeetDay =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.TRAINING &&
      workout.type === 'meet';

    const shouldUseFallbackTraining =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.TRAINING &&
      fallbackTrainingCandidate?.type === 'training' &&
      (
        workout.type !== 'training' ||
        shouldBlockSmartMeetDay ||
        fallbackTrainingCandidate.number !== workout.number ||
        (
          smartDecision.readiness?.lastWasRecoveryIntervention &&
          isHeavySmartTrainingCandidate(workout) &&
          fallbackTrainingCandidate.number !== workout.number
        )
      );

    const smartWorkout = shouldBuildRecoveryDay
      ? buildSmartRecoveryWorkout(workout)
      : shouldBlockSmartMeetDay && !fallbackTrainingCandidate
        ? buildSmartRecoveryWorkout(workout)
        : shouldBuildMeetDay
          ? buildSmartMeetWorkout(workout, smartMeetCandidate)
          : shouldBuildDeloadDay
            ? buildSmartDeloadWorkout(workout, fallbackTrainingCandidate, smartDecision.readiness)
            : shouldUseFallbackTraining
            ? buildSmartTrainingWorkout(workout, fallbackTrainingCandidate, {
              forceReplacement: true,
            })
            : workout;

    const adjustedSmartWorkout =
      isDecisionWorkout &&
      smartDecision.dayType === SMART_DAY_TYPES.TRAINING
        ? applySmartTrainingAutoregulation(smartWorkout, smartDecision.readiness)
        : smartWorkout;

    const smartDecisionSummary = isDecisionWorkout
      ? {
        dayType: smartDecision.dayType,
        reason: smartDecision.reason,
        overrideType: smartDecision.overrideType,
        readiness: smartDecision.readiness
          ? {
            completedCount: smartDecision.readiness.completedCount || 0,
            activeBlockCompletedCount: smartDecision.readiness.activeBlockCompletedCount || 0,
            activeBlockLiftExposureCounts: smartDecision.readiness.activeBlockLiftExposureCounts || {},
            meetPlanReady: Boolean(smartDecision.readiness.meetPlanReady),
            meetPlanHasCurrentCycleEvidence: Boolean(smartDecision.readiness.meetPlanHasCurrentCycleEvidence),
            meetPlanReadiness: smartDecision.readiness.meetPlanReadiness || {},
            meetPlanWeakestLift: smartDecision.readiness.meetPlanWeakestLift || null,
            meetPlanWeakestRatio: smartDecision.readiness.meetPlanWeakestRatio || 0,
            meetPlanWeakestTarget: smartDecision.readiness.meetPlanWeakestTarget || 0,
            meetPlanWeakestBestE1RM: smartDecision.readiness.meetPlanWeakestBestE1RM || 0,
            meetdayBlockers: smartDecision.readiness.meetdayBlockers || [],
            lastWorkoutNumber: smartDecision.readiness.lastWorkoutNumber || 0,
            lastMeetWorkoutNumber: smartDecision.readiness.lastMeetWorkoutNumber || 0,
            lastWorkoutEffort: smartDecision.readiness.lastWorkoutEffort || null,
            lastWorkoutLifts: smartDecision.readiness.lastWorkoutLifts || [],
            lastSmartDayType: smartDecision.readiness.lastSmartDayType || null,
            lastWasRestDay: Boolean(smartDecision.readiness.lastWasRestDay),
            lastWasRecoveryIntervention: Boolean(smartDecision.readiness.lastWasRecoveryIntervention),
            inPostMeetRecovery: Boolean(smartDecision.readiness.inPostMeetRecovery),
            postMeetRecoveryTarget: smartDecision.readiness.postMeetRecoveryTarget || 0,
            postMeetRecoveryReason: smartDecision.readiness.postMeetRecoveryReason || null,
            postMeetRecoveryDaysCompleted: smartDecision.readiness.postMeetRecoveryDaysCompleted || 0,
            postMeetRecoveryTargetReached: Boolean(smartDecision.readiness.postMeetRecoveryTargetReached),
            recentHardCount: smartDecision.readiness.recentHardCount || 0,
            recentEasyCount: smartDecision.readiness.recentEasyCount || 0,
            recentFailedOrSkippedSetCount: smartDecision.readiness.recentFailedOrSkippedSetCount || 0,
            recentFailedOrSkippedSetCountsByLift: smartDecision.readiness.recentFailedOrSkippedSetCountsByLift || {},
            trainingCandidateDebug: smartTrainingCandidateDebug,
            effortFatigueScore: smartDecision.readiness.effortFatigueScore || 0,
            failedSetFatigueScore: smartDecision.readiness.failedSetFatigueScore || 0,
            recentFatigueScore: smartDecision.readiness.recentFatigueScore || 0,
          }
          : null,
      }
      : null;

    return {
      ...adjustedSmartWorkout,
      smartTrainingSelectionSummary: isDecisionWorkout && smartDecision.dayType === SMART_DAY_TYPES.TRAINING
        ? buildSmartTrainingSelectionSummary(
          shouldUseFallbackTraining ? fallbackTrainingCandidate : adjustedSmartWorkout,
          smartDecision.readiness
        )
        : null,
      smartVisible: index <= visibleThroughIndex,
      smartSelectable: index <= visibleThroughIndex,
      smartCurrentIndex: smartContext.currentIndex,
      smartCurrentCycle: smartContext.currentCycle,
      smartDecision: null,
      smartDecisionSummary,
      smartDayType: isDecisionWorkout ? smartDecision.dayType : null,
      smartOverride: shouldBuildMeetDay
        ? SMART_OVERRIDES.MEETDAY
        : shouldBuildDeloadDay
          ? SMART_OVERRIDES.DELOAD
          : shouldBuildRecoveryDay
            ? SMART_OVERRIDES.RECOVERY
          : shouldUseFallbackTraining
            ? (
              smartDecision.readiness?.lastWasRecoveryIntervention
                ? SMART_OVERRIDES.POST_RECOVERY_LIGHT_TRAINING
                : SMART_OVERRIDES.TRAINING_FALLBACK
            )
            : null,
    };
  });
}

function generateWorkoutsForTrainingModel(model, args = {}) {
  const workoutArgs = {
    programProfile: normalizeProgramProfile(args.programProfile),
    squat: args.squat,
    bench: args.bench,
    deadlift: args.deadlift,
    accessoryMode: args.accessoryMode ?? 'off',
    accessoryPRs: args.accessoryPRs || {},
    preparationMode: args.preparationMode ?? 'basicFirst',
    deadliftVariant: args.deadliftVariant ?? 'standard',
    benchPressVariant: args.benchPressVariant ?? 'standard',
    squatVariant: args.squatVariant ?? 'standard',
    cooldownMode: args.cooldownMode ?? 'upperBackFriendly',
    history: args.history || [],
    currentIndex: args.currentIndex ?? 0,
    currentCycle: args.currentCycle ?? 1,
    meetPlannerAttempts: args.meetPlannerAttempts || {},
  };

  if (isSmartTrainingModel(model)) {
    return generateSmartWorkouts(workoutArgs);
  }

  return generateProgramForProfile(
    workoutArgs.programProfile,
    workoutArgs.squat,
    workoutArgs.bench,
    workoutArgs.deadlift,
    workoutArgs.accessoryMode,
    workoutArgs.accessoryPRs,
    workoutArgs.preparationMode,
    workoutArgs.deadliftVariant,
    workoutArgs.benchPressVariant,
    workoutArgs.squatVariant,
    workoutArgs.cooldownMode
  );
}


function RestTimer({ seconds, endTime, onDismiss, t }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil(((endTime || Date.now() + seconds * 1000) - Date.now()) / 1000)));
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasBeepedRef = useRef(false);
  const wasHiddenRef = useRef(false);
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


    startVisibleTick();
    document.addEventListener('visibilitychange', startVisibleTick);

    return () => {
      clearTick();
      clearFinishTimeout();
      document.removeEventListener('visibilitychange', startVisibleTick);
    };
  }, [
    seconds,
    endTime,
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
  const isActiveOpen = active && !done && !skipped;
  const isOpen = !done && !skipped;

  const borderColor = skipped
    ? '#e74c3c'
    : THEME.primary;

  const background = skipped
    ? '#e74c3c'
    : done
      ? THEME.primary
      : 'rgba(255, 138, 61, 0.08)';

  const color = skipped || done ? THEME.bg : THEME.text;

  return (
    <>
      {isActiveOpen && (
        <style>{`
          @keyframes kelaniActiveWorkoutCirclePulse {
            0% {
              box-shadow:
                0 0 0 2px rgba(255, 138, 61, 0.34),
                0 0 0 0 rgba(255, 138, 61, 0.56);
              transform: scale(1);
            }
            50% {
              box-shadow:
                0 0 0 4px rgba(255, 138, 61, 0.28),
                0 0 0 11px rgba(255, 138, 61, 0.00);
              transform: scale(1.12);
            }
            100% {
              box-shadow:
                0 0 0 2px rgba(255, 138, 61, 0.34),
                0 0 0 0 rgba(255, 138, 61, 0.00);
              transform: scale(1);
            }
          }
        `}</style>
      )}

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
          border: `${isActiveOpen ? 3 : 2}px solid ${borderColor}`,
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
          opacity: disabled && isOpen ? 0.8 : 1,
          boxShadow: isActiveOpen
            ? '0 0 0 4px rgba(255, 138, 61, 0.30)'
            : isOpen
              ? '0 0 0 1px rgba(255, 138, 61, 0.08)'
              : 'none',
          animation: isActiveOpen ? 'kelaniActiveWorkoutCirclePulse 1.05s ease-in-out infinite' : 'none',
        }}
      >
        {skipped ? '✕' : done ? '✓' : ''}
      </button>
    </>
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

  const columnCount = warmups.length === 1
    ? 1
    : warmups.length === 2 || warmups.length === 4
      ? 2
      : 3;

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


function generateCooldownItems(cooldownMode = 'upperBackFriendly') {
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

function CooldownBlock({ items = [], onToggleItem = () => {}, t, isReadOnly = false, activeEnabled = true }) {
  const cooldownItems = items.length > 0 ? items : generateCooldownItems('upperBackFriendly');
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
        color: THEME.meet,
        textAlign: 'center',
      }}>
        {t.cooldownTitle}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10,
        padding: '6px 10px'
      }}>
        {cooldownItems.map((item, index) => (
          <div
            key={index}
            style={{
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              padding: 0
            }}
          >
            <PrepRow
              item={item}
              isActive={!isReadOnly && activeEnabled && index === firstIncompleteIndex}
              isReadOnly={isReadOnly}
              onToggle={() => onToggleItem(index)}
              t={t}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function getFailedSetFeedbackMessage(set, t) {
  if (!set?.failed && !set?.skipped) return null;

  if (isAttemptSetLabel(set?.labelKey)) {
    if (set.labelKey === 'opener') {
      return t.failedOpenerFeedback || 'Opener was missed. The attempt is skipped; use this as feedback for attempt selection.';
    }

    if (set.labelKey === 'secondAttempt') {
      return t.failedSecondAttemptFeedback || 'Second attempt was missed. The attempt is skipped; use this as feedback for the next attempt.';
    }

    if (set.labelKey === 'thirdAttempt') {
      return t.failedThirdAttemptFeedback || 'Third attempt was missed. Use this as useful attempt-planning data for next time.';
    }
  }

  if (set.skipped) {
    return t.failedSetSkippedFeedback || 'Set missed and skipped. Continue with the next appropriate work.';
  }

  return t.failedSetFeedback || 'Set missed. Use the adjusted weight as feedback and continue with controlled technique.';
}

function getAttemptEffortInlineFeedback(set, t) {
  if (!isAttemptSetLabel(set?.labelKey) || !set?.effort) return null;

  const isThirdAttempt = set.labelKey === 'thirdAttempt';

  if (set.effort === 'easy') {
    return isThirdAttempt
      ? t.attemptInlineThirdEasy || 'Third attempt looked easy. Useful attempt-planning data for next time.'
      : t.attemptInlineEffortEasy || 'This attempt looked easy. Consider increasing the next attempt.';
  }

  if (set.effort === 'max') {
    return isThirdAttempt
      ? t.attemptInlineThirdMax || 'Third attempt looked maximal. Good cap for today; continue with the next work.'
      : t.attemptInlineEffortMax || 'This attempt looked maximal. Consider lowering the next attempt.';
  }

  if (set.effort === 'hard') {
    return isThirdAttempt
      ? t.attemptInlineThirdHard || 'Third attempt was hard but acceptable. Use it as useful attempt-planning data.'
      : t.attemptInlineEffortHard || 'Hard but acceptable for attempt practice. Keep the plan.';
  }

  if (set.effort === 'good') {
    return isThirdAttempt
      ? t.attemptInlineThirdGood || 'Third attempt looked right. Useful attempt-planning data for next time.'
      : t.attemptInlineEffortGood || 'This attempt looked right. Keep the plan.';
  }

  return null;
}

function AttemptEffortFeedback({ set, t }) {
  const message = getAttemptEffortInlineFeedback(set, t);
  if (!message) return null;

  return (
    <div style={{
      margin: '0 0 4px',
      padding: '8px 10px',
      borderTop: `1px solid ${THEME.primary}`,
      borderBottom: `1px solid ${THEME.primary}`,
      background: 'rgba(255, 138, 61, 0.12)',
      color: THEME.text,
      fontSize: 12,
      fontWeight: 800,
      lineHeight: 1.35,
      textAlign: 'center'
    }}>
      {message}
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

function getCompletedFailedSetFeedbackMessage(set, t) {
  if (!set?.failed && !set?.skipped) return null;

  if (set.labelKey === 'opener') {
    return t.completedFailedOpenerFeedback || 'Opener was missed. Use this as attempt-selection feedback for next time.';
  }

  if (set.labelKey === 'secondAttempt') {
    return t.completedFailedSecondAttemptFeedback || 'Second attempt was missed. Review the jump from opener to second attempt.';
  }

  if (set.labelKey === 'thirdAttempt') {
    return t.completedFailedThirdAttemptFeedback || 'Third attempt was missed. Useful limit data for future attempt planning.';
  }

  if (isTopSetLabel(set.labelKey)) {
    return t.completedFailedTopSetFeedback || 'Top set was missed. Treat this as load and readiness feedback for today.';
  }

  return null;
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
          : (set.done || set.failed || set.skipped)
      );

    if (!completedSets.length) return;

    if (workout.type === 'meet') {
      completedSets
        .filter(({ set }) => isAttemptSet(set))
        .forEach(({ set, index }) => pushMeetSetSuggestion(setSubject(liftName, set, index), set));
      return;
    }

    if (workout.type !== 'training') return;

    const attemptSets = completedSets.filter(({ set }) =>
      isAttemptSet(set) && (set.failed || set.skipped || set.effort)
    );

    if (attemptSets.length > 0) {
      attemptSets.forEach(({ set, index }) => {
        if (set.failed || set.skipped) {
          const message = getCompletedFailedSetFeedbackMessage(set, t);
          if (message) suggestions.push(`${setSubject(liftName, set, index)}: ${message}`);
          return;
        }

        pushTrainingSetSuggestion(setSubject(liftName, set, index), set.effort, true);
      });
      return;
    }

    completedSets
      .filter(({ set }) =>
        (set.failed || set.skipped) &&
        isTopSetLabel(set.labelKey)
      )
      .forEach(({ set, index }) => {
        const message = getCompletedFailedSetFeedbackMessage(set, t);
        if (message) suggestions.push(`${setSubject(liftName, set, index)}: ${message}`);
      });

    const effortSets = completedSets.filter(({ set }) => set.effort);

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

      {false && feedback && (
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
  const displayPct = formatSetPercentDisplay(set.pct);
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
        type="text"
        inputMode="decimal"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleConfirm}
        style={{
          width: 96,
          boxSizing: 'border-box',
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
    border: `1px solid ${THEME.primary}`,
    boxSizing: 'border-box'
  };
}

function modalActionRowStyle() {
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
    marginTop: 14
  };
}

function modalActionButtonStyle(variant = 'secondary') {
  const isDanger = variant === 'danger';
  const isPrimary = variant === 'primary';

  return {
    width: '100%',
    minHeight: 42,
    padding: '10px 12px',
    fontSize: 14,
    fontWeight: 800,
    background: isDanger ? THEME.red : isPrimary ? THEME.card : 'transparent',
    color: THEME.text,
    border: `1px solid ${isDanger ? THEME.red : THEME.primary}`,
    borderRadius: 8,
    cursor: 'pointer',
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


function MeetPrepChecklistSection() {
  return null;
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
    window.window.location.reload();
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
                border: `1px solid ${THEME.primary}`,
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
      url: 'https://mburgosfr-star.github.io/kelani-site/#support',
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

          <div style={modalActionRowStyle()}>
            <button onClick={() => setIsEditing(false)} style={modalActionButtonStyle('secondary')}>
              {t.cancel}
            </button>

            <button onClick={handleSave} style={modalActionButtonStyle('primary')}>
              {t.save}
            </button>
          </div>
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
                border: `1px solid ${THEME.primary}`,
                borderRadius: 8,
                cursor: 'pointer',
              }}>
                {t.adjust}
              </button>
            </div>
          ))}

          <button onClick={() => setIsOverviewOpen(false)} style={{ width: '100%', marginTop: 14, padding: 10, fontSize: 14, fontWeight: 700, background: 'transparent', color: THEME.text, border: `1px solid ${THEME.primary}`, borderRadius: 8, cursor: 'pointer' }}>
            {t.done}
          </button>
        </SettingsModal>
      )}

      {selectedLift && (
        <SettingsModal title={`${liftLabel(selectedLift, t)} · ${t.maxes}`} onClose={closeLift}>
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 38%) minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
              <label style={{ fontWeight: 800, fontSize: 14 }}>{t.oneRM}</label>
              <input type="number" min="0" step={weightUnit === WEIGHT_UNITS.LB ? "5" : "2.5"} value={oneRMInput} onChange={e => setOneRMInput(e.target.value)} style={modalInputStyle()} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 38%) minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
              <label style={{ fontWeight: 800, fontSize: 14 }}>{t.e1RM}</label>
              <input type="number" min="0" step={weightUnit === WEIGHT_UNITS.LB ? "5" : "2.5"} value={e1RMInput} onChange={e => setE1RMInput(e.target.value)} style={modalInputStyle()} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 900, color: THEME.text, marginBottom: 10 }}>
              {t.estimateE1RM}
            </div>

            <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 38%) minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
                <label style={{ fontWeight: 800, fontSize: 13 }}>{t.submaxWeight}</label>
                <input
                  type="number"
                  min="0"
                  step={weightUnit === WEIGHT_UNITS.LB ? "5" : "2.5"}
                  value={calculatorWeight}
                  onChange={e => setCalculatorWeight(e.target.value)}
                  style={modalInputStyle()}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 38%) minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
                <label style={{ fontWeight: 800, fontSize: 13 }}>{t.submaxReps}</label>
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

            <button onClick={handleCalculateE1RM} style={{ width: '100%', padding: 10, fontSize: 14, fontWeight: 800, background: 'transparent', color: THEME.text, border: `1px solid ${THEME.primary}`, borderRadius: 8, cursor: 'pointer' }}>
              {t.calculateE1RM}
            </button>
          </div>

          <div style={modalActionRowStyle()}>
            <button onClick={closeLift} style={modalActionButtonStyle('secondary')}>
              {t.cancel}
            </button>

            <button onClick={handleSaveLift} style={modalActionButtonStyle('primary')}>
              {t.save}
            </button>
          </div>
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
            <div
              key={field.key}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(130px, 42%) minmax(0, 1fr)',
                gap: 10,
                alignItems: 'center',
                marginBottom: 10
              }}
            >
              <label style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.25 }}>
                {field.label}
              </label>

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

          <div style={modalActionRowStyle()}>
            <button onClick={() => setIsEditing(false)} style={modalActionButtonStyle('secondary')}>
              {t.cancel}
            </button>

            <button onClick={handleSave} style={modalActionButtonStyle('primary')}>
              {t.save}
            </button>
          </div>
        </SettingsModal>
      )}
    </>
  );
}

function RestTimeSection({ t }) {
  const [showAlertHelp, setShowAlertHelp] = useState(false);
  const [alertStatus, setAlertStatus] = useState(null);

  async function handleCheckAlerts() {
    const status = await checkRestTimerAlertReadiness();
    setAlertStatus(status);
    setShowAlertHelp(true);
  }

  return (
    <>
      <SettingsListRow
        label={t.restTimerAlerts || 'Rest timer alerts'}
        actionLabel={t.check || 'Check'}
        onAction={handleCheckAlerts}
      />

      {showAlertHelp && (
        <SettingsModal
          title={t.restTimerAlerts || 'Rest timer alerts'}
          onClose={() => setShowAlertHelp(false)}
        >
          <div style={{
            color: THEME.text,
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.35,
            marginBottom: 8
          }}>
            Rest times are chosen automatically by set type. For reliable screen-off alerts, allow notifications, lock screen notifications, unrestricted battery use, and exact alarms if Android asks.
          </div>

          <div style={{
            color: THEME.muted,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.3,
            marginBottom: alertStatus ? 10 : 12
          }}>
            Xiaomi/HyperOS may also require lock screen notifications and no battery restrictions.
          </div>

          {alertStatus?.native === true && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: '4px 10px',
              color: THEME.muted,
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 12
            }}>
              <span>Notifications</span>
              <strong style={{ color: alertStatus.display === 'granted' ? THEME.primary : THEME.red }}>
                {alertStatus.display}
              </strong>
              <span>Exact alarms</span>
              <strong style={{ color: alertStatus.exactAlarm === 'granted' ? THEME.primary : THEME.muted }}>
                {alertStatus.exactAlarm}
              </strong>
            </div>
          )}

          {alertStatus?.native === false && (
            <div style={{
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${THEME.border}`,
              color: THEME.muted,
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1.3,
              marginBottom: 12
            }}>
              Open the installed Android app to check device alert settings.
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8
          }}>
            <button
              onClick={handleCheckAlerts}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 8,
                border: `1px solid ${THEME.primary}`,
                background: THEME.card,
                color: THEME.text,
                cursor: 'pointer'
              }}
            >
              {t.check || 'Check'}
            </button>

            <button
              onClick={() => setShowAlertHelp(false)}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 14,
                fontWeight: 700,
                background: 'transparent',
                color: THEME.text,
                border: `1px solid ${THEME.primary}`,
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              {t.close || 'Close'}
            </button>
          </div>
        </SettingsModal>
      )}
    </>
  );
}



function selectionModalButtonStyle(active) {
  return {
    width: '100%',
    padding: 12,
    fontSize: 15,
    fontWeight: 700,
    background: active ? THEME.primary : THEME.card,
    color: '#ffffff',
    border: `1px solid ${THEME.primary}`,
    borderRadius: 8,
    cursor: 'pointer',
    marginBottom: 6
  };
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
              type="button"
              key={l}
              onClick={() => {
                setLanguage(l);
                setIsEditing(false);
              }}
              style={selectionModalButtonStyle(language === l)}
            >
              {languageNames[l]}
            </button>
          ))}
        </SettingsModal>
      )}
    </>
  );
}

function getTrainingModelShortLabel(model) {
  return isSmartTrainingModel(model) ? 'Smart' : 'Classic';
}

function ModelSection({ trainingModel, setTrainingModel, t }) {
  const [isEditing, setIsEditing] = useState(false);
  const currentModel = normalizeTrainingModel(trainingModel);

  return (
    <>
      <SettingsListRow
        label={t.trainingModelLabel || 'Model'}
        actionLabel={getTrainingModelShortLabel(currentModel)}
        onAction={() => setIsEditing(true)}
      />

      {isEditing && (
        <SettingsModal
          title={t.trainingModelLabel || 'Model'}
          onClose={() => setIsEditing(false)}
        >
          {[TRAINING_MODELS.CLASSIC, TRAINING_MODELS.SMART].map(model => (
            <button
              type="button"
              key={model}
              onClick={() => {
                setTrainingModel(normalizeTrainingModel(model));
                setIsEditing(false);
              }}
              style={selectionModalButtonStyle(currentModel === model)}
            >
              {getTrainingModelShortLabel(model)}
            </button>
          ))}
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

function getSkippedSetMessage(set, t) {
  if (set?.labelKey === 'opener') {
    return t.openerSkippedWithLoweredPlan || 'Opener missed. This attempt is skipped; the next attempts are lowered.';
  }

  if (set?.labelKey === 'secondAttempt') {
    return t.secondAttemptSkippedWithLoweredPlan || 'Second attempt missed. This attempt is skipped; the third attempt is lowered.';
  }

  if (set?.labelKey === 'thirdAttempt') {
    return t.thirdAttemptSkipped || 'Third attempt missed. This attempt is skipped. Continue with the back-off sets.';
  }

  if (isTopSetLabel(set?.labelKey)) {
    return t.topSetSkipped || 'Top set missed and skipped. Continue with the backoff work.';
  }

  return t.topSetSkipped || 'Set skipped. Continue with the next set.';
}

function BackoffGroup({ entries, activeIndex, isReadOnly, onToggle, onEditAll, onRestoreAll, onMarkFailed, renderTimer, label, t, weightUnit = WEIGHT_UNITS.KG, lift, benchPressVariant = 'standard' }) {
  const [editing, setEditing] = useState(false);
  const firstSet = entries?.[0]?.set || {};
  const firstOpenEntry = entries.find(({ set }) => !set.done && !set.skipped) || entries[0];
  const latestActionEntry = [...(entries || [])]
    .reverse()
    .find(({ set }) => set.done || set.failed || set.skipped);
  const failedEntry = latestActionEntry?.set?.failed || latestActionEntry?.set?.skipped
    ? latestActionEntry
    : null;
  const allSameReps = entries.every(({ set }) => Number(set.reps) === Number(firstSet.reps));
  const displaySet = firstOpenEntry?.set || firstSet;
  const weightDisplay = formatWorkoutWeightFromKg(displaySet.weight || firstSet.weight, weightUnit, t, lift, benchPressVariant);
  const displayPct = formatSetPercentDisplay(firstSet.pct);
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
      {entries.length} × {allSameReps ? firstSet.reps : '—'} × {weightDisplay}{firstSet.perSide ? ` ${t.perSideSuffix || '/ side'}` : ''}{displayPct ? ` (${displayPct}%)` : ''}
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
        ? getSkippedSetMessage(failedEntry.set, t)
        : getFailedSetFeedbackMessage(failedEntry.set, t) || 'Set missed and skipped. Continue with the next set.'}
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
        : t.failedSetSkippedFeedback || 'Set missed and skipped. Continue with the next set.'}
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
      videoSrc: `${process.env.PUBLIC_URL || ''}/videos/squat.mp4`,
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
      videoSrc: `${process.env.PUBLIC_URL || ''}/videos/bench.mp4`,
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
      videoSrc: `${process.env.PUBLIC_URL || ''}/videos/deadlift.mp4`,
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

function ExerciseGuideModal({ lift, t, onClose }) {
  const guide = getExerciseGuide(lift, t);
  if (!guide) return null;

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
        border: `1px solid ${THEME.primary}`,
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

        {guide.videoSrc ? (
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            marginBottom: 14,
            borderRadius: 10,
            overflow: 'hidden',
            border: `1px solid ${THEME.primary}`,
            background: '#000'
          }}>
            <video
              src={guide.videoSrc}
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                background: '#000'
              }}
            />
          </div>
        ) : (
          <div style={{
            padding: 11,
            marginBottom: 14,
            borderRadius: 8,
            border: `1px solid ${THEME.primary}`,
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
            border: `1px solid ${THEME.primary}`,
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

function getSmartDayTypeDisplayLabel(dayType, t = {}) {
  if (dayType === SMART_DAY_TYPES.DELOAD) return t.deload || 'Deload';
  if (dayType === SMART_DAY_TYPES.RECOVERY) return t.restAndRecovery || 'Recovery';
  if (dayType === SMART_DAY_TYPES.MEET) return t.sbdMeetDay || t.meetDay || 'Meet day';
  if (dayType === SMART_DAY_TYPES.TRAINING) return t.training || 'Training';
  return null;
}

function getSmartMeetdayBlockerDisplayLabels(blockers = [], t = {}) {
  const labels = {
    'active-block-too-short': t.smartBlockerActiveBlock || 'block too short',
    fatigue: t.smartBlockerFatigue || 'fatigue',
    'failed-skipped': t.smartBlockerFailedSkipped || 'failed/skipped',
    'missing-lift-exposure': t.smartBlockerMissingLiftExposure || 'lift exposure',
    'meet-plan-not-ready': t.smartBlockerMeetPlanNotReady || 'meet plan',
    'last-workout-hard': t.smartBlockerLastWorkoutHard || 'last workout hard',
    'after-recovery-intervention': t.smartBlockerAfterRecovery || 'after recovery',
  };

  return (blockers || [])
    .map(blocker => labels[blocker] || blocker)
    .filter(Boolean);
}

function canMentionSmartMeetPlanReady(readiness = {}) {
  const activeBlockCount = Number(readiness.activeBlockCompletedCount) || 0;
  const blockers = Array.isArray(readiness.meetdayBlockers) ? readiness.meetdayBlockers : [];
  return Boolean(readiness.meetPlanReady)
    && activeBlockCount >= SMART_THRESHOLDS.MEETDAY_MIN_ACTIVE_BLOCK_DAYS
    && !blockers.includes('active-block-too-short');
}

function hasSmartFatigueEvidence(readiness = {}) {
  const explicitEvidenceCount = [
    readiness.recentFeedbackCount,
    readiness.recentWorkoutFeedbackCount,
    readiness.recentWorkoutEffortCount,
    readiness.recentRatedWorkoutCount,
    readiness.fatigueEvidenceCount,
  ]
    .map(Number)
    .find(value => Number.isFinite(value));

  if (explicitEvidenceCount !== undefined) return explicitEvidenceCount > 0;
  if (readiness.hasRecentFatigueData === true) return true;
  if (readiness.hasRecentWorkoutFeedback === true) return true;
  if (readiness.lastWorkoutEffort) return true;

  return Number(readiness.recentFailedOrSkippedSetCount) > 0 || Number(readiness.recentFatigueScore) > 0;
}

function getSmartFatigueFailedDisplayText(readiness = {}) {
  const failedCount = Number(readiness.recentFailedOrSkippedSetCount) || 0;
  const failedText = `failed/skipped ${failedCount}/${SMART_THRESHOLDS.FAILED_SET_DELOAD_COUNT}`;
  if (!hasSmartFatigueEvidence(readiness)) return failedText;
  const fatigueScore = Number(readiness.recentFatigueScore) || 0;
  return `fatigue ${fatigueScore}/${SMART_THRESHOLDS.FATIGUE_RECOVERY_SCORE}, ${failedText}`;
}

function getKelaniTrainingStructureIssues(workout = {}) {
  if (!workout || workout.type !== 'training') return [];
  const liftBlocks = (workout.lifts || []).length > 0
    ? workout.lifts
    : [{ lift: workout.lift, sets: workout.sets || [] }];

  return liftBlocks.flatMap(liftBlock => {
    const sets = liftBlock.sets || [];
    const hasTopSingle = sets.some(set => isTopSetLabel(set.labelKey) && Number(set.reps) === 1);
    const hasBackoffOrWorkSets = sets.some(set => ['backoff', 'workSets'].includes(set.labelKey) || set.groupKey);
    if (hasTopSingle && !hasBackoffOrWorkSets) {
      return [`${liftBlock.lift || 'lift'} top-single-only`];
    }
    return [];
  });
}

function getKelaniWarmupJumpIssues(workout = {}) {
  const liftBlocks = (workout.lifts || []).length > 0
    ? workout.lifts
    : [{ lift: workout.lift, warmups: workout.warmups || [], sets: workout.sets || [] }];

  return liftBlocks.flatMap(liftBlock => {
    if (!['Squat', 'Deadlift'].includes(liftBlock.lift)) return [];
    const warmups = liftBlock.warmups || [];
    const firstWorkWeight = (liftBlock.sets || [])
      .map(set => Number(set.weight) || 0)
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    const weights = [
      ...warmups.map(warmup => Number(warmup.weight) || 0),
      firstWorkWeight || 0,
    ].filter(Boolean);

    return weights
      .slice(1)
      .map((weight, index) => ({ from: weights[index], to: weight, jump: weight - weights[index] }))
      .filter(step => step.jump > 50)
      .map(step => `${liftBlock.lift} ${step.from}->${step.to}kg`);
  });
}

function getSmartDecisionReasonDisplayText(summary, t = {}) {
  if (!summary?.reason) return null;

  const readiness = summary.readiness || {};
  const fatigueScore = Number(readiness.recentFatigueScore) || 0;
  const activeBlockCount = Number(readiness.activeBlockCompletedCount) || 0;
  const meetReadyDays = Math.min(
    activeBlockCount,
    SMART_THRESHOLDS.MEETDAY_MIN_ACTIVE_BLOCK_DAYS
  );

  if (summary.reason === SMART_DECISION_REASONS.FAILED_SET_DELOAD) {
    const failedByLift = readiness.recentFailedOrSkippedSetCountsByLift || {};
    const failedLiftText = LIFT_ORDER
      .filter(lift => Number(failedByLift[lift]) > 0)
      .map(lift => `${lift} ${Number(failedByLift[lift])}`)
      .join(', ');

    if (failedLiftText) {
      return t.smartReasonFailedSetDeload || `${failedLiftText} failed/skipped → lighter deload day.`;
    }

    return t.smartReasonFailedSetDeload || `${getSmartFatigueFailedDisplayText(readiness)} → lighter deload day.`;
  }

  if (summary.reason === SMART_DECISION_REASONS.FATIGUE_RECOVERY) {
    const meetPlanText = canMentionSmartMeetPlanReady(readiness)
      ? 'Meet plan ready, but '
      : '';

    return t.smartReasonFatigueRecovery || `${meetPlanText}${getSmartFatigueFailedDisplayText(readiness)} → recovery day.`;
  }

  if (summary.reason === SMART_DECISION_REASONS.TRAINING_STREAK_RECOVERY) {
    return t.smartReasonTrainingStreakRecovery || `Training block ${activeBlockCount}/${SMART_THRESHOLDS.TRAINING_STREAK_RECOVERY_DAYS}${hasSmartFatigueEvidence(readiness) ? `, fatigue ${fatigueScore}/${SMART_THRESHOLDS.FATIGUE_RECOVERY_SCORE}` : ''} → recovery day.`;
  }

  if (summary.reason === SMART_DECISION_REASONS.TRAINING_FALLBACK) {
    if (activeBlockCount === 0 && Number(readiness.completedCount) === 0) {
      return t.smartReasonTrainingFallback || `New cycle. Build readiness toward meet plan → training day.`;
    }

    if (readiness.lastWasRecoveryIntervention || readiness.postMeetRecoveryTargetReached) {
      if (canMentionSmartMeetPlanReady(readiness)) {
        return t.smartReasonTrainingFallback || `Meet plan ready, but fresh after recovery → training day.`;
      }

      return t.smartReasonTrainingFallback || `Fresh after recovery. ${getSmartFatigueFailedDisplayText(readiness)} → training day.`;
    }

    const blockers = getSmartMeetdayBlockerDisplayLabels(readiness.meetdayBlockers || [], t)
      .slice(0, 3);

    if (blockers.length > 0) {
      if (canMentionSmartMeetPlanReady(readiness)) {
        return t.smartReasonTrainingFallback || `Meet plan ready, but ${blockers.slice(0, 3).join(', ')} → training day.`;
      }

      const weakestLift = readiness.meetPlanWeakestLift;
      const weakestBest = Number(readiness.meetPlanWeakestBestE1RM) || 0;
      const weakestTarget = Number(readiness.meetPlanWeakestTarget) || 0;
      const weakestText = weakestLift && weakestBest > 0 && weakestTarget > 0
        ? `${weakestLift} ${formatWeightValue(weakestBest, WEIGHT_UNITS.KG)}/${formatWeightValue(weakestTarget, WEIGHT_UNITS.KG)}`
        : null;

      return t.smartReasonTrainingFallback || `Meet not ready: ${[
        weakestText,
        ...blockers,
      ].filter(Boolean).slice(0, 3).join(', ')} → training day.`;
    }

    return t.smartReasonTrainingFallback || `Meet readiness ${meetReadyDays}/${SMART_THRESHOLDS.MEETDAY_MIN_ACTIVE_BLOCK_DAYS}; ${getSmartFatigueFailedDisplayText(readiness)} → training day.`;
  }

  if (summary.reason === SMART_DECISION_REASONS.MEETDAY_READY) {
    if (canMentionSmartMeetPlanReady(readiness) && readiness.lastWasRecoveryIntervention) {
      return t.smartReasonMeetdayReady || `Meet plan ready, fresh after recovery → meet day.`;
    }

    if (canMentionSmartMeetPlanReady(readiness)) {
      return t.smartReasonMeetdayReady || `Meet plan ready, ${getSmartFatigueFailedDisplayText(readiness)} → meet day.`;
    }

    return t.smartReasonMeetdayReady || `Meet readiness ${SMART_THRESHOLDS.MEETDAY_MIN_ACTIVE_BLOCK_DAYS}/${SMART_THRESHOLDS.MEETDAY_MIN_ACTIVE_BLOCK_DAYS}, ${getSmartFatigueFailedDisplayText(readiness)} → meet day.`;
  }

  if (summary.reason === SMART_DECISION_REASONS.POST_MEET_RECOVERY) {
    const target = Number(readiness.postMeetRecoveryTarget) || 0;
    const completed = Number(readiness.postMeetRecoveryDaysCompleted) || 0;
    return t.smartReasonPostMeetRecovery || `Post-meet recovery ${Math.min(completed + 1, target)}/${target} → rest day.`;
  }

  return null;
}

function getSmartTrainingSelectionDisplayText(workout, t = {}) {
  const readiness = workout?.smartDecisionSummary?.readiness || {};
  const summary = workout?.smartTrainingSelectionSummary || {};
  const weakestLift = readiness.meetPlanWeakestLift;
  const isNewCycleStart =
    Number(readiness.completedCount) === 0 &&
    Number(readiness.activeBlockCompletedCount) === 0;

  if ((summary.avoidedFailedLifts || []).length > 0) {
    return t.smartTrainingSelectionLine || `Avoiding ${summary.avoidedFailedLifts.join(' + ')} after failed/skipped set.`;
  }

  if ((summary.selectedFailedLifts || []).length > 0) {
    return t.smartTrainingSelectionLine || `${summary.selectedFailedLifts.join(' + ')} capped after failed/skipped set.`;
  }

  if (isNewCycleStart || !weakestLift || canMentionSmartMeetPlanReady(readiness)) return null;

  const best = Number(readiness.meetPlanWeakestBestE1RM) || 0;
  const target = Number(readiness.meetPlanWeakestTarget) || 0;

  if (best > 0 && target > 0) {
    return t.smartTrainingSelectionLine || `Meet limiter: ${weakestLift} ${formatWeightValue(best, WEIGHT_UNITS.KG)}/${formatWeightValue(target, WEIGHT_UNITS.KG)}.`;
  }

  return t.smartTrainingSelectionLine || `Meet limiter: ${weakestLift}.`;
}

function getSmartAutoregulationDisplayText(workout, t = {}) {
  if (!workout?.smartAutoregulatedTraining) return null;

  const byLift = workout.smartTrainingAutoregulationByLift || {};
  const adjustedEntries = Object.entries(byLift)
    .filter(([, adjustment]) => adjustment?.hasAdjustment);

  if (adjustedEntries.length > 0) {
    const liftParts = adjustedEntries.map(([lift, adjustment]) => {
      const parts = [];

      if (Number(adjustment.loadFactor) !== 1) {
        parts.push(`load ${Math.round(Number(adjustment.loadFactor) * 100)}%`);
      }

      if (Number(adjustment.maxMainSets) > 0) {
        parts.push(`max ${adjustment.maxMainSets} sets`);
      }

      return `${lift} ${parts.join(', ')}`;
    });

    return t.smartAutoregulationLine || `Autoregulation: ${liftParts.join('; ')}.`;
  }

  const adjustedLifts = workout.smartTrainingAdjustedLifts || [];
  const loadFactor = Number(workout.smartTrainingLoadFactor) || 1;
  const volumeCap = Number(workout.smartTrainingVolumeCap) || 0;
  const parts = [];

  if (loadFactor !== 1) {
    parts.push(`load ${Math.round(loadFactor * 100)}%`);
  }

  if (volumeCap > 0) {
    parts.push(`max ${volumeCap} main sets`);
  }

  if (!parts.length) return null;

  const liftText = adjustedLifts.length
    ? ` (${adjustedLifts.join(' + ')})`
    : '';

  return t.smartAutoregulationLine || `Autoregulation: ${parts.join(', ')}${liftText}.`;
}

function SmartDayTypeInline({ workout, t }) {
  const label = getSmartDayTypeDisplayLabel(workout?.smartDayType, t);
  const reasonText = getSmartDecisionReasonDisplayText(workout?.smartDecisionSummary, t);
  const trainingSelectionText = getSmartTrainingSelectionDisplayText(workout, t);
  const autoregulationText = getSmartAutoregulationDisplayText(workout, t);

  if (!label) return null;

  return (
    <div style={{
      margin: '0 0 10px',
      padding: 0,
      background: 'transparent',
      border: 'none',
      color: THEME.muted,
      fontSize: 12,
      fontWeight: 800,
      textAlign: 'center'
    }}>
      <div>
        Smart: <span style={{ color: THEME.primary }}>{label}</span>
      </div>
      {reasonText && (
        <div style={{
          marginTop: 2,
          color: THEME.muted,
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'center'
        }}>
          {reasonText}
        </div>
      )}
      {trainingSelectionText && (
        <div style={{
          marginTop: 2,
          color: THEME.muted,
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'center'
        }}>
          {trainingSelectionText}
        </div>
      )}
      {autoregulationText && (
        <div style={{
          marginTop: 2,
          color: THEME.muted,
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'center'
        }}>
          {autoregulationText}
        </div>
      )}
    </div>
  );
}

function CurrentWorkout({
  trainingModel = TRAINING_MODELS.CLASSIC, workout, currentCycle, totalWorkouts, onTogglePrepItem, onToggleWarmup, onToggleSet, onMarkSetFailed, onRestoreSetWeight, onToggleAccessorySet, onMarkAccessorySetFailed, onRestoreAccessoryWeight, onToggleCooldownItem, onToggleMeetPrepItem, onToggleMeetWarmup, onToggleMeetSet, onMarkMeetSetFailed, onRestoreMeetSetWeight, onMeetWeightChange, onMeetSetEffortChange, onWeightChange, onSetEffortChange, onAccessoryWeightChange, onComplete, onViewAll, onActivateWorkout, showNewCycle, newCyclePRs, onStartNewCycle, isReadOnly, t, weightUnit = WEIGHT_UNITS.KG, benchPressVariant = 'standard', timer, setTimer, startTimer }) {
  const smartModel = isSmartTrainingModel(trainingModel);
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
        padding: '8px 0',
        border: 'none',
        borderRadius: 0,
        background: 'transparent',
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
                  border: `1px solid ${THEME.primary}`,
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
      <div style={{
        maxWidth: 500,
        margin: '0 auto',
        padding: '10px 14px 16px',
        fontFamily: 'sans-serif'
      }}>
        <AppHeader
          t={t}
          title={t.restAndRecovery || t.deload}
          subtitle={formatCycleWorkoutSubtitle({
            t,
            currentCycle,
            workoutNumber: Math.min(Number(workout.number) || 1, totalWorkouts),
            totalWorkouts,
            smartModel,
          })}
        />

        {renderActivateWorkoutCard()}
        <SmartDayTypeInline workout={workout} t={t} />

        <div style={{
          padding: '8px 0 10px',
          marginBottom: 10,
          background: 'transparent',
          border: 'none',
          color: THEME.text,
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: 42,
            lineHeight: 1,
            marginBottom: 14
          }}>
            ✓
          </div>

          <h2 style={{
            margin: '0 0 8px',
            color: THEME.text,
            fontSize: 22,
            fontWeight: 900
          }}>
            {t.restAndRecovery || t.deload}
            {!isReadOnly && (
              <span style={{
                fontSize: 11,
                background: THEME.primary,
                color: '#ffffff',
                padding: '1px 6px',
                borderRadius: 3,
                marginLeft: 8,
                verticalAlign: 'middle'
              }}>
                {t.now}
              </span>
            )}
          </h2>

          <p style={{
            margin: '0 auto',
            maxWidth: 360,
            color: THEME.muted,
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.4
          }}>
            {t.restReadyNextWorkout || 'Rest and recover. No lifting today; complete this rest day when you are ready to continue.'}
          </p>
        </div>

        {!isReadOnly && (
          <button
            type="button"
            onClick={() => onComplete('easy')}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              background: THEME.card,
              color: '#ffffff',
              border: `1px solid ${THEME.primary}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            {t.completeRestDay || 'Complete rest day'}
          </button>
        )}
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
          subtitle={formatCycleWorkoutSubtitle({
            t,
            currentCycle,
            workoutNumber: workout.number,
            totalWorkouts,
            smartModel,
            suffix: isMeetDay ? ` · ${t.meetDay}` : '',
          })}
          titleStyle={{
            fontSize: 30,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: isMeetDay ? THEME.meet : THEME.text
          }}
        />

        {renderActivateWorkoutCard()}
        <SmartDayTypeInline workout={workout} t={t} />

{isMeetDay && (
<div style={{
  marginBottom: 10,
  padding: 10,
  border: `1px solid ${THEME.meet}`,
  borderRadius: 10,
  background: `${THEME.meet}14`,
  textAlign: 'center'
}}>
  <div style={{ color: THEME.meet, fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
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
                  {false && showMeetSetNotice && (
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
                          ? getSkippedSetMessage(set, t)
                          : getFailedSetFeedbackMessage(set, t) || 'Set missed and skipped. Continue with the next set.'}
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
                  {false && set.done && !set.failed && !set.skipped && set.effort && isAttemptSetLabel(set.labelKey) && (
                    <AttemptEffortFeedback set={set} t={t} />
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
              color: THEME.meet,
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
      <h2 style={{
        margin: '12px 0 8px',
        textAlign: 'center',
        fontSize: 30,
        fontWeight: 900,
        lineHeight: 1.15,
        color: ({
          Squat: THEME.red,
          Bench: THEME.primary,
          Deadlift: THEME.yellow,
        }[workout.lift] || THEME.meet)
      }}>
        {t.workout} {workout.number} — {workoutLiftLabel(workout.lift, t, effectiveBenchPressVariant)}
      </h2>

      <div style={{ textAlign: 'center', color: THEME.muted, fontSize: 13, marginBottom: 12 }}>
        {formatCycleWorkoutSubtitle({ t, currentCycle, workoutNumber: workout.number, totalWorkouts, smartModel })}
      </div>

      {renderActivateWorkoutCard()}
        <SmartDayTypeInline workout={workout} t={t} />

      {(workout.prepItems || []).length > 0 && (
        <div style={{ background: 'transparent', border: 'none', borderRadius: 8, overflow: 'hidden', marginBottom: (workout.warmups || []).length > 0 ? 0 : 10 }}>
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
          const showSetNotice = (set.failed || set.skipped) && !hasLaterSetAction;

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
              {false && showSetNotice && (
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
                      ? getSkippedSetMessage(set, t)
                      : getFailedSetFeedbackMessage(set, t) || 'Set missed and skipped. Continue with the next set.'}
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
              {false && set.done && !set.failed && !set.skipped && set.effort && isAttemptSetLabel(set.labelKey) && (
                <AttemptEffortFeedback set={set} t={t} />
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
            color: THEME.meet,
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

      {showNewCycle && !smartModel && (
        <NewCycleModal
          prs={newCyclePRs}
          onStart={onStartNewCycle}
          t={t}
          weightUnit={weightUnit}
        />
      )}
    </div>
  );
}

function StatsScreen({ history, bodyWeights, currentCycle, currentIndex, totalWorkouts, trainingModel = TRAINING_MODELS.CLASSIC, meetPlannerAttempts, setMeetPlannerAttempts, onBack, t, weightUnit = WEIGHT_UNITS.KG, best1RMs = {}, bestE1RMs = {} }) {
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

const runningBestPerLift = {
  Squat: { oneRM: 0, e1rm: 0 },
  Bench: { oneRM: 0, e1rm: 0 },
  Deadlift: { oneRM: 0, e1rm: 0 },
};

sortedHistory.forEach(entry => {
  if (!entry.lift || !LIFT_ORDER.includes(entry.lift) || entry.completionOnly) return;

  const candidates = getHistoryMaxCandidates(entry);

  if (candidates.oneRM <= 0 && candidates.e1rm <= 0) return;

  runningBestPerLift[entry.lift] = entry.manualMax
    ? {
        oneRM: candidates.oneRM,
        e1rm: candidates.e1rm,
      }
    : {
        oneRM: Math.max(runningBestPerLift[entry.lift].oneRM, candidates.oneRM),
        e1rm: Math.max(runningBestPerLift[entry.lift].e1rm, candidates.e1rm),
      };

  bestStats[entry.lift] = { ...runningBestPerLift[entry.lift] };

  if (!liftData[entry.lift]) liftData[entry.lift] = [];

  if (getEntryWorkoutNumber(entry) > 0 || entry.seedMax || entry.manualMax) {
    liftData[entry.lift].push({
      label: getWorkoutLabel(entry),
      absoluteWorkoutIndex: getAbsoluteWorkoutIndex(entry),
      oneRM: chartWeightFromKg(runningBestPerLift[entry.lift].oneRM),
      e1rm: chartWeightFromKg(runningBestPerLift[entry.lift].e1rm),
    });
  }

  if ((getEntryWorkoutNumber(entry) > 0 || entry.seedMax || entry.manualMax) && runningBestPerLift.Squat.oneRM && runningBestPerLift.Bench.oneRM && runningBestPerLift.Deadlift.oneRM) {
    totalData.push({
      label: getWorkoutLabel(entry),
      workoutNumber: getEntryWorkoutNumber(entry),
      absoluteWorkoutIndex: getAbsoluteWorkoutIndex(entry),
      date: entry.date,
      oneRM:
        runningBestPerLift.Squat.oneRM +
        runningBestPerLift.Bench.oneRM +
        runningBestPerLift.Deadlift.oneRM,
      e1rm:
        runningBestPerLift.Squat.e1rm +
        runningBestPerLift.Bench.e1rm +
        runningBestPerLift.Deadlift.e1rm,
    });
  }
});

LIFT_ORDER.forEach(lift => {
  const currentOneRM = Number(best1RMs?.[lift]) || bestStats[lift].oneRM || 0;
  const currentE1RM = Number(bestE1RMs?.[lift]) || bestStats[lift].e1rm || 0;

  bestStats[lift] = {
    oneRM: currentOneRM,
    e1rm: currentE1RM,
  };
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
        subtitle={formatCycleWorkoutSubtitle({
          t,
          currentCycle,
          workoutNumber: Math.min(currentIndex + 1, totalWorkouts),
          totalWorkouts,
          smartModel: isSmartTrainingModel(trainingModel),
        })}
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
              border: `1px solid ${activescreen === tab.key ? THEME.primary : THEME.border}`,
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
            background: `${THEME.meet}14`,
            border: `1px solid ${THEME.meet}`,
            borderRadius: 10,
            padding: 10,
            marginBottom: 8
          }}>
            <h3 style={{ margin: '0 0 6px', color: THEME.meet }}>{t.totalSBD}</h3>
            {renderChart(totalData.map(entry => ({ ...entry, oneRM: chartWeightFromKg(entry.oneRM), e1rm: chartWeightFromKg(entry.e1rm) })), ['oneRM', 'e1rm'], [THEME.muted, THEME.meet])}
          </div>

          <div style={{
            background: `${THEME.meet}14`,
            border: `1px solid ${THEME.meet}`,
            borderRadius: 10,
            padding: 8
          }}>
            <h3 style={{ margin: '0 0 4px', color: THEME.meet }}>{t.strengthTotalBodyweight}</h3>
            {renderChart(strengthData, ['strength', 'eStrength'], [THEME.muted, THEME.meet], t.noMetricData || t.noStatsData)}
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
      border: `1px solid ${THEME.meet}`,
      borderRadius: 10,
      background: `${THEME.meet}14`
    }}>
      <div>
        <h3 style={{ margin: '0 0 6px', color: THEME.meet }}>
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
        border: `1px solid ${THEME.meet}`,
        borderRadius: 10,
        background: `${THEME.meet}1f`,
        textAlign: 'center'
      }}>
        <div style={{ color: THEME.meet, fontSize: 11, fontWeight: 800, marginBottom: 4 }}>
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
      border: `1px solid ${THEME.meet}`,
      borderRadius: 10,
      background: `${THEME.meet}14`,
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
          <span style={{ color: THEME.meet, fontWeight: 800 }}>{label}</span>
          <strong style={{ color: THEME.text }}>{value ? formatWeightFromKg(value, statsWeightUnit) : '—'}</strong>
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
            border: `1px solid ${THEME.primary}`,
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
        border: `1px solid ${THEME.primary}`,
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
            border: `1px solid ${THEME.primary}`,
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

function ProgramProfileSection({
  programProfile,
  preparationMode = 'off',
  accessoryMode = 'off',
  cooldownMode = 'off',
  benchPressVariant = 'standard',
  deadliftVariant = 'standard',
  onChangeProgramProfile,
  onApplyProgramSettings,
  t,
}) {
  const [showProgramOptions, setShowProgramOptions] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(null);

  const normalizedProfile = normalizeProgramProfile(programProfile);
  const currentFocus =
    normalizedProfile === 'kelaniSbdUltra'
      ? 'ultra'
      : normalizedProfile === 'kelaniSbdLower' ||
        normalizedProfile === 'kelaniSbdLowerPlus' ||
        normalizeBenchPressVariant(benchPressVariant) === 'machineAlternative' ||
        normalizeDeadliftVariant(deadliftVariant) === 'hipThrust'
          ? 'lower'
          : 'sbd';

  function openWizard() {
    setDraft({
      focus: currentFocus,
      preparationMode: normalizePreparationMode(preparationMode),
      accessoryMode: normalizeAccessoryMode(accessoryMode),
      cooldownMode: normalizeCooldownMode(cooldownMode),
    });
    setStep(0);
    setShowProgramOptions(true);
  }

  function closeWizard() {
    setShowProgramOptions(false);
    setDraft(null);
    setStep(0);
  }

  function updateDraft(key, value) {
    setDraft(prev => ({ ...(prev || {}), [key]: value }));
  }

  function selectAndContinue(key, value) {
    updateDraft(key, value);

    if (step < 3) {
      setStep(prev => prev + 1);
      return;
    }

    const nextDraft = { ...(draft || {}), [key]: value };
    const focus = nextDraft.focus || 'sbd';

    const settings = {
      programProfile: focus === 'ultra' ? 'kelaniSbdUltra' : focus === 'lower' ? 'kelaniSbdLower' : 'kelaniSbd',
      preparationMode: normalizePreparationMode(nextDraft.preparationMode),
      accessoryMode: normalizeAccessoryMode(nextDraft.accessoryMode),
      cooldownMode: normalizeCooldownMode(nextDraft.cooldownMode),
      squatVariant: 'standard',
      benchPressVariant: focus === 'lower' ? 'machineAlternative' : 'standard',
      deadliftVariant: focus === 'lower' ? 'hipThrust' : 'standard',
    };

    if (onApplyProgramSettings) {
      onApplyProgramSettings(settings);
    } else if (onChangeProgramProfile) {
      onChangeProgramProfile(settings.programProfile);
    }

    closeWizard();
  }

  function optionButton({ value, title, text, selected, onClick }) {
    const active = selected === value;

    return (
      <button
        key={value}
        type="button"
        onClick={onClick}
        autoFocus={active}
        style={{
          width: '100%',
          padding: 12,
          fontSize: 15,
          fontWeight: 800,
          textAlign: 'left',
          borderRadius: 8,
          border: `1px solid ${THEME.primary}`,
          background: active ? THEME.primary : THEME.card,
          color: active ? THEME.bg : THEME.text,
          cursor: 'pointer'
        }}
      >
        <div style={{ fontWeight: 900 }}>{title}</div>
        {text && (
          <div style={{
            marginTop: 4,
            color: active ? THEME.bg : THEME.muted,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.35
          }}>
            {text}
          </div>
        )}
      </button>
    );
  }

  const friendlyAccessoryMode = draft?.focus === 'lower' ? 'lowerBodyFriendly' : 'upperBackFriendly';

  const steps = [
    {
      title: t.programStepFocusTitle || 'Choose program',
      key: 'focus',
      selected: draft?.focus,
      options: [
        {
          value: 'sbd',
          title: t.programFocusSbd || 'Kelani SBD',
          text: t.programFocusSbdText || 'Squat, Bench Press and Deadlift.',
        },
        {
          value: 'lower',
          title: t.programFocusLower || 'Kelani Adapt',
          text: t.programFocusLowerText || 'Squat, Chest Press and Hip Thrust. No upper-body main lifts.',
        },
        {
          value: 'ultra',
          title: t.programFocusSbdUltra || t.programProfileKelaniSbdUltra || 'Kelani SBD Ultra',
          text: t.programFocusSbdUltraText || t.programProfileKelaniSbdUltraText || 'High-frequency SBD meet prep with more Squat, Bench Press and Deadlift exposure.',
        },
      ],
    },
    {
      title: t.programStepPreparationTitle || 'Choose preparation',
      key: 'preparationMode',
      selected: draft?.preparationMode,
      options: [
        {
          value: 'off',
          title: t.programOptionOff || 'Off',
          text: t.programPreparationOffText || 'No preparation block.',
        },
        {
          value: 'basicFirst',
          title: t.programPreparationGeneral || 'General',
          text: t.programPreparationGeneralText || 'General preparation for the first main lift.',
        },
        {
          value: 'shoulderThoracic',
          title: t.programPreparationUpperBackFriendly || 'Upper-body friendly',
          text: t.programPreparationUpperBackFriendlyText || 'Upper-body friendly shoulder, scapula and thoracic preparation.',
        },
      ],
    },
    {
      title: t.programStepAccessoriesTitle || 'Choose accessories',
      key: 'accessoryMode',
      selected: draft?.accessoryMode,
      options: [
        {
          value: 'off',
          title: t.programOptionOff || 'Off',
          text: t.programAccessoriesOffText || 'No accessories after the main work.',
        },
        {
          value: 'standard',
          title: t.programAccessoriesGeneral || 'General',
          text: t.programAccessoriesGeneralText || 'General accessories based on the main lift.',
        },
        {
          value: friendlyAccessoryMode,
          title: t.programAccessoriesUpperBackFriendly || 'Upper-body friendly',
          text: t.programAccessoriesUpperBackFriendlyText || 'Accessories selected to reduce upper-body stress.',
        },
      ],
    },
    {
      title: t.programStepCooldownTitle || 'Choose cool-down',
      key: 'cooldownMode',
      selected: draft?.cooldownMode,
      options: [
        {
          value: 'off',
          title: t.programOptionOff || 'Off',
          text: t.programCooldownOffText || 'No cool-down block.',
        },
        {
          value: 'upperBackFriendly',
          title: t.programCooldownUpperBackFriendly || 'Upper-body friendly',
          text: t.programCooldownUpperBackFriendlyText || 'Rhomboid stretch and upper-back massage.',
        },
      ],
    },
  ];

  const currentStep = steps[step] || steps[0];

  return (
    <>
      <button
        type="button"
        onClick={openWizard}
        style={programActionButtonStyle(THEME.primary, '6px 0 0')}
      >
        {t.adjustProgram || 'Adjust program'}
      </button>

      {showProgramOptions && draft && (
        <SettingsModal
          title={currentStep.title}
          onClose={closeWizard}
        >
          <div style={{
            marginBottom: 10,
            color: THEME.muted,
            fontSize: 12,
            fontWeight: 800,
            textAlign: 'center'
          }}>
            {step + 1} / {steps.length}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {currentStep.options.map(option => optionButton({
              ...option,
              selected: currentStep.selected,
              onClick: () => selectAndContinue(currentStep.key, option.value),
            }))}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: step > 0 ? '1fr 1fr' : '1fr',
            gap: 8,
            marginTop: 14
          }}>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(prev => Math.max(0, prev - 1))}
                style={programActionButtonStyle(THEME.primary)}
              >
                {t.back || 'Back'}
              </button>
            )}

            <button
              type="button"
              onClick={closeWizard}
              style={programActionButtonStyle(THEME.primary)}
            >
              {t.cancel || 'Cancel'}
            </button>
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
                border: `1px solid ${THEME.primary}`,
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
    SBD: THEME.meet,
    Meet: THEME.meet,
  }[lift] || THEME.text);
}

function WorkoutTitle({ workout, t, benchPressVariant = 'standard' }) {
  const effectiveBenchPressVariant = workout?.type === 'meet' ? 'standard' : benchPressVariant;

  if (!workout) return t.deload;
  if (workout.type === 'rest') return t.restAndRecovery || t.deload;
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
        color: THEME.meet,
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

function AllWorkouts({ workouts, currentIndex, completedWorkoutCount, completedWorkoutNumbers = [], currentCycle, onSelect, onBack, onStats, onStartNewCycle, programProfile, trainingModel = TRAINING_MODELS.CLASSIC, preparationMode = 'off', accessoryMode = 'off', cooldownMode = 'off', squatVariant = 'standard', benchPressVariant = 'standard', deadliftVariant = 'standard', onChangeProgramProfile, onApplyProgramSettings, t, weightUnit = WEIGHT_UNITS.KG }) {
  const currentWorkoutRef = useRef(null);
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);
  const [showProgramInfo, setShowProgramInfo] = useState(false);
  const smartModel = isSmartTrainingModel(trainingModel);
  const completedWorkoutNumberSet = new Set(completedWorkoutNumbers.map(Number));
  const programSummary = summarizeProgramWorkouts(workouts);

  const hasSmartVisibilityMetadata = smartModel && workouts.some(workout =>
    Object.prototype.hasOwnProperty.call(workout || {}, 'smartVisible')
  );

  const smartAllowedCurrentIndex = Math.max(Number(currentIndex) || 0, 0);
  const allowedWorkoutEntries = smartModel
    ? workouts
      .map((workout, idx) => ({ workout, idx }))
      .filter(({ workout, idx }) => {
        if (idx > smartAllowedCurrentIndex) return false;
        if (!hasSmartVisibilityMetadata) return true;

        return workout.smartVisible !== false;
      })
    : workouts.map((workout, idx) => ({ workout, idx }));
  const visibleCurrentIndex = Math.min(
    Math.max(currentIndex, 0),
    Math.max(allowedWorkoutEntries.length - 1, 0)
  );
  const visibleStart = Math.max(0, visibleCurrentIndex - 3);
  const visibleEnd = Math.min(allowedWorkoutEntries.length, visibleCurrentIndex + 4);
  const visibleWorkoutEntries = showAllWorkouts
    ? allowedWorkoutEntries
    : allowedWorkoutEntries.slice(visibleStart, visibleEnd);
  const hasHiddenWorkouts = allowedWorkoutEntries.length > (visibleEnd - visibleStart);
  const headerWorkoutNumber = Math.max(Number(currentIndex) + 1 || 1, 1);
  const headerSubtitle = formatCycleWorkoutSubtitle({
    t,
    currentCycle,
    workoutNumber: headerWorkoutNumber,
    totalWorkouts: workouts.length,
    smartModel,
  });

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
  }, [currentIndex, workouts.length, showAllWorkouts]);

  function renderWorkoutListToggleButton(position = 'top') {
    if (!hasHiddenWorkouts) return null;
    return (
      <button
        type="button"
        onClick={() => setShowAllWorkouts(value => !value)}
        style={programActionButtonStyle(THEME.primary, position === 'top' ? '0 0 8px' : '6px 0 0')}
      >
        {showAllWorkouts ? t.showFewerWorkouts : t.showAllWorkouts}
      </button>
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '10px 14px 16px', fontFamily: 'sans-serif' }}>
      <AppHeader
        t={t}
        title={
          smartModel
            ? (t.trainingModelSmart || 'Kelani SBD Smart')
            : (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                flexWrap: 'wrap'
              }}>
                <span>{getProgramProfileTitle(programProfile, t)}</span>
                <button
                  type="button"
                  aria-label={t.programTrainingFactors || 'Training factors'}
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowProgramInfo(true);
                  }}
                  style={{
                    width: 14,
                    height: 14,
                    minWidth: 14,
                    padding: 0,
                    borderRadius: 999,
                    border: `1px solid ${THEME.primary}`,
                    background: 'transparent',
                    color: THEME.primary,
                    fontSize: 9,
                    fontWeight: 900,
                    lineHeight: '12px',
                    cursor: 'pointer',
                    transform: 'translateY(-6px)'
                  }}
                >
                  i
                </button>
              </span>
            )
        }
        subtitle={headerSubtitle}
      />

      {!smartModel && showProgramInfo && (
        <SettingsModal
          title={getProgramProfileTitle(programProfile, t)}
          onClose={() => setShowProgramInfo(false)}
        >
          <div style={{
            color: THEME.muted,
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1.45,
            marginBottom: 12,
            textAlign: 'center'
          }}>
            {getProgramProfileDescription(programProfile, t)}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.15fr repeat(3, 1fr)',
            border: `1px solid ${THEME.primary}`,
            borderRadius: 10,
            overflow: 'hidden',
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.25,
            background: THEME.card
          }}>
            <div style={{ padding: 8, color: THEME.primary, borderBottom: `1px solid ${THEME.border}` }}>
              {t.programTrainingFactors || 'Training factors'}
            </div>
            {LIFT_ORDER.map(lift => (
              <div
                key={`program-info-head-${lift}`}
                style={{
                  padding: 8,
                  color: getLiftThemeColor(lift),
                  textAlign: 'center',
                  borderBottom: `1px solid ${THEME.border}`,
                  borderLeft: `1px solid ${THEME.border}`
                }}
              >
                {lift}
              </div>
            ))}

            <div style={{ padding: 8, color: THEME.muted }}>
              {t.programFrequency || 'Frequency'}
            </div>
            {LIFT_ORDER.map(lift => (
              <div key={`program-info-frequency-${lift}`} style={{ padding: 8, textAlign: 'center', borderLeft: `1px solid ${THEME.border}` }}>
                {programSummary.byLift[lift].exposures}×
              </div>
            ))}

            <div style={{ padding: 8, color: THEME.muted, borderTop: `1px solid ${THEME.border}` }}>
              {t.programVolume || 'Volume'}
            </div>
            {LIFT_ORDER.map(lift => (
              <div key={`program-info-volume-${lift}`} style={{ padding: 8, textAlign: 'center', borderTop: `1px solid ${THEME.border}`, borderLeft: `1px solid ${THEME.border}` }}>
                {programSummary.byLift[lift].reps}
              </div>
            ))}

            <div style={{ padding: 8, color: THEME.muted, borderTop: `1px solid ${THEME.border}` }}>
              {t.programIntensity || 'Intensity'}
            </div>
            {LIFT_ORDER.map(lift => (
              <div key={`program-info-intensity-${lift}`} style={{ padding: 8, textAlign: 'center', borderTop: `1px solid ${THEME.border}`, borderLeft: `1px solid ${THEME.border}` }}>
                {programSummary.byLift[lift].avgIntensity}%
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 10,
            color: THEME.muted,
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.35,
            textAlign: 'center'
          }}>
            {programSummary.trainingDays} {t.programTrainingDays || 'training days'} · {programSummary.restDays} {t.programRestDays || 'rest days'}
          </div>

          <div style={{
            marginTop: 6,
            color: THEME.muted,
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1.35,
            textAlign: 'center'
          }}>
            {t.programIntensityNote || 'Intensity is the average planned percentage of max, weighted by reps.'}
          </div>

          <button
            type="button"
            onClick={() => setShowProgramInfo(false)}
            style={programActionButtonStyle(THEME.primary, '12px 0 0')}
          >
            {t.back || 'Back'}
          </button>
        </SettingsModal>
      )}

      {renderWorkoutListToggleButton('top')}

      {visibleWorkoutEntries.map(({ workout, idx }) => {
        const isCurrent = idx === currentIndex;
        const isDone = completedWorkoutNumberSet.has(Number(workout.number)) || Boolean(workout.completed);
        const completedAtLabel = isDone ? formatCompletedAt(workout.completedAt, workout.completedDate || workout.date) : null;
        const focusColor = workout.type === 'meet'
          ? THEME.meet
          : workout.type === 'rest'
            ? THEME.primary
            : getLiftThemeColor(workout.lift);
        const titleColor = workout.type === 'meet' ? THEME.meet : THEME.text;
        const headerBg = isCurrent ? focusColor : THEME.border;
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
              <div style={{ fontWeight: isCurrent ? 800 : 700, color: titleColor }}>
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

      {!smartModel && (
        <>
          <StartNewCycleSection
            onStartNewCycle={onStartNewCycle}
            t={t}
          />

          <ProgramProfileSection
            programProfile={programProfile}
            preparationMode={preparationMode}
            accessoryMode={accessoryMode}
            cooldownMode={cooldownMode}
            squatVariant={squatVariant}
            benchPressVariant={benchPressVariant}
            deadliftVariant={deadliftVariant}
            onChangeProgramProfile={onChangeProgramProfile}
            onApplyProgramSettings={onApplyProgramSettings}
            t={t}
          />
        </>
      )}
    </div>
  );
}

function Onboarding({ onStart, t }) {
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingError, setOnboardingError] = useState('');
  const [onboardingWeightUnit, setOnboardingWeightUnit] = useState(() => normalizeWeightUnit(localStorage.getItem('weightUnit')));
  const [onboardingTrainingModel, setOnboardingTrainingModel] = useState(() =>
    normalizeTrainingModel(localStorage.getItem('trainingModel'))
  );
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
    if (onboardingStep === 3 && !hasRequiredTrainingDetails()) {
      setOnboardingError(t.fillRequiredFields);
      return;
    }

    setOnboardingError('');
    setOnboardingStep(step => Math.min(5, step + 1));
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
    onStart(s, b, d, {
      birthDate: normalizedBirthDate,
      sex,
      weightUnit: selectedWeightUnit,
      trainingModel: normalizeTrainingModel(onboardingTrainingModel),
    }, buildInitialBodyData());
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
      minHeight: '100dvh',
      background: '#000000',
      color: THEME.text,
      overflowX: 'hidden'
    }}>
      <div style={{
        maxWidth: 500,
        margin: '0 auto',
        padding: 24,
        paddingTop: 24,
        boxSizing: 'border-box',
        minHeight: '100dvh',
        fontFamily: 'sans-serif',
        background: '#000000',
        color: THEME.text,
        overflowX: 'hidden'
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
              ? t.onboardingModelTitle || 'Choose training model'
              : onboardingStep === 3
              ? t.onboardingTrainingTitle
              : onboardingStep === 4
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
              ? t.onboardingModelHelp || 'Choose Classic for fixed programs or Smart for one-workout-at-a-time coaching.'
              : onboardingStep === 3
              ? t.onboardingMaxHelp
              : onboardingStep === 4
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
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              {
                value: TRAINING_MODELS.CLASSIC,
                title: t.trainingModelClassic || 'Kelani SBD Classic',
                text: t.trainingModelClassicText || 'Choose a fixed program and follow the plan.',
              },
              {
                value: TRAINING_MODELS.SMART,
                title: t.trainingModelSmart || 'Kelani SBD Smart',
                text: t.trainingModelSmartText || 'The app chooses one next workout at a time from your history.',
              },
            ].map(option => {
              const active = normalizeTrainingModel(onboardingTrainingModel) === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setOnboardingTrainingModel(option.value)}
                  style={{
                    width: '100%',
                    padding: 12,
                    fontSize: 15,
                    fontWeight: 800,
                    textAlign: 'left',
                    borderRadius: 8,
                    border: `1px solid ${THEME.primary}`,
                    background: active ? THEME.primary : THEME.bg,
                    color: active ? THEME.bg : THEME.text,
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{option.title}</div>
                  <div style={{
                    marginTop: 4,
                    color: active ? THEME.bg : THEME.muted,
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1.35
                  }}>
                    {option.text}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {onboardingStep === 3 && (
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
              border: `1px solid ${THEME.primary}`,
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
              background: THEME.bg
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
                    border: `1px solid ${liftColor}`,
                    boxSizing: 'border-box',
                    background: THEME.bg,
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
                    border: `1px solid ${liftColor}`,
                    boxSizing: 'border-box',
                    background: THEME.bg,
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

        {onboardingStep === 4 && (
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
              border: `1px solid ${THEME.primary}`,
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
              border: `1px solid ${THEME.primary}`,
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

        {onboardingStep === 5 && (
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
                  border: `1px solid ${THEME.primary}`,
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
                border: `1px solid ${THEME.primary}`,
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
            onClick={onboardingStep < 5 ? goToNextOnboardingStep : handleStart}
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
            {onboardingStep === 1 ? t.onboardingStartSetup : onboardingStep < 5 ? t.onboardingNext : t.startProgram}
          </button>
        </div>
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
      background: THEME.bg,
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
  const [trainingModel, setTrainingModel] = useState(() =>
    normalizeTrainingModel(localStorage.getItem('trainingModel'))
  );
  const [accessoryMode, setAccessoryMode] = useState('off');
  const [preparationMode, setPreparationMode] = useState('basicFirst');
  const [cooldownMode, setCooldownMode] = useState(() =>
    normalizeCooldownMode(localStorage.getItem('cooldownMode'))
  );
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
  const [hasLoadedData, setHasLoadedData] = useState(false);

  function startTimer(seconds, placement = null) {
    const effectiveSeconds = getRecommendedRestTimeSeconds({
      workouts,
      placement,
      fallbackSeconds: seconds,
    });
    const endTime = Date.now() + effectiveSeconds * 1000;
    const currentTranslations = translations[language] || translations.en || {};
    const doneTitle = currentTranslations.restTimerDone || 'Rest finished';
    const doneMessage = currentTranslations.restTimerDoneMessage || 'Your next set is ready.';

    setTimer({
      id: Date.now(),
      seconds: effectiveSeconds,
      endTime,
      placement,
    });

    scheduleRestTimerNotification(endTime, doneTitle, doneMessage);
  }

  function stopTimer() {
    cancelRestTimerNotification();
    setTimer(null);
  }

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('weightUnit', normalizeWeightUnit(weightUnit));
  }, [weightUnit]);

  useEffect(() => {
    if (!hasLoadedData) return;
    localStorage.setItem('programProfile', normalizeProgramProfile(programProfile));
  }, [hasLoadedData, programProfile]);

  useEffect(() => {
    if (!hasLoadedData) return;
    localStorage.setItem('trainingModel', normalizeTrainingModel(trainingModel));
  }, [hasLoadedData, trainingModel]);

  useEffect(() => {
    if (!hasLoadedData) return;
    localStorage.setItem('cooldownMode', normalizeCooldownMode(cooldownMode));
  }, [hasLoadedData, cooldownMode]);

  useEffect(() => {
    if (!hasLoadedData) return;
    localStorage.setItem('squatVariant', normalizeSquatVariant(squatVariant));
  }, [hasLoadedData, squatVariant]);

  useEffect(() => {
    if (!hasLoadedData) return;
    localStorage.setItem('benchPressVariant', normalizeBenchPressVariant(benchPressVariant));
  }, [hasLoadedData, benchPressVariant]);

  useEffect(() => {
    if (!hasLoadedData) return;
    localStorage.setItem('deadliftVariant', normalizeDeadliftVariant(deadliftVariant));
  }, [hasLoadedData, deadliftVariant]);

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
  const PROGRAM_VERSION = 'kelani-program-profiles-v5';

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
      setHasLoadedData(true);
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
        setHasLoadedData(true);
        return;
      }

      const savedHistory = data.history || [];
      const restoredPrs = mergeHigherPrs(savedPrs, calculatePrsFromHistory(savedHistory));
      const savedCycle = data.currentCycle || 1;
      const savedTrainingModel = normalizeTrainingModel(
        data.trainingModel || localStorage.getItem('trainingModel')
      );
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
      const savedAccessoryMode = normalizeAccessoryMode(
        data.accessoryMode ?? profileSettings.accessoryMode
      );
      const savedPreparationMode = normalizePreparationMode(
        data.preparationMode ?? profileSettings.preparationMode
      );
      const savedSquatVariant = normalizeSquatVariant(
        data.squatVariant ?? profileSettings.squatVariant ?? localStorage.getItem('squatVariant')
      );
      const savedDeadliftVariant = normalizeDeadliftVariant(
        data.deadliftVariant ?? profileSettings.deadliftVariant
      );
      const savedBenchPressVariant = normalizeBenchPressVariant(
        data.benchPressVariant ?? profileSettings.benchPressVariant ?? localStorage.getItem('benchPressVariant')
      );
      const savedCooldownMode = normalizeCooldownMode(
        data.cooldownMode ?? profileSettings.cooldownMode ?? profileSettings.includeCooldown
      );
      const generatedWorkouts = generateWorkoutsForTrainingModel(savedTrainingModel, {
        programProfile: savedProgramProfile,
        squat: restoredPrs.Squat,
        bench: restoredPrs.Bench,
        deadlift: restoredPrs.Deadlift,
        accessoryMode: savedAccessoryMode,
        accessoryPRs: data.accessoryPRs || {},
        preparationMode: savedPreparationMode,
        deadliftVariant: savedDeadliftVariant,
        benchPressVariant: savedBenchPressVariant,
        squatVariant: savedSquatVariant,
        cooldownMode: savedCooldownMode,
        history: savedHistory,
        currentIndex: data.inProgress?.currentIndex ?? 0,
        currentCycle: savedCycle,
      });
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
        restoredPrs
      ));
      setHistory(savedHistory);
      setPrs(restoredPrs);
      setAccessoryPRs(data.accessoryPRs || {});
      setCurrentCycle(savedCycle);
      setBodyWeights(normalizeBodyWeights(data));
      setUserProfile(data.userProfile || {});
      setMeetPlannerAttempts(savedMeetPlannerAttempts);
      setMeetPrepChecklist(savedMeetPrepChecklist);
      setRestTimeSeconds(normalizeRestTimeSeconds(data.restTimeSeconds));
      setTrainingModel(savedTrainingModel);
      setProgramProfile(savedProgramProfile);
      setAccessoryMode(savedAccessoryMode);
      setPreparationMode(savedPreparationMode);
      setCooldownMode(savedCooldownMode);
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
      setSelectedIndex(
        isSmartTrainingModel(savedTrainingModel)
          ? restoredCurrentIndex
          : Math.max(restoredCurrentIndex, restorableSelectedIndex ?? restoredCurrentIndex)
      );

      setShowNewCycle(
        isSmartTrainingModel(savedTrainingModel)
          ? isSmartCycleCompleteAfterHistory(savedHistory, savedCycle)
          : false
      );
      setScreen('dashboard');
      setHasLoadedData(true);
    } catch (e) {
      console.error('Kon opgeslagen user data niet laden', e);
      setScreen('onboarding');
      setHasLoadedData(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedData || !prs.Squat || !prs.Bench || !prs.Deadlift) return;

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
      trainingModel,
      programProfile,
      accessoryMode,
      preparationMode,
      cooldownMode,
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
  }, [hasLoadedData, history, prs, accessoryPRs, currentCycle, currentIndex, bodyWeights, userProfile, meetPlannerAttempts, meetPrepChecklist, restTimeSeconds, trainingModel, programProfile, accessoryMode, preparationMode, cooldownMode, squatVariant, deadliftVariant, benchPressVariant, selectedIndex, workouts]);

  useEffect(() => {
    if (!hasLoadedData || !prs.Squat || !prs.Bench || !prs.Deadlift) return;

    const generatedWorkouts = generateWorkoutsForTrainingModel(trainingModel, {
      programProfile,
      squat: prs.Squat,
      bench: prs.Bench,
      deadlift: prs.Deadlift,
      accessoryMode,
      accessoryPRs,
      preparationMode,
      deadliftVariant,
      benchPressVariant,
      squatVariant,
      cooldownMode,
      history,
      currentIndex,
      currentCycle,
      meetPlannerAttempts,
    });

    setWorkouts(prev => {
      const baseWorkouts = isSmartTrainingModel(trainingModel) && generatedWorkouts.length > prev.length
        ? generatedWorkouts.map((generatedWorkout, index) => prev[index] || generatedWorkout)
        : prev;

      return removeDeprecatedPrepItemsFromWorkouts(applyAccessoryPlanToWorkouts(
        baseWorkouts,
        generatedWorkouts,
        getCompletedWorkoutNumbers(history, currentCycle)
      ));
    });
  }, [hasLoadedData, trainingModel, accessoryMode, preparationMode, cooldownMode, squatVariant, deadliftVariant, benchPressVariant, programProfile, accessoryPRs, prs.Squat, prs.Bench, prs.Deadlift, history, currentIndex, currentCycle, meetPlannerAttempts]);

  useEffect(() => {
    if (!hasLoadedData || !isSmartTrainingModel(trainingModel)) return;
    if (selectedIndex <= currentIndex) return;

    setSelectedIndex(currentIndex);
  }, [hasLoadedData, trainingModel, selectedIndex, currentIndex]);

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
    const defaultTrainingModel = normalizeTrainingModel(profile.trainingModel || TRAINING_MODELS.CLASSIC);
    const defaultProgramProfile = 'kelaniSbd';
    const defaultSettings = settingsForProgramProfile(defaultProgramProfile);
    const defaultAccessoryMode = defaultSettings.accessoryMode;
    const defaultPreparationMode = defaultSettings.preparationMode;
    const defaultSquatVariant = defaultSettings.squatVariant;
    const defaultBenchPressVariant = defaultSettings.benchPressVariant;
    const defaultDeadliftVariant = defaultSettings.deadliftVariant;
    const defaultCooldownMode = normalizeCooldownMode(defaultSettings.cooldownMode ?? defaultSettings.includeCooldown);

    setWeightUnit(selectedWeightUnit);
    localStorage.setItem('weightUnit', selectedWeightUnit);
    localStorage.setItem('trainingModel', defaultTrainingModel);
    localStorage.setItem('programProfile', defaultProgramProfile);
    localStorage.setItem('squatVariant', defaultSquatVariant);
    localStorage.setItem('benchPressVariant', defaultBenchPressVariant);
    localStorage.setItem('deadliftVariant', defaultDeadliftVariant);
    localStorage.setItem('cooldownMode', defaultCooldownMode);

    setTrainingModel(defaultTrainingModel);
    setProgramProfile(defaultProgramProfile);
    setAccessoryMode(defaultAccessoryMode);
    setPreparationMode(defaultPreparationMode);
    setSquatVariant(defaultSquatVariant);
    setBenchPressVariant(defaultBenchPressVariant);
    setDeadliftVariant(defaultDeadliftVariant);
    setCooldownMode(defaultCooldownMode);

    setWorkouts(generateWorkoutsForTrainingModel(defaultTrainingModel, {
      programProfile: defaultProgramProfile,
      squat: s,
      bench: b,
      deadlift: d,
      accessoryMode: defaultAccessoryMode,
      accessoryPRs: {},
      preparationMode: defaultPreparationMode,
      deadliftVariant: defaultDeadliftVariant,
      benchPressVariant: defaultBenchPressVariant,
      squatVariant: defaultSquatVariant,
      cooldownMode: defaultCooldownMode,
      history: [],
      currentIndex: 0,
      currentCycle: 1,
    }));
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

function changeTrainingModel(nextModel) {
  const normalizedModel = normalizeTrainingModel(nextModel);
  setTrainingModel(normalizedModel);

  if (isSmartTrainingModel(normalizedModel)) {
    const safeIndex = Math.max(0, Math.min(currentIndex, Math.max(workouts.length - 1, 0)));
    setSelectedIndex(safeIndex);
  }
}

function handleResetApp() {
  setShowResetConfirm(false);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('kel-powerlifting');
  localStorage.removeItem('app_version');
  localStorage.removeItem('bodyweight_prompt_date');
  localStorage.removeItem('trainingModel');

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
  setTrainingModel(TRAINING_MODELS.CLASSIC);
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

  const storedOneRM = nextOneRM;
  const storedE1RM = nextE1RM;
  const updatedPrs = {
    ...prs,
    [lift]: storedE1RM,
  };

  setPrs(updatedPrs);
  setWorkouts(generateWorkoutsForTrainingModel(trainingModel, {
    programProfile,
    squat: updatedPrs.Squat,
    bench: updatedPrs.Bench,
    deadlift: updatedPrs.Deadlift,
    accessoryMode,
    accessoryPRs,
    preparationMode,
    deadliftVariant,
    benchPressVariant,
    squatVariant,
    cooldownMode,
    history,
    currentIndex,
    currentCycle,
    meetPlannerAttempts: {},
  }));
  setMeetPlannerAttempts({});

  setHistory(prev => {
    const today = new Date().toLocaleDateString('nl-NL');
    const manualWorkoutNumber = Math.max(0, currentIndex);

    return [
      ...prev.filter(entry => !(
        entry?.manualMax &&
        entry?.lift === lift &&
        Number(entry?.cycle) === Number(currentCycle) &&
        Number(entry?.workoutNumber) === Number(manualWorkoutNumber)
      )),
      {
        workoutNumber: manualWorkoutNumber,
        cycle: currentCycle,
        lift,
        topWeight: storedOneRM,
        topReps: 1,
        e1rm: storedE1RM,
        date: today,
        manualMax: true,
      },
    ];
  });
}

function handleStartNewCycle() {
  if (!prs.Squat || !prs.Bench || !prs.Deadlift) {
    setScreen('onboarding');
    return;
  }

  const nextCycle = currentCycle + 1;
  const newWorkouts = generateWorkoutsForTrainingModel(trainingModel, {
    programProfile,
    squat: prs.Squat,
    bench: prs.Bench,
    deadlift: prs.Deadlift,
    accessoryMode,
    accessoryPRs,
    preparationMode,
    deadliftVariant,
    benchPressVariant,
    squatVariant,
    cooldownMode,
    history,
    currentIndex: 0,
    currentCycle: nextCycle,
    meetPlannerAttempts: {},
  });

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
  stopTimer();

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
      stopTimer();
    }
  } else {
    stopTimer();
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

  if (workout && hasMoreWorkAfterMainSet(workout, setIndex)) {
    startTimer(restTimeSeconds, {
      workoutNumber: workout.number,
      type: 'main',
      index: setIndex,
      failed: true,
    });
  } else {
    stopTimer();
  }

  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        sets: w.sets.map((s, si) => {
          if (si !== setIndex) return s;

          const originalWeight = Number(s.originalWeight ?? s.weight) || 0;
          const originalPct = Number(s.originalPct ?? s.pct) || 0;

          return {
            ...s,
            done: true,
            failed: true,
            skipped: true,
            failedAttempts: (Number(s.failedAttempts) || 0) + 1,
            failedWeight: Number(s.failedWeight ?? s.weight) || 0,
            originalWeight,
            originalPct,
            adjustedWeight: null,
            adjustedFromFailedSet: false,
            adjustedFromOriginal: Number(s.weight) !== originalWeight,
            effort: null,
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
      failed: true,
    });
  } else {
    const currentDone = workout?.accessories?.[accIndex]?.done?.[setIndex];
    if (currentDone === false) {
      stopTimer();
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
  stopTimer();

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
      stopTimer();
    }
  } else {
    stopTimer();
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
      stopTimer();
    }
  } else {
    stopTimer();
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
      failed: true,
    });
  } else {
    stopTimer();
  }

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

              const originalWeight = Number(s.originalWeight ?? s.weight) || 0;
              const originalPct = Number(s.originalPct ?? s.pct) || 0;

              return {
                ...s,
                done: true,
                failed: true,
                skipped: true,
                failedAttempts: (Number(s.failedAttempts) || 0) + 1,
                failedWeight: Number(s.failedWeight ?? s.weight) || 0,
                originalWeight,
                originalPct,
                adjustedWeight: null,
                adjustedFromFailedSet: false,
                adjustedFromOriginal: Number(s.weight) !== originalWeight,
                effort: null,
              };
            }),
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



function markAccessorySetFailed(accIndex, setIndex) {
  const workout = workouts[selectedIndex];

  const hasLaterAccessoryWork = Boolean(workout) && (
    (workout.accessories?.[accIndex]?.done || []).some((done, index) =>
      index > setIndex && !done
    ) ||
    (workout.accessories || []).some((accessory, index) =>
      index > accIndex && (accessory.done || []).some(done => !done)
    )
  );

  if (workout && hasLaterAccessoryWork) {
    startTimer(restTimeSeconds, {
      workoutNumber: workout.number,
      type: 'accessory',
      accIndex,
      index: setIndex,
    });
  } else {
    stopTimer();
  }

  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        accessories: (w.accessories || []).map((a, ai) => {
          if (ai !== accIndex) return a;

          return {
            ...a,
            done: (a.done || []).map((done, i) => i === setIndex ? true : done),
            skipped: (a.skipped || (a.done || []).map(() => false)).map((skipped, i) =>
              i === setIndex ? true : skipped
            ),
            failed: (a.failed || (a.done || []).map(() => false)).map((failed, i) =>
              i === setIndex ? true : failed
            ),
            failedWeights: (a.failedWeights || (a.done || []).map(() => null)).map((weight, i) =>
              i === setIndex ? (Number(weight ?? a.weights?.[i]) || 0) : weight
            ),
            originalWeights: (a.originalWeights || a.weights || []).map((weight, i) =>
              Number(weight || a.weights?.[i]) || 0
            ),
            adjustedWeights: (a.adjustedWeights || a.weights || []).map((weight, i) =>
              i === setIndex ? a.weights?.[i] : weight
            ),
            adjustedFromFailedSet: (a.adjustedFromFailedSet || (a.done || []).map(() => false)).map((adjusted, i) =>
              i === setIndex ? false : adjusted
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
    setCooldownMode(normalizeCooldownMode(settings.cooldownMode ?? settings.includeCooldown));
  }

  function applyProgramSettings(settings = {}) {
    setProgramProfile(normalizeProgramProfile(settings.programProfile));
    setAccessoryMode(normalizeAccessoryMode(settings.accessoryMode));
    setPreparationMode(normalizePreparationMode(settings.preparationMode));
    setCooldownMode(normalizeCooldownMode(settings.cooldownMode));
    setSquatVariant(normalizeSquatVariant(settings.squatVariant));
    setBenchPressVariant(normalizeBenchPressVariant(settings.benchPressVariant));
    setDeadliftVariant(normalizeDeadliftVariant(settings.deadliftVariant));
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
    stopTimer();

    const finishedWorkout = JSON.parse(JSON.stringify(workout));
    finishedWorkout.completed = true;
    finishedWorkout.completedAt = new Date().toISOString();

    const completedSmartDayType = isSmartTrainingModel(trainingModel)
      ? finishedWorkout.smartDayType || (
        finishedWorkout.type === 'rest'
          ? SMART_DAY_TYPES.RECOVERY
          : finishedWorkout.type === 'meet'
            ? SMART_DAY_TYPES.MEET
            : SMART_DAY_TYPES.TRAINING
      )
      : null;

    const completedSmartDecisionSummary = isSmartTrainingModel(trainingModel)
      ? finishedWorkout.smartDecisionSummary || null
      : null;

    const completedFailedOrSkippedSetCount = countFailedOrSkippedSetsFromSnapshot(finishedWorkout);

    if (workout.type === 'rest') {
      const restWorkoutEffort = finishedWorkout.workoutEffort || 'easy';

      finishedWorkout.completedSummary = {
        type: 'rest',
        bodyWeight: latestBodyWeight,
      };
      setCompletedSummary(finishedWorkout.completedSummary);

      const nextHistory = [
        ...history.filter(entry => !(
          Number(entry.cycle) === Number(currentCycle) &&
          Number(entry.workoutNumber) === Number(workout.number) &&
          entry.restDay
        )),
        {
          workoutNumber: workout.number,
          cycle: currentCycle,
          smartDayType: isSmartTrainingModel(trainingModel)
            ? (finishedWorkout.type === 'rest' ? SMART_DAY_TYPES.RECOVERY : SMART_DAY_TYPES.TRAINING)
            : null,
          restDay: true,
          completionOnly: true,
          date: new Date().toLocaleDateString('nl-NL'),
          workoutEffort: restWorkoutEffort,
          failedOrSkippedSetCount: completedFailedOrSkippedSetCount,
          smartDecisionSummary: completedSmartDecisionSummary,
          workoutSnapshot: {
            ...finishedWorkout,
            workoutEffort: restWorkoutEffort,
          },
        },
      ];

      setHistory(nextHistory);
      const smartCycleCompleteAfterRest = isSmartTrainingModel(trainingModel)
        ? isSmartCycleCompleteAfterHistory(nextHistory, currentCycle)
        : false;
      setShowNewCycle(smartCycleCompleteAfterRest);

      setWorkouts(prev =>
        prev.map((w, wi) => wi === selectedIndex ? finishedWorkout : w)
      );

      setCompletedWorkout({
        ...finishedWorkout,
        workoutEffort: null,
        hideWorkoutEffort: true,
      });
      setCompletedWorkoutIndex(selectedIndex);

      const nextWorkoutIndex = smartCycleCompleteAfterRest
        ? selectedIndex
        : isSmartTrainingModel(trainingModel)
          ? selectedIndex + 1
          : Math.min(selectedIndex + 1, workouts.length - 1);
      if (isSmartTrainingModel(trainingModel)) {
        setCurrentWorkoutIndex(
          smartCycleCompleteAfterRest
            ? selectedIndex
            : Math.max(currentIndex, nextWorkoutIndex)
        );
      } else if (selectedIndex === currentIndex) {
        setCurrentWorkoutIndex(nextWorkoutIndex);
      }
      setSelectedIndex(nextWorkoutIndex);
      setScreen('completed');

      return;
    }

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
      ...previousLiftHistory.map(h => getHistoryMaxCandidates(h).e1rm || 0)
    );

    const previousBest1RM = Math.max(
      0,
      ...previousLiftHistory.map(h => getHistoryMaxCandidates(h).oneRM || 0)
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

  const nextCompletedSummary = {
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
  };

  finishedWorkout.completedSummary = nextCompletedSummary;
  setCompletedSummary(nextCompletedSummary);

    const withoutCurrentMeet = history.filter(
    h => !(Number(h.cycle) === Number(currentCycle) && Number(h.workoutNumber) === Number(workout.number))
  );

  const newEntries = results.map(result => ({
    workoutNumber: workout.number,
    cycle: currentCycle,
    smartDayType: isSmartTrainingModel(trainingModel)
      ? (finishedWorkout.type === 'rest'
        ? SMART_DAY_TYPES.RECOVERY
        : finishedWorkout.type === 'meet'
          ? SMART_DAY_TYPES.MEET
          : SMART_DAY_TYPES.TRAINING)
      : null,
    lift: result.lift,
    topWeight: result.oneRMToday,
    topReps: 1,
    e1rm: result.e1RMToday,
    date: today,
    workoutEffort: finishedWorkout.workoutEffort,
    failedOrSkippedSetCount: completedFailedOrSkippedSetCount,
    smartDecisionSummary: completedSmartDecisionSummary,
    workoutSnapshot: finishedWorkout,
  }));

  const nextHistory = [...withoutCurrentMeet, ...newEntries];

  setHistory(nextHistory);
  setPrs(prev => mergeHigherPrs(prev, calculatePrsFromHistory(nextHistory)));

  setWorkouts(prev =>
    prev.map((w, wi) => wi === selectedIndex ? finishedWorkout : w)
  );

  setCompletedWorkout(finishedWorkout);
  setCompletedWorkoutIndex(selectedIndex);
  const smartCycleCompleteAfterMeet = isSmartTrainingModel(trainingModel)
    ? isSmartCycleCompleteAfterHistory(nextHistory, currentCycle)
    : workout.type === 'meet';
  const nextWorkoutIndex = smartCycleCompleteAfterMeet
    ? selectedIndex
    : isSmartTrainingModel(trainingModel)
      ? selectedIndex + 1
      : Math.min(selectedIndex + 1, workouts.length - 1);
  if (isSmartTrainingModel(trainingModel)) {
    setCurrentWorkoutIndex(
      smartCycleCompleteAfterMeet
        ? selectedIndex
        : Math.max(currentIndex, nextWorkoutIndex)
    );
  } else if (selectedIndex === currentIndex) {
    setCurrentWorkoutIndex(nextWorkoutIndex);
  }
  setSelectedIndex(nextWorkoutIndex);
  setShowNewCycle(smartCycleCompleteAfterMeet);
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
          ...previousLiftHistory.map(h => getHistoryMaxCandidates(h).e1rm || 0)
        );

        const previousBest1RM = Math.max(
          0,
          ...previousLiftHistory.map(h => getHistoryMaxCandidates(h).oneRM || 0)
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

      const nextCompletedSummary = {
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
      };

      finishedWorkout.completedSummary = nextCompletedSummary;
      setCompletedSummary(nextCompletedSummary);

      const withoutCurrentWorkout = history.filter(
        h => !(h.cycle === currentCycle && h.workoutNumber === workout.number)
      );

      const newEntries = results.map(result => ({
        completionOnly: result.trackStrength === false,
        workoutNumber: workout.number,
        cycle: currentCycle,
        smartDayType: completedSmartDayType,
        smartDecisionSummary: completedSmartDecisionSummary,
        failedOrSkippedSetCount: completedFailedOrSkippedSetCount,
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
      setPrs(prev => mergeHigherPrs(prev, calculatePrsFromHistory(nextHistory)));
    }

  
    if (workout.type === 'training' && LIFT_ORDER.includes(workout.lift) && !shouldTrackWorkoutStrength(workout.lift, benchPressVariant)) {
  finishedWorkout.completedSummary = null;
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
        smartDayType: completedSmartDayType,
        smartDecisionSummary: completedSmartDecisionSummary,
        failedOrSkippedSetCount: completedFailedOrSkippedSetCount,
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
    .map(h => getHistoryMaxCandidates(h).oneRM || 0)
);

const is1RMPR = oneRMToday > previousBest1RM;
const isE1RMPR = e1RMToday > previousBestE1RM;

const best1RM = Math.max(previousBest1RM, oneRMToday);
const bestE1RM = Math.max(previousBestE1RM, e1RMToday);

const nextCompletedSummary = {
  type: 'training',
  results: [{
    lift: workout.lift,
    trackStrength: true,
    oneRMToday,
    e1RMToday,
    previousBest1RM,
    previousBestE1RM,
    best1RM,
    bestE1RM,
    is1RMPR,
    isE1RMPR,
    topSet,
  }],
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
};

finishedWorkout.completedSummary = nextCompletedSummary;
setCompletedSummary(nextCompletedSummary);

  setPrs(prev => {
  const current = prev[workout.lift] || 0;
  return e1RMToday > current ? { ...prev, [workout.lift]: e1RMToday } : prev;
});

    setHistory(prev => {
  const existingIndex = prev.findIndex(
    h => Number(h.cycle) === Number(currentCycle) && Number(h.workoutNumber) === Number(workout.number) && h.lift === workout.lift
  );

  const newEntry = {
    workoutNumber: workout.number,
    cycle: currentCycle,
    smartDayType: isSmartTrainingModel(trainingModel)
      ? (finishedWorkout.type === 'rest'
        ? SMART_DAY_TYPES.RECOVERY
        : finishedWorkout.type === 'meet'
          ? SMART_DAY_TYPES.MEET
          : SMART_DAY_TYPES.TRAINING)
      : null,
    lift: workout.lift,
    topWeight: oneRMToday,
    topReps: sets.find(s => Number(s.weight) === oneRMToday)?.reps || topSet.reps,
    e1rm: e1RMToday,
    date: new Date().toLocaleDateString('nl-NL'),
    workoutEffort: finishedWorkout.workoutEffort,
    failedOrSkippedSetCount: completedFailedOrSkippedSetCount,
    smartDecisionSummary: completedSmartDecisionSummary,
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

  const nextWorkoutIndex = isSmartTrainingModel(trainingModel)
    ? selectedIndex + 1
    : Math.min(selectedIndex + 1, workouts.length - 1);
  if (isSmartTrainingModel(trainingModel)) {
    setCurrentWorkoutIndex(Math.max(currentIndex, nextWorkoutIndex));
  } else if (selectedIndex === currentIndex) {
    setCurrentWorkoutIndex(nextWorkoutIndex);
  }
  setSelectedIndex(nextWorkoutIndex);

  setScreen('completed');
}

if (showLaunchSplash) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100dvh',
      minHeight: '100dvh',
      boxSizing: 'border-box',
      background: '#000000',
      color: THEME.text,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
      overflow: 'hidden',
      overscrollBehavior: 'none',
      touchAction: 'none',
      zIndex: 9999
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

const __kelaniSmartDebug = () => {
    const key = 'kel-powerlifting-user-data-v1';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    const workouts = data.inProgress?.workouts || [];
    const currentIndex = data.inProgress?.currentIndex ?? 0;
    const selectedIndex = data.inProgress?.selectedIndex ?? currentIndex;
    const currentWorkout = workouts[currentIndex] || null;
    const selectedWorkout = workouts[selectedIndex] || null;

    const summarizeSet = set => ({
      labelKey: set.labelKey,
      reps: set.reps,
      weight: set.weight,
      pct: set.pct,
      done: set.done,
      failed: set.failed,
      skipped: set.skipped,
    });

    const summarizeLift = lift => ({
      lift: lift.lift,
      warmups: (lift.warmups || []).map(warmup => ({
        reps: warmup.reps,
        weight: warmup.weight,
        done: warmup.done,
      })),
      setCount: (lift.sets || []).length,
      sets: (lift.sets || []).map(summarizeSet),
    });

    const summarizeWorkout = workout => workout ? ({
      number: workout.number,
      type: workout.type,
      lift: workout.lift,
      smartDayType: workout.smartDayType,
      smartOverride: workout.smartOverride,
      reason: workout.smartDecisionSummary?.reason,
      readiness: workout.smartDecisionSummary?.readiness || null,
      autoregulated: Boolean(workout.smartAutoregulatedTraining),
      adjustedLifts: workout.smartTrainingAdjustedLifts || [],
      loadFactor: workout.smartTrainingLoadFactor,
      volumeCap: workout.smartTrainingVolumeCap,
      autoregulationByLift: workout.smartTrainingAutoregulationByLift || null,
      deloadSelection: workout.smartDeloadSelectionSummary || null,
      deloadByLift: workout.smartDeloadByLift || null,
      trainingSelection: workout.smartTrainingSelectionSummary || null,
      warmups: (workout.warmups || []).map(warmup => ({
        reps: warmup.reps,
        weight: warmup.weight,
        done: warmup.done,
      })),
      sets: (workout.sets || []).map(summarizeSet),
      lifts: (workout.lifts || []).map(summarizeLift),
    }) : null;

    const resolvedTrainingModel = data.trainingModel || localStorage.getItem('trainingModel');
    const resolvedCurrentCycle = data.currentCycle || 1;
    const smartCycleCompleteFromHistory = isSmartTrainingModel(resolvedTrainingModel)
      ? isSmartCycleCompleteAfterHistory(data.history || [], resolvedCurrentCycle)
      : false;

    return {
      trainingModel: resolvedTrainingModel,
      currentCycle: resolvedCurrentCycle,
      showNewCycle: Boolean(showNewCycle),
      smartCycleCompleteFromHistory,
      currentIndex,
      selectedIndex,
      currentWorkout: summarizeWorkout(currentWorkout),
      selectedWorkout: summarizeWorkout(selectedWorkout),
      visibleCount: workouts.filter(workout => workout.smartVisible !== false).length,
      visibleWorkouts: workouts
        .filter(workout => workout.smartVisible !== false)
        .map(summarizeWorkout),
      history: (data.history || []).map(entry => ({
        workoutNumber: entry.workoutNumber,
        cycle: entry.cycle,
        lift: entry.lift,
        restDay: entry.restDay,
        smartDayType: entry.smartDayType,
        workoutEffort: entry.workoutEffort,
        failedOrSkippedSetCount: entry.failedOrSkippedSetCount,
      })),
    };
};

const __kelaniSmartPreviewNextDay = (options = {}) => {
    const key = 'kel-powerlifting-user-data-v1';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    const inProgress = data.inProgress || {};
    const workouts = inProgress.workouts || [];
    const currentCycle = Number(data.currentCycle) || 1;
    const currentIndex = inProgress.currentIndex ?? inProgress.selectedIndex ?? 0;
    const currentWorkout = workouts[currentIndex];

    if (!currentWorkout) {
      return { ok: false, reason: 'current-workout-not-found' };
    }

    const effort = options.effort || currentWorkout.workoutEffort || 'good';
    const failedByLift = options.failedByLift || {};
    const smartDayType = options.smartDayType || currentWorkout.smartDayType || (
      currentWorkout.type === 'meet'
        ? SMART_DAY_TYPES.MEET
        : currentWorkout.type === 'rest'
          ? SMART_DAY_TYPES.RECOVERY
          : SMART_DAY_TYPES.TRAINING
    );

    const today = new Date().toLocaleDateString('nl-NL');
    const snapshot = {
      ...currentWorkout,
      workoutEffort: effort,
      smartDayType,
      lifts: (currentWorkout.lifts || []).map(liftBlock => {
        const failedCount = Number(failedByLift[liftBlock.lift]) || 0;
        let remainingFailures = failedCount;

        return {
          ...liftBlock,
          sets: (liftBlock.sets || []).map(set => {
            if (remainingFailures > 0) {
              remainingFailures -= 1;
              return {
                ...set,
                done: true,
                failed: true,
                skipped: false,
              };
            }

            return {
              ...set,
              done: true,
              failed: false,
              skipped: false,
            };
          }),
        };
      }),
    };

    const previewEntries = (currentWorkout.lifts || []).length > 0
      ? (snapshot.lifts || []).map(liftBlock => {
        const successfulSets = (liftBlock.sets || []).filter(set =>
          set.done && !set.failed && !set.skipped
        );
        const topWeight = successfulSets.length
          ? Math.max(...successfulSets.map(set => Number(set.weight) || 0))
          : 0;
        const topSet = successfulSets.find(set => Number(set.weight) === topWeight) || successfulSets[0] || null;
        const e1rm = successfulSets.length
          ? Math.max(...successfulSets.map(set => epley(Number(set.weight) || 0, Number(set.reps) || 0)))
          : 0;

        return {
          workoutNumber: currentWorkout.number,
          cycle: currentCycle,
          smartDayType,
          lift: liftBlock.lift,
          topWeight,
          topReps: Number(topSet?.reps) || 0,
          e1rm,
          date: today,
          workoutEffort: effort,
          failedOrSkippedSetCount: Object.values(failedByLift).reduce((total, value) =>
            total + (Number(value) || 0),
            0
          ),
          smartDecisionSummary: currentWorkout.smartDecisionSummary || null,
          workoutSnapshot: snapshot,
        };
      })
      : [{
        workoutNumber: currentWorkout.number,
        cycle: currentCycle,
        smartDayType,
        restDay: currentWorkout.type === 'rest',
        completionOnly: true,
        date: today,
        workoutEffort: effort,
        failedOrSkippedSetCount: Object.values(failedByLift).reduce((total, value) =>
          total + (Number(value) || 0),
          0
        ),
        smartDecisionSummary: currentWorkout.smartDecisionSummary || null,
        workoutSnapshot: snapshot,
      }];

    const nextHistory = [
      ...(data.history || []).filter(entry =>
        !(
          Number(entry.cycle) === Number(currentCycle) &&
          Number(entry.workoutNumber) === Number(currentWorkout.number)
        )
      ),
      ...previewEntries,
    ];

    const nextCurrentIndex = currentIndex + 1;
    const generated = generateWorkoutsForTrainingModel(data.trainingModel || TRAINING_MODELS.SMART, {
      programProfile: data.programProfile,
      squat: data.prs?.Squat,
      bench: data.prs?.Bench,
      deadlift: data.prs?.Deadlift,
      accessoryMode: data.accessoryMode,
      accessoryPRs: data.accessoryPRs,
      preparationMode: data.preparationMode,
      deadliftVariant: data.deadliftVariant,
      benchPressVariant: data.benchPressVariant,
      squatVariant: data.squatVariant,
      cooldownMode: data.cooldownMode,
      history: nextHistory,
      currentIndex: nextCurrentIndex,
      currentCycle,
      meetPlannerAttempts: data.meetPlannerAttempts || {},
    });

    const nextWorkout = generated[nextCurrentIndex] || generated[generated.length - 1] || null;

    return {
      ok: true,
      simulated: {
        workoutNumber: currentWorkout.number,
        type: currentWorkout.type,
        smartDayType,
        effort,
        failedByLift,
      },
      next: nextWorkout ? {
        number: nextWorkout.number,
        type: nextWorkout.type,
        smartDayType: nextWorkout.smartDayType,
        reason: nextWorkout.smartDecisionSummary?.reason,
        readiness: nextWorkout.smartDecisionSummary?.readiness || null,
        autoregulated: Boolean(nextWorkout.smartAutoregulatedTraining),
        adjustedLifts: nextWorkout.smartTrainingAdjustedLifts || [],
        autoregulationByLift: nextWorkout.smartTrainingAutoregulationByLift || null,
        deloadSelection: nextWorkout.smartDeloadSelectionSummary || null,
        deloadByLift: nextWorkout.smartDeloadByLift || null,
        trainingSelection: nextWorkout.smartTrainingSelectionSummary || null,
        lifts: (nextWorkout.lifts || []).map(liftBlock => ({
          lift: liftBlock.lift,
          warmups: (liftBlock.warmups || []).map(warmup => ({
            reps: warmup.reps,
            weight: warmup.weight,
          })),
          sets: (liftBlock.sets || []).map(set => ({
            labelKey: set.labelKey,
            reps: set.reps,
            weight: set.weight,
            pct: set.pct,
          })),
        })),
      } : null,
    };
};

const __kelaniSmartPreviewRegression = () => {
    if (typeof __kelaniSmartPreviewNextDay !== 'function') {
      return { ok: false, reason: 'preview-helper-not-found' };
    }

    const buildPeakPreview = (options = {}) => {
      const key = 'kel-powerlifting-user-data-v1';
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      const currentCycle = Number(data.currentCycle) || 1;
      const currentIndex = Number(options.currentIndex) || 5;
      const prs = data.prs || {};

      const e1rms = {
        Squat: Number(options.squatE1RM) || Math.max(0, (Number(prs.Squat) || 150) * 0.99),
        Bench: Number(options.benchE1RM) || Math.max(0, (Number(prs.Bench) || 100) * 1.0),
        Deadlift: Number(options.deadliftE1RM) || Math.max(0, (Number(prs.Deadlift) || 185) * 0.92),
      };

      const syntheticDayTemplates = [
        ['Squat', 'Bench', 'Deadlift'],
        ['Bench', 'Squat'],
        ['Squat', 'Bench'],
        ['Deadlift', 'Bench'],
        ['Squat', 'Bench'],
        ['Bench', 'Deadlift'],
        ['Deadlift'],
        ['Squat', 'Bench'],
      ];

      const syntheticDays = Array.from({ length: Math.max(1, currentIndex) }, (_, index) => ({
        number: index + 1,
        lifts: syntheticDayTemplates[index % syntheticDayTemplates.length],
      }));

      const syntheticHistory = syntheticDays.flatMap(day =>
        day.lifts.map(lift => ({
          workoutNumber: day.number,
          cycle: currentCycle,
          smartDayType: SMART_DAY_TYPES.TRAINING,
          lift,
          topWeight: e1rms[lift],
          topReps: 1,
          e1rm: e1rms[lift],
          date: new Date().toLocaleDateString('nl-NL'),
          workoutEffort: 'good',
          failedOrSkippedSetCount: 0,
          workoutSnapshot: {
            number: day.number,
            type: 'training',
            smartDayType: SMART_DAY_TYPES.TRAINING,
            workoutEffort: 'good',
            lifts: day.lifts.map(dayLift => ({
              lift: dayLift,
              sets: [{
                reps: 1,
                weight: e1rms[dayLift],
                done: true,
                failed: false,
                skipped: false,
              }],
            })),
          },
        }))
      );

      const preservedHistory = (data.history || []).filter(entry =>
        entry?.seedMax ||
        entry?.manualMax ||
        Number(entry?.cycle) !== currentCycle
      );

      const generated = generateWorkoutsForTrainingModel(data.trainingModel || TRAINING_MODELS.SMART, {
        programProfile: data.programProfile,
        squat: prs.Squat,
        bench: prs.Bench,
        deadlift: prs.Deadlift,
        accessoryMode: data.accessoryMode,
        accessoryPRs: data.accessoryPRs,
        preparationMode: data.preparationMode,
        deadliftVariant: data.deadliftVariant,
        benchPressVariant: data.benchPressVariant,
        squatVariant: data.squatVariant,
        cooldownMode: data.cooldownMode,
        history: [...preservedHistory, ...syntheticHistory],
        currentIndex,
        currentCycle,
        meetPlannerAttempts: data.meetPlannerAttempts || {},
      });

      const nextWorkout = generated[currentIndex] || generated[generated.length - 1] || null;

      return {
        ok: Boolean(nextWorkout),
        next: nextWorkout ? {
          number: nextWorkout.number,
          type: nextWorkout.type,
          smartDayType: nextWorkout.smartDayType,
          reason: nextWorkout.smartDecisionSummary?.reason,
          readiness: nextWorkout.smartDecisionSummary?.readiness || null,
          trainingSelection: nextWorkout.smartTrainingSelectionSummary || null,
          lifts: (nextWorkout.lifts || []).map(liftBlock => ({
            lift: liftBlock.lift,
            sets: (liftBlock.sets || []).map(set => ({
              labelKey: set.labelKey,
              reps: set.reps,
              weight: set.weight,
              pct: set.pct,
            })),
          })),
        } : null,
      };
    };

    const scenarios = [
      {
        name: 'hard-no-fail',
        options: { effort: 'hard', failedByLift: {} },
        expect: result =>
          result.smartDayType === SMART_DAY_TYPES.TRAINING &&
          result.reason === SMART_DECISION_REASONS.TRAINING_FALLBACK &&
          result.deloadSelection === null &&
          (
            result.autoregulated === true ||
            (Array.isArray(result.overlapLifts) && result.overlapLifts.length === 0)
          ),
      },
      {
        name: 'too-much-squat-fail',
        options: { effort: 'tooMuch', failedByLift: { Squat: 1 } },
        expect: result =>
          result.smartDayType === SMART_DAY_TYPES.RECOVERY &&
          result.reason === SMART_DECISION_REASONS.FATIGUE_RECOVERY,
      },
      {
        name: 'good-squat-one-fail',
        options: { effort: 'good', failedByLift: { Squat: 1 } },
        expect: result =>
          result.smartDayType === SMART_DAY_TYPES.TRAINING &&
          result.reason === SMART_DECISION_REASONS.TRAINING_FALLBACK &&
          result.failedByLift?.Squat === 1 &&
          (
            !result.lifts.includes('Squat') ||
            result.adjustedLifts.includes('Squat')
          ),
      },
      {
        name: 'good-squat-two-fail',
        options: { effort: 'good', failedByLift: { Squat: 2 } },
        expect: result =>
          result.smartDayType === SMART_DAY_TYPES.DELOAD &&
          result.reason === SMART_DECISION_REASONS.FAILED_SET_DELOAD &&
          result.deloadSelection?.primaryLift === 'Squat',
      },
      {
        name: 'good-bench-two-fail',
        options: { effort: 'good', failedByLift: { Bench: 2 } },
        expect: result =>
          result.smartDayType === SMART_DAY_TYPES.DELOAD &&
          result.reason === SMART_DECISION_REASONS.FAILED_SET_DELOAD &&
          result.deloadSelection?.primaryLift === 'Bench',
      },
      {
        name: 'good-deadlift-two-fail',
        options: { effort: 'good', failedByLift: { Deadlift: 2 } },
        expect: result =>
          result.smartDayType === SMART_DAY_TYPES.DELOAD &&
          result.reason === SMART_DECISION_REASONS.FAILED_SET_DELOAD &&
          result.deloadSelection?.primaryLift === 'Deadlift',
      },
    ];

    const results = scenarios.map(scenario => {
      const preview = __kelaniSmartPreviewNextDay(scenario.options);
      const next = preview?.next || {};
      const readiness = next.readiness || {};

      const result = {
        name: scenario.name,
        ok: Boolean(preview?.ok),
        nextNumber: next.number,
        sourceWorkout: next.trainingSelection?.sourceWorkoutNumber ||
          next.deloadSelection?.sourceWorkoutNumber ||
          null,
        type: next.type,
        smartDayType: next.smartDayType,
        reason: next.reason,
        lifts: (next.lifts || []).map(liftBlock => liftBlock.lift),
        failedByLift: readiness.recentFailedOrSkippedSetCountsByLift || {},
        fatigue: readiness.recentFatigueScore,
        autoregulated: Boolean(next.autoregulated),
        adjustedLifts: next.adjustedLifts || [],
        deloadSelection: next.deloadSelection || null,
        deloadByLift: next.deloadByLift || null,
        trainingFlags: next.trainingSelection?.reasonFlags || [],
        overlapLifts: next.trainingSelection?.overlapLifts || [],
      };

      return {
        ...result,
        pass: Boolean(result.ok && scenario.expect(result)),
      };
    });

    const earlyPeakPreview = buildPeakPreview({ currentIndex: 5 });
    const laterPeakPreview = buildPeakPreview({ currentIndex: 7 });

    const peak = {
      early: {
        smartDayType: earlyPeakPreview?.next?.smartDayType,
        reason: earlyPeakPreview?.next?.reason,
        usesPeakPreference: Boolean(earlyPeakPreview?.next?.trainingSelection?.usesPeakPreference),
        sourceWorkout: earlyPeakPreview?.next?.trainingSelection?.sourceWorkoutNumber || null,
      },
      later: {
        smartDayType: laterPeakPreview?.next?.smartDayType,
        reason: laterPeakPreview?.next?.reason,
        lifts: (laterPeakPreview?.next?.lifts || []).map(liftBlock => liftBlock.lift),
        usesPeakPreference: Boolean(laterPeakPreview?.next?.trainingSelection?.usesPeakPreference),
        peakTargetLift: laterPeakPreview?.next?.trainingSelection?.peakTargetLift || null,
        sourceWorkout: laterPeakPreview?.next?.trainingSelection?.sourceWorkoutNumber || null,
      },
    };

    peak.pass = Boolean(
      earlyPeakPreview?.ok &&
      laterPeakPreview?.ok &&
      peak.early.smartDayType === SMART_DAY_TYPES.TRAINING &&
      peak.early.usesPeakPreference === false &&
      peak.later.smartDayType === SMART_DAY_TYPES.TRAINING &&
      peak.later.usesPeakPreference === true &&
      peak.later.peakTargetLift === 'Deadlift' &&
      peak.later.sourceWorkout &&
      peak.later.sourceWorkout < 20
    );

    return {
      pass: results.every(result => result.pass) && peak.pass,
      failed: [
        ...results.filter(result => !result.pass).map(result => result.name),
        ...(peak.pass ? [] : ['peak-scenario']),
      ],
      results,
      peak,
    };
};

const __kelaniSmartSetCurrentEffort = (effort = 'good') => {
    const key = 'kel-powerlifting-user-data-v1';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    const workouts = data.inProgress?.workouts || [];
    const currentIndex = data.inProgress?.currentIndex ?? data.inProgress?.selectedIndex ?? 0;
    const workout = workouts[currentIndex];

    if (!workout) {
      return { ok: false, reason: 'current-workout-not-found' };
    }

    workouts[currentIndex] = {
      ...workout,
      workoutEffort: effort,
    };

    data.inProgress = {
      ...(data.inProgress || {}),
      workouts,
    };

    localStorage.setItem(key, JSON.stringify(data));
    window.location.reload();

    return {
      ok: true,
      currentIndex,
      workoutNumber: workout.number,
      effort,
    };
};

const __kelaniSmartClearSmartHistoryToCurrentCycle = () => {
    const key = 'kel-powerlifting-user-data-v1';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    const currentCycle = Number(data.currentCycle) || 1;

    data.history = (data.history || []).filter(entry =>
      entry?.seedMax ||
      entry?.manualMax ||
      Number(entry?.cycle) !== currentCycle
    );

    data.completedWorkout = null;
    data.completedSummary = null;

    if (data.inProgress) {
      data.inProgress.currentIndex = 0;
      data.inProgress.selectedIndex = 0;
      data.inProgress.workouts = (data.inProgress.workouts || []).map(workout => ({
        ...workout,
        completed: false,
        completedAt: null,
        completedDate: null,
        completedSummary: null,
        workoutEffort: null,
        smartVisible: false,
        smartSelectable: false,
        smartDecision: null,
        smartDecisionSummary: null,
        smartTrainingSelectionSummary: null,
        smartTrainingAutoregulationByLift: null,
        smartDeloadByLift: null,
        prepItems: (workout.prepItems || []).map(item => ({ ...item, done: false })),
        warmups: (workout.warmups || []).map(item => ({ ...item, done: false })),
        sets: (workout.sets || []).map(set => ({
          ...set,
          done: false,
          failed: false,
          skipped: false,
        })),
        lifts: (workout.lifts || []).map(lift => ({
          ...lift,
          prepItems: (lift.prepItems || []).map(item => ({ ...item, done: false })),
          warmups: (lift.warmups || []).map(item => ({ ...item, done: false })),
          sets: (lift.sets || []).map(set => ({
            ...set,
            done: false,
            failed: false,
            skipped: false,
          })),
        })),
      }));
    }

    localStorage.setItem(key, JSON.stringify(data));
    window.location.reload();

    return {
      ok: true,
      currentCycle,
    };
};

const __kelaniSmartResetToW1 = () => {
    const key = 'kel-powerlifting-user-data-v1';
    const data = JSON.parse(localStorage.getItem(key) || '{}');

    const resetCycle = 2;
    const resolvedPrs = {
      Squat: Number(data?.prs?.Squat || prs?.Squat || 142.5),
      Bench: Number(data?.prs?.Bench || prs?.Bench || 87.5),
      Deadlift: Number(data?.prs?.Deadlift || prs?.Deadlift || 152.5),
    };

    const resetHistory = (Array.isArray(data.history) ? data.history : history || []).filter(entry =>
      entry?.seedMax || Number(entry?.workoutNumber) === 0
    );

    const existingWorkouts = data.inProgress?.workouts || [];

    const generatedWorkouts = existingWorkouts.length
      ? existingWorkouts
      : generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, {
        programProfile: data.programProfile || programProfile,
        squat: resolvedPrs.Squat,
        bench: resolvedPrs.Bench,
        deadlift: resolvedPrs.Deadlift,
        accessoryMode: data.accessoryMode || accessoryMode,
        accessoryPRs: data.accessoryPRs || accessoryPRs || {},
        preparationMode: data.preparationMode || preparationMode,
        deadliftVariant: data.deadliftVariant || deadliftVariant,
        benchPressVariant: data.benchPressVariant || benchPressVariant,
        squatVariant: data.squatVariant || squatVariant,
        cooldownMode: data.cooldownMode || cooldownMode,
        history: resetHistory,
        currentIndex: 0,
        currentCycle: resetCycle,
        meetPlannerAttempts: {},
      });

    const resetWorkouts = (generatedWorkouts || []).map((workout, index) => ({
      ...workout,
      completed: false,
      completedAt: null,
      completedSummary: null,
      workoutEffort: null,
      smartVisible: index === 0 ? true : workout.smartVisible === true,
      smartSelectable: index === 0 ? true : workout.smartSelectable === true,
      smartDecision: index === 0 ? workout.smartDecision : null,
      smartDecisionSummary: index === 0 ? workout.smartDecisionSummary : null,
      smartTrainingSelectionSummary: index === 0 ? workout.smartTrainingSelectionSummary : null,
      smartTrainingAutoregulationByLift: index === 0 ? workout.smartTrainingAutoregulationByLift : null,
      smartDeloadByLift: index === 0 ? workout.smartDeloadByLift : null,
      prepItems: (workout.prepItems || []).map(item => ({ ...item, done: false })),
      warmups: (workout.warmups || []).map(item => ({ ...item, done: false })),
      sets: (workout.sets || []).map(set => ({
        ...set,
        done: false,
        failed: false,
        skipped: false,
      })),
      lifts: (workout.lifts || []).map(lift => ({
        ...lift,
        prepItems: (lift.prepItems || []).map(item => ({ ...item, done: false })),
        warmups: (lift.warmups || []).map(item => ({ ...item, done: false })),
        sets: (lift.sets || []).map(set => ({
          ...set,
          done: false,
          failed: false,
          skipped: false,
        })),
      })),
    }));

    if (!resetWorkouts.length) {
      return {
        ok: false,
        reason: 'smart-reset-generated-no-workouts',
        currentCycle: resetCycle,
      };
    }

    data.trainingModel = TRAINING_MODELS.SMART;
    data.prs = resolvedPrs;
    data.history = resetHistory;
    data.currentCycle = resetCycle;
    data.completedWorkout = null;
    data.completedWorkoutIndex = null;
    data.completedSummary = null;
    data.meetPlannerAttempts = {};
    data.inProgress = {
      ...(data.inProgress || {}),
      currentCycle: resetCycle,
      currentIndex: 0,
      selectedIndex: 0,
      workouts: resetWorkouts,
      programVersion: data.inProgress?.programVersion,
    };

    localStorage.setItem('trainingModel', TRAINING_MODELS.SMART);
    localStorage.setItem(key, JSON.stringify(data));
    window.location.reload();

    return {
      ok: true,
      currentCycle: resetCycle,
      workoutCount: resetWorkouts.length,
      currentWorkout: resetWorkouts[0]?.number,
      smartDayType: resetWorkouts[0]?.smartDayType,
      type: resetWorkouts[0]?.type,
    };
};

const __kelaniSmartQA = (options = {}) => {
  const mode = options.mode || 'default';
  const helperNames = [
    '__kelaniSmartDebug',
    '__kelaniSmartPreviewNextDay',
    '__kelaniSmartPreviewRegression',
    '__kelaniSmartSetCurrentEffort',
    '__kelaniSmartClearSmartHistoryToCurrentCycle',
    '__kelaniSmartResetToW1',
    '__kelaniSmartQA',
  ];

  const key = 'kel-powerlifting-user-data-v1';
  const data = (() => {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (error) {
      return { __parseError: error?.message || String(error) };
    }
  })();

  const inProgress = data.inProgress || {};
  const workouts = inProgress.workouts || [];
  const currentIndex = inProgress.currentIndex ?? inProgress.selectedIndex ?? 0;
  const selectedIndex = inProgress.selectedIndex ?? currentIndex;
  const currentWorkout = workouts[currentIndex] || null;
  const selectedWorkout = workouts[selectedIndex] || null;
  const visibleWorkouts = workouts.filter(workout => workout.smartVisible !== false);
  const resolvedTrainingModel = data.trainingModel || localStorage.getItem('trainingModel') || null;

  const regression = typeof __kelaniSmartPreviewRegression === 'function'
    ? __kelaniSmartPreviewRegression()
    : { pass: false, failed: ['preview-regression-helper-missing'] };

  const previewGood = typeof __kelaniSmartPreviewNextDay === 'function'
    ? __kelaniSmartPreviewNextDay({ effort: 'good', failedByLift: {} })
    : { ok: false, reason: 'preview-helper-missing' };

  const expected = options.expected || {};
  const expectedFailures = [];

  if (expected.cycle !== undefined && Number(data.currentCycle) !== Number(expected.cycle)) {
    expectedFailures.push('expected-cycle-' + expected.cycle + '-got-' + data.currentCycle);
  }

  if (expected.workoutNumber !== undefined && Number(currentWorkout?.number) !== Number(expected.workoutNumber)) {
    expectedFailures.push('expected-workout-' + expected.workoutNumber + '-got-' + currentWorkout?.number);
  }

  if (expected.smartDayType !== undefined && currentWorkout?.smartDayType !== expected.smartDayType) {
    expectedFailures.push('expected-smart-day-' + expected.smartDayType + '-got-' + currentWorkout?.smartDayType);
  }

  if (expected.type !== undefined && currentWorkout?.type !== expected.type) {
    expectedFailures.push('expected-type-' + expected.type + '-got-' + currentWorkout?.type);
  }

  const helperExposure = typeof window === 'undefined'
    ? { pass: true, reason: 'no-window' }
    : {
      pass: helperNames.every(name =>
        typeof window[name] === 'function' &&
        Object.prototype.propertyIsEnumerable.call(window, name) === false
      ),
      helpers: helperNames.reduce((summary, name) => ({
        ...summary,
        [name]: {
          type: typeof window[name],
          enumerable: Object.prototype.propertyIsEnumerable.call(window, name),
        },
      }), {}),
      enumerableSmartKeys: Object.keys(window).filter(keyName => keyName.startsWith('__kelaniSmart')),
    };

  const smartModel = typeof isSmartTrainingModel === 'function'
    ? isSmartTrainingModel(resolvedTrainingModel)
    : String(resolvedTrainingModel || '').toLowerCase().includes('smart');

  const peak = regression?.peak || {};
  const regressionResults = regression?.results || [];
  const regressionNames = regressionResults.map(result => result.name);
  const requiredRegressionScenarios = [
    'hard-no-fail',
    'too-much-squat-fail',
    'good-squat-one-fail',
    'good-squat-two-fail',
    'good-bench-two-fail',
    'good-deadlift-two-fail',
  ];


  const qaCurrentWorkout = typeof currentWorkout !== 'undefined' ? currentWorkout : null;
  const qaSelectedWorkout = typeof selectedWorkout !== 'undefined' ? selectedWorkout : qaCurrentWorkout;
  const qaTrainingStructureIssues = [
    ...getKelaniTrainingStructureIssues(qaCurrentWorkout || {}),
    ...getKelaniTrainingStructureIssues(qaSelectedWorkout || {}),
  ];
  const qaWarmupJumpIssues = [
    ...getKelaniWarmupJumpIssues(qaCurrentWorkout || {}),
    ...getKelaniWarmupJumpIssues(qaSelectedWorkout || {}),
  ];
  const v1Checks = {
    noPhoneTopSingleOnlyTraining: qaTrainingStructureIssues.length === 0,
    noPhoneSquatDeadliftWarmupJumpOver50kg: qaWarmupJumpIssues.length === 0,

    smartModel,
    hasWorkouts: workouts.length > 0,
    hasVisibleWorkout: visibleWorkouts.length > 0,
    currentWorkoutFound: Boolean(currentWorkout),
    currentWorkoutHasType: Boolean(currentWorkout?.type),
    currentWorkoutHasSmartDayType: Boolean(currentWorkout?.smartDayType),
    previewGoodWorks: Boolean(previewGood?.ok && previewGood?.next),
    regressionScenarioCoverage: requiredRegressionScenarios.every(name => regressionNames.includes(name)),
    regressionPeakCoverage: Boolean(
      peak?.pass &&
      peak?.early?.smartDayType &&
      peak?.later?.smartDayType &&
      peak?.later?.usesPeakPreference === true
    ),
    nonEnumerableDebugHelpers: Boolean(
      helperExposure.pass &&
      (helperExposure.enumerableSmartKeys || []).length === 0
    ),
  };

  const checks = {
    storageParse: !data.__parseError,
    currentWorkoutFound: Boolean(currentWorkout),
    regression: Boolean(regression?.pass && (regression.failed || []).length === 0),
    helperExposure: Boolean(helperExposure.pass),
    expectedState: expectedFailures.length === 0,
    ...(mode === 'v1' ? v1Checks : {}),
  };

  const failed = [
    ...Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name),
    ...expectedFailures,
    ...((regression?.failed || []).map(name => 'regression:' + name)),
  ];

  return {
    pass: failed.length === 0,
    failed,
    mode,
    checks,
    state: {
      trainingModel: resolvedTrainingModel,
      currentCycle: data.currentCycle || null,
      currentIndex,
      selectedIndex,
      currentWorkout: currentWorkout ? {
        number: currentWorkout.number,
        type: currentWorkout.type,
        smartDayType: currentWorkout.smartDayType,
        lift: currentWorkout.lift || null,
        completed: Boolean(currentWorkout.completed),
        smartVisible: currentWorkout.smartVisible,
        smartSelectable: currentWorkout.smartSelectable,
        reason: currentWorkout.smartDecisionSummary?.reason || null,
      } : null,
      selectedWorkout: selectedWorkout ? {
        number: selectedWorkout.number,
        type: selectedWorkout.type,
        smartDayType: selectedWorkout.smartDayType,
        lift: selectedWorkout.lift || null,
      } : null,
      visibleCount: visibleWorkouts.length,
      workoutCount: workouts.length,
      historyCount: (data.history || []).length,
    },
    regression: {
      pass: Boolean(regression?.pass),
      failed: regression?.failed || [],
      peak: regression?.peak || null,
      resultCount: regressionResults.length,
      scenarioNames: regressionNames,
    },
    previewGood: {
      ok: Boolean(previewGood?.ok),
      reason: previewGood?.reason || previewGood?.next?.reason || null,
      next: previewGood?.next ? {
        number: previewGood.next.number,
        type: previewGood.next.type,
        smartDayType: previewGood.next.smartDayType,
        reason: previewGood.next.reason,
      } : null,
    },
    v1: mode === 'v1' ? {
      pass: Object.values(v1Checks).every(Boolean),
      checks: v1Checks,
      requiredRegressionScenarios,
    } : null,
    helperExposure,
  };
};

const isKelaniSmartDebugExposureAllowed = () => {
  if (typeof window === 'undefined') return false;

  const host = window.location.hostname;
  const protocol = window.location.protocol;

  const isLocalDev =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '' ||
    protocol === 'file:';

  const hasManualOptIn =
    window.localStorage?.getItem('kelaniSmartDebug') === '1';

  return isLocalDev || hasManualOptIn;
};

const exposeKelaniSmartDebugHelpers = () => {
  if (typeof window === 'undefined') return;
  if (!isKelaniSmartDebugExposureAllowed()) return;

  const helpers = {
    __kelaniSmartDebug,
    __kelaniSmartPreviewNextDay,
    __kelaniSmartPreviewRegression,
    __kelaniSmartSetCurrentEffort,
    __kelaniSmartClearSmartHistoryToCurrentCycle,
    __kelaniSmartResetToW1,
    __kelaniSmartQA,
  };

  Object.entries(helpers).forEach(([name, fn]) => {
    if (typeof fn !== 'function') return;

    Object.defineProperty(window, name, {
      value: fn,
      configurable: true,
      writable: false,
      enumerable: false,
    });
  });
};

exposeKelaniSmartDebugHelpers();

if (screen === null) {
  return (
    <div style={{
      minHeight: '100dvh',
      boxSizing: 'border-box',
      background: THEME.bg
    }} />
  );
}

if (screen === 'onboarding') return <Onboarding onStart={handleStart} t={t}/>;

if (screen !== 'onboarding' && !workouts.length) {
  return <Onboarding onStart={handleStart} t={t}/>;
}

function activateSelectedWorkout() {
  if (isSmartTrainingModel(trainingModel)) return;
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

const bestMaxesFromHistory = calculateBestMaxesFromHistory(history);

const best1RMs = {
  Squat: bestMaxesFromHistory.Squat.oneRM || 0,
  Bench: bestMaxesFromHistory.Bench.oneRM || 0,
  Deadlift: bestMaxesFromHistory.Deadlift.oneRM || 0,
};

const bestE1RMs = {
  Squat: Math.max(Number(prs.Squat) || 0, bestMaxesFromHistory.Squat.e1rm || 0),
  Bench: Math.max(Number(prs.Bench) || 0, bestMaxesFromHistory.Bench.e1rm || 0),
  Deadlift: Math.max(Number(prs.Deadlift) || 0, bestMaxesFromHistory.Deadlift.e1rm || 0),
};

const total1RM = best1RMs.Squat + best1RMs.Bench + best1RMs.Deadlift;
const totalE1RM = bestE1RMs.Squat + bestE1RMs.Bench + bestE1RMs.Deadlift;
const latestBodyDataEntry = [...bodyWeights].slice(-1)[0];
const latestBodyWeightEntry = [...bodyWeights].filter(entry => entry.bodyWeight).slice(-1)[0];
const latestBodyWeight = latestBodyWeightEntry?.bodyWeight || null;

function buildCompletedSummaryForRender(workout) {
  if (!workout) return null;

  const workoutNumber = Number(workout.number);
  const currentEntries = (history || []).filter(entry =>
    Number(entry.cycle) === Number(currentCycle) &&
    Number(entry.workoutNumber) === workoutNumber
  );

  function resultForLift(lift, sets = [], liftBlock = null) {
    const entry = currentEntries.find(item => item.lift === lift);
    const trackStrength = liftBlock
      ? shouldTrackLiftBlockStrength(liftBlock, benchPressVariant)
      : shouldTrackWorkoutStrength(lift, benchPressVariant);

    const successfulSets = trackStrength
      ? (sets || []).filter(set => set.done && !set.failed && !set.skipped)
      : [];

    const topSet = successfulSets.length
      ? successfulSets.reduce(
          (best, set) =>
            epley(Number(set.weight) || 0, Number(set.reps) || 0) >
            epley(Number(best.weight) || 0, Number(best.reps) || 0)
              ? set
              : best,
          successfulSets[0]
        )
      : null;

    const oneRMToday = entry
      ? Number(entry.topWeight) || 0
      : successfulSets.length
        ? Math.max(...successfulSets.map(set => Number(set.weight) || 0))
        : 0;

    const e1RMToday = entry
      ? Number(entry.e1rm) || 0
      : successfulSets.length
        ? Math.max(...successfulSets.map(set => epley(Number(set.weight) || 0, Number(set.reps) || 0)))
        : 0;

    const previousLiftHistory = (history || []).filter(item =>
      item.lift === lift &&
      !(Number(item.cycle) === Number(currentCycle) && Number(item.workoutNumber) === workoutNumber)
    );

    const previousBest1RM = Math.max(
      0,
      ...previousLiftHistory.map(item => getHistoryMaxCandidates(item).oneRM || 0)
    );

    const previousBestE1RM = Math.max(
      Number(prs?.[lift]) || 0,
      ...previousLiftHistory.map(item => getHistoryMaxCandidates(item).e1rm || 0)
    );

    return {
      lift,
      trackStrength,
      oneRMToday,
      e1RMToday,
      previousBest1RM,
      previousBestE1RM,
      best1RM: Math.max(previousBest1RM, oneRMToday),
      bestE1RM: Math.max(previousBestE1RM, e1RMToday),
      is1RMPR: oneRMToday > previousBest1RM && oneRMToday > 0,
      isE1RMPR: e1RMToday > previousBestE1RM && e1RMToday > 0,
      topSet,
    };
  }

  const results = (workout.lifts || []).length > 0
    ? (workout.lifts || []).map(liftBlock =>
        resultForLift(liftBlock.lift, liftBlock.sets || [], liftBlock)
      )
    : workout.lift
      ? [resultForLift(workout.lift, workout.sets || [], null)]
      : [];

  const primaryResult = results.find(result => result.trackStrength !== false);

  if (!primaryResult) {
    return {
      type: workout.type || 'training',
      results,
      bodyWeight: latestBodyWeight,
    };
  }

  return {
    type: workout.type === 'meet' ? 'meet' : ((workout.lifts || []).length > 0 ? 'multiTraining' : 'training'),
    results,
    lift: primaryResult.lift,
    oneRMToday: primaryResult.oneRMToday || 0,
    e1RMToday: primaryResult.e1RMToday || 0,
    previousBest1RM: primaryResult.previousBest1RM || 0,
    previousBestE1RM: primaryResult.previousBestE1RM || 0,
    best1RM: primaryResult.best1RM || 0,
    bestE1RM: primaryResult.bestE1RM || 0,
    is1RMPR: !!primaryResult.is1RMPR,
    isE1RMPR: !!primaryResult.isE1RMPR,
    topSet: primaryResult.topSet || null,
    bodyWeight: latestBodyWeight,
  };
}

const completedSummaryCandidate = completedWorkout?.completedSummary || completedSummary;
const completedSummaryForRender =
  (completedSummaryCandidate?.results || []).length > 0
    ? completedSummaryCandidate
    : buildCompletedSummaryForRender(completedWorkout) || completedSummaryCandidate;

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
    boxSizing: 'border-box',
    background: THEME.bg,
    minHeight: '100dvh',
    color: THEME.text,
    overflowX: 'hidden'
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
          benchPressVariant={benchPressVariant}
          onChangeProgramProfile={changeProgramProfile}
          trainingModel={trainingModel}
          t={t}
          weightUnit={weightUnit}
          timer={timer}
          setTimer={stopTimer}
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
      subtitle={formatCycleWorkoutSubtitle({
        t,
        currentCycle,
        workoutNumber: Math.min(currentIndex + 1, workouts.length),
        totalWorkouts: workouts.length,
        smartModel: isSmartTrainingModel(trainingModel),
      })}
    />

    {workouts[currentIndex] && (() => {
      const nextWorkout = workouts[currentIndex];
      const isNextMeetDay = nextWorkout.type === 'meet';

      return (
        <div style={{
          background: isNextMeetDay ? `${THEME.meet}14` : 'transparent',
          border: isNextMeetDay ? `1px solid ${THEME.meet}` : 'none',
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
            color: isNextMeetDay ? THEME.meet : THEME.text,
            fontSize: 22,
            fontWeight: 900
          }}>
            <WorkoutTitle workout={nextWorkout} t={t} benchPressVariant={benchPressVariant} />
          </div>
        </div>
      );
    })()}
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
            color: THEME.meet,
            background: `${THEME.meet}14`,
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
          trainingModel={trainingModel}
          preparationMode={preparationMode}
          accessoryMode={accessoryMode}
          cooldownMode={cooldownMode}
          squatVariant={squatVariant}
          deadliftVariant={deadliftVariant}
          onApplyProgramSettings={applyProgramSettings}
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
          trainingModel={trainingModel}
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

    <ModelSection
      trainingModel={trainingModel}
      setTrainingModel={changeTrainingModel}
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
    boxSizing: 'border-box',
    minHeight: '100dvh',
    background: THEME.bg,
    color: THEME.text,
    fontFamily: 'sans-serif',
    overflowX: 'hidden'
  }}>
    {completedWorkout?.type === 'meet' && showNewCycle ? (
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
            border: `1px solid ${THEME.primary}`,
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

        <h2 style={{ margin: '0 0 8px', color: THEME.brown || '#a67c52' }}>
          {showNewCycle
            ? (t.cycleCompleted || 'Cycle complete')
            : completedWorkout?.type === 'rest'
              ? 'Rest day complete'
              : t.workoutCompleted}
        </h2>

        <p style={{ color: THEME.muted, margin: '0 0 12px' }}>
          {showNewCycle
            ? (t.workoutAndCycleSaved || 'Cycle saved. Start the next cycle when ready.')
            : completedWorkout?.type === 'rest'
              ? 'Rest day saved. You can continue to the next workout.'
              : t.goodJobSaved}
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

        {!isSmartTrainingModel(trainingModel) && getCompletedWorkoutSuggestions(completedWorkout, t, benchPressVariant).length > 0 && (
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
          display: (
            completedWorkout?.type === 'meet' ||
            completedSummaryForRender?.type === 'meet' ||
            !(completedSummaryForRender?.results || []).some(result => result.trackStrength !== false)
          ) ? 'none' : undefined,
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
            }[(completedSummaryForRender?.results || []).find(result => result.trackStrength !== false)?.lift || completedWorkout?.lift] || THEME.primary),
            fontSize: 16,
            fontWeight: 900,
            marginBottom: 10,
            textAlign: 'center'
          }}>
            {liftLabel((completedSummaryForRender?.results || []).find(result => result.trackStrength !== false)?.lift || completedWorkout?.lift, t)} · 1RM / e1RM
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

            const primaryResult = (completedSummaryForRender?.results || []).find(result => result.trackStrength !== false);
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

        {showNewCycle && (
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
        )}

        <button
          onClick={() => setScreen('stats')}
          style={{
            width: '100%',
            padding: 14,
            fontSize: 16,
            fontWeight: 600,
            background: showNewCycle ? 'transparent' : THEME.primary,
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
            border: `1px solid ${THEME.primary}`,
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
      border: `1px solid ${THEME.primary}`,
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
          border: `1px solid ${THEME.primary}`,
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
      border: `1px solid ${THEME.primary}`,
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
            border: `1px solid ${THEME.primary}`,
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
