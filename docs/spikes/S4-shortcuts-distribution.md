# S4 · Distributing shortcuts and choosing by voice

**Questions:** (1) can a shortcut be shared through an iCloud link with an **Import Question** that asks for the user's token when it's installed? (2) Does **Choose from List** on a dictionary work by voice through Siri?
**Pass criteria:** a second iPhone installs the shortcut from the link, answers the Import Question, and logs a habit by voice.
**If it fails:** the install guide adds a manual "paste your token here" step ([Integrations §1.2](../spec/06-integrations.md#12-distribution)).

## Sample data

`https://<your-app>/spikes/s4-today.json` is a static file shaped like `GET /api/v1/today` ([API §2](../spec/05-api.md#2-shortcuts-api-v1)), with fake habits. Its `choices` field is a dictionary from a readable label to a habit ID.

## Build the shortcut

1. *Shortcuts → +*. Name it **Registrar hábito prueba**.
2. **Text**: `test-token` (stands in for the user's token).
3. **Get Contents of URL**: `https://<your-app>/spikes/s4-today.json`, method GET, header `Authorization` = `Bearer ` + the Text.
4. **Get Dictionary Value**: key `choices`.
5. **Choose from List** with the prompt "¿Cuál hábito?".
6. **Get Dictionary Value**: the chosen item, from the `choices` dictionary (gives the ID).
7. **Show Result**: "Elegiste " + the ID.

## Steps

1. Say "Oye Siri, registrar hábito prueba". Does Siri read or show the options? Say "Meditar". Does it pick the right one?
2. Try a partial name ("leer") and a wrong one.
3. *Shortcut details → Setup → Import Questions*: add a question for the Text action ("Pega tu token de Restart").
4. *Share → Copy iCloud Link*. On another iPhone (or after deleting the shortcut), open the link and install it. Does it ask the question? Does the answer end up in the Text action?

## Results

| Date | iOS | Voice choice works? | Partial names? | Import Question works? | Notes |
|---|---|---|---|---|---|
| | | | | | |
