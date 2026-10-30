# Kelani SBD Tracker

[![Latest release](https://img.shields.io/github/v/release/mburgosfr-star/kelani-sbd-tracker?label=Latest%20release)](https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest)

**Plan your Squat, Bench Press and Deadlift training, log your sets and follow your strength progress offline.**

Kelani is an open-source Android app for independent lifters. It is free through GitHub and IzzyOnDroid, with no Kelani account, ads or subscription. Available in **English, Dutch and Catalan**.

## Download

Requires **Android 7.0 or later**.

- [GitHub Releases](https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest): open **Assets**, download the `.apk` and follow Android’s installation prompts.
- [IzzyOnDroid](https://apt.izzysoft.de/packages/com.kelani.sbdtracker): install and update through a compatible F-Droid client, such as Neo Store.

Existing users: export a JSON backup before updating. Official Android package: `com.kelani.sbdtracker`. See [installation, updates and migration](docs/user-guide.md#installation-and-backups) and [download verification](VERIFY.md).

## How Smart Training Works

Kelani builds an adaptive SBD route with heavy, medium and light workouts, followed by a taper, Meet Day and recovery. Your confirmed strength determines the weights; workout feedback adjusts the route.

- Follow warm-ups, top sets and back-off work in a clear workout grid.
- Record sets and use a rest timer with sound and Android notifications.
- Review past workouts, preview upcoming sessions and track records, estimated 1RM and body statistics.
- Customize preparation and accessories, keep JSON backups and optionally add workouts to an Android calendar.

See the [user guide](docs/user-guide.md) for training rules and settings.

## Screenshots

<details>
<summary>View Dashboard, Program, Workout and Statistics</summary>

Version 2.0.61, with fictional demo data.

| Dashboard | Program |
|---|---|
| ![Kelani dashboard](docs/assets/screenshots/dashboard.png) | ![Kelani Program screen](docs/assets/screenshots/smart-training.png) |

| Workout | Statistics |
|---|---|
| ![Kelani workout](docs/assets/screenshots/workout.png) | ![Kelani statistics](docs/assets/screenshots/stats.png) |

</details>

## Privacy

Core training works offline. Kelani has no automatic analytics or cloud sync. Optional calendar events may sync through your selected calendar provider; optional update checks contact GitHub. You choose whether to export or share data. Read the [privacy policy](docs/privacy-policy.md).

## Help and Contribute

[Report a problem or suggest an improvement](https://github.com/mburgosfr-star/kelani-sbd-tracker/issues). Please do not post personal training backups publicly.

[Volunteer for the upcoming Google Play test](docs/user-guide.md#google-play-testing) or [support development through GitHub Sponsors](https://github.com/sponsors/mburgosfr-star). Contributions are optional and unlock no app features.

Experimental desktop versions have separate data: [Ubuntu](docs/ubuntu-prototype.md) · [Windows](docs/windows-prototype.md).

## Development

Use Node.js 22 and, for Android builds, Java 21.

```bash
npm ci
npm run security:check
npm test -- --runInBand
npm run build
```

Maintained by [Kel](https://github.com/mburgosfr-star). [MIT License](LICENSE) · [Project identity](BRANDING.md) · [Release history](https://github.com/mburgosfr-star/kelani-sbd-tracker/releases).
