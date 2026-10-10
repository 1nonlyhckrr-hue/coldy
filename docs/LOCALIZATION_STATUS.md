# Localization migration status

English, Hindi and Hinglish dictionaries have matching keys and matching placeholder sets. `/config language` stores a validated locale per guild. Core information replies, permission errors, generic errors, welcome/goodbye configuration, localized default member messages, log configuration and log labels use keyed strings. These are local automated tests, not a live Discord language/visual test.

Welcome/goodbye templates entered by the owner remain verbatim, including an intentionally English template in a Hindi guild. Existing stored custom templates are preserved. New template changes carry an explicit custom flag so a message matching the original English default is not mistaken for a Luna-authored default.

Moderation action results/errors, role-panel messages and help header/footer now use keyed strings too. Remaining migration: command/help descriptions, serialized status/mode labels and translated slash-command metadata. Do not claim every output is translated yet. Command names stay stable across locales.

Shared embeds include localized branding and errors where a locale is supplied. Output channels now require Embed Links as well as View Channel and Send Messages. Actual Discord pixels remain unverified until a separate Luna test environment is available.
