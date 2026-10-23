import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { WhatsNewModal } from './App';
import { translations } from './translations';

describe('WhatsNewModal', () => {
  test.each(['en', 'nl', 'ca'])('shows %s release highlights and exposes the automatic-display preference', language => {
    const t = translations[language];
    const onShowAfterUpdatesChange = vi.fn();
    const onClose = vi.fn();

    render(
      <WhatsNewModal
        t={t}
        version="2.0.60"
        showAfterUpdates={true}
        onShowAfterUpdatesChange={onShowAfterUpdatesChange}
        onClose={onClose}
      />
    );

    expect(screen.getByText(t.whatsNewTitle)).toBeInTheDocument();
    expect(screen.getByText('v2.0.60')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(t.whatsNewRestTimerItem)).toBeInTheDocument();
    expect(screen.getByText(t.whatsNewCompletionSpacingItem)).toBeInTheDocument();
    expect(screen.getByText(t.whatsNewSupportItem)).toBeInTheDocument();

    const checkbox = screen.getByLabelText(
      t.whatsNewShowAutomatically
    );
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(onShowAfterUpdatesChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: t.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
