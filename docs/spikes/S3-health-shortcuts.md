# S3 · Apple Health through Shortcuts

**Question:** can a shortcut read correct daily totals from Health (steps, workouts, sleep), including from an automation while the phone is locked?
**Pass criteria:** step totals within 1% of the Health app for 7 days.
**If it fails:** drop the metric, or use exercise minutes for "workout days" ([Integrations §2](../spec/06-integrations.md#2-apple-health)).

## Prerequisites

An iPhone with Health data. Ideally also an Apple Watch, to check double counting.

## Build the test shortcut by hand

1. *Shortcuts → +*. Name it **S3 Health test**.
2. **Find Health Samples** where *Type* is *Steps* and *Start Date* is *today*. Add **Calculate Statistics** → *Sum*. Add **Show Result**.
3. Run it and compare with the Health app's step total for today.
4. If the numbers differ, check the sources: does Find Health Samples return both iPhone and Apple Watch samples (double counting)? Try the options for grouping or filtering by source, and write down which combination matches.
5. Repeat for **Workouts** (count of today's workouts) and **Sleep** (hours asleep last night). Note if the type isn't available in Find Health Samples.
6. **Locked phone:** *Shortcuts → Automation → + → Time of Day*, a time 5 minutes from now, **Run Immediately**, action: run *S3 Health test* but replace Show Result with **Append to Note** (so the result is saved). Lock the phone and wait. Did the note get a value, or an error?

## Results (7 days)

| Day | Health app steps | Shortcut steps | Difference | Workouts readable? | Sleep readable? | Locked automation worked? |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |
| 7 | | | | | | |

**Decision for Phase 5:** which metrics to support, the exact shortcut actions, and how often the automations should run.
