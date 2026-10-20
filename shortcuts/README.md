# Shortcuts for Restart

Siri can't learn commands from a web app, but it runs any shortcut by its name. These recipes
build the shortcuts that call Restart's [Shortcuts API](../docs/spec/05-api.md#2-shortcuts-api-v1).
See [Integrations §1](../docs/spec/06-integrations.md#1-siri-and-shortcuts) for how it fits together.

| Recipe | Español | English | Siri phrase |
|---|---|---|---|
| Log a habit | [registrar-habito.es.md](registrar-habito.es.md) | [log-habit.en.md](log-habit.en.md) | "Registrar hábito" / "Log habit" |
| Undo | [deshacer-habito.es.md](deshacer-habito.es.md) | [undo-habit.en.md](undo-habit.en.md) | "Deshacer hábito" / "Undo habit" |
| How am I doing | [como-voy.es.md](como-voy.es.md) | [how-am-i-doing.en.md](how-am-i-doing.en.md) | "Cómo voy" / "How am I doing" |
| One habit, no question | in each "Log" recipe, last section | | "Ya medité" / "I meditated" |

"Sync Health" comes with Phase 5 (Apple Health).

## Publishing (owner)

1. Build each shortcut on an iPhone following its recipe. Use the deployed address, e.g.
   `https://restart.vercel.app`, and an **Import Question** for the token (*Shortcut details →
   Setup → Add Import Question* on the Text action that holds the token).
2. *Share → Copy iCloud Link* for each one.
3. Put the links in `src/lib/shortcuts.ts` (`SHORTCUT_LINKS.es` / `.en`) and deploy. Settings then
   shows install buttons instead of pointing here.

## Versions

Every request sends `X-Shortcut-Version: 1.0`. When the recipes change, raise the version here and
in `SHORTCUT_VERSION` (`src/server/shortcuts/http.ts`), publish new iCloud links, and the API tells
users of older shortcuts once a day that a new version exists.

Current version: **1.0**.
