# Autoresponders

Six Emika slash paths: `/autoresponder create`, `edit`, `delete`, `config`, `preview`, `toggle`. All require Manage Server. Creation requires the operator to enable the Message Content privileged intent and set `ENABLE_MESSAGE_EVENTS=true`; it is off by default. Editing/listing/deleting existing rules remains possible when message events are disabled.

Create accepts trigger, response, optional mode (`exact` or `keyword`) and cooldown (10-3600 seconds, default 60). Triggers are case-insensitive Unicode-normalized literal text. Keyword phrases need word boundaries, not arbitrary substrings or owner-supplied regex. Up to 50 triggers per guild; configuration lists ten rules per page. Only configuration metadata is listed, not response contents.

Rules and cooldown timestamps live in SQLite. One response at most is claimed per message. Exact rules are tried before keyword rules. A reserved delivery is stored before sending, and replayed events cannot send again. Uncertain sends are not retried. After restart, reserved deliveries become uncertain. Cooldowns are server-wide per trigger, not per author. Delivery deduplication records expire after 30 days; events older than five minutes are ignored, so expired historical message IDs do not trigger old responses.

Bots, webhooks, system messages, DMs and message edits are ignored. Mentions are disabled. Response templates are owner-authored and remain verbatim; embed labels follow the guild locale. Message content is used for matching but is not stored in delivery records or logs. No attachment, embed or regex triggers are supported in this version.

Local tests cover CRUD, validation, guild isolation, limits, normalization, word boundaries, exact priority, persistent cooldown, replay/restart recovery, blocked channels, bot/webhook/stale events, mention suppression, localized embeds and failed sends. No live Discord execution has taken place. The public reference has four similarly named paths, but Emika's cooldowns and matching behavior are original implementation choices, not claimed reference equivalence.

Reference source: https://docs.zynrax.site/configuration/autoresponder

`/autoresponder toggle trigger enabled` pauses/resumes one stored rule without deleting response,cooldown or delivery history. Migration24 adds enabled default1,so existing rules retain prior enabled behavior. Both read-only eligibility and atomic claim exclude paused rules;pause during native validation suppresses reservation/send. Preview remains available while paused. Runtime message-event permission remains separate. Private localized replies.358 current project tests;native acceptance pending.

Cooldown edit retains last-send and replay history;decreasing can allow next matching message sooner,increasing delays it. Existing accepted/uncertain message IDs stay nonreplayable.

## Rule library management

`clone trigger new-trigger` copies response/mode/cooldown to a unique new **paused** rule. No copied delivery receipts,last-sent cooldown or automatic send. It can be prepared while runtime off;explicit toggle enables later. Existing cap50 and normalized trigger validation apply. `info trigger` privately shows stored settings/response,no send. `deleteall confirm:true` deletes every guild rule/response,keeps retained replay receipts and does not delete Discord messages or stop already-claimed sends. New rules cannot replay old receipt IDs. Current ManageGuild/private3locale/no-ping,read/write SQLite only. Native/visual acceptance pending.

## Portable rule library and safe diagnostics

`export` returns private JSON containing only trigger,response,mode,cooldownSeconds for this guild. It includes response text and should be kept private. No guild/user/rule IDs, enable state, timestamps or delivery receipts. A full50-rule export can exceed the import limit;split into batches of1-10rules and4000characters. Export does not send to another channel.

`import json confirm:true` atomically adds1-10unique new rules,up to4000characters. JSON is a strict array of the exported field shape;mode/cooldown defaults apply if omitted. All imported rules are paused,including while runtime off. No replace/merge/delete of existing rules. Normalized duplicate triggers,validation failures and50-rule cap failure roll back the whole batch. Existing cooldown/replay history stays intact. Explicitly toggle each new rule later to enable it.

`dryrun text` privately shows matching stored rule IDs in exact-first priority,paused/cooldown/eligible state,and first eligible rule at the local clock. Text up to1800characters is never saved or sent;no reservation/cooldown/history changes. This is a stored-rule diagnostic only,not a live channel/runtime/permission/message-replay check or delivery promise. ManageGuild is fetched fresh for all three paths;replies use shared localized embeds and disable mentions. JSON AttachmentBuilder bytes verified locally,not live client display.

## Existing library bulk edits

`replace json confirm:true` accepts strict1-10 existing rule objects,up to4000characters,with trigger,response,mode,cooldownSeconds. Normalized unique triggers must all exist in this server. Atomically changes response/mode/cooldown and pauses these rules. IDs,created times,last-send timestamps and retained replay receipts stay intact. No new rules,rename,enable or automatic send. Missing/duplicate/invalid rules or storage abort rolls back the batch. Full exports may need splitting into batches.

`deletepaused confirm:true` deletes only currently paused rule text/settings;enabled rules and retained delivery receipts remain. `cooldownall seconds confirm:true` changes all stored rule cooldowns10-3600seconds,without resetting last-send timestamps or enable states. Reducing cooldown can make the next matching eligible message respond sooner. All three use current native Manage Server and private localized replies;runtime may be off for library edits. Already-claimed sends can finish despite pause/delete;these commands do not erase native messages. Three tests cover transactional abort/validation/isolation/history/confirmation/current manager/private3locale. No native/client visual acceptance.
