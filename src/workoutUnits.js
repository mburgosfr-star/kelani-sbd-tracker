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

  return Number(numericWeight.toFixed(1));
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

export function formatWeightValue(value, unit = WEIGHT_UNITS.KG, { body = false } = {}) {
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

export function formatDecimalDisplay(value, { minimumFractionDigits, maximumFractionDigits = 1 } = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '—';

  const hasDecimal = !Number.isInteger(numericValue);
  const minDigits = minimumFractionDigits ?? (hasDecimal ? 1 : 0);

  return numericValue.toLocaleString(decimalLocale(), {
    minimumFractionDigits: minDigits,
    maximumFractionDigits,
  });
}

export function formatWeightDisplayValue(value, unit = WEIGHT_UNITS.KG, options = {}) {
  const rawValue = formatWeightValue(value, unit, options);
  return formatDecimalDisplay(rawValue, { maximumFractionDigits: 1 });
}

export function formatWeightFromKg(weightKg, unit = WEIGHT_UNITS.KG, options = {}) {
  const displayWeight = kgToDisplayWeight(weightKg, unit);
  if (displayWeight === '') return '—';

  return `${formatWeightDisplayValue(displayWeight, unit, options)} ${normalizeWeightUnit(unit)}`;
}
