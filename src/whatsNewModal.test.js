import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { WhatsNewModal } from './App';
import { translations } from './translations';

describe('WhatsNewModal', () => {
  test('shows localized release highlights and exposes the automatic-display preference', () => {
    const onShowAfterUpdatesChange = vi.fn();
    const onClose = vi.fn();

    render(
      <WhatsNewModal
        t={translations.en}
        version="2.0.41"
        showAfterUpdates={true}
        onShowAfterUpdatesChange={onShowAfterUpdatesChange}
        onClose={onClose}
      />
    );

    expect(screen.getByText("What's new?")).toBeInTheDocument();
    expect(screen.getByText('v2.0.41')).toBeInTheDocument();
    expect(screen.getByText(translations.en.whatsNewScreenLayoutItem)).toBeInTheDocument();

    const checkbox = screen.getByLabelText(
      translations.en.whatsNewShowAutomatically
    );
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(onShowAfterUpdatesChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: translations.en.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
