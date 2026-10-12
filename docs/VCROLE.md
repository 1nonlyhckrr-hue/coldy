# Voice role

Verified reference-led feature: https://docs.zynrax.site/configuration/roles/vcrole . Luna adapts it to human-only safe-role grants with ownership-aware cleanup. Native Discord acceptance pending.

`/vcrole add role`:futurevoicejoin policy,single reviewed safe role. Fresh manager Manage Server+Manage Roles,role/bot hierarchy and permission allowlist enforced. Requires voiceevents. `remove` disables future grants but keeps successful Luna-owned grant records for future disconnect cleanup. `show` private saved policy and retained grant counts,not native membership proof.

Voice channel change events only,mute/deafen changes ignored. On join/move,fresh target/bot/role/configuring-manager checked twice. Exact target voice channel,identity,guild,role safety,hierarchy and unchanged policy required. Existing membership is not recorded as owned,so disconnect never strips pre-existing role. One persistent adding reservation before grant,forced exact native membership and voice observation afterwards. Ambiguity freezes with no retry.

On disconnect,only previously verified owned grants can be removed,even if policy has changed/been disabled. Still needs fresh target/bot/role/voice/hierarchy/safe permissions;destructive cleanup never bypasses role safety. One removing reservation,forced exact absence observation,then owned record erased. Unknown add/remove states stay uncertain on restart. No automatic bulk backfill/cleanup on startup,no role replacement edits,no message/DM alerts. If role becomes privileged/managed or permissions disappear,cleanup pauses rather than bypassing guards. A new voice event may re-evaluate unsubmitted paused work;submitted ambiguity never retries.

Rapid concurrent events serialize per member;unobserved mid-effect voice change can leave uncertain rather than chasing the user. Native event cadence/permissions/client visuals and operator recovery remain acceptance gates. Local tests cover policy persistence,pre-existing-role preservation,owned cleanup after disable,guard matrix,replay/failure/races and private3locale output.
