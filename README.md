# Kelani SBD Tracker

[![Latest release](https://img.shields.io/github/v/release/mburgosfr-star/kelani-sbd-tracker?label=Latest%20release)](https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest)

**Adaptive, private powerlifting training on Android.**

Kelani is an offline-first Squat, Bench Press and Deadlift tracker for lifters who train independently but do not want to train blindly. It requires no account, subscription or cloud service.

Smart Training follows a level-specific 28-workout ideal route from the start of a cycle through SBD Meet Day. The Program screen shows the route ahead, while your confirmed strength determines the prescribed weights. **Too easy**, **Too hard**, failed work and post-meet recovery can adjust the calendar; readiness information explains your progress without silently replacing planned workouts or postponing the meet.

## What Kelani does

- Prescribes heavy, medium and light SBD training with barbell-loadable weights.
- Uses real 1RM values for meet planning and tracks estimated 1RM progress from successful sets.
- Responds predictably to workout feedback: **Too easy** shortens the route to the meet, while **Too hard** or failed work adds recovery.
- Builds toward meet attempts, tapers and schedules an SBD Meet Day.
- Shows past, current and provisional future workouts, and explains readiness and projected meet timing.
- Tracks 1RM, e1RM, SBD totals, Strength, eStrength and body statistics.

During training you can complete or fail sets, adjust and restore weights, use a rest timer and open the plate calculator. Failed sets automatically make the workout **Too hard**; optional work left unchecked is not treated as failure.

## Your workout setup

Preparation and accessories are personal. In **Settings → Workout setup**, you decide:

- whether preparation and accessories are enabled;
- which available exercises belong to each big lift;
- how many sets and reps each exercise uses.

Kelani places your selected exercises into relevant workouts and chooses their training intensity. Optional preparation, accessories and cooldown work can be left undone without becoming failed work. Meet Day contains only the competition lifts.

## Private by default

Kelani has no accounts, ads, telemetry, automatic analytics or cloud synchronization. Training calculations and saved data stay on your device unless you explicitly export or share them.

The optional anonymous usage summary is generated locally and shown in full before you choose to copy or email it. See the [privacy policy](docs/privacy-policy.md) for details.

## Screenshots

| Dashboard | Smart Training |
|---|---|
| ![Kelani dashboard](docs/assets/screenshots/dashboard.png) | ![Kelani Smart Training](docs/assets/screenshots/smart-training.png) |

| Workout | Statistics |
|---|---|
| ![Kelani workout](docs/assets/screenshots/workout.png) | ![Kelani statistics](docs/assets/screenshots/stats.png) |

## Download

- [Latest APK from GitHub Releases](https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest)
- [Kelani on IzzyOnDroid](https://apt.izzysoft.de/packages/com.kelani.sbdtracker)

The official Android package is `com.kelani.sbdtracker`. Checksums, the signing-certificate fingerprint and provenance instructions are documented in [VERIFY.md](VERIFY.md).

### Moving from Kelani 1.x

Kelani 2.x uses a new Android identity, so Android can keep 1.x and 2.x installed side by side. Export a JSON backup from 1.x, import it into 2.x and verify your data before removing the legacy app. Existing 2.x users update normally.

## Languages and training models

Kelani is available in English, Catalan and Dutch. New users start with Smart Training. The earlier fixed Classic programs remain available to existing Classic users in maintenance mode; they can continue or switch permanently to Smart using their existing history.

## Development

Use Node.js 22. Android builds additionally require Java 21.

```bash
npm ci
CI=true npm test -- --runInBand
npm run build
```

Public Android releases use the repository's guarded release automation.

## Feedback, support and license

Report bugs or suggest improvements through [GitHub Issues](https://github.com/mburgosfr-star/kelani-sbd-tracker/issues). You can support development through [GitHub Sponsors](https://github.com/sponsors/mburgosfr-star).

Kelani is maintained by [Kel](https://github.com/mburgosfr-star) and released under the [MIT License](LICENSE). See [BRANDING.md](BRANDING.md) for official project-identity guidance.
