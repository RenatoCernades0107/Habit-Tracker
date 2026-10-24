# Log habit (English) · v1.0

Siri asks which habit, logs it, and says the result ("Done, Meditate ✅. That's 12 days in a row.").

1. **Text**: paste your token (`ht_…`). Make this an Import Question: "Paste your Restart token".
2. **Get Contents of URL**
   - URL: `https://<app>/api/v1/today`
   - Method: GET
   - Headers: `Authorization` = `Bearer ` + *Text*; `X-Shortcut-Version` = `1.0`
3. **Get Dictionary Value**: `pending_count` from *Contents of URL*.
4. **If** *Dictionary Value* is `0`:
   - **Get Dictionary Value**: `speech` from *Contents of URL* → **Show Result** → **Stop This Shortcut**.
5. **End If**
6. **Get Dictionary Value**: `choices` from *Contents of URL*.
7. **Choose from List**: *Dictionary Value*, prompt "Which habit?".
8. **Get Dictionary Value**: *Chosen Item* from the `choices` dictionary (step 6) → the habit ID.
9. **Get Contents of URL**
   - URL: `https://<app>/api/v1/check-ins`
   - Method: POST, Request Body: JSON
   - JSON: `habit_id` = *Dictionary Value* (step 8)
   - Headers: as in step 2
10. **Get Dictionary Value**: `speech` → **Show Result**. Started by voice, Siri reads it aloud.

Name the shortcut **Log habit**. Errors also come with a `speech` field: with *Show Result* on
`speech`, Siri says what went wrong (for example, a revoked token).

## One habit, no question ("I meditated")

1. Duplicate **Log habit** and rename it, e.g. **I meditated**.
2. Delete steps 2–8.
3. In step 9, set `habit_id` to the habit's ID: open the habit in Restart → **Copy ID for Shortcuts**.

The ID keeps working when you rename the habit.

## Without the list: say the name

Replace steps 2–8 with **Dictate Text** and send `query` = *Dictated Text* instead of `habit_id`.
The server ignores case and accents, understands aliases, and answers "Which one? …" (HTTP 409 with
`choices`) when two habits sound alike.
