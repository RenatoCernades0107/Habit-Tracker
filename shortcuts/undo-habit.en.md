# Undo habit (English) · v1.0

Undoes today's last check-in, from any source, and says what it undid ("Undid Meditate.").

1. **Text**: your token (Import Question).
2. **Get Contents of URL**: `https://<app>/api/v1/check-ins/undo`, POST, JSON body `{}`,
   headers `Authorization` = `Bearer ` + *Text* and `X-Shortcut-Version` = `1.0`.
3. **Get Dictionary Value**: `speech` → **Show Result**.

Name it **Undo habit**. With nothing to undo, Siri says "There's nothing to undo today."
