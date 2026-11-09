import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import AchievementShareModal, { shareAchievementImage } from './AchievementShareModal';
import { renderAchievementCard, buildAchievementCard } from './achievementShare';
import { translations } from './translations';
vi.mock('./achievementShare', async importOriginal => ({ ...await importOriginal(), renderAchievementCard: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: vi.fn() }, Directory: { Cache: 'CACHE' } }));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));
const image = 'data:image/png;base64,YWJj';
const card = buildAchievementCard({ t: translations.en });
const Modal = ({ title, children }) => <section><h3>{title}</h3>{children}</section>;
beforeEach(() => { vi.clearAllMocks(); Capacitor.isNativePlatform.mockReturnValue(false); renderAchievementCard.mockResolvedValue(image); });

test('opening a preview never sends anything; the shown image is the shared image', async () => {
  Capacitor.isNativePlatform.mockReturnValue(true);
  Filesystem.writeFile.mockResolvedValue({ uri: 'file:///cache/card.png' });
  Share.share.mockResolvedValue({});
  const close = vi.fn();
  render(<AchievementShareModal card={card} t={translations.en} onClose={close} Modal={Modal} buttonStyle={() => ({})} />);
  expect(Share.share).not.toHaveBeenCalled();
  expect(await screen.findByAltText(translations.en.sharePreviewAlt)).toHaveAttribute('src', image);
  expect(screen.getByRole('link', { name: translations.en.shareDownload })).toHaveAttribute('href', card.url);
  expect(screen.queryByText(card.title)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  await waitFor(() => expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/card.png'], text: expect.stringContaining(card.url) })));
  expect(Filesystem.writeFile).toHaveBeenCalledWith(expect.objectContaining({ data: 'YWJj', directory: 'CACHE' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(close).toHaveBeenCalledOnce();
});

test('native cancellation is quiet, real errors are actionable', async () => {
  Capacitor.isNativePlatform.mockReturnValue(true);
  Filesystem.writeFile.mockResolvedValue({ uri: 'file:///cache/card.png' });
  Share.share.mockRejectedValueOnce(new Error('Share canceled')).mockRejectedValueOnce(new Error('Unavailable'));
  render(<AchievementShareModal card={card} t={translations.en} onClose={() => {}} Modal={Modal} buttonStyle={() => ({})} />);
  await screen.findByAltText(translations.en.sharePreviewAlt);
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(translations.en.shareError);
});

test('failed rendering disables sharing and shows a localized error', async () => {
  renderAchievementCard.mockRejectedValue(new Error('Canvas failed'));
  render(<AchievementShareModal card={card} t={translations.ca} onClose={() => {}} Modal={Modal} buttonStyle={() => ({})} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(translations.ca.shareImageError);
  expect(screen.getByRole('button', { name: translations.ca.shareAction })).toBeDisabled();
});

test('web sharing sends a PNG file plus a clickable download URL', async () => {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockResolvedValue({}) });
  expect(await shareAchievementImage(card, image)).toBe('shared');
  expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)], text: expect.stringContaining(card.url) }));
});
