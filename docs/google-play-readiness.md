# Google Play readiness checklist

Last updated: 2026-06-02

App: Kelani SBD Tracker  
Package name: com.kel.powerlifting  
Current release prep branch: v1.0-prep  
Privacy policy URL: https://mburgosfr-star.github.io/kelani-site/#privacy

## Store listing

- App name: Kelani SBD Tracker
- Short description: Powerlifting tracker for Squat, Bench and Deadlift training.
- Full description: fastlane/metadata/android/en-US/full_description.txt
- App icon: fastlane/metadata/android/en-US/images/icon.png
- Feature graphic: fastlane/metadata/android/en-US/images/featureGraphic/feature.png
- Phone screenshots: fastlane/metadata/android/en-US/images/phoneScreenshots/

## Privacy and Data Safety

- No accounts
- No login
- No ads
- No analytics
- No tracking
- No developer server
- No automatic network data collection
- Local storage only
- User-controlled export/import/share features

Recommended Data Safety position:

- Data collected: No
- Data shared: No
- Account creation: No
- Account deletion URL: Not applicable because the app has no accounts
- Data encryption in transit: Not applicable because no user data is collected off-device

See docs/google-play-data-safety.md for details.

## Before 1.0 release

- Confirm v0.9.13 / latest Neo Store reproducible-build status
- Run npm run build
- Run node scripts/test-izzy-build.js
- Build signed release APK
- Smoke-test on phone
- Bump package.json version to 1.0.0
- Bump android versionName to 1.0.0
- Bump android versionCode from 46 to 47
- Add fastlane/metadata/android/en-US/changelogs/47.txt
- Create GitHub release with node scripts/create-github-release.js
- Submit/update store listing in Google Play Console
