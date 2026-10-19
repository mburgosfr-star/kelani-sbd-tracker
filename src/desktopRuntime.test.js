import { fireEvent, render, screen } from '@testing-library/react';
import { DesktopRestTimeSection, UpdatesSettingsModal, shouldPlayRestTimerInAppAlert, shouldShowAutomaticBackupStatus } from './App';
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
