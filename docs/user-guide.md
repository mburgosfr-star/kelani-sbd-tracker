# Kelani User Guide

Kelani SBD Tracker helps you plan Squat, Bench Press and Deadlift workouts and track strength progress. See the [project overview and downloads](../README.md).

## Installation and Backups

Requires Android 7.0 or later. Download the APK from [official GitHub Releases](https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest), or install through [IzzyOnDroid](https://apt.izzysoft.de/packages/com.kelani.sbdtracker) using a compatible F-Droid client such as Neo Store. Open the APK and follow Android’s installation prompts. The official package is `com.kelani.sbdtracker`; [verify the download and publisher](../VERIFY.md).

Enter your starting lift maxes, choose your workout setup and start Smart Training. No Kelani sign-up is needed.

Export an independent JSON backup before updating. Existing 2.x users can update a compatible installation normally. Do not uninstall the app to bypass an installation error. GitHub APK updates are installed manually; a compatible F-Droid client can manage IzzyOnDroid updates. Kelani’s optional release checks link to downloads without installing updates automatically.

Kelani 1.x and 2.x have different Android identities and can coexist. To migrate, export a JSON backup from 1.x, import it into 2.x and verify your data before removing the older app.

## Smart Training

New users start with Smart Training. It follows a level-specific 28-workout ideal route:

| Route | Purpose |
|---|---|
| W1–W21 | Build strength with heavy, medium and light workouts |
| W22–W26 | Taper |
| W27 | SBD Meet Day |
| W28 | Planned post-meet recovery |

The Program screen shows the route ahead. Completed workouts show recorded work-set results on the right instead of the plan: green ✓ for successful sets and red ✕ for missed sets, grouped by repetitions, weight and recorded percentage. Warm-ups are omitted, as in the planning preview. A question mark means an older record has no saved outcome for that set. Confirmed strength determines the prescribed weights. Future workouts open in view-only mode; choosing **Workout** in the navigation returns to your current session.

**Too easy** shortens the route unless Meet Day is already next. **Too hard** or failed work can add recovery without scheduling more than two consecutive rest days. Readiness information explains progress without silently replacing planned workouts or postponing the meet.

Meet planning uses demonstrated real 1RM values. Estimated 1RM tracks progress from successful sets. Existing Classic users can continue their fixed programs or switch permanently to Smart using their existing history. Classic remains in maintenance mode.

## Warm-ups and Work Sets

Warm-ups prepare for the first work set or opening meet attempt. They use multiples of 10 kg and only 1, 3 or 5 repetitions. The final warm-up aims for about 85% of that weight and never exceeds 90%. Warm-ups above this limit are removed, allowing a larger final jump at very high loads.

The five-column workout grid stays filled. Newly generated work-set and back-off blocks contain 1–5 volume sets, depending on the warm-up count. Started workouts and completed history keep their saved prescriptions.

Smart volume work uses these target percentages:

| Phase | Heavy: 3 reps | Medium: 4 reps | Light: 5 reps |
|---|---|---|---|
| Triple | 80% | 75% | 70% |
| Double | 75% | 70% | 65% |
| Single | 70% | 65% | 60% |
| Taper | 70% | 65% | 60% |

Top sets have their own prescriptions. During a workout you can complete or fail sets, adjust and restore weights, and open the plate calculator. Failed sets make the workout **Too hard**. Optional preparation, accessories and cooldown work left unchecked are not treated as failure.

## Rest Timer

The timer provides sound and Android notifications. After the final warm-up before a top single, double or triple, including Classic heavy singles, it gives five minutes of rest. Meet-day rest is eight minutes. On Android, the ready-for-next-set message remains visible when you return after the timer finishes.

## Workout Setup and Progress

In **Settings → Workout setup**, choose whether preparation and accessories are enabled, which exercises belong to each lift, and their sets and reps. Kelani places the selected exercises into relevant workouts and chooses their training intensity. Meet Day contains only the competition lifts.

Statistics track 1RM, estimated 1RM, SBD totals, Strength, eStrength and body measurements. Completed cycles include a results review, progress since the start and a chart of the best recorded 1RM total. You can send feedback from the review. Navigating to another screen starts the next cycle.

## Optional Calendar and Sharing

After granting Android calendar access, select a calendar and start the first sync manually. Kelani then keeps its workout events up to date. Planning covers the remaining current cycle and one provisional next cycle; dates can change with training results and settings.

Events receive a reminder at their start time. Reminders you change are preserved, and events you manually delete stay deleted. You can choose to remove Kelani’s events for completed workouts. Your calendar provider may sync events through its own service.

The optional usage summary is generated locally and shown in full before you choose to copy or email it. Sending email reveals your sender address and possibly your name. See the [privacy policy](privacy-policy.md) for the complete calendar, sharing and update-check details.

## Google Play Testing

The Google Play closed test is not open yet. To express interest, [see the volunteer invitation](https://www.reddit.com/r/alphaandbetausers/comments/1xfunxi/android_looking_for_volunteer_testers_for_kelani/). Please do not post your email address publicly. Trying the current APK does not enroll you in a Play test.

## Support and Desktop Prototypes

Report bugs and suggestions through [GitHub Issues](https://github.com/mburgosfr-star/kelani-sbd-tracker/issues). Do not attach personal training backups publicly.

You can [support development through GitHub Sponsors](https://github.com/sponsors/mburgosfr-star). Contributions are optional, require GitHub sign-in and unlock no additional training features. GitHub and IzzyOnDroid downloads remain free.

The experimental [Ubuntu](ubuntu-prototype.md) and [Windows](windows-prototype.md) desktop versions use separate profiles, with no automatic phone synchronization. Follow their platform guides for installation and limitations.
