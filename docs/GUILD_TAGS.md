# Guild tag reward: manual refresh

Four original paths in Vanityroles: `/guildtag setup role`, `show`, `reset`, `refresh`. Existing safe role mapping, no automatic profile-event tracking or public congratulatory broadcasts yet. This is partial reference behavior, not a complete equivalent.

Setup/reset require current Manage Roles. Safe-role permission whitelist and bot/actor hierarchy checked on setup. The role cannot be silently changed while configuration exists; reset first leaves assignments intact. Show lists current role ID. Refresh forces current Discord user and server member fetch. Exact primaryGuild.identityGuildId must equal this server and identityEnabled true. Another identity ID or explicitly false means not matching. Missing/null/unclear identity is unknown and causes no role change. It does not inspect nickname, bio, custom status or tag text. Tags can be unavailable on unsupported servers; no role is granted by guess.

Refresh only acts on caller. Bot/app Manage Roles, current role safety/hierarchy checked each time. Preexisting role isn't adopted as Luna-owned, so a later tag change does not remove that independent assignment. A successful Luna grant is tracked; verified nonmatching tag removes the tracked role. If staff independently reassign the same role after a Luna grant, Discord gives no per-assignment provenance and Luna cannot distinguish that ownership change; use a dedicated tag-reward role, not one assigned manually for other purposes. No current member/role/API state guarantee after the last check; Discord owns final permission enforcement.

Per-guild/user mutex. Config reread after async calls. Case and pending grant stored before effect; failure/ambiguity blocks future changes for moderator review. No automatic retry, startup marks pending grants uncertain. Config reset never deletes grant records or revokes existing roles. Changing role after reset can leave old grant records; affected users need moderator review, not automated old-role removal. No repair/cleanup UI for uncertain or stale grants in this batch; this is a release limitation.

Private localized Luna embeds, no mentions,10-second dispatch cooldown. SQLite v13 config/grant state; existing effect cases also recorded. Eight new tests,167 project tests pass: exact tri-state identity, grant/release ownership, independent role protection, unsafe edits/API access/config race, uncertainty recovery, migration/reset, duplicate/mutex gates and every path/locale. No Discord live fetch/pixel verification.

Sources inspected:
- https://docs.zynrax.site/configuration/roles/guildtag
- https://docs.discord.com/developers/resources/user
