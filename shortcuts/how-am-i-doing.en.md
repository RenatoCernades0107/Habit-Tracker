# How am I doing (English) · v1.0

Says today's score and what's left ("You're at 56%. Left: Read, Water and Journal. Gym: 2 of 4 this week.").

1. **Text**: your token (Import Question).
2. **Get Contents of URL**: `https://<app>/api/v1/summary`, GET, headers `Authorization` =
   `Bearer ` + *Text* and `X-Shortcut-Version` = `1.0`.
3. **Get Dictionary Value**: `speech` → **Show Result**.

Name it **How am I doing**.
