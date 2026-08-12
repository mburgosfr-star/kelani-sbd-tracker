import fs from 'fs';
import path from 'path';

const appSource = fs.readFileSync(
  path.join(__dirname, 'App.js'),
  'utf8'
);

function componentBlock(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return appSource.slice(start, end);
}

test('warm-up weights expose the plate calculator', () => {
  const block = componentBlock(
    'export function WarmupGrid',
    'export function SetRow'
  );

  expect(block).toContain('onShowPlateCalculator');
  expect(block).toContain('onShowPlateCalculator(warmup.weight)');
  expect(block).toContain('plateCalculatorTitle');

  const callCount = (
    appSource.match(
      /<WarmupGrid[\s\S]*?onShowPlateCalculator=\{onShowPlateCalculator\}[\s\S]*?\/>/g
    ) || []
  ).length;

  expect(callCount).toBe(2);
});

test('non-per-side accessory weights expose the plate calculator', () => {
  const block = componentBlock(
    'export function AccessoryGroup',
    'function getExerciseGuide'
  );

  expect(block).toContain('onShowPlateCalculator');
  expect(block).toContain('!acc.perSide');
  expect(block).toContain('onShowPlateCalculator(setWeight)');
  expect(block).toContain('plateCalculatorTitle');

  const callCount = (
    appSource.match(
      /<AccessoryGroup[\s\S]*?onShowPlateCalculator=\{onShowPlateCalculator\}[\s\S]*?\/>/g
    ) || []
  ).length;

  expect(callCount).toBe(2);
});

test('per-side accessories remain excluded from the plate calculator', () => {
  const block = componentBlock(
    'export function AccessoryGroup',
    'function getExerciseGuide'
  );

  expect(block).toMatch(
    /\{onShowPlateCalculator && !isBodyweight && !acc\.perSide && \(/
  );
});

function plateCalculatorButtonStyle(block) {
  const match = block.match(
    /onShowPlateCalculator\([^)]*\);\s*\}\}\s*style=\{\{([\s\S]*?)\}\}/
  );

  expect(match).not.toBeNull();

  const styleText = match[1];
  const border = styleText.match(/border:\s*('[^']*'|"[^"]*")/)?.[1];
  const padding = styleText.match(/padding:\s*([^,\n]+),/)?.[1];

  expect(border).toBeDefined();
  expect(padding).toBeDefined();

  return { border, padding };
}

test('plate calculator button styling matches across warm-up, set, back-off, and accessory rows, and has no border', () => {
  const warmupBlock = componentBlock('export function WarmupGrid', 'export function SetRow');
  const setRowBlock = componentBlock('export function SetRow', 'export function BackoffGroup');
  const backoffBlock = componentBlock('export function BackoffGroup', 'export function AccessoryGroup');
  const accessoryBlock = componentBlock('export function AccessoryGroup', 'function getExerciseGuide');

  const warmupStyle = plateCalculatorButtonStyle(warmupBlock);
  const setRowStyle = plateCalculatorButtonStyle(setRowBlock);
  const backoffStyle = plateCalculatorButtonStyle(backoffBlock);
  const accessoryStyle = plateCalculatorButtonStyle(accessoryBlock);

  expect(setRowStyle).toEqual(warmupStyle);
  expect(backoffStyle).toEqual(warmupStyle);
  expect(accessoryStyle).toEqual(warmupStyle);
  expect(warmupStyle.border).toBe("'none'");
});
