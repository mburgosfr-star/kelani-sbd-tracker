# Kelani SBD Tracker

[<img src="https://gitlab.com/IzzyOnDroid/repo/-/raw/master/assets/IzzyOnDroidButtonGreyBorder_nofont.png" height="80" alt="Get it at IzzyOnDroid">](https://apt.izzysoft.de/packages/com.kel.powerlifting)

[![IzzyOnDroid](https://img.shields.io/endpoint?url=https://apt.izzysoft.de/fdroid/api/v1/shield/com.kel.powerlifting&label=IzzyOnDroid)](https://apt.izzysoft.de/packages/com.kel.powerlifting)

Kelani SBD Tracker is a simple offline-first powerlifting app to track Squat, Bench and Deadlift training cycles.

Website: https://kelani-site.mburgosfr.workers.dev/

## Features

- Structured Squat, Bench Press and Deadlift training cycles
- Workout tracking with warm-ups, main work, back-offs and optional accessories
- Automatic progression based on performance
- Rest timer with audio signals
- Meet Planner for planning squat, bench press and deadlift attempts before competition day
- Meet prep checklist for practical competition-day preparation
- Bodyweight and body composition logging
- 1RM, estimated 1RM and strength statistics
- Perceived effort tracking for sets and completed workouts
- Local data export and import
- Offline-first: no internet required
- No accounts
- No ads
- No tracking
- Multilingual interface: English, Catalan and Dutch

## Download

IzzyOnDroid / Neo Store:

https://apt.izzysoft.de/packages/com.kel.powerlifting

Latest APK on GitHub:

https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest

## Screenshots

![Dashboard](screenshots/dashboard.png)
![Workout](screenshots/workout.png)
![Stats](screenshots/stats.png)

## Build from source

Requires JDK 21.

npm install  
npm run build  
npx cap sync android  
cd android  
./gradlew assembleRelease

For the local signed release APK workflow used by the maintainer:

npm install  
npm run android:release-apk  

For a clean release-style build:

npm install  
npm run build  
npx cap sync android  
cd android  
./gradlew clean assembleRelease --no-build-cache --no-configuration-cache --no-daemon  

## Notes

Kelani SBD Tracker is built for simplicity and consistency in training.

## Maintainer

Maintained by Kel.

- GitHub: https://github.com/mburgosfr-star
