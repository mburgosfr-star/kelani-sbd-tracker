import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import CycleCompletedScreen from './CycleCompletedScreen';
import { translations } from './translations';

const theme = { red: '#ff5c45', primary: '#ff8a3d', yellow: '#ffd166', green: '#5f5', muted: '#aaa', border: '#555', text: '#fff' };

test.each(['en', 'nl', 'ca'])('cycle review in %s offers feedback without a separate next-cycle action', language => {
  const t = translations[language];
  const onFeedback = vi.fn();
  render(<CycleCompletedScreen history={[]} currentCycle={2} t={t} weightUnit="kg" theme={theme}
    header={<h2>{t.cycleCompleted}</h2>} buttonStyle={() => ({})}
    onFeedback={onFeedback} />);
  expect(screen.getByRole('heading', { name: t.cycleCompleted })).toBeInTheDocument();
  expect(screen.queryByText(t.restDayCompletedSaved)).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: t.shareCycleExperience }));
  expect(onFeedback).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: t.startNewCycle })).not.toBeInTheDocument();
});
