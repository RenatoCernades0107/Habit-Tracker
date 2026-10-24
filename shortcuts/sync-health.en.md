# Sync Health (English) · v1.0

Sends Apple Health daily totals for today and yesterday to Restart, which completes habits with a
Health rule (e.g. steps ≥ 5,000). Run it from automations several times a day.

For **each metric your habits use** (steps, exercise minutes, active energy, walking + running
distance, mindful minutes, workouts, sleep):

1. **Find Health Samples** where *Type* is the metric and *Start Date* is *today*.
2. **Calculate Statistics** → *Sum* of the samples (for workouts: *Count*).
3. **Dictionary**: `metric` = `steps` (the API name), `date` = **Format Date** (today, custom
   format `yyyy-MM-dd`), `value` = the sum. **Add to Variable** `Metrics`.
4. Repeat steps 1–3 for **yesterday** (late data from an Apple Watch).

Then:

5. **Text**: your token (Import Question).
6. **Get Contents of URL**: `https://<app>/api/v1/health`, POST, JSON body `metrics` = *Metrics*,
   headers `Authorization` = `Bearer ` + *Text* and `X-Shortcut-Version` = `1.0`.
7. **Get Dictionary Value**: `speech` → **Show Result** (hidden when run by an automation).

API names: `steps`, `exercise_minutes`, `active_energy_kcal`, `distance_km`, `mindful_minutes`,
`workouts`, `sleep_hours`.

## Automations

Shortcuts → **Automation** → **Time of Day**: 12:00, 18:00, 21:00, and 15 minutes before your daily
report. Choose **Run Immediately** and turn off **Notify When Run**.

## Notes (spike S3)

- iPhone and Apple Watch both record steps; check that the sum matches the Health app. If it's
  higher, filter the samples by source or use one device.
- Sleep: sum the *Asleep* samples of the night that ends today, so the night counts for the day you
  wake up.
- Health data can't be read while the iPhone is locked; several automations and the "yesterday"
  pass make up for it.
