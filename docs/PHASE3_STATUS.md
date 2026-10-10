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

## Consolidated modules checkpoint (11 October 2026)

18 top-level commands, 62 executable paths, 102 distinct local automated tests pass. Added persistent autoresponders, giveaways, private ticket channels/transcripts, scheduled messages, opt-in AutoMod and bounded process watchdog. Detailed scope and limitations: AUTORESPONDERS.md, GIVEAWAYS.md, TICKETS.md, AUTOMATIONS.md, AUTOMOD.md, WATCHDOG.md and LOCALIZATION_STATUS.md. These are partial module implementations, not proof all reference behaviors are built. Reference inventory remains 318 documented paths; full 541 target is unverified.

Original public checkpoint passed Node 22/24 GitHub CI. This newer consolidated checkpoint must be published and its own CI verified separately. No live Discord testing, visual embed verification, Docker build or deployment. Destination channels now require Embed Links. Music/free-source and the other modules are still work. Retention, privacy, rate-limit and real interaction/restart tests remain release gates.

## Fun checkpoint

19 top-level commands, 69 executable paths, 110 local tests pass. Seven optional solo Fun paths; see FUN.md. Prior 102-test module checkpoint published with final Node22/24 CI success. New Fun source is local only until separately published. No Discord live tests or deployment.

## Permit checkpoint

20 top-level commands, 75 paths, 119 tests pass. Persistent additive deny layer with recovery protection, no native Discord permission grants. Six paths. See PERMIT.md. New Fun/Permit work remains local until separately published.

## Voice moderation checkpoint

21 top-level commands, 81 paths, 130 local tests pass. Six single-member voice moderation paths with native permission/hierarchy checks and no-retry effect cases. See VOICE.md. Public remains earlier verified102-test checkpoint; new Fun/Permit/Voice source local only. No live test/deployment.

## CustomRole mappings checkpoint

22 top-level commands, 87 paths, 140 local tests pass. Six persistent safe-role mapping paths, eligibility gate, explicit self claim/release and no-retry case tracking. Not self-created user roles. See CUSTOM_ROLES.md. New modules remain local pending consolidated publication; no live testing/deployment.

## Message Leaderboard checkpoint

23 top-level commands, 94 paths, 150 local tests pass. Seven opt-in message metrics paths with bounded retention, no message-content storage, UTC calendar windows and replay-safe counts. Not voice/invite tracking. SQLite v11. See LEADERBOARD.md. New modules local only, not deployed.

## Audit alert foundation

24 top-level commands, 100 paths, 159 local tests pass. Six Antinuke alert-only paths, no prevention/punishment/recovery. SQLite v12. See ANTINUKE.md. Still no live Discord tests/deployment; newer modules local only.

## Manual guild tag foundation

25 top-level commands,104 paths,167 local tests pass. Exact current primary-guild identity checks, tracked safe role grants, manual self refresh. No automatic profile tracking. SQLite v13. See GUILD_TAGS.md. New source local only, no live testing/deployment.

## Private VoiceMaster foundation

26 top-level commands,110 paths,178 local tests pass. Explicit private owner channels with config/create/rename/limit/empty-close and persisted ownership. Not join-to-create/auto orphan cleanup. SQLitev14. See VOICE_MASTER.md. No live testing/deploy; new source local pending publication.

## Unactivated Music core

26 commands/110 paths unchanged,188 tests pass. Queue and direct-audio Lavalink adapter prepared but not registered/wired. No actual source catalog/free node/live playback verified. See MUSIC_CORE.md. Public older102-test checkpoint unchanged.
