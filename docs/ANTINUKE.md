# Antinuke: audit alerts only

Six paths: `/antinuke enable channel`, `disable`, `threshold count seconds`, `trust member trusted`, `config`, `incidents`. This is a detection/alert foundation, not complete automatic protection or recovery. It never kicks, bans, strips roles, changes server settings, restores channels or reverses changes. Manual review is required, and alerts can describe legitimate staff work. Do not advertise this as prevention.

Off by default, current Manage Server checked for all commands. Runtime ENABLE_AUDIT_EVENTS adds GuildModeration intent. Enable checks bot View Audit Log and alert output permissions. No historical audit scrape or target-to-actor guessing. Native guildAuditLogEntryCreate executorId is used; unknown executor ignored. Supported actions: guild update; channel create/update/delete; role create/update/delete; webhook create/update/delete; ban-add and kick. Threshold is mixed supported actions per actor across these types, not separate category quotas. Range2-20 actions over10-300 seconds, default5/60s. Observation arrival times determine the window; Discord-delayed events can cluster and create false positives.

Owner, Emika's own bot and up to20 explicit trusted users excluded. Trust applies only to this alert module, not Permit, moderation or other native authority. No trusted-role grants. Non-ID/bad/stale (>5min)/far-future entries ignored. Event replay IDs stored24 hours; incident retention30 days with startup/active cleanup. Incident persists before send. One alert per actor/window. Disabled config stops future records. No automatic replay on restart. Unavailable channel stored unavailable; ambiguous send stored uncertain, never auto-retried. `recorded` after crash/finalization failure means delivery not confirmed; moderators inspect Discord rather than re-send blindly. No current-member-fetch attribution claim; event is audit evidence from Discord, not proof malicious intent.

Replies and alerts use shared localized EN/HI/Hinglish embeds with all mentions disabled. Alert counts/executor IDs and state retained; no audit reason text, credentials, message contents or raw change objects. Configure a staff-only output channel; Emika verifies usable output, not who admins allowed to read it. Adding trust requires current membership; removing trust needs a valid user ID but not current membership, so stale exemptions can be removed.

Nine new tests,159 total pass: disabled/config gates, replay/threshold/window, trust/owner/bot/unknown/stale exclusions, validated settings/cleanup, localized alert send, unavailable/uncertain no-retry, every slash path in three locales, current Manage Server and runtime/View Audit Log checks. No Discord live gateway/visual test. Full Antinuke safe intervention and recovery remain release work.

Official sources inspected:
- https://docs.discord.com/developers/events/gateway-events
- https://docs.discord.com/developers/resources/audit-log

AcceptednativealertsendmustreturnnonemptystringmessageID;otherwiseuncertainwithoutreplay. Finalizationtransitionsone recordedreservationonly. /antinuke unresolved [page] is private exactcurrentmanager storedmetadatareview,oldestfirst10/page1-10,terminal/foreignexcluded. No currentdanger/delivery/punishmentclaim,nativefetch,retryorcleanup.560localtests,new200pathscheckpointlocalonly.

## Stored alert-policy management

`exportpolicy` privately exports destination/enabled/threshold/window/trusted-userIDs,no audit events/incidents/actor history. Keep file private. Not import/restore/live readiness/prevention proof.

`resetpolicy confirm:true` restores disabled defaults(threshold5,window60seconds,emptytrustedIDs,no destination),keeps events/incidents/replayguards/cases/nativepermissions. `removetrust user-id confirm:true` removes one exact stored trustedID including departedusers,no native member lookup. Missing storedID returns0. Owner/applicationbot exemptions always retained by detection. No native permissions/role change,punishment or rollback. Fresh exact ManageGuild for all three paths,explicitconfirmation for mutations. Nativevalidation late reset stops alert and marks existing incident unavailable,no replay. Alreadyinflightalerts mayfinish,no atomicrecall guarantee. Private localized/no-ping sharedembeds/JSONbytes locally tested;liveaudit/visual acceptance pending.

## Stored alert-policy library

`/antinuke importpolicy json confirm:true` replaces one strict policy object4000characters max,using existing defaults/limits,unique trusted-user IDs,and forces monitoring disabled. Stored channel/trust IDs are not live verified by import;review before explicit enable. Audit events,incidents and replay suppression stay intact. No punishment/prevention/rollback.

`cleartrust confirm:true` removes all stored user exemptions,retaining owner/bot exemptions and monitoring/destination/thresholds. When enabled,future actions by formerly trusted users may contribute to alerts. `clearchannel confirm:true` stops monitoring and forgets only destination,retaining trust/thresholds/history. In-flight alerts may finish. All3fresh native Manage Server/explicit confirmation/private3locale/no-ping,no native target mutation. Three tests cover replacement/defaults/forceddisable/isolation/validation/storagefail/scope/commands. No live/client visual acceptance.
