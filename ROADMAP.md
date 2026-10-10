# Roadmap and acceptance gates

## Phase 1: reference research

Initial official-docs inventory complete. Reconcile screenshot/live-help evidence before claiming full 541-path coverage. Maintain source evidence and avoid padding unknown commands.

## Phase 2: foundation

Local foundation complete: modular registry, environment schema, SQLite migrations, permission gates, bounded cooldowns, sanitized errors, four initial commands, tests, CI definition and docs. Public repository and live integration remain pending.

## Phase 3: moderation and server configuration

Implement safe single-target moderation first, settings commands, warnings/cases, role/channel checks, audit logging. Add tests for denied access, hierarchy, expired confirmations, retry outcomes and persistence. Bulk actions are separate acceptance gates, not aliases of single actions.

## Phase 4: community systems

Welcomer, reaction roles, persistent ticket lifecycle and transcripts, restart-safe giveaways, autoresponders, temporary voice ownership and cleanup. Test restarts, duplicates and missing/deleted resources.

## Phase 5: security and advanced modules

Automod, cautious antinuke report-only rollout, permit/ignore, automation, leaderboards, privacy/retention controls. Validate actual event attribution before enabling punishments.

## Phase 6: music and launch

Select a lawful source/backend, Lavalink compatibility and hosting cost with the owner. Test Discord voice encryption support, unavailable backend, reconnects and queue/session persistence. No dependence on unspecified free public nodes or promise of 24/7 uptime.

Release only after separate Luna token/application, test guild and integration test results. Confirm public repo authority and write access; choose a public code license. Do not promise a full completion date before reference gaps and live test prerequisites are resolved.
