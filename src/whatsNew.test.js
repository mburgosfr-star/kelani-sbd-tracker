import {
  LATEST_WHATS_NEW_VERSION,
  shouldAutoShowWhatsNew,
} from './whatsNew';

describe('shouldAutoShowWhatsNew', () => {
  const eligible = {
    currentVersion: LATEST_WHATS_NEW_VERSION,
    hasExistingProfile: true,
    enabled: true,
  };

  test('shows the current release notes once to an existing user', () => {
    expect(shouldAutoShowWhatsNew(eligible)).toBe(true);
    expect(shouldAutoShowWhatsNew({
      ...eligible,
      lastSeenVersion: LATEST_WHATS_NEW_VERSION,
    })).toBe(false);
  });

  test('does not auto-open for new users or when disabled', () => {
    expect(shouldAutoShowWhatsNew({ ...eligible, hasExistingProfile: false })).toBe(false);
    expect(shouldAutoShowWhatsNew({ ...eligible, enabled: false })).toBe(false);
  });

  test('does not auto-open in development or without matching content', () => {
    expect(shouldAutoShowWhatsNew({ ...eligible, currentVersion: 'dev' })).toBe(false);
    expect(shouldAutoShowWhatsNew({ ...eligible, currentVersion: '2.0.39' })).toBe(false);
  });
});
