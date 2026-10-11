# Guild tag reward: manual refresh

Five original paths in Vanityroles: `/guildtag setup role`, `show`, `reset`, `refresh`, `status`. Existing safe role mapping, no automatic profile-event tracking or public congratulatory broadcasts yet. This is partial reference behavior, not a complete equivalent.

Setup/reset require current Manage Roles. Safe-role permission whitelist and bot/actor hierarchy checked on setup. The role cannot be silently changed while configuration exists; reset first leaves assignments intact. Show lists current role ID. Refresh forces current Discord user and server member fetch. Exact primaryGuild.identityGuildId must equal this server and identityEnabled true. Another identity ID or explicitly false means not matching. Missing/null/unclear identity is unknown and causes no role change. It does not inspect nickname, bio, custom status or tag text. Tags can be unavailable on unsupported servers; no role is granted by guess.

Refresh only acts on caller. Bot/app Manage Roles, current role safety/hierarchy checked each time. Preexisting role isn't adopted as Luna-owned, so a later tag change does not remove that independent assignment. A successful Luna grant is tracked; verified nonmatching tag removes the tracked role. If staff independently reassign the same role after a Luna grant, Discord gives no per-assignment provenance and Luna cannot distinguish that ownership change; use a dedicated tag-reward role, not one assigned manually for other purposes. No current member/role/API state guarantee after the last check; Discord owns final permission enforcement.

Per-guild/user mutex. Config reread after async calls. Case and pending grant stored before effect; failure/ambiguity blocks future changes for moderator review. No automatic retry, startup marks pending grants uncertain. Config reset never deletes grant records or revokes existing roles. Changing role after reset can leave old grant records; affected users need moderator review, not automated old-role removal. No repair/cleanup UI for uncertain or stale grants in this batch; this is a release limitation.

Private localized Luna embeds, no mentions,10-second dispatch cooldown. SQLite v13 config/grant state; existing effect cases also recorded. Current local suite390 tests;module tests cover: exact tri-state identity, grant/release ownership, independent role protection, unsafe edits/API access/config race, uncertainty recovery, migration/reset, duplicate/mutex gates and every path/locale. No Discord live fetch/pixel verification.

Sources inspected:
- https://docs.zynrax.site/configuration/roles/guildtag
- https://docs.discord.com/developers/resources/user

Setup/reset force exact caller/guild identity. Setup forces exact role then refreshes caller and application bot authority/hierarchy. Refresh requires exact caller and bot guild identity before grant cases/reservations/effects.

Grant outcome writes require exactly one pending record. Completed/uncertain/missing/foreign records cannot silently become granted or be rewritten. Accepted native add with failed completion stays blocked as pending;startup recovers uncertain.423 local tests,SQLite25;no live acceptance.

`status` privately reads only caller stored grant role/state pending/granted/uncertain or absent. No live primary identity/current role possession claim,native lookup,repair,assignment or record change. All locales and stored states tested.426 local tests,38top-level/169paths,SQLite25;native acceptance pending.

Absent/empty/nonstring primary identity guild ID is unknown even when identityEnabled is true;it is not nonmatching evidence and cannot revoke tracked roles. Regression preserves grant/role on malformed identity.428 local tests,native acceptance pending.
