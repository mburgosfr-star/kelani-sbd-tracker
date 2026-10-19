import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App, { DesktopRestTimeSection, UpdatesSettingsModal, shouldPlayRestTimerInAppAlert, shouldShowAutomaticBackupStatus } from './App';
import { translations } from './translations';
import { isDesktopRuntime } from './desktopRuntime';

afterEach(() => { delete window.kelaniDesktop; });

test('ordinary web and Android behavior does not acquire a desktop bridge', () => {
  expect(isDesktopRuntime()).toBe(false);
  expect(shouldShowAutomaticBackupStatus(false)).toBe(false);
  expect(shouldPlayRestTimerInAppAlert({ isNativePlatform: false, isDocumentHidden: false })).toBe(true);
});

test('desktop owns notifications and exposes automatic backup status', () => {
  window.kelaniDesktop = { platform: 'desktop' };
  expect(isDesktopRuntime()).toBe(true);
  expect(shouldShowAutomaticBackupStatus(false)).toBe(true);
  expect(shouldPlayRestTimerInAppAlert({ isNativePlatform: false, isDocumentHidden: false })).toBe(false);
});

test.each(['en', 'ca', 'nl'])('desktop test alert and platform limitations are shown in %s', async language => {
  const t = translations[language];
  const testNotification = jest.fn().mockResolvedValue({ sent: true });
  window.kelaniDesktop = { platform: 'desktop', testNotification };
  render(<DesktopRestTimeSection t={t} />);
  fireEvent.click(screen.getByRole('button', { name: t.check }));
  expect(screen.getByText(t.desktopTimerHelp)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: t.desktopTestNotification }));
  expect(await screen.findByText(t.desktopNotificationSent)).toBeInTheDocument();
  expect(testNotification).toHaveBeenCalledWith({ title: t.restTimerDone, body: t.restTimerDoneMessage });
});

test('desktop updates never offer the Android APK or Izzy store', () => {
  const t = translations.en;
  window.kelaniDesktop = { platform: 'desktop' };
  render(<UpdatesSettingsModal t={t} onClose={() => {}} onOpenLink={() => {}} />);
  expect(screen.getByText(t.desktopNoSync)).toBeInTheDocument();
  expect(screen.queryByText(t.updateDownloadIzzy)).not.toBeInTheDocument();
  expect(screen.queryByText(t.updateCheckAutomatically)).not.toBeInTheDocument();
});

test('returning to the desktop workout keeps the elapsed timer ready message without rescheduling it', async () => {
  localStorage.clear();
  localStorage.setItem('language', 'en');
  localStorage.setItem('kel-powerlifting-user-data-v1', JSON.stringify({
    version: 1, trainingModel: 'classic', currentCycle: 1,
    prs: { Squat: 100, Bench: 75, Deadlift: 125 }, history: [],
    showWhatsNewAfterUpdates: false,
  }));
  const start = Date.now();
  const deadline = start + 60_000;
  localStorage.setItem('kelani-sbd-tracker-active-rest-timer', JSON.stringify({
    id: start, seconds: 60, endTime: deadline,
    placement: { workoutNumber: 1, type: 'meetWarmup', liftIndex: 0, index: 0 },
  }));
  const scheduleTimer = jest.fn().mockResolvedValue({ scheduled: true });
  window.kelaniDesktop = {
    platform: 'desktop', scheduleTimer,
    getPendingTimer: jest.fn().mockResolvedValue({ pending: true, id: 1208, at: deadline }),
    onTimerClick: () => () => {},
    writeBackup: jest.fn(async json => ({ data: json, path: 'Backups/test.json' })),
  };
  const view = render(<App />);
  await screen.findByRole('button', { name: 'Workout' }, { timeout: 5000 });
  await waitFor(() => expect(window.kelaniDesktop.getPendingTimer).toHaveBeenCalled());
  const now = jest.spyOn(Date, 'now').mockReturnValue(deadline + 1000);
  try {
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByText(translations.en.readyNextSet)).toBeInTheDocument();
    expect(scheduleTimer).not.toHaveBeenCalled();
    expect(localStorage.getItem('kelani-sbd-tracker-active-rest-timer')).toBeNull();
  } finally {
    view.unmount();
    now.mockRestore();
    localStorage.clear();
  }
}, 10000);
