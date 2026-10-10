# Phase 3 first batch

Implemented `/moderation` with warn, warnings, clearwarns, timeout, untimeout, kick, ban and unban. Four foundation commands remain installed. Total: 5 top-level commands, 12 executable paths.

Status: local automated tests, not live Discord tested. No deploy/repository creation yet. No equivalent Zynrax reference rows are promoted as complete because syntax, subcommand organization and behavior differ, and integration remains unverified.

Caller/bot members and target are refreshed for permission and hierarchy checks. Bot owner never bypasses these. Timeouts refuse bots and administrators. Ban intentionally keeps existing message history. Reasons are bounded; outputs suppress mentions. Cases must persist before external effects. Failed/uncertain/completed outcomes are explicit, and duplicate interaction IDs cannot repeat actions. Pending or uncertain cases after a crash require state reconciliation, not automatic retry.

Warnings are stored in SQLite, with 10 most recent active warnings displayed. Clearwarns marks warnings cleared rather than deleting audit history. Retention/export/deletion configuration remains a launch gate for this stored personal moderation data. No automatic punishment on a warning threshold is enabled.

The command's default Discord permission bitfield is an initial visibility hint, not an authorization substitute. Specific subcommands enforce permissions at runtime. Moderation logs to a configured server channel and bulk destructive actions are not implemented yet.

## Batch 2

11 top-level commands, 28 executable paths. Validated nested guild config, case-log delivery, welcome/goodbye template config and opt-in member event handlers, plus userinfo/avatar/uptime/stats and paginated help. Configuration requires Manage Server. Destination validation refuses foreign or voice channels and requires View Channel/Send Messages. Mentions are suppressed except the explicit newly joined member in welcome messages. Member intent is off by default in code. Missing resources or delivery failures are contained and logged without message contents.

40 distinct local automated tests pass. Test discovery is restricted to *.test.js so fixture modules do not count as tests. Refactor failure (missing ChannelType import) was fixed and the entire suite rerun. No live test or launch occurred.

## Role panel batch

12 top-level slash commands, 31 executable paths. Button-role panels implemented with migration v3 and current-role safety checks. 48 distinct local tests pass, zero fail. See ROLE_PANELS.md. No early deployment: full module build continues by owner direction.
