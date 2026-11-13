// Prescribed training loads only. Progression steps, meet attempts and
// recorded/estimated maxima deliberately retain their own policies.
export const TRAINING_WEIGHT_INCREMENT_KG = 0.5;
export function roundTrainingWeight(weight, mode = 'nearest') {
  const value = Number(weight);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const steps = value / TRAINING_WEIGHT_INCREMENT_KG;
  const rounded = mode === 'down' ? Math.floor(steps) : mode === 'up' ? Math.ceil(steps) : Math.round(steps);
  return rounded * TRAINING_WEIGHT_INCREMENT_KG;
}

export const WEIGHT_UNITS = {
  KG: 'kg',
  LB: 'lb',
};

const KG_TO_LB = 2.2046226218;

export function normalizeWeightUnit(unit) {
  return unit === WEIGHT_UNITS.LB ? WEIGHT_UNITS.LB : WEIGHT_UNITS.KG;
}

export function kgToDisplayWeight(weightKg, unit = WEIGHT_UNITS.KG) {
  const numericWeight = Number(weightKg);
  if (!Number.isFinite(numericWeight)) return '';

  return normalizeWeightUnit(unit) === WEIGHT_UNITS.LB
    ? numericWeight * KG_TO_LB
    : numericWeight;
}

export function roundKgForStorage(weightKg) {
  const numericWeight = Number(weightKg);
  if (!Number.isFinite(numericWeight)) return '';

  // Kept as a compatibility export. Unit conversion must not discard the
  // precision of measured body data, recorded maxes or calculated estimates.
  return numericWeight;
}

export function displayWeightToKg(weight, unit = WEIGHT_UNITS.KG) {
  const numericWeight = Number(weight);
  if (!Number.isFinite(numericWeight)) return '';

  const weightKg = normalizeWeightUnit(unit) === WEIGHT_UNITS.LB
    ? numericWeight / KG_TO_LB
    : numericWeight;

  return roundKgForStorage(weightKg);
}

export function roundToStep(value, step) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '';

  return Math.round(numericValue / step) * step;
}

export function decimalLocale() {
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

export function formatWeightValue(value, unit = WEIGHT_UNITS.KG, { body = false, recorded = false } = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';

  if (recorded) return Number(numericValue.toFixed(2)).toString();

  if (body) {
    return Number(numericValue.toFixed(1)).toString();
  }

  // Generators own barbell rounding. Keep manual loads and converted
  // per-arm weights accurate when displaying or reopening an editor.
  return Number(numericValue.toFixed(2)).toString();
}

export function formatDecimalDisplay(value, { minimumFractionDigits, maximumFractionDigits = 1 } = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';

  const roundedValue = Number(numericValue.toFixed(maximumFractionDigits));
  const hasDecimal = !Number.isInteger(roundedValue);
  const minDigits = minimumFractionDigits ?? (hasDecimal ? 1 : 0);

  return roundedValue.toLocaleString(decimalLocale(), {
    minimumFractionDigits: minDigits,
    maximumFractionDigits,
  });
}

export function formatWeightDisplayValue(value, unit = WEIGHT_UNITS.KG, options = {}) {
  const rawValue = formatWeightValue(value, unit, options);
  return formatDecimalDisplay(rawValue, { maximumFractionDigits: options.body && !options.recorded ? 1 : 2 });
}

export function formatWeightFromKg(weightKg, unit = WEIGHT_UNITS.KG, options = {}) {
  const displayWeight = kgToDisplayWeight(weightKg, unit);
  if (displayWeight === '') return '-';

  return `${formatWeightDisplayValue(displayWeight, unit, options)} ${normalizeWeightUnit(unit)}`;
}

// Estimates keep their full precision in state. Two visible decimal places
// communicate useful precision without exposing floating-point noise.
export function formatEstimatedWeightFromKg(weightKg, unit = WEIGHT_UNITS.KG) {
  const displayWeight = kgToDisplayWeight(weightKg, unit);
  if (displayWeight === '') return '-';

  return `${formatDecimalDisplay(displayWeight, { maximumFractionDigits: 2 })} ${normalizeWeightUnit(unit)}`;
}
