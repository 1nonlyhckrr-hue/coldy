# AutoMod

Eight Luna paths: enable/disable/rule/wordadd/wordremove/exempt/config/incidents under `/automod`. Manage Server is refreshed for management actions. Message Content intent/runtime opt-in is required. Rules and automatic moderation start disabled. Enable selects warning-record or single-message-delete mode; no auto-timeout/kick/ban in this version.

Rules: literal bad-word/phrase boundaries, Discord invites, HTTP(S) links, five-or-more mentions (everyone counts as five), more than 80% uppercase after at least 20 letters, or spam (six messages or three identical normalized messages within ten seconds). Unicode normalization is used; phrase matching never executes user regex. These fixed thresholds may have false positives; choose rules cautiously. Other link schemes, obfuscation/evasion and historical edit scanning are not handled.

Server owner, managers, members with Manage Messages/Moderate Members and configured exempt roles are skipped. Bots/webhooks/system/stale events are skipped. Deletion rechecks bot Manage Messages in the actual channel. A rule claim is persisted before warning/deletion; duplicate message events cannot repeat an action, and replay does not inflate spam thresholds. Unconfirmed actions become uncertain and are never blindly retried. Restart converts incomplete claims to uncertain. Incident records contain rule/IDs/status, not message content, and expire after 30 days on startup cleanup. Spam detection is bounded in memory, resets on restart and is not a durable violation history.

AutoMod runs before autoresponders. A detected/uncertain incident suppresses autoresponder processing for that message. Local tests cover rules, configuration, isolation, staff/bot/webhook exemption, replay/duplicates, warning persistence, uncertain deletion, runtime guard, eight command paths and Hindi output. No live Discord/rate-limit/false-positive field testing yet. AntiBot, allowlisted channels/domains, per-rule tuning, timeout actions and the broader antinuke module remain work. The reference inventory stays reference-only.

Sources: https://docs.zynrax.site/security/automod and https://docs.zynrax.site/configuration/antibot
