import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { UpdateAvailableModal, UpdatesSettingsModal } from './App';
import { GITHUB_RELEASES_URL, IZZY_ON_DROID_URL } from './appUpdates';
import { translations } from './translations';
import { GOOGLE_PLAY_URL } from './updateChannel';

describe('app update modals', () => {
  test.each(['en', 'nl', 'ca'])('Play updates bypass cached GitHub availability and direct downloads (%s)', language => {
    const t = translations[language];
    const onOpenLink = vi.fn();
    const onCheck = vi.fn();
    render(<UpdatesSettingsModal t={t} currentVersion="2.0.71" latestVersion="9.0.0"
      checkStatus="available" checkAutomatically={true} updateChannel="play"
      onCheckAutomaticallyChange={vi.fn()} onCheck={onCheck} onOpenWhatsNew={vi.fn()}
      onOpenLink={onOpenLink} onClose={vi.fn()} />);
    expect(screen.getByText(t.updateViaGooglePlay)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('9.0.0')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.updateDownloadGitHub })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.updateDownloadIzzy })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.updateOpenGooglePlay }));
    expect(onOpenLink).toHaveBeenCalledWith(GOOGLE_PLAY_URL);
    expect(onCheck).not.toHaveBeenCalled();
  });

  test('pending and unknown sources never offer an APK fallback or claim an available version', () => {
    const t = translations.en;
    const props = { t, currentVersion: '2.0.71', latestVersion: '9.0.0', checkStatus: 'available',
      checkAutomatically: true, onCheckAutomaticallyChange: vi.fn(), onCheck: vi.fn(),
      onOpenWhatsNew: vi.fn(), onOpenLink: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<UpdatesSettingsModal {...props} updateChannel="pending" />);
    expect(screen.getByRole('button', { name: t.updateChannelChecking })).toBeDisabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    rerender(<UpdatesSettingsModal {...props} updateChannel="unknown" />);
    expect(screen.getByText(t.updateChannelUnknown)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.updateDownloadGitHub })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.updateOpenGooglePlay })).toBeEnabled();
    rerender(<UpdateAvailableModal {...props} updateChannel="play" />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  test('shows a newer version with trusted download choices and a positive preference', () => {
    const onCheckAutomaticallyChange = vi.fn();
    const onOpenLink = vi.fn();
    const onClose = vi.fn();

    render(
      <UpdateAvailableModal
        t={translations.en}
        currentVersion="2.0.41"
        latestVersion="2.0.42"
        checkAutomatically={true}
        onCheckAutomaticallyChange={onCheckAutomaticallyChange}
        onOpenLink={onOpenLink}
        onClose={onClose}
      />
    );

    expect(screen.getByRole('heading', { name: 'New Version Available' })).toBeInTheDocument();
    expect(screen.getByText('2.0.41')).toBeInTheDocument();
    expect(screen.getByText('2.0.42')).toBeInTheDocument();

    const checkbox = screen.getByLabelText('Automatically check for updates');
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(onCheckAutomaticallyChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Download from GitHub' }));
    expect(onOpenLink).toHaveBeenCalledWith(GITHUB_RELEASES_URL);
    fireEvent.click(screen.getByRole('button', { name: 'Open in IzzyOnDroid' }));
    expect(onOpenLink).toHaveBeenCalledWith(IZZY_ON_DROID_URL);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('keeps What’s New and opt-in update checking together in Settings', () => {
    const onCheck = vi.fn();
    const onOpenWhatsNew = vi.fn();

    render(
      <UpdatesSettingsModal
        t={translations.en}
        currentVersion="2.0.41"
        latestVersion={null}
        checkStatus="idle"
        checkAutomatically={false}
        onCheckAutomaticallyChange={() => {}}
        onCheck={onCheck}
        onOpenWhatsNew={onOpenWhatsNew}
        onOpenLink={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
    expect(screen.getByLabelText('Automatically check for updates')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'View updates' }));
    expect(onOpenWhatsNew).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });
});
