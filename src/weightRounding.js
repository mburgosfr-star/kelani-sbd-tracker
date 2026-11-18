// Missing preferences retain the established training/meet policies on old installations.
export const LEGACY_WEIGHT_ROUNDING = Object.freeze({ training: 0.5, meet: 2.5 });
export const DEFAULT_WEIGHT_ROUNDING = Object.freeze({ training: 2.5, meet: 2.5 });
export const WEIGHT_ROUNDING_STEPS = Object.freeze([0.5, 2.5]);
export function isValidWeightRounding(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    WEIGHT_ROUNDING_STEPS.includes(value.training) && WEIGHT_ROUNDING_STEPS.includes(value.meet));
}
export function normalizeWeightRounding(value) {
  return isValidWeightRounding(value) ? { training: value.training, meet: value.meet } : { ...LEGACY_WEIGHT_ROUNDING };
}
export function uniformWeightRounding(step) {
  const value = WEIGHT_ROUNDING_STEPS.includes(step) ? step : DEFAULT_WEIGHT_ROUNDING.training;
  return { training: value, meet: value };
}
export function resolveStoredWeightRounding(data) {
  return normalizeWeightRounding(data?.weightRounding);
}

export function roundingPoliciesEqual(left, right) {
  const a = normalizeWeightRounding(left);
  const b = normalizeWeightRounding(right);
  return a.training === b.training && a.meet === b.meet;
}

export function roundAccessoryLoads(accessories = [], step = 0.5) {
  return accessories.map(accessory => {
    if (accessory.bodyweight) return accessory;
    const round = weight => {
      const value = Number(weight);
      return Number.isFinite(value) && value > 0 ? Math.max(step, Math.round(value / step) * step) : weight;
    };
    const weights = (accessory.weights || []).map(round);
    return { ...accessory, weights, originalWeights: [...weights] };
  });
}
