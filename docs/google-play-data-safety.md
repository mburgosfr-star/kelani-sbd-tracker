# Google Play Data Safety notes

Last updated: 2026-06-02

App: Kelani SBD Tracker  
Package name: com.kel.powerlifting  
Privacy policy URL: https://mburgosfr-star.github.io/kelani-site/#privacy

## App privacy model

Kelani SBD Tracker is offline-first.

The app has:

- No accounts
- No login
- No ads
- No analytics
- No tracking
- No developer server
- No automatic network data collection
- Local storage only
- User-controlled export/import/share features

The app stores training data locally on the user's device. This may include workouts, training history, bodyweight, body composition, Meet Planner attempts, meet prep checklist state and app settings.

## Google Play Data Safety recommended answers

### Does your app collect or share any of the required user data types?

Recommended answer: No

Reason: The app does not transmit user data off the user's device. Training data is processed and stored locally.

Google Play defines "collect" as transmitting data from the app off the user's device. On-device-only access/processing does not need to be disclosed as collected.

### Does your app share user data with third parties?

Recommended answer: No

Reason: The app does not automatically transfer user data to the developer or third parties.

The app has export/share features, but these are specific user-initiated actions. The user chooses whether to export/share a backup file and chooses the destination app.

### Is all user data collected by your app encrypted in transit?

Recommended answer: Not applicable / No data collected

Reason: The app does not collect user data by transmitting it off-device.

### Do you provide a way for users to request that their data is deleted?

Recommended answer: Not applicable for server-side deletion / No server-side user data

Reason: Kelani SBD Tracker does not use accounts or servers and the developer does not hold user data.

Users can delete local app data by clearing app data, uninstalling the app, or replacing local data with an imported backup.

### Does your app allow users to create an account?

Recommended answer: No

Reason: The app has no account creation, login or registration.

### Privacy policy

Use:

https://mburgosfr-star.github.io/kelani-site/#privacy

The privacy policy states that the app works offline, uses no accounts, ads, analytics or tracking, and stores training data locally unless the user chooses to export or share it.

## Data types note

The app may locally process fitness/training data and body-related entries, but this data is not transmitted off the device by the app.

Because the app does not collect or share this data automatically, the recommended Data Safety declaration is no data collected and no data shared.

## Third-party SDK/library note

Review included SDKs/libraries before submission.

Current app direction:

- React / Capacitor app
- Capacitor App
- Capacitor Filesystem
- Capacitor Share

No Firebase, AdMob, analytics SDK, crash reporting SDK or tracking SDK is intentionally used.

If future analytics, crash reporting, ads, accounts, cloud sync, server backups or push messaging are added, the Data Safety form and privacy policy must be updated before release.
