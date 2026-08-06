export const DEFAULT_PLATE_SET_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_BARBELL_WEIGHT_KG = 20;
export const WOMENS_BARBELL_WEIGHT_KG = 15;

const EPSILON = 0.001;

export function calculatePlateBreakdown(totalWeightKg, {
  barWeightKg = DEFAULT_BARBELL_WEIGHT_KG,
  availablePlatesKg = DEFAULT_PLATE_SET_KG,
} = {}) {
  const total = Number(totalWeightKg) || 0;
  const bar = Number(barWeightKg) || 0;
  const remainderTotal = Math.max(0, total - bar);
  let perSideRemaining = remainderTotal / 2;

  const sortedPlates = [...availablePlatesKg]
    .map(Number)
    .filter(p => p > 0)
    .sort((a, b) => b - a);

  const perSidePlates = [];
  for (const plate of sortedPlates) {
    let count = 0;
    while (perSideRemaining + EPSILON >= plate) {
      perSideRemaining -= plate;
      count += 1;
    }
    if (count > 0) perSidePlates.push({ weightKg: plate, count });
  }

  const achievedPerSide = perSidePlates.reduce(
    (sum, p) => sum + p.weightKg * p.count,
    0
  );
  const achievedTotalKg = Math.round((bar + achievedPerSide * 2) * 100) / 100;

  return {
    barWeightKg: bar,
    perSidePlates,
    achievedTotalKg,
    requestedTotalKg: total,
    isExact: Math.abs(achievedTotalKg - total) < 0.01,
    leftoverPerSideKg: Math.round(perSideRemaining * 100) / 100,
  };
}
