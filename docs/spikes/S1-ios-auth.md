# S1 · Sign-in inside the installed iPhone app

**Question:** do the email code and Google sign-in both end with a session **inside** the app opened from the Home Screen?
**Why it matters:** on iOS, Home Screen apps don't share cookies with Safari. A flow that finishes in Safari leaves the app signed out ([Architecture §6](../spec/03-architecture.md#6-authentication)).
**Pass criteria:** both methods work on the current iOS version, and the session survives closing the app.
**If it fails:** offer Google sign-in only in the browser and keep the email code in the app.

## Prerequisites

- The app deployed with HTTPS ([setup](../setup.md)), with Google sign-in enabled in Supabase.
- An iPhone on iOS 16.4 or later, with Restart added to the Home Screen.

## Steps

1. Open Restart from the Home Screen icon. You should see the sign-in screen.
2. **Email code:** enter your email, switch to Mail, copy the code, switch back.
   - Does the app still show the code step (it may have reloaded)? Paste the code. Do you land on Today?
3. Close the app completely (swipe it away) and open it again. Still signed in?
4. Settings → **Sign out**.
5. **Google:** tap **Continue with Google** and finish the Google screens.
   - Where do you end up: in the app, or in a Safari window? Are you signed in there?
6. Close and reopen the app. Signed in?

## Results

| Date | iPhone / iOS | Method | Ends inside the app? | Survives reopen? | Notes |
|---|---|---|---|---|---|
| | | Email code | | | |
| | | Google | | | |
