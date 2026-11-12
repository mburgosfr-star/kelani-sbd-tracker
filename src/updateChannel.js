import { Capacitor, registerPlugin } from '@capacitor/core';
import { fetchLatestReleaseVersion } from './appUpdates';

const DistributionChannel = registerPlugin('DistributionChannel');
export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.kelani.sbdtracker';

// Local web review only. Production builds and native installation checks never use this preview.
function webPreviewChannel() {
  if (!import.meta.env.DEV || Capacitor.getPlatform() !== 'web' || typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('previewUpdateChannel');
  return ['play', 'direct', 'unknown'].includes(value) ? value : null;
}

export function initialUpdateChannel() {
  return webPreviewChannel() || (Capacitor.getPlatform() === 'android' ? 'pending' : 'direct');
}

export function canCheckGitHubUpdates(channel) {
  return channel === 'direct';
}

export async function resolveUpdateChannel() {
  const preview = webPreviewChannel();
  if (preview) return preview;
  if (Capacitor.getPlatform() !== 'android') return 'direct';
  let timeout;
  const result = await Promise.race([
    DistributionChannel.getChannel(),
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Installation source lookup timed out')), 3000); }),
  ]).finally(() => clearTimeout(timeout));
  if (!['play', 'direct'].includes(result?.channel)) {
    throw new Error('Unrecognized installation source result');
  }
  return result.channel;
}

export async function fetchChannelReleaseVersion(channel, fetchVersion = fetchLatestReleaseVersion) {
  return canCheckGitHubUpdates(channel) ? fetchVersion() : null;
}
