# Confirmed safe role assignments

Reference-led role/create scope: https://docs.zynrax.site/security/moderation . Original Emika behavior is deliberately narrower than arbitrary privileged/bulk role grants.

`/role add member role confirm:true` and `remove` change exactly one human membership. Fresh forced actor,bot,target and role identities and guilds are checked twice;actor and bot Manage Roles,app permission,safe role permission allowlist,unmanaged/non-everyone and hierarchy required. Target owner/self/bot and roles owned by panel/autorole/custom-creation workflows are rejected. Unknown prior target role membership effects freeze further add/remove until reviewed separately. A native no-op stores no case. Effect has one pre-reserved case and forced exact post-membership observation. Any submitted ambiguous outcome is uncertain,no retry.

`/role create name confirm:true` creates one unassigned zero-permission role,hoist=false/mentionable=false. Name1-32,no controls/@/edgewhitespace/unpairedsurrogates. No user-role assignment,positioning or permission edit. Fresh actor/bot/app authority before case/effect. Missing created-ID or post-fetch identity/name/flags/zero-permission proof leaves uncertain,and blocks further role creation in that guild. Returns private localized confirmation;created ID remains retrievable through current role metadata list. No deletion/automatic rollback.

All paths private3locale/no-ping. Local mocks are not native Discord permissions/hierarchy/client-visual acceptance.
