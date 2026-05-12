import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { translations } from './translations';
import { App as CapacitorApp } from '@capacitor/app';

const show = v => (v === null || v === undefined ? '—' : v);
const STORAGE_KEY = 'kel-powerlifting-user-data-v1';
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

const dash = v => (v ? v : '—');


function getRestTime() {
  return 300;
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

function getCompletedWorkoutCount(history, cycle) {
  return new Set(
    (history || [])
      .filter(h =>
        h.lift &&
        h.workoutNumber > 0 &&
        getEntryCycle(h) === cycle
      )
      .map(h => h.workoutNumber)
  ).size;
}

function normalizeBodyWeights(data) {
  const entries = [];

  (data.bodyWeights || []).forEach((entry, index) => {
    const bodyWeight = Number(entry.bodyWeight || entry.weight);
    if (!bodyWeight) return;

    entries.push({
      workoutNumber: Number.isFinite(Number(entry.workoutNumber))
        ? Number(entry.workoutNumber)
        : index,
      date: entry.date || new Date().toLocaleDateString('nl-NL'),
      timestamp: entry.timestamp || new Date().toISOString(),
      bodyWeight,
    });
  });

  (data.history || []).forEach(entry => {
    const bodyWeight = Number(entry.bodyWeight || entry.bodyWeightToday);
    if (!bodyWeight) return;

    entries.push({
      workoutNumber: Number.isFinite(Number(entry.workoutNumber))
        ? Number(entry.workoutNumber)
        : 0,
      date: entry.date || new Date().toLocaleDateString('nl-NL'),
      timestamp: entry.timestamp || new Date().toISOString(),
      bodyWeight,
    });
  });

  if (data.bodyWeightToday) {
    const completedWorkouts = (data.history || []).filter(
      h => h.lift && h.workoutNumber > 0
    ).length;

    entries.push({
      workoutNumber: completedWorkouts,
      date: new Date().toLocaleDateString('nl-NL'),
      timestamp: new Date().toISOString(),
      bodyWeight: Number(data.bodyWeightToday),
    });
  }

  const byWorkout = {};

  entries.forEach(entry => {
    byWorkout[entry.workoutNumber] = entry;
  });

  return Object.values(byWorkout).sort(
    (a, b) => a.workoutNumber - b.workoutNumber
  );
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
      return savedSnapshot.workoutSnapshot;
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
            warmups: (liftBlock.warmups || []).map(w => ({ ...w, done: true })),
            sets: (liftBlock.sets || []).map(s => ({ ...s, done: true })),
          })),
        };
      }

      return {
        ...workout,
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

function getWorkoutTypeLabel(workout, t) {
  const key = getWorkoutTypeKey(workout);
  return key ? t[key] : '—';
}

function generateWarmups(firstWorkWeight) {
  function roundUp10(w) {
    return Math.ceil(w / 10) * 10;
  }

  const weight = Number(firstWorkWeight) || 0;

  if (weight <= 20) return [];

  let template = [];

  if (weight <= 50) {
    template = [{ weight: 20, reps: 5 }];
  } else if (weight <= 100) {
    template = [
      { weight: 20, reps: 5 },
      { pct: 0.60, reps: 3 },
    ];
  } else if (weight <= 160) {
    template = [
      { weight: 20, reps: 5 },
      { pct: 0.50, reps: 5 },
      { pct: 0.75, reps: 3 },
    ];
  } else {
    template = [
      { weight: 20, reps: 5 },
      { pct: 0.45, reps: 5 },
      { pct: 0.65, reps: 3 },
      { pct: 0.80, reps: 2 },
    ];
  }

  const seen = new Set();

  return template
    .map(w => {
      const warmupWeight = w.weight ?? roundUp10(weight * w.pct);

      return {
        weight: warmupWeight,
        reps: w.reps,
        isWarmup: true,
        done: false,
      };
    })
    .filter(w => w.weight > 0 && w.weight < weight)
    .filter(w => {
      if (seen.has(w.weight)) return false;
      seen.add(w.weight);
      return true;
    });
}

function generateProgram(s, b, d) {
  function round25(w) {
    return Math.round(w / 2.5) * 2.5;
  }

  const oneRMs = {
    Squat: s,
    Bench: b,
    Deadlift: d,
  };

  const program = [
    { lift: 'Deadlift', type: 'training', label: 'Base strength', blocks: [{ sets: 4, reps: 5, pct: 0.70 }] },
    { lift: 'Bench', type: 'training', label: 'Volume', blocks: [{ sets: 5, reps: 8, pct: 0.65 }] },
    { lift: 'Squat', type: 'training', label: 'Base volume', blocks: [{ sets: 5, reps: 6, pct: 0.65 }] },
    { lift: 'Bench', type: 'training', label: 'Strength volume', blocks: [{ sets: 6, reps: 5, pct: 0.70 }] },
    { lift: 'Squat', type: 'training', label: 'Strength volume', blocks: [{ sets: 5, reps: 5, pct: 0.70 }] },
    { lift: 'Bench', type: 'training', label: 'Technique strength', blocks: [{ sets: 8, reps: 3, pct: 0.75 }] },

    { lift: 'Deadlift', type: 'training', label: 'Strength volume', blocks: [{ sets: 5, reps: 4, pct: 0.75 }] },
    { lift: 'Bench', type: 'training', label: 'Volume strength', blocks: [{ sets: 5, reps: 6, pct: 0.70 }] },
    { lift: 'Squat', type: 'training', label: 'Strength volume', blocks: [{ sets: 5, reps: 5, pct: 0.70 }] },
    { lift: 'Bench', type: 'training', label: 'Strength', blocks: [{ sets: 6, reps: 4, pct: 0.75 }] },
    { lift: 'Squat', type: 'training', label: 'Strength', blocks: [{ sets: 6, reps: 4, pct: 0.75 }] },
    { lift: 'Bench', type: 'training', label: 'Heavy technique', blocks: [{ sets: 7, reps: 3, pct: 0.80 }] },

    { lift: 'Deadlift', type: 'training', label: 'Heavy strength', blocks: [{ sets: 5, reps: 3, pct: 0.80 }] },
    { lift: 'Bench', type: 'training', label: 'Strength volume', blocks: [{ sets: 5, reps: 5, pct: 0.75 }] },
    { lift: 'Squat', type: 'training', label: 'Heavy volume', blocks: [{ sets: 5, reps: 4, pct: 0.775 }] },
    { lift: 'Bench', type: 'training', label: 'Heavy strength', blocks: [{ sets: 6, reps: 3, pct: 0.825 }] },
    { lift: 'Squat', type: 'training', label: 'Heavy strength', blocks: [{ sets: 5, reps: 3, pct: 0.825 }] },
    { lift: 'Bench', type: 'training', label: 'Heavy doubles', blocks: [{ sets: 5, reps: 2, pct: 0.875 }] },

    { lift: 'Deadlift', type: 'training', label: 'Peak strength', blocks: [{ sets: 4, reps: 2, pct: 0.85 }] },
    { lift: 'Bench', type: 'training', label: 'Heavy volume', blocks: [{ sets: 4, reps: 4, pct: 0.80 }] },
    { lift: 'Squat', type: 'training', label: 'Peak strength', blocks: [{ sets: 4, reps: 3, pct: 0.85 }] },
    { lift: 'Bench', type: 'training', label: 'Peak doubles', blocks: [{ sets: 5, reps: 2, pct: 0.875 }] },
    { lift: 'Squat', type: 'training', label: 'Heavy doubles', blocks: [{ sets: 3, reps: 2, pct: 0.90 }] },
    { lift: 'Bench', type: 'training', label: 'Peak singles', blocks: [{ sets: 4, reps: 1, pct: 0.925 }] },

    {
      lift: 'Deadlift',
      type: 'training',
      label: 'Pre-meet',
      blocks: [
        { sets: 1, reps: 1, pct: 0.90, labelKey: 'opener' },
        { sets: 1, reps: 1, pct: 0.93, labelKey: 'secondAttempt' },
        { sets: 1, reps: 1, pct: 0.95, labelKey: 'thirdAttempt' },
        { sets: 3, reps: 3, pct: 0.80, labelKey: 'backoff' },
      ],
    },
    {
      lift: 'Bench',
      type: 'training',
      label: 'Pre-meet',
      blocks: [
        { sets: 1, reps: 1, pct: 0.90, labelKey: 'opener' },
        { sets: 1, reps: 1, pct: 0.93, labelKey: 'secondAttempt' },
        { sets: 1, reps: 1, pct: 0.95, labelKey: 'thirdAttempt' },
        { sets: 3, reps: 3, pct: 0.80, labelKey: 'backoff' },
      ],
    },
    {
      lift: 'Squat',
      type: 'training',
      label: 'Pre-meet',
      blocks: [
        { sets: 1, reps: 1, pct: 0.90, labelKey: 'opener' },
        { sets: 1, reps: 1, pct: 0.93, labelKey: 'secondAttempt' },
        { sets: 1, reps: 1, pct: 0.95, labelKey: 'thirdAttempt' },
        { sets: 3, reps: 3, pct: 0.80, labelKey: 'backoff' },
      ],
    },
  ];

  const workouts = [];

  program.forEach((day, dayIndex) => {
    const sets = [];

    day.blocks.forEach(block => {
      for (let i = 0; i < block.sets; i++) {
        sets.push({
          labelKey: block.labelKey || null,
          label: block.label || null,
          reps: block.reps,
          pct: block.pct,
          weight: round25(oneRMs[day.lift] * block.pct),
          done: false,
        });
      }
    });

    const firstWorkWeight = sets.length ? sets[0].weight : 20;
    const warmups = generateWarmups(firstWorkWeight);

    workouts.push({
      number: dayIndex + 1,
      type: day.type,
      lift: day.lift,
      label: day.label,
      warmups,
      sets,
      accessories: [],
    });
  });

  workouts.push({
  number: 28,
  type: 'meet',
  lift: 'SBD',
  labelKey: 'meetDay',
  lifts: ['Squat', 'Bench', 'Deadlift'].map(lift => {
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


function RestTimer({ seconds, onDismiss, t }) {
  const [remaining, setRemaining] = useState(seconds);
  const intervalRef = useRef(null);
  const hasBeepedRef = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    hasBeepedRef.current = false;

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) {
      clearInterval(intervalRef.current);

      if (!hasBeepedRef.current) {
        hasBeepedRef.current = true;
        playBeep();
      }

      return;
    }

    intervalRef.current = setInterval(() => setRemaining(r => r - 1), 1000);
    return () => clearInterval(intervalRef.current);
  }, [remaining, seconds]);

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      [0, 0.3, 0.6].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.value = 880;
        osc.type = 'sine';

        gain.gain.setValueAtTime(0.5, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);

        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.3);
      });
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

function SetRow({ set, index, label, isWarmup = false, onToggle, onWeightChange, isActive, isReadOnly, t }) {
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
    border: `2px solid ${set.done ? '#ae8a27' : '#ccc'}`,
    background: set.done ? '#ae5827' : 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    transform: set.done ? 'scale(1.1)' : 'scale(1)',
    color: '#ffffff',
  }}
>
      </div>
      <div onClick={onToggle} style={{ flex: 1, cursor: 'pointer' }}>
        <span style={{ fontWeight: 500, color: THEME.text, textDecoration: set.done ? 'line-through' : 'none' }}>{label}</span>
<span style={{ color: THEME.text, fontSize: 16, fontWeight: 700, marginLeft: 12 }}>
{set.reps} {t.reps}
</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input ref={inputRef} type="number" value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleConfirm}
              style={{ width: 70, padding: '4px 8px', fontSize: 16, fontWeight: 700, borderRadius: 4, border: '2px solid #e74c3c', textAlign: 'right' }} />
            <span style={{ fontSize: 16, color: THEME.text }}>kg</span>
            {!isWarmup && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleConfirm();
                }}
                style={{
                  background: 'none',
                  border: `1px solid ${THEME.primary}`,
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '4px 8px',
                  color: '#ffffff',
                  lineHeight: 1,
                  fontWeight: 700
                }}
              >
                {t.save}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 18, color: '#ffffff' }}>{set.weight} kg</span>
            {set.pct && <span style={{ color: '#ffffff', fontSize: 12 }}>{Math.round(set.pct * 100)}%</span>}
            {!isWarmup && (
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
          </div>
        )}
      </div>
    </div>
  );
}


function BodyWeightModal({ onSave, onSkip, t }) {
  const [weight, setWeight] = useState('');
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: THEME.card, borderRadius: 12, padding: 24, maxWidth: 340, width: '90%' }}>
        <h3 style={{ margin: '0 0 16px', color: THEME.text }}>{t.updateBodyweight}</h3>
        <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, fontSize: 14 }}>{t.bodyweight} (kg)</label>
        <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder={t.exampleWeight} autoFocus
          style={{ width: '100%', padding: 10, fontSize: 16, borderRadius: 4, background: THEME.bg, color: THEME.text, border: `1px solid ${THEME.border}`, boxSizing: 'border-box', marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onSkip} style={{ flex: 1, padding: 10, fontSize: 14, background: 'transparent', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', color: THEME.muted }}>{t.cancel}</button>
          <button onClick={() => { const v = parseFloat(weight); if (!isNaN(v) && v > 0) onSave(v); else onSkip(); }}
            style={{ flex: 1, padding: 10, fontSize: 14, background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.border}`, color: 'white', border: `1px solid ${THEME.primary}`, borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>{t.save}</button>
        </div>
      </div>
    </div>
  );
}

function NewCycleModal({ prs, onStart, t }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: THEME.card, borderRadius: 12, padding: 24, maxWidth: 340, width: '90%' }}>
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 10 }}>🏆</div>
        <h3 style={{ margin: '0 0 8px', textAlign: 'center' }}>{t.cycleCompleted}</h3>
        <p style={{ color: THEME.muted, fontSize: 14, margin: '0 0 20px', textAlign: 'center' }}>{t.newCycleWeights}</p>
        <div style={{ background: THEME.card,
border: `1px solid ${THEME.border}`,
color: THEME.text, borderRadius: 8, padding: 12, marginBottom: 20 }}>
          {['Deadlift', 'Bench', 'Squat'].map(lift => (
            <div key={lift} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
              <span style={{ color: THEME.text, fontWeight: 700 }}>{lift} e1RM</span>
              <span style={{ fontWeight: 700 }}>{prs[lift] || '—'} kg</span>
            </div>
          ))}
        </div>
        <button onClick={onStart} style={{ width: '100%', padding: 14, fontSize: 16, background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.border}`, color: 'white', border: `1px solid ${THEME.primary}`, borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
          {t.startNewCycle} 🚀
        </button>
      </div>
    </div>
  );
}

function CurrentWorkout({ workout, currentCycle, totalWorkouts, onToggleWarmup, onToggleSet, onToggleAccessorySet, onToggleMeetWarmup, onToggleMeetSet, onMeetWeightChange, onWeightChange, onAccessoryWeightChange, onComplete, onViewAll, showNewCycle, newCyclePRs, onStartNewCycle, isReadOnly, t, timer, setTimer, startTimer }) {
  const [showBodyWeight, setShowBodyWeight] = useState(false);

  function isTimerFor(placement) {
    if (!timer || !timer.placement) return false;
    if (timer.placement.workoutNumber !== workout.number) return false;

    return Object.keys(placement).every(key => timer.placement[key] === placement[key]);
  }

  function renderInlineTimer(placement) {
    if (!isTimerFor(placement)) return null;

    return (
      <RestTimer
        key={timer.id}
        seconds={timer.seconds}
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
        Kelani SBD Tracker
      </h1>        
      <div style={{ background: THEME.card, padding: 40, borderRadius: 8 }}>
          <div style={{ fontSize: 48 }}>🎉</div>
          <h2>{t.deload}</h2>
          <p style={{ color: THEME.muted }}>{t.restReadyNextCycle}</p>
        </div>
        <button onClick={onStartNewCycle} style={{ marginTop: 16, width: '100%', padding: 14, fontSize: 16, background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.border}`, color: 'white', border: `1px solid ${THEME.primary}`, borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
          {t.startNewCycle}
        </button>
      </div>
    );
  }

    if (workout.type === 'meet') {
    const liftLabel = lift =>
      lift === 'Squat' ? t.squat :
      lift === 'Bench' ? t.bench :
      t.deadlift;

    const allMeetDone = (workout.lifts || []).every(liftBlock =>
      (liftBlock.sets || []).every(s => s.done)
    );

    const firstIncompleteLiftIndex = (workout.lifts || []).findIndex(liftBlock =>
      (liftBlock.warmups || []).some(w => !w.done) ||
      (liftBlock.sets || []).some(s => !s.done)
    );

    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '8px 12px 12px', paddingBottom: 16, fontFamily: 'sans-serif' }}>
        <h2 style={{ margin: '12px 0 8px', textAlign: 'center', fontSize: 24 }}>
          {t.workout} {workout.number} — {t.meetDay}
        </h2>

        <div style={{ textAlign: 'center', color: THEME.muted, fontSize: 13, marginBottom: 12 }}>
          {t.cycle} {currentCycle} · {t.workoutProgress} {workout.number} / {totalWorkouts} · {t.meetDay}
        </div>

        {(workout.lifts || []).map((liftBlock, li) => {
          const firstIncompleteWarmup = (liftBlock.warmups || []).findIndex(w => !w.done);
          const firstIncompleteSet = (liftBlock.sets || []).findIndex(s => !s.done);
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
                borderBottom: `1px solid ${THEME.border}`,
              }}>
                {liftLabel(liftBlock.lift)}
              </div>

              {(liftBlock.warmups || []).map((w, wi) => (
                <SetRow
                  key={`warmup-${wi}`}
                  set={w}
                  index={wi}
                  label={`${t.warmup} ${wi + 1}`}
                  isWarmup={true}
                  isActive={
                    !isReadOnly &&
                    li === firstIncompleteLiftIndex &&
                    wi === firstIncompleteWarmup
                  }
                  isReadOnly={isReadOnly}
                  onToggle={() => handleToggle(() => onToggleMeetWarmup(li, wi))}
                  t={t}
                />
              ))}

              {(liftBlock.sets || []).map((set, si) => (
                <SetRow
                  key={`attempt-${si}`}
                  set={set}
                  index={si}
                  label={set.labelKey ? t[set.labelKey] : `${t.set} ${si + 1}`}
                  isWarmup={false}
                  isActive={
                    !isReadOnly &&
                    li === firstIncompleteLiftIndex &&
                    allWarmupsDone &&
                    si === firstIncompleteSet
                  }
                  isReadOnly={isReadOnly}
                  onToggle={() => handleToggle(() => onToggleMeetSet(li, si))}
                  onWeightChange={val => onMeetWeightChange(li, si, val)}
                  t={t}
                />
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

function handleToggle(fn) {
  if (isReadOnly) return;
  fn();
}

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '8px 12px 12px', paddingBottom: 16, fontFamily: 'sans-serif' }}>
  
    <h2 style={{ margin: '12px 0 8px', textAlign: 'center', fontSize: 24 }}>

{t.workout} {workout.number} — {
  workout.lift === 'Squat' ? t.squat :
  workout.lift === 'Bench' ? t.bench :
  t.deadlift
}

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
  {t.cycle} {currentCycle} · {t.workoutProgress} {workout.number} / {totalWorkouts} · {getWorkoutTypeLabel(workout, t)}
</div>

      {(workout.warmups || []).length > 0 && (
        <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{
  padding: '8px 16px',
  fontSize: 16,
  fontWeight: 700,
  color: THEME.text
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
                isActive={!isReadOnly && i === workout.warmups.findIndex(wu => !wu.done)}
                isReadOnly={isReadOnly}
                onToggle={() => handleToggle(() => onToggleWarmup(i))}
                t={t}
              />
              {renderInlineTimer({ type: 'warmup', index: i })}
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{
  padding: '8px 16px',
  fontSize: 16,
  fontWeight: 700,
  color: THEME.text
}}>
  {workout.lift}
</div>
      {workout.sets.map((set, i) => {
  const allWarmupsDone = (workout.warmups || []).every(w => w.done);
  const firstIncomplete = workout.sets.findIndex(s => !s.done);

  return (
    <React.Fragment key={i}>
      <SetRow
        set={set}
        index={i}
        label={set.labelKey ? t[set.labelKey] : set.label || `${t.set} ${i + 1}`}
        isWarmup={false}
        isActive={!isReadOnly && allWarmupsDone && i === firstIncomplete}
        isReadOnly={isReadOnly}
        onToggle={() => handleToggle(() => onToggleSet(i))}
        onWeightChange={val => onWeightChange('set', i, val)}
        t={t}
      />
      {renderInlineTimer({ type: 'main', index: i })}
    </React.Fragment>
  );
})}
</div>

      {(workout.accessories || []).length > 0 && (
        <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          {workout.accessories.map((acc, ai) => (
            <div key={ai}>
<div style={{
  padding: '8px 16px',
  background: THEME.card,
  borderBottom: `1px solid ${THEME.border}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
}}>
<span style={{ fontWeight: 800, color: THEME.text }}>
  {acc.name}
</span>
                </div>
              {acc.done.map((done, si) => {
  const allMainSetsDone = (workout.sets || []).every(s => s.done);
  const firstIncompleteAccessoryGroup = (workout.accessories || []).findIndex(a =>
    (a.done || []).some(d => !d)
  );
  const firstIncompleteAccessorySet = (acc.done || []).findIndex(d => !d);

  return (
    <SetRow
      key={si}
      set={{ done, weight: acc.weights[si], reps: acc.reps }}
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
      onWeightChange={val => onAccessoryWeightChange(ai, si, val)}
      t={t}
    />
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
    ? `${t.completeWorkout}`
    : t.completeWorkout}
</button>

      {showNewCycle && <NewCycleModal prs={newCyclePRs} onStart={onStartNewCycle} t={t} />}
    </div>
  );
}

function StatsScreen({ history, bodyWeights, onBack, t }) {
const [activescreen, setActivescreen] = useState('lifts');
  const liftData = {};
  const totalData = [];
  const bodyData = [];
  const strengthData = [];
  const COLORS = {
  Squat: THEME.red,
  Bench: THEME.yellow,
  Deadlift: THEME.primary
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

  if (entry.lift && ['Deadlift', 'Bench', 'Squat'].includes(entry.lift)) {
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
  if (!entry.lift || !['Squat', 'Bench', 'Deadlift'].includes(entry.lift)) return;

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

bodyWeights.forEach(entry => {
  const workoutNumber = getEntryWorkoutNumber(entry);

  bodyData.push({
    label: getWorkoutLabel(entry),
    workoutNumber,
    absoluteWorkoutIndex: getAbsoluteWorkoutIndex(entry),
    gewicht: entry.bodyWeight,
  });
});

const sortedBodyWeights = [...bodyWeights].sort(
  (a, b) => getAbsoluteWorkoutIndex(a) - getAbsoluteWorkoutIndex(b)
);

function getBodyWeightForWorkoutIndex(absoluteWorkoutIndex) {
  let latest = null;

  sortedBodyWeights.forEach(entry => {
    if (getAbsoluteWorkoutIndex(entry) <= absoluteWorkoutIndex) {
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

  function renderChart(data, dataKeys, colors) {
    if (!data || data.length === 0) {
      return (
        <p style={{ color: THEME.text, textAlign: 'center', padding: 20 }}>
          Nog geen data — voltooi workouts om grafieken te zien.
        </p>
      );
    }

    const allXTicks = [...new Set(
      data
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

    const labelByX = data.reduce((labels, item) => {
      labels[item.absoluteWorkoutIndex] = item.label;
      return labels;
    }, {});

    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
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
  formatter={(value, name) => {
    if (name === 'gewicht') return [value, t.bodyweight];
    if (name === 'strength') return [value, t.strength];
    if (name === 'oneRM') return [value, '1RM'];
    if (name === 'e1rm') return [value, 'e1RM'];
    return [value, name];
  }}
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
  name={
    key === 'oneRM' ? '1RM' : 
    key === 'e1rm' ? 'e1RM' : 
    key === 'gewicht' ? t.weight :
    key === 'strength' ? t.strength :
    key
  }
/>
))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 12, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>{t.stats}</h2>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['lifts', 'totaal', 'lichaam', 'kracht'].map(screen => (
  <button
    key={screen}
    onClick={() => setActivescreen(screen)}
    style={{
  flex: 1,
  padding: '8px 0',
  fontSize: 16,
  background: THEME.card,
  color: activescreen === screen ? THEME.primary : THEME.text,
  border: `1px solid ${THEME.border}`,
  borderTop: activescreen === screen
    ? `2px solid ${THEME.primary}`
    : `2px solid ${THEME.border}`,
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: activescreen === screen ? 600 : 400
}}
>
    {screen === 'lifts'
      ? t.lifts
      : screen === 'totaal'
      ? t.total
      : screen === 'lichaam'
      ? t.body
      : t.strength}
  </button>
))}   
</div>

      {activescreen === 'lifts' && (
  <div>
    {['Deadlift', 'Bench', 'Squat'].map(lift => {
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
      <h3 style={{ margin: '0 0 12px', color: COLORS[lift] }}>
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
        <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px' }}>{t.totalSBD}</h3>
          {renderChart(totalData, ['oneRM', 'e1rm'], [THEME.muted, THEME.primary])}
        </div>
      )}

      {activescreen === 'lichaam' && (
        <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px' }}>{t.bodyweight}</h3>
          {renderChart(bodyData, ['gewicht'], [THEME.yellow])}
        </div>
      )}
      {activescreen === 'kracht' && (
  <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16 }}>
    <h3 style={{ margin: '0 0 12px' }}>{t.strengthTotalBodyweight}</h3>
    {renderChart(strengthData, ['strength'], [THEME.primary])}
  </div>
)}
    </div>
  );
}

function AllWorkouts({ workouts, currentIndex, currentCycle, onSelect, onBack, onStats, t }) {
  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 12, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, flex: 1 }}>{t.program}</h2>
        <div style={{ color: THEME.muted, fontSize: 13, marginTop: 4 }}>
          {t.cycle} {currentCycle} · {t.workoutProgress} {Math.min(currentIndex + 1, workouts.length)} / {workouts.length}
        </div>
      </div>
    {workouts.map((workout, idx) => {
  const isCurrent = idx === currentIndex;
  const isDone = idx < currentIndex;
  const headerBg = workout.type === 'rest' ? THEME.brown : THEME.border;

  return (
    <div
      key={workout.number}
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
          {workout.type === 'rest' ? t.deload : workout.lift}
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

      <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
        {t.workoutProgress} {workout.number} / {workouts.length} · {getWorkoutTypeLabel(workout, t)}
      </div>

      </div>

      {isDone && <span style={{ color: THEME.primary, fontSize: 18 }}>✅</span>}
    </div>
  );
})}
    </div>
  );
}

function Onboarding({ onStart, t }) {
  const [squat, setSquat] = useState('');
  const [bench, setBench] = useState('');
  const [deadlift, setDeadlift] = useState('');
  function handleStart() {
    const s = parseFloat(squat), b = parseFloat(bench), d = parseFloat(deadlift);
    if (!s || !b || !d) { alert('Vul alle 1RM waarden in!'); return; }
    onStart(s, b, d);
  }
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
      Kelani SBD Tracker
    </h1>

    <div style={{
      background: THEME.card,
      padding: 24,
      borderRadius: 8,
      border: `1px solid ${THEME.border}`
    }}>
      <h2 style={{ marginTop: 0, color: THEME.text }}>
        {t.enter1RM}
      </h2>

      {[[t.squat, squat, setSquat], [t.bench, bench, setBench], [t.deadlift, deadlift, setDeadlift]].map(([label, val, setter]) => (
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
  { key: 'stats', label: t.progress },
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
  return localStorage.getItem('language') || 'nl';
});

const [timer, setTimer] = useState(null);

function startTimer(seconds, placement = null) {
  setTimer({
    id: Date.now(),
    seconds,
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
  const [history, setHistory] = useState([]);
  const [prs, setPrs] = useState({});
  const [accessoryPRs, setAccessoryPRs] = useState({});
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [completedWorkout, setCompletedWorkout] = useState(null);
  const [completedWorkoutIndex, setCompletedWorkoutIndex] = useState(null);
  const [completedSummary, setCompletedSummary] = useState(null);
  const [currentCycle, setCurrentCycle] = useState(1);
  const [bodyWeights, setBodyWeights] = useState([]);
  const [showBodyWeightModal, setShowBodyWeightModal] = useState(false);
  const currentIndex = getCompletedWorkoutCount(history, currentCycle);
  const PROGRAM_VERSION = 'cube-27-v1';

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
    const generatedWorkouts = generateProgram(squat, bench, deadlift);
    const savedInProgress = data.inProgress || null;

    const canRestoreInProgress =
      savedInProgress &&
      savedInProgress.programVersion === PROGRAM_VERSION &&
      savedInProgress.currentCycle === savedCycle &&
      Array.isArray(savedInProgress.workouts) &&
      savedInProgress.workouts.length === generatedWorkouts.length;

    const restoredWorkouts = canRestoreInProgress
      ? savedInProgress.workouts
      : hydrateWorkoutsWithHistory(generatedWorkouts, savedHistory, savedCycle);

    setWorkouts(restoredWorkouts);
    setHistory(savedHistory);
    setPrs(savedPrs);
    setAccessoryPRs(data.accessoryPRs || {});
    setCurrentCycle(savedCycle);
    setBodyWeights(normalizeBodyWeights(data));

    setSelectedIndex(
      canRestoreInProgress
        ? savedInProgress.selectedIndex || 0
        : getCompletedWorkoutCount(savedHistory, savedCycle)
    );
  
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
    inProgress: {
      programVersion: PROGRAM_VERSION,
      currentCycle,
      selectedIndex,
      workouts,
    },
  }));
}, [history, prs, accessoryPRs, currentCycle, bodyWeights, selectedIndex, workouts]);

function handleStart(s, b, d) {
  localStorage.removeItem('kel-powerlifting');
  localStorage.removeItem('app_version');

  setWorkouts(generateProgram(s, b, d));
  setSelectedIndex(0);

  setHistory([
  {
    workoutNumber: 0,
    lift: 'Squat',
    topWeight: s,
    topReps: 1,
    e1rm: s,
    date: new Date().toLocaleDateString('nl-NL'),
  },
  {
    workoutNumber: 0,
    lift: 'Bench',
    topWeight: b,
    topReps: 1,
    e1rm: b,
    date: new Date().toLocaleDateString('nl-NL'),
  },
  {
    workoutNumber: 0,
    lift: 'Deadlift',
    topWeight: d,
    topReps: 1,
    e1rm: d,
    date: new Date().toLocaleDateString('nl-NL'),
  }
]);

  setPrs({ Squat: s, Bench: b, Deadlift: d });
  setAccessoryPRs({});
  setShowNewCycle(false);
  setScreen('dashboard');
}

function handleResetApp() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('kel-powerlifting');
  localStorage.removeItem('app_version');
  localStorage.removeItem('bodyweight_prompt_date');

  setWorkouts([]);
  setSelectedIndex(0);
  setHistory([]);
  setPrs({});
  setAccessoryPRs({});
  setShowNewCycle(false);
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
  const newWorkouts = generateProgram(prs.Squat, prs.Bench, prs.Deadlift);

  setCurrentCycle(nextCycle);
  setWorkouts(newWorkouts);
  setSelectedIndex(0);
  setCompletedWorkout(null);
  setCompletedSummary(null);
  setShowNewCycle(false);
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

function toggleWarmup(wIndex) {
  const workout = workouts[selectedIndex];
  if (shouldStartRestTimerAfterToggle(workout, 'warmup', wIndex)) {
    startTimer(getRestTime((workout.sets || [])[0]?.reps || 3), {
      workoutNumber: workout.number,
      type: 'warmup',
      index: wIndex,
    });
  } else {
    setTimer(null);
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

function toggleSet(setIndex) {
  const workout = workouts[selectedIndex];
  const set = workout.sets?.[setIndex];

  if (shouldStartRestTimerAfterToggle(workout, 'main', setIndex)) {
    startTimer(getRestTime(set.reps), {
      workoutNumber: workout.number,
      type: 'main',
      index: setIndex,
    });
  } else {
    setTimer(null);
  }

  setWorkouts(prev =>
    prev.map((w, wi) =>
      wi !== selectedIndex
        ? w
        : {
            ...w,
            sets: w.sets.map((s, si) =>
              si === setIndex ? { ...s, done: !s.done } : s
            ),
          }
    )
  );
}

function toggleAccessorySet(accIndex, setIndex) {
  const workout = workouts[selectedIndex];
  const acc = workout.accessories?.[accIndex];

  if (shouldStartRestTimerAfterToggle(workout, 'accessory', setIndex, accIndex)) {
    startTimer(getRestTime(acc.reps), {
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
          sets: w.sets.map((s, i) => i === index ? { ...s, weight: val } : s),
        };
      }

      return w;
    })
  );
}

function toggleMeetWarmup(liftIndex, warmupIndex) {
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
  return (workout.lifts || []).some((liftBlock, li) => {
    if (li < liftIndex) return false;
    if (li > liftIndex) return (liftBlock.sets || []).some(s => !s.done);

    return (liftBlock.sets || []).some((s, si) => si > setIndex && !s.done);
  });
}

function toggleMeetSet(liftIndex, setIndex) {
  const workout = workouts[selectedIndex];

  if (hasMoreMeetSets(workout, liftIndex, setIndex)) {
    startTimer(getRestTime(), {
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
              si === setIndex ? { ...s, done: !s.done } : s
            ),
          };
        }),
      };
    })
  );
}

function changeMeetWeight(liftIndex, setIndex, val) {
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
              si === setIndex ? { ...s, weight: val } : s
            ),
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

          return {
            ...a,
            weights: a.weights.map((wt, i) => i === setIndex ? val : wt),
          };
        }),
      };
    })
  );
}

  function completeWorkout() {  
    
    setTimer(null);
    
    const workout = workouts[selectedIndex];
    const finishedWorkout = JSON.parse(JSON.stringify(workout));

    if (workout.type === 'meet') {
  const today = new Date().toLocaleDateString('nl-NL');

  const results = (workout.lifts || []).map(liftBlock => {
    const sets = liftBlock.sets || [];

    const topSet = sets.reduce(
      (best, s) =>
        epley(Number(s.weight) || 0, Number(s.reps) || 0) >
        epley(Number(best.weight) || 0, Number(best.reps) || 0)
          ? s
          : best,
      sets[0]
    );

    const oneRMToday = sets.length
      ? Math.max(...sets.map(s => Number(s.weight) || 0))
      : 0;

    const e1RMToday = sets.length
      ? Math.max(...sets.map(s => epley(Number(s.weight) || 0, Number(s.reps) || 0)))
      : 0;

    const previousBestE1RM = Math.max(
      0,
      ...history
        .filter(h => h.lift === liftBlock.lift && h.workoutNumber !== workout.number)
        .map(h => Number(h.e1rm) || 0)
    );

    const previousBest1RM = Math.max(
      0,
      ...history
        .filter(h => h.lift === liftBlock.lift && h.workoutNumber !== workout.number)
        .map(h => Number(h.topWeight) || 0)
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

  setCompletedSummary({
    type: 'meet',
    results,
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
    workoutSnapshot: finishedWorkout,
  }));

  const nextHistory = [...withoutCurrentMeet, ...newEntries];

  setHistory(nextHistory);
  setPrs(calculatePrsFromHistory(nextHistory));

  setCompletedWorkout(finishedWorkout);
  setCompletedWorkoutIndex(selectedIndex);
  setSelectedIndex(Math.min(currentIndex + 1, workouts.length - 1));
  setShowNewCycle(true);
  setScreen('completed');

  return;

}
  
    if (workout.type === 'training' && ['Deadlift', 'Bench', 'Squat'].includes(workout.lift)) {
    const sets = workout.sets || [];

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

  if (workout.accessories) {
    workout.accessories.forEach(acc => {
      const bestWeight = Math.max(...acc.weights);
      const name = acc.name;

      setAccessoryPRs(prev => {
        const current = prev[name] || 0;
        return bestWeight > current ? { ...prev, [name]: bestWeight } : prev;
      });
    });
  }

  setCompletedWorkout(finishedWorkout);
  setCompletedWorkoutIndex(selectedIndex);

  setSelectedIndex(Math.min(currentIndex + 1, workouts.length - 1));

  setScreen('completed');
}
function selectWorkout(idx) {
  setSelectedIndex(idx);
  setScreen('current');
}

if (screen === 'onboarding') return <Onboarding onStart={handleStart} t={t}/>;

if (screen !== 'onboarding' && !workouts.length) {
  return <Onboarding onStart={handleStart} t={t}/>;
}

if (screen === 'current' && !workouts[selectedIndex]) {
  return <Onboarding onStart={handleStart} t={t}/>;
}

function saveBodyWeight(bw) {
  const today = new Date().toLocaleDateString('nl-NL');

  setBodyWeights(prev => [
    ...prev.filter(entry => entry.date !== today),
    {
      workoutNumber: currentIndex,
      cycle: currentCycle,
      date: today,
      timestamp: new Date().toISOString(),
      bodyWeight: bw,
    },
  ]);

  setShowBodyWeightModal(false);
}

function skipBodyWeight() {
  setShowBodyWeightModal(false);
}

function updateBodyWeight() {
  setShowBodyWeightModal(true);
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

const latestBodyWeightEntry = [...bodyWeights].slice(-1)[0];
const latestBodyWeight = latestBodyWeightEntry?.bodyWeight || null;

const strengthRatio = latestBodyWeight
  ? Math.round((totalE1RM / latestBodyWeight) * 100) / 100
  : null;

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
          onToggleWarmup={toggleWarmup}
          onToggleSet={toggleSet}
          onToggleAccessorySet={toggleAccessorySet}
          onWeightChange={changeWeight}
          onAccessoryWeightChange={changeAccessoryWeight}
          onComplete={completeWorkout}
          onViewAll={() => setScreen('all')}
          showNewCycle={showNewCycle}
          newCyclePRs={prs}
          onStartNewCycle={handleStartNewCycle}
          t={t}
          timer={timer}
          setTimer={setTimer}
          onToggleMeetWarmup={toggleMeetWarmup}
          onToggleMeetSet={toggleMeetSet}
          onMeetWeightChange={changeMeetWeight}
        />
      )}

      {screen === 'dashboard' && (
  <div style={{ maxWidth: 500, margin: '0 auto', padding: 16, background: THEME.bg, minHeight: '100vh', color: THEME.text }}>
    <h2 style={{ marginTop: 0, textAlign: 'center' }}>{t.dashboard}</h2>
    <div style={{ textAlign: 'center', color: THEME.muted, fontSize: 13, marginBottom: 12 }}>
      {t.cycle} {currentCycle} · {t.workoutProgress} {Math.min(currentIndex + 1, workouts.length)} / {workouts.length}
    </div>
    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
      {[
        [t.squat, THEME.red, best1RMs.Squat, bestE1RMs.Squat],
        [t.bench, THEME.yellow, best1RMs.Bench, bestE1RMs.Bench],
        [t.deadlift, THEME.primary, best1RMs.Deadlift, bestE1RMs.Deadlift],
      ].map(([lift, color, oneRM, e1RM]) => (
        <div key={lift} style={{ marginBottom: lift === t.deadlift ? 0 : 12 }}>
          <div style={{ marginBottom: 6 }}>
            <strong style={{ color }}>{lift}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: THEME.text, fontWeight: 700 }}>1RM:</span>
            <strong>{oneRM ? `${oneRM} kg` : '—'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: THEME.text, fontWeight: 700 }}>e1RM:</span>
            <strong>{e1RM ? `${e1RM} kg` : '—'}</strong>
          </div>
        </div>
      ))}
    </div>

    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: THEME.text, fontWeight: 700 }}>{t.total1rm}</span>
        <strong style={{ color: THEME.red }}>{total1RM ? `${total1RM} kg` : '—'}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: THEME.text, fontWeight: 700 }}>{t.totalE1rm}</span>
        <strong style={{ color: THEME.yellow }}>{totalE1RM ? `${totalE1RM} kg` : '—'}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: THEME.text, fontWeight: 700 }}>{t.strength}</span>
        <strong style={{ color: THEME.primary }}>{strengthRatio || '—'}</strong>
      </div>
    </div>

    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: THEME.text, fontWeight: 700 }}>{t.bodyweight}</span>
        <strong>{latestBodyWeight ? `${latestBodyWeight} kg` : '—'}</strong>
      </div>
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
          t={t}
        />
      )}

      {screen === 'stats' && (
        <StatsScreen
          history={history}
          bodyWeights={bodyWeights}
          onBack={() => setScreen('all')}
          t={t}
        />
)}

      {screen === 'settings' && (
       <div style={{ maxWidth: 500, margin: '0 auto', padding: 12, fontFamily: 'sans-serif' }}>
  <h2 style={{ marginTop: 0 }}>{t.settings}</h2>
  <button
  onClick={updateBodyWeight}
  style={{
    width: '100%',
    padding: 14,
    fontSize: 16,
    fontWeight: 600,
    background: THEME.card,
    color: '#ffffff',
    border: `1px solid ${THEME.border}`,
    borderRadius: 8,
    cursor: 'pointer',
    marginBottom: 12
  }}
>
  {t.updateBodyweight}
</button>

  <button
    onClick={handleResetApp}
    style={{
      width: '100%',
      padding: 14,
      fontSize: 16,
      fontWeight: 600,
      background: THEME.card,
      color: '#ffffff',
      border: `1px solid ${THEME.border}`,
      borderRadius: 8,
      cursor: 'pointer'
    }}
  >
    {t.restart}
  </button>
  <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 700 }}>
  {t.language}
</div>
<div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
  {['ca','en','nl'].map(l => (
    <button
      key={l}
      onClick={() => setLanguage(l)}
      style={{
        flex: 1,
        padding: 10,
        fontSize: 14,
        fontWeight: 600,
        borderRadius: 8,
        cursor: 'pointer',
        border: `1px solid ${language === l ? THEME.primary : THEME.border}`,
        background: language === l ? THEME.primary : THEME.card,
        color: '#ffffff'
      }}
    >
      {l.toUpperCase()}
    </button>
  ))}
</div>
<div style={{
  marginTop: 32,
  paddingTop: 12,
  borderTop: `1px solid ${THEME.border}`,
  textAlign: 'center',
  color: THEME.muted,
  fontSize: 12
}}>
  Kelani SBD Tracker · v{process.env.REACT_APP_VERSION ?? 'dev'}
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
    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>

      <h2 style={{ margin: '0 0 8px', color: THEME.text }}>{t.workoutCompleted}</h2>

<p style={{ color: THEME.muted, margin: '0 0 12px' }}>
  {t.goodJobSaved}
</p>

<div style={{
  background: THEME.card,
  border: `1px solid ${THEME.border}`,
  color: THEME.text,
  borderRadius: 8,
  padding: 12,
  marginBottom: 20,
  textAlign: 'left'
}}>

{(() => {
  const row = (label, value, isPR) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ color: THEME.text, fontWeight: 700 }}>{label}</span>
      <strong style={{ color: '#ffffff' }}>
        {value} kg {isPR ? '🚀' : ''}
      </strong>
    </div>
  );

  if (completedWorkout?.type === 'meet') {
    const liftLabel = lift =>
      lift === 'Squat' ? t.squat :
      lift === 'Bench' ? t.bench :
      t.deadlift;

    return (
      <>
        {(completedSummary?.results || []).map(result => (
          <div key={result.lift} style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 800, color: THEME.primary, marginBottom: 6 }}>
              {liftLabel(result.lift)}
            </div>
            {row(t.oneRMToday, result.oneRMToday, result.is1RMPR)}
            {row(t.e1RMToday, result.e1RMToday, result.isE1RMPR)}
            {row(t.best1RM, result.best1RM, result.is1RMPR)}
            {row(t.bestE1RM, result.bestE1RM, result.isE1RMPR)}
          </div>
        ))}
      </>
    );
  }

  const sets = completedWorkout?.sets || [];

  const oneRMToday = sets.length
    ? Math.max(...sets.map(s => Number(s.weight) || 0))
    : 0;

  const e1RMToday = sets.length
      ? Math.max(...sets.map(s => epley(Number(s.weight) || 0, Number(s.reps) || 0)))
  : 0;

  const best1RM = completedSummary?.best1RM || oneRMToday;
  const bestE1RM = completedSummary?.bestE1RM || completedSummary?.e1rm || e1RMToday;

  const is1RMPR = oneRMToday >= best1RM && oneRMToday > 0;
  const isE1RMPR = e1RMToday >= bestE1RM && e1RMToday > 0;

  return (
    <>
      {row(t.oneRMToday, oneRMToday, is1RMPR)}
      {row(t.e1RMToday, e1RMToday, isE1RMPR)}
      {row(t.best1RM, Math.max(best1RM, oneRMToday), is1RMPR)}
      {row(t.bestE1RM, Math.max(bestE1RM, e1RMToday), isE1RMPR)}
    </>
  );
})()}

</div>

<div style={{ background: THEME.card,
border: `1px solid ${THEME.border}`,
color: THEME.text, borderRadius: 8, padding: 16, marginBottom: 20, textAlign: 'left' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
    <span style={{ color: THEME.text, fontWeight: 700 }}>{t.lift}</span>
    <strong>{completedWorkout?.lift || '—'}</strong>
  </div>

  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
    <span style={{ color: THEME.text, fontWeight: 700 }}>{t.workout}</span>
    <strong>{completedWorkout?.number || '—'}</strong>
  </div>

  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
    <span style={{ color: THEME.text, fontWeight: 700 }}>{t.cycle}</span>
    <strong>{currentCycle}</strong>
  </div>

<div style={{ fontSize: 16, fontWeight: 700, color: THEME.muted, marginBottom: 10 }}>
  {completedWorkout?.lift || '—'}
</div>

{(completedWorkout?.sets || []).map((set, i) => {
  return (
    <div
  key={i}
  style={{
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 12px',
    color: '#ffffff'
  }}
>
  <span style={{ color: '#ffffff', fontWeight: 700 }}>
    {set.label || `${t.set} ${i + 1}`} — {set.reps} {t.reps}
  </span>

  <strong style={{ color: '#ffffff' }}>
    {set.weight} kg
  </strong>
</div>
  );
})}
</div>

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
  setSelectedIndex(completedWorkoutIndex);
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
  </div>
)}
    {showBodyWeightModal && (
  <BodyWeightModal
    onSave={saveBodyWeight}
    onSkip={skipBodyWeight}
    t={t}
  />
)}

{showNewCycle && screen === 'completed' && (
  <NewCycleModal
    prs={prs}
    onStart={handleStartNewCycle}
    t={t}
  />
)}

      <BottomNav screen={screen} onChange={changeScreen} t={t} />
    </div>
  );
}