# Kelani SBD Tracker

[<img src="https://gitlab.com/IzzyOnDroid/repo/-/raw/master/assets/IzzyOnDroidButtonGreyBorder_nofont.png" height="80" alt="Get it at IzzyOnDroid">](https://apt.izzysoft.de/packages/com.kel.powerlifting)

[![IzzyOnDroid](https://img.shields.io/endpoint?url=https://apt.izzysoft.de/fdroid/api/v1/shield/com.kel.powerlifting&label=IzzyOnDroid)](https://apt.izzysoft.de/packages/com.kel.powerlifting)

**Kelani SBD Tracker** is a calm, offline-first powerlifting app for structured Squat, Bench Press and Deadlift training.

It helps you plan, track and complete SBD workouts without accounts, ads, subscriptions, analytics or cloud lock-in. Your training data stays on your device unless you choose to export it.

Website: https://kelani-site.mburgosfr.workers.dev/  
YouTube: https://www.youtube.com/@KelaniFocus  
Support Kelani: https://kelani-site.mburgosfr.workers.dev/#support

## Why Kelani?

Most training apps are either too generic, too social, too expensive, or too dependent on cloud accounts.

Kelani is intentionally smaller and calmer. It focuses on the training flow itself: clear SBD workouts, practical progression, useful feedback, and local control of your data.

- **Focused on SBD** — built around Squat, Bench Press and Deadlift
- **Offline-first** — your training data stays on your device
- **No account required**
- **No ads**
- **No analytics or tracking**
- **No subscription or locked training features**
- **Open source** — the code is public
- **Built for practical long-term progress, not social media engagement**

## Features

- Structured Squat, Bench Press and Deadlift training cycles
- Workout tracking with warm-ups, main work, back-off work and optional accessories
- Automatic progression based on completed training
- Rest timer with audio signals
- 1RM, estimated 1RM and strength statistics
- Bodyweight and body composition logging
- Perceived effort tracking for sets and completed workouts
- Meet Planner for attempt selection before competition day
- Meet prep checklist for practical competition-day preparation
- Exercise alternatives for lifters who need temporary lower-stress options
- Local data export and import
- Multilingual interface: English, Catalan and Dutch

## Download

### IzzyOnDroid / Neo Store

https://apt.izzysoft.de/packages/com.kel.powerlifting

### Latest APK on GitHub

https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest

## Screenshots

![Dashboard](screenshots/dashboard.png)

![Workout](screenshots/workout.png)

![Stats](screenshots/stats.png)

## Feedback and support

Kelani is actively developed and real user feedback matters.

If something is confusing, broken, missing, or useful to you, please open an issue:

https://github.com/mburgosfr-star/kelani-sbd-tracker/issues

Good feedback examples:

- “This workout screen is hard to understand because…”
- “This exercise alternative would help me because…”
- “The Dutch/Catalan/English text sounds wrong here…”
- “I expected the app to do X, but it did Y.”

## Support Kelani

Kelani is free, offline-first and open source. There are no ads, subscriptions or tracking.

If the app helps your training, you can support the project here:

https://kelani-site.mburgosfr.workers.dev/#support

Support helps keep Kelani maintained, tested on real devices, improved over time, and independent.

## Build from source

Requires JDK 21.

```bash
npm install
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

For the local signed release APK workflow used by the maintainer:

```bash
npm install
npm run android:release-apk
```

For a clean release-style build:

```bash
npm install
npm run build
npx cap sync android
cd android
./gradlew clean assembleRelease --no-build-cache --no-configuration-cache --no-daemon
```

## Maintainer

Maintained by Kel.

- GitHub: https://github.com/mburgosfr-star
- Website: https://kelani-site.mburgosfr.workers.dev/
- YouTube: https://www.youtube.com/@KelaniFocus
