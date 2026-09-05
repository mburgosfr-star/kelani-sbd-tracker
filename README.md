# Kelani SBD Tracker

[![Latest release](https://img.shields.io/github/v/release/mburgosfr-star/kelani-sbd-tracker?label=Latest%20release)](https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest)

**Adaptive powerlifting training that stays on your device.**

> **Official Kelani project:** this repository, `mburgosfr-star/kelani-sbd-tracker`, is the official Kelani SBD Tracker source and GitHub release location. The current Android package is `com.kelani.sbdtracker`. Official Android distribution is through this repository's GitHub Releases and IzzyOnDroid. See [VERIFY.md](VERIFY.md) to verify an APK and [BRANDING.md](BRANDING.md) for project-identity guidance.

Kelani is built for lifters who prefer to train independently but do not want to train blindly. It gives you adaptive SBD programming without requiring a personal trainer, an account, a subscription, or handing your training data to a cloud service.

Kelani is an offline-first Android app for Squat, Bench and Deadlift. Its main training model, Smart Training, does not give you a long static calendar. It plans one next workout at a time from the training you actually completed and how that work affected your readiness.

After every completed workout, Kelani interprets your recent training load, lift frequency, successful and failed work, workout difficulty, current strength and progress toward your planned meet attempts. It uses those signals to choose what to train next and to prescribe the sets, reps and barbell-loadable weights.

## Philosophy

Kelani can be used by anyone, but it is designed first for independent, natural, raw powerlifters of every age, sex and experience level. Its programming responds to demonstrated strength, completed training, readiness and feedback. It does not classify lifters by age or sex, and it does not need those details to help someone become stronger.

Training independently should not mean guessing. Kelani aims to provide structure, adaptation and clear reasoning while leaving the lifter in control. It keeps the app free, open source, offline-first and private by default so useful programming does not depend on an account, recurring payment or remote ownership of training data.

## Smart Training

Smart Training continuously rebuilds the plan around your real training history. It can:

- choose the next lift or combination of lifts based on priority, recent exposure and your training level;
- balance heavy, medium and light work instead of repeating the same session structure;
- progress successful work and respond to difficult or failed work;
- schedule recovery or deload work when fatigue, training streaks or completed workload call for it;
- generate preparation, warm-ups, top sets, back-off work and optional accessories for the selected session;
- work toward your Meet Planner attempts, then taper and schedule meet day when the required strength has been demonstrated;
- show the reasoning behind the next-workout decision and each lift's planned intensity.

Kelani generates only the next relevant workout, so new performance and feedback can influence the plan immediately instead of waiting for a fixed cycle to end.

## During and around training

- Follow a set-by-set workout view with preparation, warm-ups, main work, accessories and cooldown options.
- With accessories enabled, every Bench session includes Row, kept light during taper. Meet day has no accessories.
- Record completed or failed sets and rate both sets and the full workout.
- Use the built-in rest timer and plate calculator while training.
- Track real 1RM, estimated 1RM, SBD totals, Strength, eStrength and body statistics.
- Plan competition attempts, follow meet readiness and use a meet-day checklist.
- Choose kilograms or pounds and use alternative lift profiles when standard SBD is not suitable.
- Export, import and share local JSON backups; Android also keeps an automatic emergency backup after completed workouts.
- Review an anonymous usage summary generated entirely on your device, then optionally copy it or email it to Kelani to help improve the app.
- Use the app in English, Catalan or Dutch.

## Smart and Classic

New installations start with Smart Training. Classic Training contains the earlier fixed programs and remains available to existing Classic users in maintenance mode. They can continue their current program or switch permanently to Smart Training, which uses their existing training history.

Kelani has no accounts, ads, subscriptions, automatic analytics, telemetry or cloud synchronization. All training calculations run locally, and your data stays on your device unless you explicitly export or share it. The optional anonymous usage summary is created locally, shown to you before sharing and sent only through an action you choose.

## Download

Both channels distribute the current Kelani 2.x Android app (`com.kelani.sbdtracker`):

- [Kelani 2.x APK from GitHub Releases](https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest)
- [Kelani 2.x on IzzyOnDroid](https://apt.izzysoft.de/packages/com.kelani.sbdtracker)

For authenticity checks, including the official Android signing-certificate SHA-256 fingerprint, see [VERIFY.md](VERIFY.md).

## Android app identities and migration

Kelani 2.x is the current continuation of Kelani, but it uses a deliberately new Android app and signing identity. `com.kelani.sbdtracker` is the stable package identity for the 2.x line. Android therefore treats it as a different app from legacy Kelani 1.x; installing 2.x does not update or overwrite `com.kel.powerlifting`.

| Kelani line | Status | Android AppID | Update path |
|---|---|---|---|
| 2.x | Current | `com.kelani.sbdtracker` | Updates normally to later 2.x releases from GitHub or IzzyOnDroid |
| 1.x | Legacy | `com.kel.powerlifting` | Requires a one-time JSON backup migration to 2.x |

The two AppIDs have separate Android storage. Training data is not transferred automatically. Existing 1.x users should:

1. Open the legacy app and export a JSON backup from Settings → Data.
2. Keep the legacy app installed and install Kelani 2.x from either current download channel above.
3. Import the backup from the first setup screen. If setup was already completed, use Settings → Data.
4. Confirm that training history, PRs, body data and in-progress work are present before removing the legacy app.

Both apps can remain installed side by side during the migration. Never remove the legacy app before creating and verifying a backup. Users already running `com.kelani.sbdtracker` are already on the 2.x identity and do not need to migrate again.

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

Kelani is released under the [MIT License](LICENSE) and maintained by [Kel](https://github.com/mburgosfr-star). Open-source licensing and official project identity are separate concerns; see [BRANDING.md](BRANDING.md) for clarification.
