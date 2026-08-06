# Kelani SBD Tracker

[![Latest release](https://img.shields.io/github/v/release/mburgosfr-star/kelani-sbd-tracker?label=Latest%20release)](https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest)

Kelani is a calm, offline-first powerlifting app for planning and tracking Squat, Bench Press and Deadlift training. It has no accounts, ads, subscriptions, analytics or cloud dependency.

## Highlights

- **Smart Training** builds each next workout from your training history, readiness and recent feedback.
- **Classic Training** provides fixed programs for lifters who prefer a predetermined plan.
- Track warm-ups, work sets, accessories, perceived effort, failures and skipped sets.
- Follow 1RM, estimated 1RM, strength and body statistics.
- Plan competition attempts and prepare for meet day.
- Export and import local backups.
- Use the app in English, Catalan or Dutch.

All training calculations run locally. Your data stays on your device unless you explicitly export or share it.

## Download

- [Latest APK from GitHub](https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest)
- [IzzyOnDroid listing](https://apt.izzysoft.de/packages/com.kelani.sbdtracker)

## Migrating from the legacy Android app

The new Android package is intentionally separate from the legacy `com.kel.powerlifting` app. Existing users should:

1. Open the legacy app and export a JSON backup from Settings → Data.
2. Install and open the new app.
3. Import the backup directly from the first setup screen.
4. Confirm that training history, PRs, body data and in-progress work are present before removing the legacy app.

Both apps can remain installed side by side during the migration. Never remove the legacy app before creating and verifying a backup.

## Screenshots

| Dashboard | Smart Training |
|---|---|
| ![Kelani dashboard](docs/assets/screenshots/dashboard.png) | ![Kelani Smart Training](docs/assets/screenshots/smart-training.png) |

| Workout | Statistics |
|---|---|
| ![Kelani workout](docs/assets/screenshots/workout.png) | ![Kelani statistics](docs/assets/screenshots/stats.png) |

## Development

Use Node.js 22 for the web project. Java 21 is additionally required for Android builds.

```bash
npm ci
CI=true npm test -- --runInBand
npm run build
```

Public Android releases are produced through guarded repository automation.

## Feedback and support

Report bugs or suggest improvements through [GitHub Issues](https://github.com/mburgosfr-star/kelani-sbd-tracker/issues). You can support continued development through [GitHub Sponsors](https://github.com/sponsors/mburgosfr-star).

## License

Kelani is released under the [MIT License](LICENSE) and maintained by [Kel](https://github.com/mburgosfr-star).
