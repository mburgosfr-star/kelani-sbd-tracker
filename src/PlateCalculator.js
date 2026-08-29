import { useState } from 'react';
import {
  calculatePlateBreakdown,
  DEFAULT_PLATE_SET_KG,
  DEFAULT_BARBELL_WEIGHT_KG,
  WOMENS_BARBELL_WEIGHT_KG,
} from './plateMath';

const PLATE_COLORS = {
  25: '#e74c3c',
  20: '#3498db',
  15: '#f1c40f',
  10: '#2ecc71',
  5: '#ffffff',
  2.5: '#e74c3c',
  1.25: '#95a5a6',
};

export default function PlateCalculator({ weightKg, onClose, theme, t }) {
  const [barWeightKg, setBarWeightKg] = useState(DEFAULT_BARBELL_WEIGHT_KG);
  const breakdown = calculatePlateBreakdown(weightKg, {
    barWeightKg,
    availablePlatesKg: DEFAULT_PLATE_SET_KG,
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 600,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.card,
          border: `1px solid ${theme.primary}`,
          borderRadius: 12,
          padding: 20,
          maxWidth: 380,
          width: '100%',
          color: theme.text,
        }}
      >
        <h3 style={{ margin: '0 0 10px', color: theme.brown || '#a67c52' }}>
          {t.plateCalculatorTitle}
        </h3>

        <p style={{ margin: '0 0 4px', fontSize: 14, color: theme.muted }}>
          {t.plateCalculatorTotal}: <strong style={{ color: theme.text }}>{breakdown.requestedTotalKg} kg</strong>
        </p>

        <div style={{ display: 'flex', gap: 8, margin: '10px 0 16px' }}>
          {[DEFAULT_BARBELL_WEIGHT_KG, WOMENS_BARBELL_WEIGHT_KG].map((bw) => (
            <button
              key={bw}
              onClick={() => setBarWeightKg(bw)}
              style={{
                flex: 1,
                padding: 10,
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 8,
                border: `1px solid ${theme.primary}`,
                background: barWeightKg === bw ? theme.primary : 'transparent',
                color: barWeightKg === bw ? '#ffffff' : theme.text,
                cursor: 'pointer',
              }}
            >
              {bw} kg {t.plateCalculatorBar}
            </button>
          ))}
        </div>

        {breakdown.perSidePlates.length === 0 ? (
          <p style={{ fontSize: 14, color: theme.muted }}>
            {t.plateCalculatorBarOnly}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: theme.muted }}>
              {t.plateCalculatorPerSide}:
            </p>
            {breakdown.perSidePlates.map((p) => (
              <div
                key={p.weightKg}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: PLATE_COLORS[p.weightKg] || theme.primary,
                      border: '1px solid rgba(0,0,0,0.25)',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontWeight: 700 }}>{p.weightKg} kg</span>
                </div>
                <span style={{ fontWeight: 800 }}>× {p.count}</span>
              </div>
            ))}
          </div>
        )}

        {!breakdown.isExact && (
          <p style={{ fontSize: 12.5, color: '#f39c12', marginBottom: 12 }}>
            {t.plateCalculatorNotExact}
          </p>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: 12,
            fontSize: 14,
            fontWeight: 700,
            background: 'transparent',
            color: theme.text,
            border: `1px solid ${theme.primary}`,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          {t.plateCalculatorClose || t.resetConfirmCancel}
        </button>
      </div>
    </div>
  );
}
