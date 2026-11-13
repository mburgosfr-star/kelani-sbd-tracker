import {
  calculatePlateBreakdown,
  DEFAULT_BARBELL_WEIGHT_KG,
  WOMENS_BARBELL_WEIGHT_KG,
} from './plateMath';

test.each([
  {
    name: '20 kg is the empty 20 kg bar',
    totalWeightKg: 20,
    expectedPlates: [],
  },
  {
    name: '75 kg uses 25 kg and 2.5 kg per side',
    totalWeightKg: 75,
    expectedPlates: [
      { weightKg: 25, count: 1 },
      { weightKg: 2.5, count: 1 },
    ],
  },
  {
    name: '90 kg uses 25 kg and 10 kg per side',
    totalWeightKg: 90,
    expectedPlates: [
      { weightKg: 25, count: 1 },
      { weightKg: 10, count: 1 },
    ],
  },
  {
    name: '130 kg uses two 25 kg plates and one 5 kg plate per side',
    totalWeightKg: 130,
    expectedPlates: [
      { weightKg: 25, count: 2 },
      { weightKg: 5, count: 1 },
    ],
  },
])('$name', ({ totalWeightKg, expectedPlates }) => {
  const result = calculatePlateBreakdown(totalWeightKg);

  expect(result).toMatchObject({
    barWeightKg: DEFAULT_BARBELL_WEIGHT_KG,
    requestedTotalKg: totalWeightKg,
    achievedTotalKg: totalWeightKg,
    isExact: true,
    leftoverPerSideKg: 0,
    perSidePlates: expectedPlates,
  });
});

test('75 kg with a 15 kg bar uses 25 kg and 5 kg per side', () => {
  const result = calculatePlateBreakdown(75, {
    barWeightKg: WOMENS_BARBELL_WEIGHT_KG,
  });

  expect(result).toMatchObject({
    barWeightKg: 15,
    requestedTotalKg: 75,
    achievedTotalKg: 75,
    isExact: true,
    leftoverPerSideKg: 0,
    perSidePlates: [
      { weightKg: 25, count: 1 },
      { weightKg: 5, count: 1 },
    ],
  });
});

test('81 kg reports the closest lower load when microplates are unavailable', () => {
  const result = calculatePlateBreakdown(81, { availablePlatesKg: [25, 20, 15, 10, 5, 2.5, 1.25] });

  expect(result).toMatchObject({
    barWeightKg: 20,
    requestedTotalKg: 81,
    achievedTotalKg: 80,
    isExact: false,
    leftoverPerSideKg: 0.5,
    perSidePlates: [
      { weightKg: 25, count: 1 },
      { weightKg: 5, count: 1 },
    ],
  });
});


test('the standard plate set loads every half-kilogram total from the empty bar through 500 kg', () => {
  for (let target = 20; target <= 500; target += 0.5) {
    const result = calculatePlateBreakdown(target);
    expect(result.isExact).toBe(true);
    expect(result.achievedTotalKg).toBe(target);
    expect(20 + 2 * result.perSidePlates.reduce((total, plate) => total + plate.weightKg * plate.count, 0)).toBe(target);
  }
  expect(calculatePlateBreakdown(83).perSidePlates).toEqual([
    { weightKg: 25, count: 1 }, { weightKg: 5, count: 1 }, { weightKg: 1.25, count: 1 }, { weightKg: 0.25, count: 1 },
  ]);
  expect(calculatePlateBreakdown(19).isExact).toBe(false);
});
