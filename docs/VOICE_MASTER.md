# VoiceMaster: private explicit channels

Six paths: `/voicemaster setup category`, `config`, `open`, `rename name`, `limit count`, `close`. First foundation, not complete join-to-create/reference behavior.

Setup requires fresh Manage Channels and current category/bot access. Open fetches member/bot/category, validates category View Channel/Connect for caller and bot Manage Channels access, stores owner reservation before creating standard voice channel. One live/uncertain record per user, up to50 per guild. Explicit creation only, does not move caller. Channel starts owner-only with capacity1: @everyone denied ViewChannel/Connect; owner ViewChannel/Connect/Speak/Stream/UseVAD; bot ViewChannel/Connect/ManageChannels. No inherited category access or owner ManageChannels grant. Discord administrators always bypass access restrictions. Exact overwrite entries/types/bitfields checked after creation and before controls. Channel ID stored as soon as returned, retained if privacy verification fails. Unconfirmed creation reserves uncertain owner record and blocks repeats.

Rename1-80 single-line characters; capacity1-99. Capacity does not invite other users or widen access; current owner-only privacy remains. Close only stored owner channel, current native bot/app permissions, expected access and empty member collection. Refuses nonempty channel, never disconnects anyone as cleanup. A last-millisecond join after emptiness check remains a Discord race; no atomic empty-delete operation exists here, so live tests/manual care are release gates. Tracked ownership, not ManageChannels ownership, controls user access. Untracked/foreign/channel-type/access changes refuse controls.

Per-owner/guild mutex. Mutation case reserved before effect; duplicate interaction ID blocks repeats. One API call, no auto retry. Uncertain delete marks channel record uncertain and blocks controls; pending create/delete changed uncertain at startup. Active channels persist across restart. Rename/limit API uncertainty recorded in case; these set-state actions are not automatically retried. No automatic orphan deletion, member-leave cleanup, reconciliation UI or external overwrite repair yet. A deleted-channel/missing owner or uncertain record needs moderator review. No broad guild purge/reset.

Private localized Luna embeds, no mentions,10-second dispatch cooldown. SQLitev14 stores category and owner/channel state; moderation cases carry effect outcomes. Eleven new tests,178 project tests pass: exact private grants, owner reservation/dedup, creation gates, uncertain/privacy state, rename/limit/empty-delete calls, access drift/foreign/nonempty refusal, bounds/storage gates, every path/locale and restart state. No Discord gateway/visual test.

Remaining feature work: public join-to-create, invited access, lock/unlock, supported ownership controls/transfer, safe automatic orphan cleanup and recovery. These are not marked done by the first six paths.

## Explicit audience controls

`lock` restores owner-only view/connect. `unlock share:true` explicitly allows every server member view/connect on tracked channel,only when empty. No silent public default,no member movement. Capacity unchanged;owner should review capacity before making public. Channel exact stored audience shape verified before effect,current bot Manage Channels+Manage Roles,forced native post-write validation. Case written/state marked uncertain before overwrite. Native/provider/storage failures block further edit until observed-state repair/operator review. Unknown changed audience is not guessed by reconciliation. SQLitev22 stores public_access default0,migrates existing private channels unchanged.

Empty-member cache is not proof no concurrent voice joins happened after check;live gateway race testing required before release. No automatic empty cleanup.3newtests253total.32top-level133paths. Existing private-first description means explicit creation is private,not that unlocked rooms remain private. Access shape exact minimal privileges,not arbitrary guest invite permission. No join-to-create,transfer/invites,lock held-room eviction,or automatic orphan delete.

## Required voice-state runtime

ENABLE_VOICE_EVENTS must be true to subscribe GuildVoiceStates before any open/edit/repair. Earlier local source lacked this intent and was not safe to treat empty channel caches as live occupancy. Fixed fail-closed runtime gate,three new regression tests,total256. Native gateway startup/reconnect/cache race verification still required;no claim mock tests prove actual empty rooms. Nonprivileged intent,not presence tracking.

## Reconnect safety stop

Native initial ready and available guild/client required. Voice effects blocked for any shard that disconnects/reconnects until fresh process startup;resume is not assumed to restore a trustworthy occupancy cache. Operator inspect gateway health before restart. Readiness rechecked just before effect. Conservative availability loss is intended. Two readiness tests,total258. Real event/cache completeness/concurrent joins still release-blocking.

## Raw voice-state occupancy

Native discord.js channel.members skips voice states when member is not cached. Empty check now counts raw guild.voiceStates cache channel IDs instead,not member list. Missing voice cache blocks. Also used by move destination capacity. Two new tests,total260,uncached connected member blocks close/unlock. Real gateway state completeness/concurrent join race still unresolved by local tests.
