import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const show = v => (v === null || v === undefined ? '—' : v);
const APP_BUILD = '0.5.4-storage-fix';
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

const ACCESSORIES = {
  Squat: [
    { name: 'Romanian Deadlift', sets: 3, reps: 10, pct: 0.40, lift: 'squat', alternative: null },
    { name: 'Leg Press', sets: 3, reps: 12, pct: 0.50, lift: 'squat', alternative: { name: 'Bulgarian Split Squat', pct: 0.30, lift: 'squat' } },
  ],
  Bench: [
    { name: 'Triceps Pushdown', sets: 3, reps: 12, pct: 0.30, lift: 'bench', alternative: { name: 'Skull Crushers', pct: 0.20, lift: 'bench' } },
    { name: 'Dumbbell Row', sets: 3, reps: 10, pct: 0.35, lift: 'bench', alternative: { name: 'Barbell Row', pct: 0.35, lift: 'bench' } },
  ],
  Deadlift: [
    { name: 'Good Morning', sets: 3, reps: 10, pct: 0.25, lift: 'deadlift', alternative: null },
    { name: 'Pull-ups', sets: 3, reps: 8, pct: 0, lift: null, alternative: { name: 'Barbell Row', pct: 0.30, lift: 'deadlift' } },
  ],
};

function getRestTime(reps) {
  if (reps <= 5) return 300;
  if (reps <= 10) return 180;
  return 90;
}

function epley(weight, reps) {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

function generateWarmups(firstWorkWeight) {
  const warmups = [];
  let w = 20;
  while (true) {
    if (firstWorkWeight - w >= 25) {
      warmups.push({ weight: w, reps: 5, isWarmup: true, done: false });
      w += 50;
    } else {
      break;
    }
  }
  return warmups;
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
    { day: 1, lift: 'Deadlift', blocks: [{ sets: 5, reps: 2, pct: 0.80 }] },
    { day: 3, lift: 'Bench', blocks: [{ sets: 3, reps: 12, pct: 0.70 }] },
    { day: 5, lift: 'Squat', blocks: [{ sets: 8, reps: 3, pct: 0.65 }] },

    { day: 8, lift: 'Deadlift', blocks: [{ sets: 8, reps: 3, pct: 0.65 }] },
    { day: 10, lift: 'Bench', blocks: [{ sets: 5, reps: 2, pct: 0.80 }] },
    { day: 12, lift: 'Squat', blocks: [{ sets: 3, reps: 12, pct: 0.70 }] },

    { day: 15, lift: 'Deadlift', blocks: [{ sets: 3, reps: 12, pct: 0.70 }] },
    { day: 17, lift: 'Bench', blocks: [{ sets: 8, reps: 3, pct: 0.65 }] },
    { day: 19, lift: 'Squat', blocks: [{ sets: 5, reps: 2, pct: 0.80 }] },

    { day: 22, lift: 'Deadlift', blocks: [{ sets: 3, reps: 2, pct: 0.85 }] },
    { day: 24, lift: 'Bench', blocks: [{ sets: 3, reps: 8, pct: 0.80 }] },
    { day: 26, lift: 'Squat', blocks: [{ sets: 6, reps: 2, pct: 0.70 }] },

    { day: 29, lift: 'Deadlift', blocks: [{ sets: 6, reps: 2, pct: 0.70 }] },
    { day: 31, lift: 'Bench', blocks: [{ sets: 3, reps: 2, pct: 0.85 }] },
    { day: 33, lift: 'Squat', blocks: [{ sets: 3, reps: 8, pct: 0.80 }] },

    { day: 36, lift: 'Deadlift', blocks: [{ sets: 3, reps: 8, pct: 0.80 }] },
    { day: 38, lift: 'Bench', blocks: [{ sets: 6, reps: 2, pct: 0.70 }] },
    { day: 40, lift: 'Squat', blocks: [{ sets: 3, reps: 2, pct: 0.85 }] },

    { day: 43, lift: 'Deadlift', blocks: [
      { sets: 1, reps: 2, pct: 0.90 },
      { sets: 1, reps: 1, pct: 0.925 },
      { sets: 1, reps: 1, pct: 0.95 },
      { sets: 1, reps: 'AMRAP', pct: 0.80 },
    ]},
    { day: 45, lift: 'Bench', blocks: [{ sets: 3, reps: 5, pct: 0.85 }] },
    { day: 47, lift: 'Squat', blocks: [{ sets: 5, reps: 2, pct: 0.75 }] },

    { day: 50, lift: 'Deadlift', blocks: [{ sets: 5, reps: 2, pct: 0.75 }] },
    { day: 52, lift: 'Bench', blocks: [
      { sets: 1, reps: 2, pct: 0.90 },
      { sets: 1, reps: 1, pct: 0.925 },
      { sets: 1, reps: 1, pct: 0.95 },
      { sets: 1, reps: 'AMRAP', pct: 0.80 },
    ]},
    { day: 54, lift: 'Squat', blocks: [{ sets: 3, reps: 5, pct: 0.85 }] },

    { day: 57, lift: 'Deadlift', blocks: [{ sets: 3, reps: 5, pct: 0.85 }] },
    { day: 59, lift: 'Bench', blocks: [{ sets: 5, reps: 2, pct: 0.75 }] },
    { day: 61, lift: 'Squat', blocks: [
      { sets: 1, reps: 2, pct: 0.90 },
      { sets: 1, reps: 1, pct: 0.925 },
      { sets: 1, reps: 1, pct: 0.95 },
      { sets: 1, reps: 'AMRAP', pct: 0.80 },
    ]},
  ];

  const workouts = [];
  let num = 1;

  program.forEach(day => {
    const sets = [];

    day.blocks.forEach(block => {
      for (let i = 0; i < block.sets; i++) {
        sets.push({
          reps: block.reps,
          pct: block.pct,
          weight: round25(oneRMs[day.lift] * block.pct),
          done: false,
        });
      }
    });

    const firstWorkWeight = sets.length ? sets[0].weight : 20;
    const warmups = generateWarmups(firstWorkWeight);

    const accessories = ACCESSORIES[day.lift].map(a => {
      const baseMap = { squat: s, bench: b, deadlift: d };
      const baseWeight = a.lift ? round25(baseMap[a.lift] * a.pct) : 0;
      const altLift = a.alternative?.lift || a.lift;
      const altPct = a.alternative?.pct || a.pct;
      const altBaseWeight = altLift ? round25(baseMap[altLift] * altPct) : 0;

      return {
        ...a,
        weight: baseWeight,
        done: Array(a.sets).fill(false),
        weights: Array(a.sets).fill(baseWeight),
        useAlternative: false,
        alternativeWeight: a.alternative ? altBaseWeight : 0,
      };
    });

    workouts.push({
      number: num++,
      day: day.day,
      type: 'training',
      lift: day.lift,
      warmups,
      sets,
      accessories,
    });
  });

  workouts.push({
    number: num++,
    type: 'rest',
    lift: null,
    warmups: [],
    sets: [],
    accessories: [],
  });

  return workouts;
}

const MODE_LABEL = { heavy: 'Zwaar', explosive: 'Explosief', rep: 'Repetitie', peak: 'Peak' };
const MODE_COLOR = { heavy: '#e67e22', explosive: '#27ae60', rep: '#2980b9', peak: '#8e44ad' };
const HEADER_COLOR = { 1: '#2c3e50', 2: '#1a5276', 3: '#154360', peak: '#8e44ad', rest: '#95a5a6' };

function RestTimer({ seconds, onDismiss }) {
  const [remaining, setRemaining] = useState(seconds);
  const intervalRef = useRef(null);
  const hasBeepedRef = useRef(false);
  useEffect(() => { setRemaining(seconds); hasBeepedRef.current = false; }, [seconds]);
  useEffect(() => {
    if (remaining <= 0) {
      clearInterval(intervalRef.current);
      if (!hasBeepedRef.current) { hasBeepedRef.current = true; playBeep(); }
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
    } catch(e) {}
  }
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = remaining / seconds;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const isDone = remaining <= 0;
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: THEME.card, borderTop: `1px solid ${THEME.border}`, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -2px 12px rgba(0,0,0,0.1)', zIndex: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <svg width="60" height="60" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="30" cy="30" r={radius * 0.9} fill="none" stroke="#eee" strokeWidth="5" />
          <circle cx="30" cy="30" r={radius * 0.9} fill="none" stroke={isDone ? '#27ae60' : '#e74c3c'} strokeWidth="5"
            strokeDasharray={`${circumference * 0.9} ${circumference * 0.9}`}
            strokeDashoffset={(circumference * 0.9) * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        <div>
          <div style={{ fontSize: isDone ? 16 : 28, fontWeight: 700, color: isDone ? '#27ae60' : '#222', fontFamily: 'monospace' }}>
            {isDone ? 'Klaar voor volgende set!' : `${mins}:${String(secs).padStart(2, '0')}`}
          </div>
          {!isDone && <div style={{ fontSize: 12, color: THEME.text }}>Rusttijd</div>}
        </div>
      </div>
      <button onClick={onDismiss} style={{ padding: '8px 20px', fontSize: 14, background: isDone ? '#27ae60' : 'transparent', color: isDone ? 'white' : '#666', border: `1px solid ${isDone ? '#27ae60' : '#ccc'}`, borderRadius: 4, cursor: 'pointer', fontWeight: isDone ? 600 : 400 }}>
        {isDone ? 'Doorgaan' : 'Overslaan'}
      </button>
    </div>
  );
}

function SetRow({ set, index, label, onToggle, onWeightChange, isWarmup, isActive, isReadOnly }) {
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
    if (!isNaN(val) && val > 0) onWeightChange(val);
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
    border: `2px solid ${set.done ? '#27ae60' : '#ccc'}`,
    background: set.done ? '#27ae60' : 'white',
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
        {set.done && <span style={{ color: 'white', fontSize: 14 }}>✓</span>}
      </div>
      <div onClick={onToggle} style={{ flex: 1, cursor: 'pointer' }}>
        <span style={{ fontWeight: 500, color: '#ffffff', textDecoration: set.done ? 'line-through' : 'none' }}>{label}</span>
        <span style={{ color: THEME.muted, fontSize: 18, fontWeight: 700, marginLeft: 12 }}>
  {set.reps} reps
</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input ref={inputRef} type="number" value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={handleKeyDown}
              style={{ width: 70, padding: '4px 8px', fontSize: 16, fontWeight: 700, borderRadius: 4, border: '2px solid #e74c3c', textAlign: 'right' }} />
            <span style={{ fontSize: 13, color: THEME.text }}>kg</span>
            <button onClick={handleConfirm} style={{ padding: '4px 10px', fontSize: 13, background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.border}`, color: 'white', border: `1px solid ${THEME.primary}`, borderRadius: 4, cursor: 'pointer' }}>✓</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 18, color: '#ffffff' }}>{set.weight} kg</span>
            {set.pct && <span style={{ color: '#ffffff', fontSize: 12 }}>{Math.round(set.pct * 100)}%</span>}
            <button onClick={handleEditClick} style={{ background: 'none', border: `1px solid ${THEME.primary}`, cursor: 'pointer', fontSize: 16, padding: '2px 4px', color: '#ffffff', lineHeight: 1 }}>✎</button>
          </div>
        )}
      </div>
    </div>
  );
}

function BodyWeightModal({ onSave, onSkip }) {
  const [weight, setWeight] = useState('');
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: THEME.card, borderRadius: 12, padding: 24, maxWidth: 340, width: '90%' }}>
        <h3 style={{ margin: '0 0 8px' }}>Workout voltooid! 💪</h3>
        <p style={{ color: THEME.muted, fontSize: 14, margin: '0 0 20px' }}>Wil je je lichaamsgewicht invoeren?</p>
        <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, fontSize: 14 }}>Lichaamsgewicht (kg)</label>
        <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="bijv. 85.5" autoFocus
          style={{ width: '100%', padding: 10, fontSize: 16, borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box', marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onSkip} style={{ flex: 1, padding: 10, fontSize: 14, background: 'transparent', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', color: THEME.muted }}>Overslaan</button>
          <button onClick={() => { const v = parseFloat(weight); if (!isNaN(v) && v > 0) onSave(v); else onSkip(); }}
            style={{ flex: 1, padding: 10, fontSize: 14, background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.border}`, color: 'white', border: `1px solid ${THEME.primary}`, borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Opslaan</button>
        </div>
      </div>
    </div>
  );
}

function NewCycleModal({ prs, onStart }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: THEME.card, borderRadius: 12, padding: 24, maxWidth: 340, width: '90%' }}>
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 10 }}>🏆</div>
        <h3 style={{ margin: '0 0 8px', textAlign: 'center' }}>Cyclus voltooid!</h3>
        <p style={{ color: THEME.muted, fontSize: 14, margin: '0 0 20px', textAlign: 'center' }}>Nieuwe gewichten berekend op basis van je beste prestaties.</p>
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
          Nieuwe cyclus starten 🚀
        </button>
      </div>
    </div>
  );
}

function CurrentWorkout({ workout, onToggleWarmup, onToggleSet, onToggleAccessorySet, onWeightChange, onAccessoryWeightChange, onToggleAlternative, onComplete, onViewAll, showNewCycle, newCyclePRs, onStartNewCycle, isReadOnly }) {
  const [timer, setTimer] = useState(null);
  const [showBodyWeight, setShowBodyWeight] = useState(false);

  if (workout.type === 'rest') {
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
     <h1 style={{ 
        textAlign: 'center', 
        marginTop: 40, 
        marginBottom: 24 
      }}>
        Kel Powerlifting
      </h1>        
      <div style={{ background: THEME.card, padding: 40, borderRadius: 8 }}>
          <div style={{ fontSize: 48 }}>🎉</div>
          <h2>Deload week</h2>
          <p style={{ color: THEME.muted }}>Rust en herstel. Je bent klaar voor de volgende cyclus!</p>
        </div>
        <button onClick={onStartNewCycle} style={{ marginTop: 16, width: '100%', padding: 14, fontSize: 16, background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.border}`, color: 'white', border: `1px solid ${THEME.primary}`, borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
          Nieuwe cyclus starten 🚀
        </button>
      </div>
    );
  }

  const allDone = (workout.sets || []).every(s => s.done);
  const allAccessoriesDone = (workout.accessories || []).every(a => (a.done || []).every(d => d));
  const headerBg = workout.type === 'peak' ? HEADER_COLOR.peak : HEADER_COLOR[workout.cycle];

  function handleToggle(fn, reps) {
    if (isReadOnly) return;
    setTimer(getRestTime(reps));
    fn();
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '8px 12px 12px', paddingBottom: timer !== null ? 100 : 16, fontFamily: 'sans-serif' }}>
  
    <h2 style={{ margin: '12px 0 8px', textAlign: 'center', fontSize: 24 }}>
  Workout {workout.number} — {workout.lift}
  {isReadOnly && (
    <span style={{
      marginLeft: 8,
      fontSize: 12,
      background: '#999',
      color: 'white',
      padding: '2px 6px',
      borderRadius: 4
    }}>
      Preview
    </span>
  )}
</h2>

      {(workout.warmups || []).length > 0 && (
        <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '10px 16px', background: THEME.card,
border: `1px solid ${THEME.border}`,
color: THEME.text, border: `1px solid ${THEME.border}`, fontWeight: 700, fontSize: 14, color: '#ffffff' }}>Warming-up</div>
          {workout.warmups.map((w, i) => (
            <SetRow
  key={i}
  set={w}
  index={i}
  label={`Warm-up ${i + 1}`}
  isWarmup={true}
  isActive={!isReadOnly && i === workout.warmups.findIndex(wu => !wu.done)}
  isReadOnly={isReadOnly}
  onToggle={() => handleToggle(() => onToggleWarmup(i), w.reps)}
  onWeightChange={val => onWeightChange('warmup', i, val)}
/>
          ))}
        </div>
      )}

      <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '10px 16px', background: THEME.card,
border: `1px solid ${THEME.border}`,
color: THEME.text, border: `1px solid ${THEME.border}`, fontWeight: 600, fontSize: 14, color: THEME.muted }}>
        {workout.lift}
      </div>  {workout.sets.map((set, i) => {
  const allWarmupsDone = (workout.warmups || []).every(w => w.done);
  const firstIncomplete = workout.sets.findIndex(s => !s.done);

  return (
    <SetRow
      key={i}
      set={set}
      index={i}
      label={set.label || `Set ${i + 1}`}
      isWarmup={false}
      isActive={!isReadOnly && allWarmupsDone && i === firstIncomplete}
      isReadOnly={isReadOnly}
      onToggle={() => handleToggle(() => onToggleSet(i), set.reps)}
      onWeightChange={val => onWeightChange('set', i, val)}
    />
  );
})}
</div>

      {(workout.accessories || []).length > 0 && (
        <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '10px 16px', background: THEME.card,
border: `1px solid ${THEME.border}`,
color: THEME.text, border: `1px solid ${THEME.border}`, fontWeight: 500, fontSize: 14 }}>Accessoires</div>
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
  <span style={{ fontWeight: 500, fontSize: 14, color: '#ffffff' }}>
    {acc.useAlternative ? acc.alternative.name : acc.name}
  </span>                {acc.alternative && (
                  <button onClick={() => onToggleAlternative(ai)} style={{ background: 'none', border: `1px solid ${THEME.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: THEME.text }}>
                    ⇄ {acc.useAlternative ? acc.name : acc.alternative.name}
                  </button>
                )}
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
      label={`Set ${si + 1}`}
      isWarmup={false}
      isActive={
        !isReadOnly &&
        allMainSetsDone &&
        ai === firstIncompleteAccessoryGroup &&
        si === firstIncompleteAccessorySet
      }
      isReadOnly={isReadOnly}
      onToggle={() => handleToggle(() => onToggleAccessorySet(ai, si), acc.reps)}
      onWeightChange={val => onAccessoryWeightChange(ai, si, val)}
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
    ? 'Preview (niet voltooibaar)'
    : allDone
    ? 'Workout voltooien ✓'
    : 'Workout voltooien'}
</button>

      {timer !== null && <RestTimer key={timer} seconds={timer} onDismiss={() => setTimer(null)} />}
      {showNewCycle && <NewCycleModal prs={newCyclePRs} onStart={onStartNewCycle} />}
    </div>
  );
}

function StatsScreen({ history, onBack }) {
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

history.forEach(entry => {
  const label = `W${entry.workoutNumber}`;

  if (entry.lift && ['Deadlift', 'Bench', 'Squat'].includes(entry.lift)) {
    if (!liftData[entry.lift]) liftData[entry.lift] = [];

    if (entry.workoutNumber === 0) {
      bestStats[entry.lift].oneRM = Math.max(bestStats[entry.lift].oneRM, entry.e1rm || 0);
    }

    bestStats[entry.lift].e1rm = Math.max(bestStats[entry.lift].e1rm, entry.e1rm || 0);

    liftData[entry.lift].push({
      label,
      oneRM: bestStats[entry.lift].oneRM || null,
      e1rm: bestStats[entry.lift].e1rm || null,
    });
  }

  if (entry.bodyWeight) {
    bodyData.push({ label, gewicht: entry.bodyWeight });
  }
});

const baselineSquat = history.find(h => h.workoutNumber === 0 && h.lift === 'Squat')?.e1rm || 0;
const baselineBench = history.find(h => h.workoutNumber === 0 && h.lift === 'Bench')?.e1rm || 0;
const baselineDeadlift = history.find(h => h.workoutNumber === 0 && h.lift === 'Deadlift')?.e1rm || 0;
const baselineTotal = baselineSquat + baselineBench + baselineDeadlift;

const bestPerLift = {};
history.forEach(entry => {
  if (!entry.lift || !['Squat', 'Bench', 'Deadlift'].includes(entry.lift)) return;

  if (!bestPerLift[entry.lift] || entry.e1rm > bestPerLift[entry.lift].e1rm) {
    bestPerLift[entry.lift] = { e1rm: entry.e1rm };
  }

  if (bestPerLift.Squat && bestPerLift.Bench && bestPerLift.Deadlift) {
    totalData.push({
      label: `W${entry.workoutNumber}`,
      oneRM: baselineTotal,
      e1rm:
        bestPerLift.Squat.e1rm +
        bestPerLift.Bench.e1rm +
        bestPerLift.Deadlift.e1rm,
    });
  }
});

const latestBodyWeightEntry = [...history]
  .filter(h => h.bodyWeight)
  .slice(-1)[0];

const latestBodyWeight = latestBodyWeightEntry?.bodyWeight || null;

if (latestBodyWeight) {
  totalData.forEach(entry => {
    strengthData.push({
      label: entry.label,
      strength: Math.round((entry.e1rm / latestBodyWeight) * 100) / 100,
    });
  });
}

  function renderChart(data, dataKeys, colors) {
    if (!data || data.length === 0) {
      return (
        <p style={{ color: THEME.text, textAlign: 'center', padding: 20 }}>
          Nog geen data — voltooi workouts om grafieken te zien.
        </p>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid stroke={THEME.border} />
          <XAxis
  stroke={THEME.text}
  tickFormatter={(value) => `W${value}`}
/>
          <YAxis stroke={THEME.text} />
          <Tooltip
  labelFormatter={(value) => `W${value}`}
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
  type="monotone"
  dataKey={key}
  stroke={colors[i] || THEME.primary}
  strokeWidth={2}
  dot={{ r: 3, fill: colors[i] || THEME.primary, stroke: colors[i] || THEME.primary }}
  activeDot={{ r: 5, fill: colors[i] || THEME.primary, stroke: '#ffffff' }}
  name={key === 'oneRM' ? '1RM' : key === 'e1rm' ? 'e1RM' : key}
/>
))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 12, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Statistieken</h2>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['lifts', 'totaal', 'lichaam', 'kracht'].map(screen => (
  <button
    key={screen}
    onClick={() => setActivescreen(screen)}
    style={{
  flex: 1,
  padding: '8px 0',
  fontSize: 13,
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
      ? 'Lifts'
      : screen === 'totaal'
      ? 'Totaal'
      : screen === 'lichaam'
      ? 'Lichaam'
      : 'Kracht'}
  </button>
))}   
</div>

      {activescreen === 'lifts' && (
  <div>
    {['Deadlift', 'Bench', 'Squat'].map(lift => (
      <div
        key={lift}
        style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}
      >
        <h3 style={{ margin: '0 0 12px', color: COLORS[lift] }}>{lift}</h3>
      {renderChart(liftData[lift] || [], ['oneRM', 'e1rm'], [THEME.muted, COLORS[lift]])}
      </div>
    ))}
  </div>
)}

      {activescreen === 'totaal' && (
        <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px' }}>Totaal (SBD)</h3>
          {renderChart(totalData, ['oneRM', 'e1rm'], [THEME.muted, THEME.primary])}
        </div>
      )}

      {activescreen === 'lichaam' && (
        <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px' }}>Lichaamsgewicht</h3>
          {renderChart(bodyData, ['gewicht'], [THEME.yellow])}
        </div>
      )}
      {activescreen === 'kracht' && (
  <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16 }}>
    <h3 style={{ margin: '0 0 12px' }}>Kracht (totaal / BW)</h3>
    {renderChart(strengthData, ['strength'], [THEME.primary])}
  </div>
)}
    </div>
  );
}

function AllWorkouts({ workouts, currentIndex, onSelect, onBack, onStats }) {
  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 12, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Programma</h2>
      </div>
    {workouts.map((workout, idx) => {
  const isCurrent = idx === currentIndex;
  const isDone = idx < currentIndex;
  const headerBg = workout.type === 'rest' ? THEME.brown : THEME.border;

  return (
    <div
      key={workout.number}
      onClick={() => onSelect(idx)}
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
        fontSize: 13,
        marginRight: 14,
        flexShrink: 0
      }}>
        {workout.number}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: isCurrent ? 700 : 500, color: isCurrent ? THEME.primary : '#ffffff' }}>
          {workout.type === 'rest' ? 'Deload' : workout.lift}
          {isCurrent && (
            <span style={{
              fontSize: 11,
              background: THEME.primary,
              color: '#ffffff',
              padding: '1px 6px',
              borderRadius: 3,
              marginLeft: 8
            }}>
              NU
            </span>
          )}
        </div>

        <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
          {workout.type === 'rest' ? 'Rust & herstel' : `Workout ${workout.number}`}
        </div>
      </div>

      {isDone && <span style={{ color: THEME.primary, fontSize: 18 }}>✓</span>}
    </div>
  );
})}
    </div>
  );
}

function Onboarding({ onStart }) {
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
      Kel Powerlifting
    </h1>

    <div style={{
      background: THEME.card,
      padding: 24,
      borderRadius: 8,
      border: `1px solid ${THEME.border}`
    }}>
      <h2 style={{ marginTop: 0, color: THEME.text }}>
        Voer je 1RM in
      </h2>

      {[['Squat', squat, setSquat], ['Bench Press', bench, setBench], ['Deadlift', deadlift, setDeadlift]].map(([label, val, setter]) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, color: THEME.text }}>
            {label}
          </label>

          <input
            type="number"
            value={val}
            onChange={e => setter(e.target.value)}
            placeholder="kg"
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
        Start programma
      </button>
    </div>
  </div>
);
}

function BottomNav({ screen, onChange }) {
  const items = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'all', label: 'Programma' },
    { key: 'current', label: 'Workout' },
    { key: 'stats', label: 'Vooruitgang' },
    { key: 'settings', label: 'Instellingen' },
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
          onClick={() => onChange(item.key)}
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
  const [bodyWeightToday, setBodyWeightToday] = useState(null);
    const currentIndex = history.filter(
    h => h.lift && h.workoutNumber > 0
  ).length;
  const APP_VERSION = '0.5.3';
  const PROGRAM_VERSION = 'cube-27-v1';

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

    setWorkouts(generateProgram(squat, bench, deadlift));
    setHistory(data.history || []);
    setPrs(savedPrs);
    setAccessoryPRs(data.accessoryPRs || {});
    setCurrentCycle(data.currentCycle || 1);
    setBodyWeightToday(data.bodyWeightToday || null);

    setSelectedIndex(
    (data.history || []).filter(
        h => h.lift && h.workoutNumber > 0
    ).length
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
    bodyWeightToday
  }));
}, [history, prs, accessoryPRs, currentCycle, bodyWeightToday]);

useEffect(() => {
  if (screen === 'onboarding') return;
  if (workouts.length === 0) return;

  const today = new Date().toLocaleDateString('nl-NL');
  const lastPromptDate = localStorage.getItem('bodyweight_prompt_date');

  if (lastPromptDate === today) return;

  const hasTodayWeight = history.some(
    h => h.bodyWeight && h.date === today
  );

  if (hasTodayWeight) {
    localStorage.setItem('bodyweight_prompt_date', today);
    return;
  }

  const val = prompt('Wat is je lichaamsgewicht vandaag (kg)?');
  localStorage.setItem('bodyweight_prompt_date', today);

  if (!val) return;

  const bw = parseFloat(val.replace(',', '.'));
  if (isNaN(bw)) return;

  setBodyWeightToday(bw);

  setHistory(prev => {
  const existingIndex = prev.findIndex(
    h => h.lift === null && h.date === today
  );

  const entry = {
    workoutNumber: 0,
    lift: null,
    bodyWeight: bw,
    date: today,
  };

  if (existingIndex !== -1) {
    const updated = [...prev];
    updated[existingIndex] = entry;
    return updated;
  }

return [...prev, entry];
});
}, [screen, workouts.length, history]);

function handleStart(s, b, d) {
  localStorage.removeItem('kel-powerlifting');
  localStorage.removeItem('app_version');

  setWorkouts(generateProgram(s, b, d));
  setSelectedIndex(0);

  setHistory([
    {
      workoutNumber: 0,
      lift: 'Squat',
      e1rm: s,
      date: new Date().toLocaleDateString('nl-NL'),
    },
    {
      workoutNumber: 0,
      lift: 'Bench',
      e1rm: b,
      date: new Date().toLocaleDateString('nl-NL'),
    },
    {
      workoutNumber: 0,
      lift: 'Deadlift',
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
  setBodyWeightToday(null);
  setScreen('onboarding');
}

function handleStartNewCycle() {
  if (!prs.Squat || !prs.Bench || !prs.Deadlift) {
    setScreen('onboarding');
    return;
  }

  const newWorkouts = generateProgram(prs.Squat, prs.Bench, prs.Deadlift);
  setWorkouts(newWorkouts);
  setSelectedIndex(0);
  setShowNewCycle(false);
  setScreen('all');
}

  function toggleWarmup(wIndex) {
    setWorkouts(prev => prev.map((w, wi) => wi !== selectedIndex ? w : { ...w, warmups: w.warmups.map((wu, i) => i === wIndex ? { ...wu, done: !wu.done } : wu) }));
  }
  function toggleSet(setIndex) {
    setWorkouts(prev => prev.map((w, wi) => wi !== selectedIndex ? w : { ...w, sets: w.sets.map((s, si) => si === setIndex ? { ...s, done: !s.done } : s) }));
  }

  function toggleAccessorySet(accIndex, setIndex) {
  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        accessories: w.accessories.map((a, ai) => {
          if (ai !== accIndex) return a;

          return {
            ...a,
            done: a.done.map((d, di) => di === setIndex ? !d : d),
          };
        }),
      };
    })
  );
}

function toggleAlternative(accIndex) {
  setWorkouts(prev =>
    prev.map((w, wi) => {
      if (wi !== selectedIndex) return w;

      return {
        ...w,
        accessories: w.accessories.map((a, ai) => {
          if (ai !== accIndex) return a;

          return {
            ...a,
            useAlternative: !a.useAlternative,
            weights: Array(a.sets).fill(!a.useAlternative ? a.alternativeWeight : a.weight),
            done: Array(a.sets).fill(false),
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

  function completeWorkout() {  const workout = workouts[selectedIndex];
  
  if (workout.type === 'training' && ['Deadlift', 'Bench', 'Squat'].includes(workout.lift)) {
    const topSet = workout.sets.reduce(
      (best, s) => epley(s.weight, s.reps) > epley(best.weight, best.reps) ? s : best,
      workout.sets[0]
    );

    const newE1rm = epley(topSet.weight, topSet.reps);
    const previousPR = prs[workout.lift] || 0;
    const isPR = newE1rm > previousPR;

    setCompletedSummary({
      lift: workout.lift,
      e1rm: newE1rm,
      previousPR,
      isPR,
      topSet,
      bodyWeight: bodyWeightToday,
    });

    setPrs(prev => {
      const current = prev[workout.lift] || 0;
      return newE1rm > current ? { ...prev, [workout.lift]: newE1rm } : prev;
    });

    setHistory(prev => {
  const existingIndex = prev.findIndex(
    h => h.workoutNumber === workout.number && h.lift === workout.lift
  );

  const newEntry = {
    workoutNumber: workout.number,
    lift: workout.lift,
    topWeight: topSet.weight,
    topReps: topSet.reps,
    e1rm: newE1rm,
    bodyWeight: bodyWeightToday,
    date: new Date().toLocaleDateString('nl-NL'),
  };

  if (existingIndex !== -1) {
    const updated = [...prev];
    updated[existingIndex] = newEntry;
    return updated;
  }

  return [...prev, newEntry];
});

  } else if (bodyWeightToday) {
    setHistory(prev => [
      ...prev,
      {
        workoutNumber: workout.number,
        lift: null,
        bodyWeightToday,
        date: new Date().toLocaleDateString('nl-NL'),
      }
    ]);
  }

  if (workout.accessories) {
    workout.accessories.forEach(acc => {
      const bestWeight = Math.max(...acc.weights);
      const name = acc.useAlternative ? acc.alternative.name : acc.name;

      setAccessoryPRs(prev => {
        const current = prev[name] || 0;
        return bestWeight > current ? { ...prev, [name]: bestWeight } : prev;
      });
    });
  }

  const isLastWorkout = currentIndex === workouts.length - 2;
  if (isLastWorkout) setShowNewCycle(true);

  setCompletedWorkout(workout);
  setCompletedWorkoutIndex(selectedIndex);

  setSelectedIndex(currentIndex + 1);

  setScreen('completed');
}
function selectWorkout(idx) {
  setSelectedIndex(idx);
  setScreen('current');
}
if (screen === 'onboarding') return <Onboarding onStart={handleStart} />;
  if (screen !== 'onboarding' && (!workouts.length || !workouts[currentIndex])) {
  return <Onboarding onStart={handleStart} />;
}
const workout = workouts[currentIndex];


function updateBodyWeight() {
  const val = prompt('Voer je lichaamsgewicht in (kg)');
  if (!val) return;

  const bw = parseFloat(val.replace(',', '.'));
  if (isNaN(bw)) return;

  setBodyWeightToday(bw);

  setHistory(prev => {
    const today = new Date().toLocaleDateString('nl-NL');

    const existingIndex = prev.findIndex(
      h => h.date === today && h.lift === null
    );

    const entry = {
      workoutNumber: 0,
      lift: null,
      bodyWeight: bw,
      date: today,
    };

    if (existingIndex !== -1) {
      const updated = [...prev];
      updated[existingIndex] = entry;
      return updated;
    }

    return [...prev, entry];
  });
}

const best1RMs = {
  Squat: Math.max(0, ...history.filter(h => h.lift === 'Squat' && h.topReps === 1).map(h => h.topWeight || 0)),
  Bench: Math.max(0, ...history.filter(h => h.lift === 'Bench' && h.topReps === 1).map(h => h.topWeight || 0)),
  Deadlift: Math.max(0, ...history.filter(h => h.lift === 'Deadlift' && h.topReps === 1).map(h => h.topWeight || 0)),
};

const total1RM = best1RMs.Squat + best1RMs.Bench + best1RMs.Deadlift;
const totalE1RM = (prs.Squat || 0) + (prs.Bench || 0) + (prs.Deadlift || 0);

const latestBodyWeightEntry = [...history]
  .filter(h => h.bodyWeight)
  .slice(-1)[0];

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
          isReadOnly={selectedIndex > currentIndex}
          onToggleWarmup={toggleWarmup}
          onToggleSet={toggleSet}
          onToggleAccessorySet={toggleAccessorySet}
          onWeightChange={changeWeight}
          onAccessoryWeightChange={changeAccessoryWeight}
          onToggleAlternative={toggleAlternative}
          onComplete={completeWorkout}
          onViewAll={() => setScreen('all')}
          showNewCycle={showNewCycle}
          newCyclePRs={prs}
          onStartNewCycle={handleStartNewCycle}
        />
      )}

      {screen === 'dashboard' && (
  <div style={{ maxWidth: 500, margin: '0 auto', padding: 16, background: THEME.bg, minHeight: '100vh', color: THEME.text }}>
    <h2 style={{ marginTop: 0, textAlign: 'center' }}>Dashboard</h2>
    <div style={{ textAlign: 'center', color: THEME.muted, fontSize: 12, marginBottom: 12 }}>
  Build {APP_BUILD}
</div>
    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
      {[
        ['Squat', THEME.red, best1RMs.Squat, prs.Squat],
        ['Bench', THEME.yellow, best1RMs.Bench, prs.Bench],
        ['Deadlift', THEME.primary, best1RMs.Deadlift, prs.Deadlift],
      ].map(([lift, color, oneRM, e1RM]) => (
        <div key={lift} style={{ marginBottom: lift === 'Deadlift' ? 0 : 12 }}>
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
        <span style={{ color: THEME.text, fontWeight: 700 }}>Totaal 1RM:</span>
        <strong>{total1RM ? `${total1RM} kg` : '—'}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: THEME.text, fontWeight: 700 }}>Totaal e1RM:</span>
        <strong style={{ color: THEME.primary }}>{totalE1RM ? `${totalE1RM} kg` : '—'}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: THEME.text, fontWeight: 700 }}>Kracht:</span>
        <strong style={{ color: THEME.yellow }}>{strengthRatio || '—'}</strong>
      </div>
    </div>

    <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: THEME.text, fontWeight: 700 }}>Lichaamsgewicht:</span>
        <strong>{latestBodyWeight ? `${latestBodyWeight} kg` : '—'}</strong>
      </div>
    </div>
  </div>
)}

      {screen === 'all' && (
        <AllWorkouts
          workouts={workouts}
          currentIndex={currentIndex}
          onSelect={(idx) => {
            setSelectedIndex(idx);
            setScreen('current');
          }}
          onBack={() => setScreen('current')}
          onStats={() => setScreen('stats')}
        />
      )}

      {screen === 'stats' && (
        <StatsScreen
          history={history}
          onBack={() => setScreen('all')}
        />
      )}

      {screen === 'settings' && (
       <div style={{ maxWidth: 500, margin: '0 auto', padding: 12, fontFamily: 'sans-serif' }}>
  <h2 style={{ marginTop: 0 }}>Instellingen</h2>

  <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: 16, marginTop: 4, marginBottom: 16 }}>
    <div style={{ color: '#ffffff', display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
      <span>Squat 1RM (ingevoerd)</span>
      <strong>{prs.Squat || '—'} kg</strong>
    </div>
    <div style={{ color: '#ffffff', display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
      <span>Bench 1RM (ingevoerd)</span>
      <strong>{prs.Bench || '—'} kg</strong>
    </div>
    <div style={{ color: '#ffffff', display: 'flex', justifyContent: 'space-between' }}>
      <span>Deadlift 1RM (ingevoerd)</span>
      <strong>{prs.Deadlift || '—'} kg</strong>
    </div>
  </div>

  <button
  onClick={updateBodyWeight}
  style={{
    width: '100%',
    padding: 14,
    fontSize: 16,
    fontWeight: 600,
    background: THEME.card,
    color: '#ffffff',
    border: `none`,
    borderRadius: 8,
    cursor: 'pointer',
    marginBottom: 12
  }}
>
  Lichaamsgewicht bijwerken
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
    Opnieuw beginnen
  </button>
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

      <h2 style={{ margin: '0 0 8px', color: THEME.text }}>Workout voltooid</h2>

<p style={{ color: THEME.muted, margin: '0 0 12px' }}>
  Goed gedaan. Je workout is opgeslagen.
</p>

<div style={{
  background: THEME.card,
border: `1px solid ${THEME.border}`,
color: THEME.text,
  border: `1px solid ${THEME.border}`,
  borderRadius: 8,
  padding: 12,
  marginBottom: 20,
  textAlign: 'center'
}}>
<span style={{ color: THEME.text, fontWeight: 700 }}>
  {(() => {
    const topSet = (completedWorkout?.sets || []).reduce((best, s) =>
      (s.weight * (1 + s.reps / 30)) > (best.weight * (1 + best.reps / 30)) ? s : best,
      completedWorkout?.sets?.[0] || { weight: 0, reps: 1 }
    );

    const e1rm = Math.round(topSet.weight * (1 + topSet.reps / 30));
    const previous = prs[completedWorkout?.lift] || 0;
    const isPR = e1rm > previous;

return completedSummary?.isPR
  ? `${completedSummary?.lift} e1RM PR: ${completedSummary?.e1rm} kg 🚀`
  : `${completedSummary?.lift} e1RM (vandaag): ${completedSummary?.e1rm} kg`;  })()}
</span>
</div>

<div style={{ background: THEME.card,
border: `1px solid ${THEME.border}`,
color: THEME.text, borderRadius: 8, padding: 16, marginBottom: 20, textAlign: 'left' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
    <span style={{ color: THEME.text, fontWeight: 700 }}>Lift</span>
    <strong>{completedWorkout?.lift || '—'}</strong>
  </div>

  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
    <span style={{ color: THEME.text, fontWeight: 700 }}>Workout</span>
    <strong>{completedWorkout?.number || '—'}</strong>
  </div>

  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
    <span style={{ color: THEME.text, fontWeight: 700 }}>Cyclus</span>
    <strong>{currentCycle}</strong>
  </div>

<div style={{ fontSize: 13, fontWeight: 700, color: THEME.muted, marginBottom: 10 }}>
  {completedWorkout?.lift || '—'}
</div>

{(completedWorkout?.sets || []).map((set, i) => {
  const isTopSet =
    set.weight === Math.max(...completedWorkout.sets.map(s => s.weight));

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
  <span style={{ color: '#ffffff', fontWeight: isTopSet ? 700 : 500 }}>
    {set.label || `Set ${i + 1}`} — {set.reps} reps
  </span>

  <strong style={{ color: '#ffffff' }}>
    {set.weight} kg
  </strong>
</div>
  );
})}
</div>

      <button
        onClick={() => setScreen('all')}
        style={{
          width: '100%',
          padding: 14,
          fontSize: 16,
          fontWeight: 600,
          marginTop: 4,
          background: THEME.card, color: '#ffffff', border: `1px solid ${THEME.border}`,
          color: 'white',
          border: `1px solid ${THEME.primary}`,
          borderRadius: 8,
          cursor: 'pointer',
          marginBottom: 10
        }}
      >
        Verder naar Programma
      </button>

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
        Bekijk Vooruitgang
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
        Terug naar Workout
      </button>
    </div>
  </div>
)}

      <BottomNav screen={screen} onChange={setScreen} />
    </div>
  );
}