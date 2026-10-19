# 01 · Product

## 1. Vision

A habit tracker that's fastest to use at the moment a habit happens. Say *"Hey Siri, log habit"* and it's recorded. Get reminded at the right time, and only when it's still needed. See honest progress on your phone or computer. Apple Health confirms some habits automatically, and your habits appear in Google Calendar.

## 2. Goals

| Goal | How we measure it |
|---|---|
| Logging takes no effort | Median time to log: ≤ 2 s after opening the app, ≤ 6 s by voice with Siri |
| The app feels instant | Feedback after a tap ≤ 100 ms (see [NFR-PERF](03-architecture.md#9-performance-budgets)) |
| Reminders help instead of nagging | < 10% of reminders are for habits that are already done |
| People keep using it | 30-day retention; share of active users with a streak of 7+ days |

## 3. Users and platforms

The app is **multi-user**: anyone can create an account. Each user only sees their own data.

| Capability | iPhone (installed PWA) | Android (installed PWA) | Desktop (browser or installed) |
|---|---|---|---|
| Track habits, stats, settings | ✅ | ✅ | ✅ |
| Push notifications | ✅ iOS 16.4+, only after "Add to Home Screen" | ✅ | ✅ |
| Buttons inside the notification ("Done", "Snooze") | ❌ Tapping opens the app | ✅ | ✅ Chrome / Edge |
| Log with Siri | ✅ through Shortcuts | ❌ | ❌ (macOS Shortcuts could work later) |
| Apple Health checks | ✅ through Shortcuts | ❌ | ❌ |
| Google Calendar sync | ✅ | ✅ | ✅ |
| Pending-count badge on the app icon | ✅ | ✅ (depends on launcher) | ✅ (depends on browser) |

## 4. Scope

**In scope for v1:** everything in the brief, plus the features agreed in review: smart reminders, streaks with skip days, Siri feedback, undo, logging past days, routine mode, statistics, a Shortcuts widget, weekly review, pause and archive, data export, and Spanish and English versions.

**Out of scope for v1:** native apps and the App Store, Apple Watch, Android Health Connect / Google Fit, iCloud and Outlook calendars, social features (friends, sharing, leaderboards), AI coaching, payments, and importing from other apps.

## 5. Functional requirements

Everything below is in v1. The [roadmap](08-roadmap.md) says which phase delivers each group. Items marked **(Should)** may slip without blocking a phase.

### 5.1 Account and profile — `FR-ACC`

- **FR-ACC-1** Sign up and sign in with a 6-digit email code, or with Google.
- **FR-ACC-2** On first sign-in, a profile is created with the browser language, the device timezone (IANA name), the day ending at 04:00, and the week start taken from the locale (Monday if unknown).
- **FR-ACC-3** Settings: display name, language (es/en), timezone, day end (00:00–06:00), week start (Monday/Sunday), theme (system/light/dark), and how many past days can be edited (0–30, default 7).
- **FR-ACC-4** When the app opens and the device timezone differs from the profile, ask: "You seem to be in *X*. Update your timezone?"
- **FR-ACC-5** Delete account. This removes all data, revokes Google access, deletes push subscriptions and revokes API tokens. The user must type a confirmation word.
- **FR-ACC-6** Sign out of all devices.

### 5.2 Habits — `FR-HAB`

- **FR-HAB-1** Create and edit a habit with these fields:

  | Field | Required | Notes |
  |---|---|---|
  | Name | ✅ | 1–80 characters |
  | Icon and color | — | Default comes from the category |
  | Category | — | See FR-HAB-3 |
  | Description | — | Free text |
  | Type | ✅ | Boolean, or measurable with **target**, **unit** and **step** (e.g. 8 glasses, step 1) |
  | Schedule | ✅ | Every day · specific weekdays · N times per week |
  | Routine | — | Morning, Evening, a custom routine, or *Anytime* |
  | Time | — | Overrides the routine's start time. Needed for an individual reminder |
  | Duration | — | Minutes. Used by the routine-mode timer and the calendar event |
  | Reminder | — | On/off. How many minutes before (default from profile: 5) |
  | Cue | — | Habit stacking: "After I *brew coffee*…" |
  | Voice aliases | — | Other names Siri should recognize ("meditation", "meditar") |
  | Health rule | — | iPhone only: metric and target, e.g. steps ≥ 5,000 |
  | Calendar sync | — | On/off, when Google Calendar is connected |
  | Start date | ✅ | Default today |

- **FR-HAB-2** A template gallery, in both languages, pre-fills the form. Examples: Drink water (8 glasses), Walk 5,000 steps (Health), Meditate 10 min, Read 20 pages, Work out 4×/week (Health), Journal, Sleep 7 h (Health), Stretch.
- **FR-HAB-3** Categories: defaults (Health, Fitness, Mind, Learning, Productivity, Home) shown in the current language. Users can add, rename, recolor and delete categories. Deleting one leaves its habits uncategorized.
- **FR-HAB-4** Reorder habits inside a routine by drag and drop, with a keyboard alternative. This order is the order of routine mode.
- **FR-HAB-5** Pause a habit from a date, optionally until a date. While paused it isn't expected, isn't reminded, and doesn't count in scores or streaks. **Vacation mode** pauses every habit.
- **FR-HAB-6** Archive a habit: it's hidden and its history is kept, and it can be restored. **Delete** removes the habit and its history after a confirmation.
- **FR-HAB-7** Changing a schedule or target applies from today on. Past days keep being judged by the schedule that applied then (see `R-SCHED-0`).

### 5.3 Routines — `FR-RTN`

- **FR-RTN-1** Every account starts with **Morning** (07:00) and **Evening** (21:00) routines, plus the implicit *Anytime* group. Onboarding asks the user to confirm the times.
- **FR-RTN-2** Custom routines (e.g. "Afternoon", "Start of work"), each with a name, icon, start time, optional end time, order, and digest on/off.
- **FR-RTN-3** **Routine digest:** a notification at the routine's start time listing its pending habits. Tapping it opens routine mode. This covers brief item *Recordatorio 3*.
- **FR-RTN-4** Deleting a routine moves its habits to *Anytime*.

### 5.4 Check-ins — `FR-CHK`

- **FR-CHK-1** Boolean habit: a tap toggles done. Measurable habit: a tap adds the step. A long press or the "…" menu lets the user type an exact value or mark it complete (value = target).
- **FR-CHK-2** Skip with a reason (sick, travel, rest, other). Only for habits with fixed days. Flexible habits use pause instead.
- **FR-CHK-3** An optional note on any check-in.
- **FR-CHK-4** **Undo:** every check-in action shows an *Undo* toast for 5 seconds. Entries in a habit's history can be edited at any time inside the edit window.
- **FR-CHK-5** **Past days:** previous days inside the edit window can be logged from the day switcher on Today or from the habit history. Never before the habit's start date, never in the future.
- **FR-CHK-6** Each check-in records where it came from: app, routine mode, Siri, notification button, or Health. The history shows it.
- **FR-CHK-7** Logging works offline and syncs when back online. The same action sent twice, or from two devices, never creates duplicates.
- **FR-CHK-8** Flexible (N per week) habits count at most one completion per day.

### 5.5 Today — `FR-TOD`

- **FR-TOD-1** Shows the current *habit day* (not the calendar day) with the daily score as a ring.
- **FR-TOD-2** Sections by routine in time order, then *Anytime*, then *This week* for flexible habits ("Gym 2/4").
- **FR-TOD-3** Each row shows icon, name, time, streak, progress and state. A **"Don't miss twice"** badge appears when the previous occurrence was missed.
- **FR-TOD-4** A day switcher to go back to past days inside the edit window.
- **FR-TOD-5** Updates live when a check-in arrives from another device, Siri or Health.
- **FR-TOD-6** A friendly "rest day" state when nothing is scheduled.
- **FR-TOD-7** A setup checklist (Install · Notifications · Siri · Health · Calendar) until it's finished or dismissed.

### 5.6 Routine mode — `FR-RMD`

- **FR-RMD-1** *Start* on a routine opens a full-screen, step-by-step view of its pending habits, in order.
- **FR-RMD-2** Each step shows the name, cue and description, with **Done / Skip / Later**. Measurable habits show a stepper. Habits with a duration offer a timer, and the screen is kept awake where the browser supports it.
- **FR-RMD-3** A progress indicator, and a summary at the end ("4 of 5 done · 🔥 Meditate 12 days") with a celebration.
- **FR-RMD-4** Leaving halfway keeps everything already logged.

### 5.7 Streaks and motivation — `FR-STK`

- **FR-STK-1** Current and best streak for every habit (rules in `R-STREAK`).
- **FR-STK-2** Skips and pauses never break a streak.
- **FR-STK-3** "Don't miss twice": a habit missed on its last occurrence is highlighted the next time. A flexible habit whose week is at risk ("2 more needed, 2 days left") is highlighted too.
- **FR-STK-4** Celebrations when a streak reaches 3, 7, 14, 30, 60, 100, 200 or 365.
- **FR-STK-5** A "perfect day" celebration at a 100% daily score.
- **FR-STK-6** Celebrations respect the system "reduce motion" setting.

### 5.8 Statistics — `FR-STA`

- **FR-STA-1** Overview: heatmap of daily scores for the last 12 months, weekly score trend for the last 12 weeks, this week compared with last week.
- **FR-STA-2** Per habit: current and best streak; completion rate for 7, 30 and 90 days and all time; heatmap; results by weekday; for measurable habits, a value chart with the target line; notes; editable history.
- **FR-STA-3** Breakdown by routine and by category.
- **FR-STA-4** "Needs attention" (under 50% for the last 3 weeks) and "Strongest" (longest active streaks) lists.
- **FR-STA-5** Best and worst weekdays overall.
- **FR-STA-6** Period filter: 7 days · 30 days · 90 days · 12 months · all.
- **FR-STA-7** Stats are computed on the device from local data, so they open instantly and work offline.

### 5.9 Reflection and weekly review — `FR-REV`

- **FR-REV-1** Optional daily mood (1–5) and note, from Today or from the daily report.
- **FR-REV-2** **Weekly review** page, also opened from the weekly notification: week score and change from last week, result per habit, wins (streaks kept, perfect days), misses, the week's notes, mood trend.
- **FR-REV-3** A short reflection ("What worked? What will you change?") saved with the week.
- **FR-REV-4** **(Should)** Suggestions: a habit under 50% three weeks in a row gets an offer to lower the target, reduce the days, or move it to another routine, applied with one tap.

### 5.10 Notifications — `FR-NTF`

- **FR-NTF-1** Turn on push for each device. Settings list the user's devices with their status and a "Send test" button.
- **FR-NTF-2** **Habit reminder** at the habit's time minus the lead time (default 5 min from the profile, can be changed per habit, can be turned off per habit). Only for habits with their own time. Habits that only belong to a routine are covered by the routine digest. *(Brief: Recordatorio 1)*
- **FR-NTF-3** **Smart reminders:** no reminder if the habit is already done or skipped, is paused, already meets its Health target, or if the user muted notifications or is in quiet hours.
- **FR-NTF-4** **Routine digest** (FR-RTN-3). *(Brief: Recordatorio 3)*
- **FR-NTF-5** **Daily report** at the time the user picks: score %, done/total, best active streak, what's missing, "don't miss twice" items. Tapping it opens Today with the mood prompt. *(Brief: Recordatorio 2)*
- **FR-NTF-6** **Weekly review** notification on the day and time the user picks (default Sunday 19:00).
- **FR-NTF-7** Quiet hours (start and end time).
- **FR-NTF-8** "Mute for today", and snooze a reminder for 15, 30 or 60 minutes.
- **FR-NTF-9** The app icon badge shows how many habits are still pending today.
- **FR-NTF-10** "Done" and "Snooze 15 min" buttons inside the notification where the platform supports them (Android, desktop). On iPhone, tapping opens that habit.
- **FR-NTF-11** All notification text is in the user's language.
- **FR-NTF-12** On iPhone, the app guides the user to add it to the Home Screen *before* asking for notification permission, because iOS requires that.

### 5.11 Siri and Shortcuts — `FR-SIR`

- **FR-SIR-1** *Settings → Siri & Shortcuts*: create a personal access token (shown only once), list and revoke tokens, install links in Spanish and English, a step-by-step guide, and a check that turns green after the first successful call.
- **FR-SIR-2** **"Log habit" / "Registrar hábito":** Siri asks which habit, listing today's pending ones, logs it, and says the result: streak and what's left.
- **FR-SIR-3** The user can say a habit's name or an alias. Matching ignores case and accents and tolerates small differences. If two habits match, Siri asks which one.
- **FR-SIR-4** Measurable habits: each log adds the step. Siri answers "Water: 5 of 8 glasses".
- **FR-SIR-5** **"Undo habit" / "Deshacer hábito":** undoes today's last check-in and says what it undid.
- **FR-SIR-6** **"How am I doing" / "Cómo voy":** says today's score and what's left.
- **FR-SIR-7** Direct shortcuts for one habit ("I meditated" / "Ya medité"). The app shows how to create them and a button to copy the habit's ID.
- **FR-SIR-8** A guide to add a Shortcuts widget to the Home Screen for one-tap logging. It also covers the Action Button and Back Tap.
- **FR-SIR-9** Check-ins made with Siri appear live in the open app and sync to Google Calendar.

### 5.12 Apple Health — `FR-HLT`

- **FR-HLT-1** A habit can have a Health rule: a metric and a minimum, e.g. steps ≥ 5,000, workouts ≥ 1, sleep ≥ 7 h.
- **FR-HLT-2** Metrics: steps, exercise minutes, active energy, walking and running distance, mindful minutes, workouts (count), sleep hours. Workouts and sleep depend on spike S3.
- **FR-HLT-3** A "Sync Health" shortcut sends daily totals for today and yesterday. The app shows how to run it automatically several times a day. Settings show "Last Health sync: 12 min ago" and warn if it's been more than 24 hours.
- **FR-HLT-4** When a metric reaches the target, that day's occurrence is completed automatically, with source Health and a "Verified by Health" badge. A measurable habit linked to a metric shows the metric's value (the progress bar fills up by itself).
- **FR-HLT-5** Manual check-ins always win, and Health never un-completes a habit. If the user undoes an automatic completion, Health won't complete it again that day.
- **FR-HLT-6** The user can delete all stored Health data.
- **FR-HLT-7** The brief's examples must work: "walk 5,000 steps a day" and "train 4 times a week (Mon, Tue, Thu, Fri)".

### 5.13 Google Calendar — `FR-CAL`

- **FR-CAL-1** Connect a Google account from *Settings → Integrations*. The app creates its own calendar, "Habits" / "Hábitos", and never touches other calendars.
- **FR-CAL-2** A toggle per habit. Synced habits with fixed days and a time (their own or the routine's) appear as recurring events with their duration (default 15 min).
- **FR-CAL-3** Completing a habit from any source, including Siri, renames that day's event to "✅ *Name*" and turns it green. Undo reverts it. A skip shows "⏭️ *Name*".
- **FR-CAL-4** Changes to the schedule or time update future events and keep past ones. Paused days are removed from the series. Archiving ends the series; deleting the habit removes it.
- **FR-CAL-5** Flexible (N per week) habits and habits without a time are not synced in v1. The toggle explains why.
- **FR-CAL-6** Events have no Google reminders, so the user doesn't get two notifications. Events are marked "free", so habits don't block the user's availability.
- **FR-CAL-7** Disconnect: syncing stops, access is revoked, and the user can choose to delete the Habits calendar. If access expires, a "Reconnect" banner appears.

### 5.14 Data and privacy — `FR-DAT`

- **FR-DAT-1** Export all data as JSON, or check-ins as CSV.
- **FR-DAT-2** Delete Health data. Delete the account (FR-ACC-5).
- **FR-DAT-3** Privacy policy and terms pages. Google requires them to verify the OAuth app.

### 5.15 Languages — `FR-I18N`

- **FR-I18N-1** The whole interface exists in Spanish and English. The language can be changed at any time in Settings, and the change also applies to notifications, Siri replies and the calendar's name.
- **FR-I18N-2** Default: Spanish if the browser language starts with `es`, otherwise English.
- **FR-I18N-3** Dates, numbers and plurals follow the language (Intl / ICU messages).
- **FR-I18N-4** Default content (routines, categories, templates) is shown in the current language until the user renames it.
- **FR-I18N-5** Shortcuts come in both languages, because Siri's phrase is the shortcut's name.

### 5.16 PWA and offline — `FR-PWA`

- **FR-PWA-1** Installable on iPhone, Android and desktop, with an install guide per platform (iPhone has no install prompt).
- **FR-PWA-2** Opens offline with the last data. Check-ins made offline are queued. A small indicator shows the sync status.
- **FR-PWA-3** When a new version is available, an "Update available" toast offers to reload.

## 6. Non-functional requirements

| ID | Requirement | Where it's detailed |
|---|---|---|
| NFR-1 | Works on phones and computers, responsive from 360 px wide | [UX §3](07-ux.md#3-navigation-and-layout) |
| NFR-PERF | Views and updates feel instant (< 100 ms, brief NFR 2) | [Architecture §9](03-architecture.md#9-performance-budgets) |
| NFR-UX | Intuitive interface with modern UI/UX patterns (brief NFR 3–4) | [UX §1–2](07-ux.md) |
| NFR-A11Y | WCAG 2.2 AA | [UX §7](07-ux.md#7-accessibility) |
| NFR-SEC | Each user's data isolated by RLS; secrets encrypted; minimal Health data | [Architecture §10](03-architecture.md#10-security-and-privacy) |
| NFR-REL | Reminders leave the server within 60 s of their time (p95). Delivery itself depends on Apple, Google and Mozilla push services | [Architecture §5](03-architecture.md#5-scheduler) |
| NFR-SCALE | Handles 10,000 users with ~20 habits each without design changes | [Data model](04-data-model.md) |
| NFR-I18N | Spanish and English everywhere, including server-generated text | [Architecture §7](03-architecture.md#7-internationalization) |
