import React, { useState } from 'react';
import { normalizeWeightLimits, getLiftWeightLimit } from './weightLimits';
import { kgToDisplayWeight, displayWeightToKg, formatWeightValue } from './workoutUnits';

export default function WeightLimitsEditor({ value, onSave, onClose, bodyWeight, weightUnit, t, buttonStyle }) {
  const [initial] = useState(() => normalizeWeightLimits(value));
  const [initialFields] = useState(() => Object.fromEntries(Object.entries(initial)
    .map(([key, weight]) => [key, weight == null ? '' : formatWeightValue(kgToDisplayWeight(weight, weightUnit), weightUnit)])));
  const [fields, setFields] = useState(initialFields);
  const [error, setError] = useState(false);
  const labels = { Squat: t.squat, Bench: t.bench, Deadlift: t.deadlift, benchCapacity: t.weightLimitsBenchCapacity };
  const parsed = Object.fromEntries(Object.entries(fields).map(([key, value]) =>
    [key, value === initialFields[key] ? initial[key] : value.trim() === '' ? null : displayWeightToKg(Number(value.replace(',', '.')), weightUnit)]));
  const valid = Object.values(parsed).every(value => value == null || (Number.isFinite(value) && value >= 20)) &&
    getLiftWeightLimit('Bench', parsed, bodyWeight) >= 20;
  return <form onSubmit={event => { event.preventDefault(); if (!valid) { setError(true); return; } onSave(parsed); onClose(); }}>
    <p>{t.weightLimitsHelp}</p>
    {Object.keys(labels).map(key => <label key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 130px)', gap: 10, alignItems: 'center', margin: '12px 0' }}>
      <span>{labels[key]} ({weightUnit})</span>
      <input type="text" inputMode="decimal" value={fields[key]} aria-label={`${labels[key]} (${weightUnit})`}
        placeholder={t.weightLimitsOff} onChange={event => { setFields({ ...fields, [key]: event.target.value }); setError(false); }}
        style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 48, font: 'inherit', color: 'inherit', background: '#000', border: '1px solid #ff8c32', borderRadius: 6, padding: '8px 10px' }} />
    </label>)}
    <p>{t.weightLimitsBenchHelp}</p>
    {error && <p role="alert">{t.weightLimitsInvalid}</p>}
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      <button type="button" style={buttonStyle} onClick={onClose}>{t.cancel}</button>
      <button type="submit" style={buttonStyle}>{t.save}</button>
    </div>
  </form>;
}
