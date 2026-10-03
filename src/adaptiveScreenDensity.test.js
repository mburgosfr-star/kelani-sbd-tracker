import { resolveAdaptiveScreenDensity } from './App';

test('keeps a screen compact after compaction makes its content fit', () => {
  const initial = { screen: 'completed', compact: false };
  const compact = resolveAdaptiveScreenDensity(initial, 'completed', true);

  expect(compact).toEqual({ screen: 'completed', compact: true });
  expect(resolveAdaptiveScreenDensity(compact, 'completed', false)).toBe(compact);
});

test('re-evaluates compact density after navigating to another screen', () => {
  const compactCompleted = { screen: 'completed', compact: true };

  expect(resolveAdaptiveScreenDensity(compactCompleted, 'dashboard', false))
    .toEqual({ screen: 'dashboard', compact: false });
});
