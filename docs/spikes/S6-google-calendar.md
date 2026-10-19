# S6 · Google Calendar with `calendar.app.created`

**Questions:** (1) does the narrow scope `calendar.app.created` allow everything Restart needs (create a calendar, a recurring event, patch one day, exclude a day)? (2) With the app *In production* but **unverified**, is the warning screen the only obstacle, and do refresh tokens last longer than 7 days?
**Pass criteria:** the script passes all steps, and `--refresh-check` still works after 8 days.
**If it fails:** use a broader Calendar scope, with a clear explanation to users ([Integrations §3](../spec/06-integrations.md#3-google-calendar)).

## 1. Create the OAuth client

1. [Google Cloud Console](https://console.cloud.google.com) → create (or pick) a project → *APIs & Services → Library* → enable **Google Calendar API**.
2. *OAuth consent screen*: type **External**, app name **Restart**, your support email. Add the scope `.../auth/calendar.app.created`.
3. Set the publishing status to **In production**. Don't submit for verification. Staying in *Testing* would make refresh tokens expire after 7 days, which is exactly what this spike checks.
4. *Credentials → Create credentials → OAuth client ID*, type **Desktop app**. Copy the client ID and secret.

## 2. Run the test

```bash
export GOOGLE_CLIENT_ID=….apps.googleusercontent.com
export GOOGLE_CLIENT_SECRET=…
node scripts/spikes/s6-google-calendar.mjs --tz America/Lima
```

The script prints a Google URL. Open it and sign in. You should see "Google hasn't verified this app": choose *Advanced → Go to Restart (unsafe)*, then allow access. The script then prints PASS or FAIL for each step (`--help` lists them). The refresh token is saved to `~/.restart-s6-token.json` (outside the repository, mode 0600). Tokens are never printed.

Check the result in Google Calendar: a calendar named **Restart spike** with a Mon/Tue/Thu/Fri 07:00 event, one day marked ✅ in green, and one day missing.

## 3. The 8-day token check

Eight or more days later:

```bash
node scripts/spikes/s6-google-calendar.mjs --refresh-check
```

It uses the saved refresh token and prints its age. Running the full test again issues a new token and restarts the clock.

## 4. Clean up

```bash
node scripts/spikes/s6-google-calendar.mjs --cleanup --revoke
```

## Results

| Date | Step | Result | Notes |
|---|---|---|---|
| | Unverified warning was the only obstacle | | |
| | Steps 1–8 of the script | | |
| | `--refresh-check` after ≥ 8 days | | Token age: |
