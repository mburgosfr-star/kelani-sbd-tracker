# AGENTS.md

## Repository collaboration

- Work step by step on large, uncertain, or high-impact changes. Ask for confirmation when a decision would materially change behavior or scope.
- Prefer concise, efficient sessions and report uncertainty directly.
- Treat this repository and every tracked file as public. Never add private conversations, personal working agreements, identifying user data, unsanitized exports, credentials, signing material, or local diagnostics. Keep personal agent preferences in global Codex instructions outside the repository.
- Do not guess about reported training behavior. When a user supplies an exported backup, analyze and reproduce the issue with those real values and history without committing the backup unless it has been explicitly authorized and sanitized.
- Smart Training is the active product direction. Classic Training is in maintenance mode; do not give Classic feature parity with Smart unless explicitly requested.
- Never finish or publish a release without the repository owner's explicit approval for the irreversible publish step.

## Project overview

Kelani SBD Tracker is an offline-first React application for Squat, Bench Press, and Deadlift training. It runs as a web app and is packaged for Android with Capacitor.

The app has:

- no backend or user accounts;
- no analytics or cloud synchronization;
- local persistence through `localStorage`;
- native Android integrations for backups, sharing, notifications, status-bar behavior, and the hardware back button.

Preserve these privacy and offline-first properties unless the user explicitly requests an architectural change.

This file is the canonical public repository guidance for coding agents. Verify changing facts against the current code. Operational maintainer instructions must remain outside this repository.

## Repository structure

- `src/App.js` — root application, screen navigation, UI components, workout interaction, persistence coordination, completion flow, backups, and native integration.
- `src/smartTrainingEngine.js` — Smart Training orchestration, readiness, day selection, meet readiness, recovery/deload behavior, and candidate selection.
- `src/smartPrescriptionEngine.js` — lift-state analysis, priorities, progression decisions, and concrete prescriptions.
- `src/smartFrequencyPolicy.js` — legacy rolling frequency and intensity constraints that still participate in final workout selection.
- `src/smartTrainingConstants.js` — shared Smart Training constants and the newer frequency-score policy.
- `src/classicProgramTemplates.js` — fixed Classic program generation.
- `src/programProfiles.js` — program profiles, exercise variants, labels, and strength-tracking rules.
- `src/workoutHistoryStats.js` — history normalization, PRs, e1RM, athlete level, and progress calculations.
- `src/warmupAndPrepGeneration.js` — preparation and warm-up generation.
- `src/accessoryGeneration.js` — accessory selection and structure merging.
- `src/workoutStateMerge.js` — reconciliation of regenerated workouts with saved user progress.
- `src/workoutUnits.js` — kg/lb conversion and formatting.
- `src/plateMath.js` and `src/PlateCalculator.js` — plate-loading logic and UI.
- `src/translations.js` — English, Catalan, and Dutch translations.
- `android/` — Capacitor Android project.
- `scripts/` — guarded build, QA, and release automation.

Tests are colocated under `src/` as `*.test.js`. JSON files under `src/` may be regression fixtures containing representative training histories.

## Development commands

Install dependencies:

```bash
npm ci
```

Run the full test suite non-interactively:

```bash
CI=true npm test -- --runInBand
```

Run a focused test:

```bash
CI=true npm test -- --runInBand --runTestsByPath src/example.test.js
```

Build production web assets:

```bash
npm run build
```

Validate release automation:

```bash
npm run release:self-check
```

The project has no separate lint script. CRA surfaces ESLint results through tests and production builds.

Use Node.js 22 and Java 21 when matching CI or building Android releases.

## Working rules

- Read the relevant implementation and existing regression tests before changing behavior.
- Preserve unrelated user changes in a dirty worktree.
- Make focused changes; avoid broad cleanup unless it is part of the request.
- Prefer pure domain logic in the existing domain modules over adding more policy logic to `App.js`.
- Do not introduce a router, global state library, backend, telemetry, or network dependency without explicit authorization.
- Keep kilograms as the canonical internal/storage unit. Convert pounds only through `workoutUnits.js`.
- User-facing strings must be added to all three language tables: `en`, `ca`, and `nl`.
- Preserve completed and in-progress workout state when regenerating program structure.
- Maintain compatibility with both browser execution and the Capacitor Android shell.
- Do not silently swallow new errors. Native failures may degrade gracefully, but user-data and backup failures need actionable handling.
- Do not inspect, expose, copy, replace, or modify signing material unless the user explicitly requests authorized release work.

## Smart Training architecture and known frequency debt

Smart Training currently has two historically separate frequency systems. They can disagree, and both remain active.

The newer system starts with `SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL` in `smartTrainingConstants.js`. It defines per-level and per-lift score targets, training days, a default heavy/medium/light mix, and `consecutiveAllowancePerWeek`. `EXPOSURE_TARGETS_BY_LEVEL` in `smartPrescriptionEngine.js` is derived from its `days` values. Eligibility and heavy-due decisions in `smartTrainingEngine.js` use this newer model.

The older system is `SMART_FREQUENCY_POLICY_BY_LEVEL` in `smartFrequencyPolicy.js`. It applies `maxTotal`, `maxHeavy`, `maxLight`, and hard consecutive-day restrictions after a workout has already been generated. It can reject or replace the newer system's selection through `getSmartFrequencyPolicyDecision`, `constrainSmartWorkoutByFrequency`, supplemental-lift selection, and the generation retry loop.

Known intentional debt:

- hard `noConsecutive` and `noConsecutiveHeavy` behavior has not yet been replaced by the newer graded `consecutiveAllowancePerWeek` model;
- the old policy and supplemental-lift replacement have not yet been retired;
- full reconciliation is a separate, high-risk project and must not be slipped into an unrelated bug fix.

For a surprising heavy/light/lift-selection result, first compare the decisions made by the newer eligibility logic and the older frequency constraint. This disagreement has repeatedly been the root cause of apparently arbitrary choices.

Recent fixes that must be preserved include:

- new eligibility gates use raw exposure counts rather than weighted counts;
- the final primary fallback prefers lifts with genuine remaining secondary capacity;
- legacy heavy/light caps were aligned with the newer default mix as far as its binary model permits.

## Smart Training change rules

Smart Training is the highest-risk domain area.

When changing it:

1. Trace the complete pipeline from history/readiness through prescription, retries, and final frequency constraints.
2. Put the rule in the narrowest relevant module.
3. Check for an existing scenario or regression test before creating a new test file.
4. Add a regression test based on the reported history or decision boundary.
5. Verify safety invariants, not only the expected selected lift.

Important invariants include:

- failed or skipped work must not create false PRs;
- generated weights must use valid barbell increments;
- warm-ups must remain below their work-set targets;
- meet attempts must remain strictly increasing;
- frequency and intensity hard caps must not be exceeded;
- completed workout snapshots must remain restorable;
- generated workout grids must satisfy their layout constraints;
- regeneration must preserve user-entered progress where applicable;
- recovery and deload decisions must not be replaced by unrelated full-intensity work.

Avoid fixing a regression by weakening an unrelated safety constraint.

## Meet readiness and progression

- Meet attempts are based on demonstrated real 1RM values in `prs`, not estimated e1RM. Training seeks to improve e1RM; meet planning targets real 1RM performance.
- Lift readiness progresses through `opener`, `second-attempt`, `third-attempt`, and `ready`.
- A third-attempt target is demonstrated through an e1RM-equivalent double or triple, not a literal maximal single in training.
- `meetPlanReady` and `meetPlanFullyDemonstrated` are intentionally different. The latter gates tapering toward the meet.
- Meet-specific top sets use barbell-precision progression rather than ordinary five-percentage-point bucketing. Preserve `useBarbellPrecision` and the strict higher-than-previous floor when progression is required with the same rep scheme.

Relevant regressions include `smartThirdAttemptRoundingFloor.test.js` and `smartThirdAttemptStrictProgressFloor.test.js`.

## Real-history investigation workflow

When a user supplies a real JSON export for a structural Smart Training problem:

1. Read and validate the supplied data rather than recreating approximate maxes or history.
2. Call `generateWorkoutsForTrainingModel('smart', options)` with the same values the app uses.
3. If forward behavior matters, simulate completion in the same history shape produced by the real completion flow. Multi-lift history entries must share the complete `workoutSnapshot`, matching actual exports.
4. Iterate only as many future workouts as needed to expose the behavior.
5. Compare both frequency systems when interpreting each decision.

Temporary `__scratch*.test.js` files, temporary exports of internal helpers, and targeted diagnostic logs are acceptable for investigation. Remove all such instrumentation before handoff. Do not commit the user's personal exported backup unless explicitly authorized and sanitized.

## Persistence and backup changes

The main persisted record uses:

```text
kel-powerlifting-user-data-v1
```

Persistence changes require special care because existing installations may contain older workout shapes.

When changing saved data:

- keep old records readable;
- normalize missing or legacy properties at the persistence boundary;
- preserve history, PRs, body data, settings, and in-progress set state;
- validate imported backups before replacing current data;
- test save-to-reload and export-to-import behavior;
- update backup integrity tests when the intended payload changes;
- do not rename or remove storage keys without an explicit migration.

`programVersion` controls compatibility of generated in-progress workout structures; it is not a substitute for general persisted-data migration.

## UI and interaction changes

Navigation is controlled by the root `screen` state rather than a router. Account for Android back-button behavior when adding or removing screens or modals.

Workout controls are used during physical training:

- preserve large touch targets;
- keep set state visually unambiguous;
- retain keyboard and screen-reader semantics;
- avoid making the completion flow easier to trigger accidentally;
- preserve read-only behavior for future or completed workouts;
- check narrow phone layouts.

Prefer extracting reusable components when doing so is directly relevant, but do not combine a feature fix with a wholesale `App.js` rewrite.

## Verification expectations

Use verification proportional to the change:

- Pure helper: focused tests.
- Smart Training rule: focused regression tests plus related Smart suites.
- Persistence/import/restore: integrity and reload tests.
- UI interaction: React Testing Library test where practical.
- Cross-cutting or release-facing change: full tests and production build.

Before handing off a substantial code change, normally run:

```bash
CI=true npm test -- --runInBand
npm run build
```

Report any checks that were not run and why.

Do not update snapshots or expected values merely to make a failing test pass without confirming that the new behavior is intentional.

## Android and generated files

After changing web code, Capacitor synchronization is only necessary when Android assets or a native build are actually required.

Do not hand-edit generated build output. Do not commit new APKs, Gradle output, release proofs, checksums, or other release artifacts unless the user explicitly requests release work and the canonical release process requires them.

## Release process

Release operations use guarded repository automation and private maintainer instructions kept outside this public repository. Do not perform commits, pushes, tagging, release preparation, APK publication, or GitHub release creation unless the repository owner explicitly requests those state-changing actions. Never bypass the safeguards implemented by the release scripts.
