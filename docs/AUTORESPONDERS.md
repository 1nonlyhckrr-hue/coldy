# Autoresponders

Six Luna slash paths: `/autoresponder create`, `edit`, `delete`, `config`, `preview`, `toggle`. All require Manage Server. Creation requires the operator to enable the Message Content privileged intent and set `ENABLE_MESSAGE_EVENTS=true`; it is off by default. Editing/listing/deleting existing rules remains possible when message events are disabled.

Create accepts trigger, response, optional mode (`exact` or `keyword`) and cooldown (10-3600 seconds, default 60). Triggers are case-insensitive Unicode-normalized literal text. Keyword phrases need word boundaries, not arbitrary substrings or owner-supplied regex. Up to 50 triggers per guild; configuration lists ten rules per page. Only configuration metadata is listed, not response contents.

Rules and cooldown timestamps live in SQLite. One response at most is claimed per message. Exact rules are tried before keyword rules. A reserved delivery is stored before sending, and replayed events cannot send again. Uncertain sends are not retried. After restart, reserved deliveries become uncertain. Cooldowns are server-wide per trigger, not per author. Delivery deduplication records expire after 30 days; events older than five minutes are ignored, so expired historical message IDs do not trigger old responses.

Bots, webhooks, system messages, DMs and message edits are ignored. Mentions are disabled. Response templates are owner-authored and remain verbatim; embed labels follow the guild locale. Message content is used for matching but is not stored in delivery records or logs. No attachment, embed or regex triggers are supported in this version.

Local tests cover CRUD, validation, guild isolation, limits, normalization, word boundaries, exact priority, persistent cooldown, replay/restart recovery, blocked channels, bot/webhook/stale events, mention suppression, localized embeds and failed sends. No live Discord execution has taken place. The public reference has four similarly named paths, but Luna's cooldowns and matching behavior are original implementation choices, not claimed reference equivalence.

Reference source: https://docs.zynrax.site/configuration/autoresponder

`/autoresponder toggle trigger enabled` pauses/resumes one stored rule without deleting response,cooldown or delivery history. Migration24 adds enabled default1,so existing rules retain prior enabled behavior. Both read-only eligibility and atomic claim exclude paused rules;pause during native validation suppresses reservation/send. Preview remains available while paused. Runtime message-event permission remains separate. Private localized replies.358 current project tests;native acceptance pending.

Cooldown edit retains last-send and replay history;decreasing can allow next matching message sooner,increasing delays it. Existing accepted/uncertain message IDs stay nonreplayable.
