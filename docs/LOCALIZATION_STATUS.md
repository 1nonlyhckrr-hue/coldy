# Localization migration status

English, Hindi and Hinglish dictionaries and a strict keyed localization service are present. `/config language` saves a validated locale per guild, and `/config view` displays translated configuration. Seven configuration keys have matching translations and strict parameter handling. No fallback silently masks missing keys.

This is the first migration step, NOT full-language support. Existing moderation, help, utilities, logs, welcome defaults, role panels, errors and branding text still require conversion to keyed strings. The next development batch must finish that migration before claiming every response follows the server language.

Custom welcome/goodbye templates are user-authored and preserved verbatim. Slash command names remain stable across locales; translated descriptions and select/button labels are a remaining UX requirement. Stored language is isolated per server.

All responses currently use the shared Luna embed utility, including errors and channel sends. Actual rendered Discord appearance remains visually unverified until a live preview can be inspected.
