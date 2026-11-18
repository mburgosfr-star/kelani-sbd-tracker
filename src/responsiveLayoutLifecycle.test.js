import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import AdaptiveDialogPanel from './AdaptiveDialogPanel';

let naturalDialogHeight;
let availableHeight;
let resizeCallbacks;
function scaleOf(element) {
  return Number(element.style.getPropertyValue('--kelani-content-font-scale')) || 1;
}
beforeEach(() => {
  localStorage.clear();
  naturalDialogHeight = 260;
  availableHeight = 650;
  resizeCallbacks = [];
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resizeCallbacks.push(callback); }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () {
    return this.dataset.testid === 'app-viewport' ? 393 : 360;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () {
    if (this.hasAttribute('data-adaptive-dialog')) return Math.min(naturalDialogHeight * scaleOf(this), availableHeight);
    return this.dataset.testid === 'app-viewport' ? 873 : 650;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function () { return this.clientWidth; });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
    return this.hasAttribute('data-adaptive-dialog') ? naturalDialogHeight * scaleOf(this) : 500;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('initial visible Dashboard is fitted before navigation and returns at the same size', async () => {
  localStorage.setItem('language', 'en');
  localStorage.setItem('kelani-sbd-tracker-navigation-state', JSON.stringify({ screen: 'dashboard', selectedIndex: 0 }));
  localStorage.setItem('kel-powerlifting-user-data-v1', JSON.stringify({ version: 1,
    trainingModel: 'smart', currentCycle: 1, showWhatsNewAfterUpdates: false,
    prs: { Squat: 100, Bench: 75, Deadlift: 125 },
    oneRMs: { Squat: 100, Bench: 75, Deadlift: 125 }, history: [] }));
  const view = render(<App />);
  const viewport = await screen.findByTestId('app-viewport', {}, { timeout: 5000 });
  // This fails when the effect only depends on screen: it ran behind the splash.
  expect(scaleOf(viewport)).toBe(1.05);
  for (const label of ['Settings', 'Statistics', 'Program', 'Workout', 'Dashboard']) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(scaleOf(viewport)).toBe(label === 'Program' || label === 'Workout' ? 1 : label === 'Dashboard' ? 1.05 : label === 'Settings' ? 1.15 : 1.25);
  }
  view.unmount();
  render(<App />);
  expect(scaleOf(await screen.findByTestId('app-viewport', {}, { timeout: 5000 }))).toBe(1.05);
}, 15000);

test('dialogs independently expand, refit changed content and scroll at readable baseline', async () => {
  const content = text => <div style={{ padding: 16, '--kelani-content-font-scale': 0.9 }} data-testid="background">
    <AdaptiveDialogPanel data-testid="panel"><p>{text}</p><button>Close</button></AdaptiveDialogPanel>
  </div>;
  const view = render(content('Short help'));
  const panel = screen.getByTestId('panel');
  expect(scaleOf(panel)).toBe(1.1);
  expect(scaleOf(screen.getByTestId('background'))).toBe(0.9);
  naturalDialogHeight = 1000;
  view.rerender(content('Long help'));
  await waitFor(() => expect(scaleOf(panel)).toBe(1));
  expect(panel).toHaveStyle({ overflowY: 'auto', padding: '12px' });
  naturalDialogHeight = 260;
  view.rerender(content('Short help again'));
  await waitFor(() => expect(scaleOf(panel)).toBe(1.1));
  // Its own post-fit ResizeObserver notification cannot change the result.
  await act(async () => { resizeCallbacks.forEach(callback => callback()); await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(scaleOf(panel)).toBe(1.1);
  expect(screen.getByRole('button', { name: 'Close' })).toBeVisible();
});

test('dialog refits for less and then more viewport space without navigation', async () => {
  render(<div><AdaptiveDialogPanel data-testid="panel"><p>Help</p></AdaptiveDialogPanel></div>);
  const panel = screen.getByTestId('panel');
  expect(scaleOf(panel)).toBe(1.1);
  availableHeight = 270;
  fireEvent(window, new Event('resize'));
  await waitFor(() => expect(scaleOf(panel)).toBe(1));
  availableHeight = 650;
  fireEvent(window, new Event('resize'));
  await waitFor(() => expect(scaleOf(panel)).toBe(1.1));
});
