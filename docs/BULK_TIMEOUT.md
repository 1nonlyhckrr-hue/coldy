# Exact bounded timeout clearing

Two paths: `/bulktimeout preview` and `confirm`. Reference unmuteall is adapted to explicit1-10current human member ID strings,not a serverwide timeout census or silent all-member clear.

Preview reads each current exact native deadline with fresh guild/member/bot identity,ModerateMembers,moderatable/admin/bot/self/owner/hierarchy guards. It stores only IDs/deadlines/actor/time in a persistent private120second plan and makes no native change. Empty,duplicate,invalid,untimed-out and unresolved prior bulk-clear targets are refused. At most25unexpired stored preview plans per guild;old preview plans may be cleaned after a day.

Confirm requires the same actor/guild/exact plan and explicit confirmation. All previewed deadlines are checked before any effect. The plan is consumed before effects. Each target is checked again,then a separate pending moderation case is persisted,then deadline/native permission checks repeat before clearing. Forced post-fetch must show no timeout. Case and plan status record complete or uncertain. Targets are never substituted. No more than10members per plan. One in-flight confirm per guild/process.

A change,departure,protected target,new deadline,unknown error,storage failure or unverified clear stops the remaining batch. Earlier clears can already have succeeded. Plans are never blindly retried;in-flight restart plans freeze uncertain. Pending/uncertain bulk-clear cases block new previews for that target. No automatic rollback or re-timeout is supplied. Operator inspection of cases/native state is needed for uncertainty. Discord has no conditional timeout update:another moderator can race the final check,and clearing could remove their newer timeout. Post-effect detection cannot repair that race. Plans and case history retain IDs/deadlines/outcome,not message content.

## Reference closure

Source: https://docs.zynrax.site/security/moderation

Reference unmuteall is a bounded exact-preview adaptation,not literal serverwide behavior. Automatic complete-server selection is omitted for safety:member pagination/offline gaps/concurrent moderator changes make a universal clear easy to mis-scope. Whole-server unbanall,other purge filters,channel nuke/clone and bulk role/voice behaviors still require their own implementation or explicit safety/native-limit mapping. Existing single-target timeout/untimeout remain separate commands.

Six local tests cover persistence/isolation/preview-no-effect,exactcase-per-member clearproof/one-shot,drift/expiry/confirm/input guards,identity/permissions/hierarchy/protected targets,partial unknown/restart/no-retry and bothpaths/3locales. Native Discord execution/rate limits/visual embeds remain unverified. No token/deployment used.
