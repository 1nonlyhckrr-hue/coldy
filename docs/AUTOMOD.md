# AutoMod

Seventeen Luna paths under `/automod`: enable,disable,rule,wordadd,wordremove,exempt,config,incidents,timeoutminutes,ignorechannel,thresholds,testtext,spamthresholds,removepolicy,wordlist,unresolved,stats. Manage Server is refreshed for management actions. Message Content intent/runtime opt-in is required. Rules and automatic moderation start disabled. Enable selects warning-record or single-message-delete mode; bounded explicitly confirmed timeout is available;no auto-kick/ban.

Rules: literal bad-word/phrase boundaries, Discord invites, HTTP(S) links, five-or-more mentions (everyone counts as five), more than 80% uppercase after at least 20 letters, or spam (six messages or three identical normalized messages within ten seconds). Unicode normalization is used; phrase matching never executes user regex. Thresholds may have false positives; choose rules cautiously. Other link schemes, obfuscation/evasion and historical edit scanning are not handled.

Server owner, managers, members with Manage Messages/Moderate Members and configured exempt roles are skipped. Bots/webhooks/system/stale events are skipped. Deletion rechecks bot Manage Messages in the actual channel. A rule claim is persisted before warning/deletion; duplicate message events cannot repeat an action, and replay does not inflate spam thresholds. Unconfirmed actions become uncertain and are never blindly retried. Restart converts incomplete claims to uncertain. Incident records contain rule/IDs/status, not message content, and expire after 30 days on startup cleanup. Spam detection is bounded in memory, resets on restart and is not a durable violation history.

AutoMod runs before autoresponders. A detected/uncertain incident suppresses autoresponder processing for that message. Local tests cover rules, configuration, isolation, staff/bot/webhook exemption, replay/duplicates, warning persistence, uncertain deletion, runtime guard, current command paths and Hindi output. No live Discord/rate-limit/false-positive field testing yet. AntiBot, allowlisted channels/domains, richer per-rule policies and the broader antinuke module remain work. The reference inventory stays reference-only.

Sources: https://docs.zynrax.site/security/automod and https://docs.zynrax.site/configuration/antibot

## Bounded timeout action

`enable action:timeout confirm-timeout:true` requires runtime message events,current Manage Server and current bot Moderate Members. Explicit confirmation is separate from ordinary enable. `timeoutminutes` sets1-60min duration(default5),does not enable rules. At runtime native current target+bot fetched again;owner,bot,admin,staff permissions,exempt roles,unmoderatable target or bot hierarchy failures record failed,no effect. Config snapshot compared after fetch;if changed,fail closed. Existing longer communication-disabled timestamp never shortened. Call sets absolute deadline so network latency cannot silently extend via retry. Reserve incident first;unknown outcomes not replayed.

Three new tests,total238 local tests. No live native timeout test,no permission-race atomic guarantee or reviewed false-positive corpus. Rule matching remains literal simple caps/spam/mentions/links;staff should tune warn-only first. Timeout does not also delete message. No ban/kick in this path. No claim of full Antinuke prevention. Existing30day incident retention remains,not message content retained except short in-memory spam text window.

`/automod ignorechannel channel enabled` adds/removes exact channel exclusions,max20,guild isolated,persistent JSON config. Fresh exact ManageGuild actor/channel validated;actor refreshed again after channel fetch. Text/announcement/thread IDs supported,no parent inheritance,no effect on autoresponder/ranks/AFK. Ignored channel skips member fetch/detection/reservation. Exclusion/config changes during member or delete/timeout permission validation suppress effects. Existing JSON without ignoredChannels defaults empty;no new migration.344 project tests,SQLite24;native gateway acceptance pending.

`/automod thresholds [mentions] [caps-percent] [caps-letters]` tunes mention limit2-20,caps percent50-100 and minimum letters10-100 without enabling moderation or changing action/rules. At least one option required. Caps detection strictly exceeds percentage,at/above minimumletters;@everyone/@here always qualify under enabled mention rule. Defaults5/80/20 preserve existing JSON behavior. Timeout snapshot now includes every threshold field.349 local project tests,no false-positive field acceptance.

`/automod testtext text` is a private static dry-run for configured words/invites/HTTP links/caps even while moderation disabled. It explicitly does not simulate mentions/spam/member exemptions/channel policy. No sample content echoed/saved,no incident/case/cooldown/spam state or native action. Current exact manager required.375 local project tests;not live false-positive acceptance.

`spamthresholds [messages] [repeats] [seconds]` tunes3-10 total messages,2-10 identical normalized messages,5-30s rollingwindow. Atleastoneoption,currentmanagerrequired. Doesnotenable/changeactions/rules;defaults6/3/10. Recenthistorymemorymax10/userguild,bounded10000keys,resetsonrestart;short-livednormalizedcontentsretainedupto30s,notSQLite. Configchangecomparesfullsnapshotbeforetimeout/delete. Tune warningonlyfirst,falsepositivespossible. Finishrequiresone reservedreceipt;loggingfailurecannotrewritecompletedterminalstatus.571localtests,new202pathssourcelocalonly.

`unresolved [page]`:private current-manager metadata review,oldestfirst10/page,page1-10,max100visible records. Onlyreserved/uncertain,notcompleted/failed orforeignguilds. IDs,userID,rule,action,statusonly,nooriginalmessage/content. Doesnotretryorchange records;uncertain means outcomeunknown,notfailure/currentrisk. Standardcleanup30days;metadatareviewcannotprove nativeDiscordoutcome. Reservedrows recoveruncertain after restart,noautomaticreplay.575localtests/203paths;source unpublished beyond556checkpoint.

## Stored count summary

`/automod stats` requires current ManageGuild and returns a private localized,no-ping aggregate of retained incident outcomes and action counts. No message content,IDs or user details are shown. This reads stored records only,not current risk or native outcomes,and performs no retry or mutation. Retention is subject to separate cleanup;older retained rows can remain until cleanup runs.

Timeout safety requires the refreshed native restriction deadline to be explicit null (no restriction) or a nonnegative safe integer. Unknown or malformed deadlines fail the reserved incident rather than risk shortening an unverifiable existing timeout.

`/automod incidents [status]` filters stored reserved/completed/uncertain/failed outcomes before selecting the newest20 records. Omit status for all outcomes. Read-only/private/current-manager;does not fetch source messages or retry actions.

## Policy export and reset

`exportpolicy` privately exports stored enabled/action/rules/thresholds/literal words/exempt-role/ignored-channel IDs. No incidents/message content history/actor IDs/live readiness proof. Keep file private;not an import/restore operation.

`clearwords confirm:true` erases only literal word list,retains words-rule toggle/other rules/action/enabled/exemptions/incidents/cases. `resetpolicy confirm:true` restores disabled defaults(allrulesoff,warn/default thresholds,emptywords/exemptions/ignoredchannels). Clears only this guild's short-lived in-memory spam history,not another guild's. Persistent incidents/cases/replayguards/native messages unchanged. Stopping/resetting remains allowed while runtime off and needs exact fresh ManageGuild+confirmation. Already-in-flight actions may finish. If config reset happens during native pre-effect validation,existing exactpolicy recheck stops effect and marks existing reservation failed rather than deleting its replayguard. No atomic recall guarantee. All replies private localized/no-ping/JSONbytes locally tested;live false-positive/gateway/visual acceptance pending.

## Safe policy replacement and exclusion clearing

`/automod importpolicy json confirm:true` accepts one strict policy object up to4000characters. Uses existing policy schema/defaults,normalizes literal words,rejects empty/duplicate/control words and duplicate role/channel IDs. Complete replacement restores unspecified defaults,forces enabled=false,clears own guild spam memory only after successful storage. Incident/case/replay guards remain. Imported role/channel IDs are stored configuration only,not live existence/permission verification. Review settings and explicitly enable later;exported maximum policies may exceed import limit. No native effects during import.

`clearignored confirm:true` clears stored ignored channels;`clearexempt confirm:true` clears stored exempt role IDs. Other settings and guards remain,including enabled/action. If enabled,future messages previously excluded can be moderated. No native role/channel mutation or existence checks are needed for forgetting exclusions. In-flight actions can finish. Fresh native Manage Server,private3locale/no-ping. Three tests cover schema/bounds/normalization/replacement/defaults/disable/memory/storagefailure,scope/isolation and commandauthority/confirmation. No live/client visual acceptance.
