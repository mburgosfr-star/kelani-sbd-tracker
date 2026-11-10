# Kelani User Guide

Kelani SBD Tracker helps you plan Squat, Bench Press and Deadlift workouts and track strength progress. See the [project overview and downloads](../README.md).

## Installation and Backups

Requires Android 7.0 or later. Download the APK from [official GitHub Releases](https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest), or install through [IzzyOnDroid](https://apt.izzysoft.de/packages/com.kelani.sbdtracker) using a compatible F-Droid client such as Neo Store. Open the APK and follow Android’s installation prompts. The official package is `com.kelani.sbdtracker`; [verify the download and publisher](../VERIFY.md).

Enter your starting lift maxes, choose your workout setup and start Smart Training. No Kelani sign-up is needed.

Export an independent JSON backup before updating. Existing 2.x users can update a compatible installation normally. Do not uninstall the app to bypass an installation error. GitHub APK updates are installed manually; a compatible F-Droid client can manage IzzyOnDroid updates. Kelani’s optional release checks link to downloads without installing updates automatically.

Kelani 1.x and 2.x have different Android identities and can coexist. To migrate, export a JSON backup from 1.x, import it into 2.x and verify your data before removing the older app.

## Smart Training

### Athlete Levels

Smart Training uses your lifetime **eStrength Max** (total estimated 1RM divided by bodyweight), with the same thresholds for everyone:

| Level | eStrength Max |
|---|---|
| Beginner | Below 4.5× |
| Intermediate | From 4.5× to below 5.5× |
| Advanced | From 5.5× to below 6.5× |
| Elite | 6.5× or higher |

These are relative-strength bands, informed by rounded quartiles of tested, raw, full-SBD competitors in [OpenPowerlifting](https://openpowerlifting.gitlab.io/opl-csv/bulk-csv.html). They do not measure training experience or prove an optimal training frequency. Competition totals are measured results, whereas eStrength includes estimates.

When updating from the previous 3×/6×/9× thresholds, your previous level is retained if the new calculation would lower it; a higher calculated level applies immediately. This protection is saved with your records and backups. Older backups receive the same protection when loaded. New profiles use the new thresholds immediately. The update does not inflate strength records or reset completed or started workouts. Future prescriptions use the resulting level. Meet-attempt percentages and the strength basis for training weights are unchanged.

### Training Calendar

New users start with Smart Training. The default calendar depends on the athlete level:

| Route | Beginner | Intermediate, Advanced and Elite |
|---|---|---|
| Build strength | W1–W18 | W1–W21 |
| Taper | W19–W24 | W22–W26 |
| SBD Meet Day | W25 | W27 |
| Planned post-meet recovery | W26 | W28 |

All beginner routes alternate a training day and a recovery day, including during taper. Each normal six-day block contains three sessions; the prescribed exercises, weights and volume per session remain the same. Feedback can adjust the calendar as described below.

Existing cycles keep their completed workouts and their numbering. Work already started keeps its saved prescription and set progress. The remaining plan adopts the new rhythm, so a cycle already underway can finish later than the default W26. No history or PRs are reset.

The Program screen shows the route ahead. Completed workouts show recorded work-set results on the right instead of the plan: green ✓ for successful sets and red ✕ for missed sets, grouped by repetitions, weight and recorded percentage. Warm-ups are omitted, as in the planning preview. A question mark means an older record has no saved outcome for that set. Confirmed strength determines the prescribed weights. Future workouts open in view-only mode; choosing **Workout** in the navigation returns to your current session.

**Too easy** shortens the route unless Meet Day is already next. **Too hard** or failed work can add recovery without scheduling more than two consecutive rest days. Readiness information explains progress without silently replacing planned workouts or postponing the meet.

Meet planning uses demonstrated real 1RM values. Estimated 1RM tracks progress from successful sets. Existing Classic users can continue their fixed programs or switch permanently to Smart using their existing history. Classic remains in maintenance mode.

### Starting a New Cycle Early

In **Settings → New cycle → Start**, you can leave the current cycle and begin Workout 1 of the next cycle without doing the planned meet. Confirmation is required. Any unfinished progress in the current workout is discarded; remaining workouts are not recorded as failed, and no meet results or cycle-completion result are created. Your completed history, PRs, body data and settings stay saved. The Meet Planner and meet checklist reset for the new cycle. After a break, the existing lighter return-workout option remains available; starting a new cycle does not itself lower your training weights.

To reset the app completely instead, open **Settings → Data & backups → Manage → Delete all data**. This requires a separate confirmation and removes local training data. Export a backup first if you want to keep it.

## Automatic Backup History

In **Settings → Data & backups → Manage → Backup History**, choose **Latest backup only**, **7 days**, **30 days** (default), or **90 days**. The latest automatic backup is still updated after completed workouts and relevant body-data changes. Android and desktop also keep at most one daily recovery point, updated with the last successful backup that day. Retention uses the device's local calendar days, not the number of workouts. At most 90 daily files are kept, plus the latest backup and one safety copy. Reserved previous copies of the latest backup or safety copy may also remain locally to recover an interrupted file replacement. These are separate from the daily recovery points.

A shorter retention period, including **Latest backup only**, takes effect when a new automatic backup is successfully written and verified. Only Kelani's daily files in its dedicated history folder are cleaned up. Manual exports, the latest backup and the safety copy are never removed by this cleanup. The latest backup remains available after a long training break.

Select **Restore** beside a date to preview its cycle and workout progress, then confirm. Restoring replaces your local history, records, settings and in-progress workout; it does not merge histories. Kelani first writes and verifies a separate **Safety backup before restore** containing your current data. If that fails, restoration stops. That safety copy stays available in Backup History until the next restoration replaces it with a new verified safety copy. The retention preference belongs to this installation and is not changed by importing training data. Calendar events already written outside Kelani are not undone by restoration.

On Android, history is stored below `Kelani SBD Tracker/Automatic Backups/History` in the app's Documents location. Desktop uses `Backups/History` in its own application-data directory. Browsers do not create automatic backup files; use manual export and import there. Keep an independent export outside the app and device for protection against device loss or storage failure. Files created before this feature cannot provide earlier recovery points that were already overwritten.

## Warm-ups and Work Sets

Warm-ups prepare for the first work set or opening meet attempt. They use multiples of 10 kg and only 1, 3 or 5 repetitions. The final warm-up aims for about 85% of that weight and never exceeds 90%. Warm-ups above this limit are removed, allowing a larger final jump at very high loads.

The five-column workout grid stays filled. Newly generated work-set and back-off blocks contain 2–6 volume sets, depending on the warm-up count. Started workouts and completed history keep their saved prescriptions.

Smart volume work uses these target percentages:

| Phase | Heavy: 3 reps | Medium: 4 reps | Light: 5 reps |
|---|---|---|---|
| Triple | 80% | 75% | 70% |
| Double | 75% | 70% | 65% |
| Single | 70% | 65% | 60% |
| Taper | 70% | 65% | 60% |

On Meet Day, each lift shows its warm-ups and attempts on separate, centered rows. Top sets have their own prescriptions. During a workout you can complete or fail sets, adjust and restore weights, and open the plate calculator. Failed sets make the workout **Too hard**. Optional preparation, accessories and cooldown work left unchecked are not treated as failure.

## Rest Timer

The timer provides sound and Android notifications. After the final warm-up before a top single, double or triple, including Classic heavy singles, it gives five minutes of rest. Meet-day rest is eight minutes. On Android, the ready-for-next-set message remains visible when you return after the timer finishes.

## Workout Setup and Progress

In **Settings → Workout setup**, choose whether preparation and accessories are enabled, which exercises belong to each lift, and their sets and reps. Kelani places the selected exercises into relevant workouts and chooses their training intensity. Meet Day contains only the competition lifts.

Statistics track 1RM, estimated 1RM, SBD totals, Strength, eStrength and body measurements. Completed cycles include a results review, progress since the start and a chart of the best recorded 1RM total. You can preview and share a cycle-results card from the review. Navigating to another screen starts the next cycle.

## Optional Calendar and Sharing

After granting Android calendar access, select a calendar and start the first sync manually. Kelani then keeps its workout events up to date. Planning covers the remaining current cycle and one provisional next cycle; dates can change with training results and settings.

Events receive a reminder at their start time. Reminders you change are preserved, and events you manually delete stay deleted. You can choose to remove Kelani’s events for completed workouts. Your calendar provider may sync events through its own service.

Feedback and issue reporting remain available in About & Updates. You choose what to submit through GitHub or your email app. Email reveals your sender address and possibly your name. See the [privacy policy](privacy-policy.md) for the complete calendar, sharing and update-check details.

## Sharing and Contact

Tap the logo or the version with the information icon to open **Settings → About & Updates**. The logo and version form one button. This does not reset your training data.

The header logo and version open **About & Updates** over the current screen. Closing it returns to the same screen. Result screens and dialogs use larger text on wider displays while retaining the compact layout on smaller phones.

**Share Kelani** is available after completing a workout, rest day, meet or cycle, on strength-milestone dialogs, and in About & Updates. Review the image and download text before choosing **Share**. Result cards use successful recorded sets and achievements, not planned or failed weights. Estimated records remain labeled e1RM. Meet totals require a successful result for all three lifts. Cards include your level, cycle and workout number and follow your interface language and weight unit. They exclude names, body measurements, notes and full training backups.

On Android, choose an app and recipient in the system share sheet. The download address is shared as separate text with a clickable link, outside the image. The receiving app decides how image and text appear. Canceling does not change your saved workout. In browsers that do not support image sharing, download the image and use **Copy download link** to include the text when you send it.

About & Updates has one email action, one link to the GitHub project, and one link to IzzyOnDroid, also usable with clients such as NeoStore. Email opens a blank draft; GitHub provides downloads, feedback and issue reporting. **Support Kelani** remains a separate, optional GitHub Sponsors action. Completing training or reaching a milestone no longer prompts you to email feedback.

## Google Play Testing

The Google Play closed test is not open yet. To express interest, [see the volunteer invitation](https://www.reddit.com/r/alphaandbetausers/comments/1xfunxi/android_looking_for_volunteer_testers_for_kelani/). Please do not post your email address publicly. Trying the current APK does not enroll you in a Play test.

## Support and Desktop Prototypes

Report bugs and suggestions through [GitHub Issues](https://github.com/mburgosfr-star/kelani-sbd-tracker/issues). Do not attach personal training backups publicly.

You can [support development through GitHub Sponsors](https://github.com/sponsors/mburgosfr-star). Contributions are optional, require GitHub sign-in and unlock no additional training features. GitHub and IzzyOnDroid downloads remain free.

The experimental [Ubuntu](ubuntu-prototype.md) and [Windows](windows-prototype.md) desktop versions use separate profiles, with no automatic phone synchronization. Follow their platform guides for installation and limitations.
