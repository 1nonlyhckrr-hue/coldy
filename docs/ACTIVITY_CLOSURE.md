# Activity and VoiceMaster reference closure - October12

Every34leaderboard and4VoiceMaster reference inventory row mapped below. Adapted is a named narrower original slash behavior,not literal prefix parity or native acceptance. Unknown541help inventory remains unknown.

Sources:https://docs.zynrax.site/configuration/leaderboard and https://docs.zynrax.site/configuration/voicemaster

| Reference | Disposition | Emika paths / reason |
| --- | --- | --- |
| addvctime | omitted (safety) | Manual fabricated voice-time adjustments omitted safety:counts are observed settled samples,not administrator-assigned reward credit;avoid misrepresenting tracked activity. Own erasure remains. |
| blacklistcategory | adapted | /leaderboard exclude - Explicit current manager category exclusion;applies futurecounts,no historical erasure. |
| blacklistchannel | adapted | /leaderboard exclude - Explicit current manager textchannel exclusion;applies future eligible counts only. |
| clearinvites | omitted (native-limit) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| clearmsgs | adapted | /leaderboard resetall, /leaderboard eraseuser - Confirmed manager erasure allguildcounts or exactuser;preferences/replayguards/cases remain. |
| clearvoice | omitted (safety) | Wholeguild voice erase omitted safety in current interface:one manager bulk action could remove many opt-in histories/reward evidence without reviewed per-target scope. Own erasure/privacy optout exist;no fake no-op reset path. |
| dailyvoice | adapted | /voicelb top - Explicit today UTCcalendar sampledsettledtime,not certifiedcontinuouspresence. |
| invited | omitted (native-limit) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| inviteinfo | adapted | /inviteinfo - Own active native invitecodes/counters cap25 privately,no persistent attribution/history,no othermember lookup. |
| invitelb off | omitted (native-limit) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| invitelb on | omitted (native-limit) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| inviteleaderboard | omitted (native-limit) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| inviteleaderboard fake | omitted (safety) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| inviteleaderboard regular | omitted (native-limit) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| inviter | omitted (native-limit) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| invites | omitted (native-limit) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| leaderboard dailymessages | adapted | /leaderboard top - Explicit period today,UTC calendar day,not trailing24hours;retained metric boundaries stated. |
| leaderboard messages | adapted | /leaderboard top - Explicit period retained90UTCdays,not all-time;indefinite history omitted privacy. |
| leaderboard weeklymessages | adapted | /leaderboard top - Explicit week,today+previous6UTCdays,not current calendar-week or indefinite history. |
| msgleaderboard off | adapted | /leaderboard disable - Stops future counting,retains privacy-bounded counts/no submitted effect reversal. |
| msgleaderboard on | adapted | /leaderboard enable - Future eligible messages only,opt-in,no content;not historical import. |
| msgstats | adapted | /leaderboard stats - Only requesting member counts retained90UTCdays,today/week;other-member detail omitted privacy. |
| reducevctime | omitted (safety) | Manual fabricated voice-time adjustments omitted safety:counts are observed settled samples,not administrator-assigned reward credit;avoid misrepresenting tracked activity. Own erasure remains. |
| resetmyinvites | omitted (native-limit) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| resetmymessages | adapted | /leaderboard resetmine - Own retainedcounts only,privacy/replayguards retained;not native message deletion. |
| resetmyvoice | adapted | /voicelb resetmine - Erases ownsettledcounts anddrops session,no native disconnect/effect/rewardrevocation. |
| setaltthreshold | omitted (safety) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| setinviterole | omitted (safety) | No reliable usedinvite identity in memberjoin events;counterdelta races/offline/deleted/vanity/rejoin gaps cannot justify exact inviter stats/rankings/rewards. Fake/alt account-age labels omitted safety;no such tracker to reset or enable. Specific behavior dispositions in INVITE_SCOPE.md. |
| setmessagerole | adapted | /rankreward set, /rankreward claim - Owner-configured zero-permission role and explicitmember claim against retained90daycounts;automatic grant omitted safety,channel access owner-review required. |
| vcstats | adapted | /voicelb stats - Own settled sampledconnectedmilliseconds today/week/90days only;othermemberdetails omitted privacy. |
| voicelb off | adapted | /voicelb disable - Stops sampling,retains settled90UTCdays;inflight/restarttails dropped rather than guessed. |
| voicelb on | adapted | /voicelb enable - Opt-in futurehumanjoins and60secondnative sampling,not startup/backfill/speaking activity. |
| voiceleaderboard | adapted | /voicelb top - Explicit retained90UTCdays sampledconnectiontime,not all-time speaking ranking. |
| weeklyvoice | adapted | /voicelb top - Explicit week UTCtoday+previous6days sampledsettledtime,not speakingquality. |
| voicemaster buttons | adapted | /voicemaster buttons - Private10min one-use ownerbound fixedlock/shareeveryoneunlock/emptyclose buttons. Dropdowncustomization/mute/hide/ban/transfer omitted safety:no overwriting participant access/punishment/ownership. Rename/limit stay explicitslash. |
| voicemaster config | adapted | /voicemaster config, /vmjoin config, /voicemaster records - Stored active setup/lobby/ownership metadata privately,currentnative room config separately inspectable;storedrecord is not occupancy/access proof. |
| voicemaster reset | adapted | /vmjoin off, /voicemaster resetsetup, /voicemaster close - Adapted stopfuturejoincreation/forgetcreationcategory/manualowneremptyroomclose. Fullsystem category/lobby/occupiedchannel destruction omitted safety;no massdisconnect/delete or autoemptycleanup. |
| voicemaster setup | adapted | /voicemaster setup, /vmjoin setup - Existing category/lobby explicit setup,futurehumanjoin private creation+one-shotmove. Auto category/lobby creation omitted safety to avoid unreviewed hierarchy/audience creation;no startupexistinglobbysweep. |

## Additional described behaviors

- Real-time statistics:adapted to eligible messageevent counts and settled60second voice samples. Nativegateway misses/offline gaps/counter updates are not a zero-latency guarantee. Voice samples are connectedtime,not audio/speaking or exact continuous presence.
- VoiceMaster automaticemptycleanup:omitted safety. Occupancy cache/reconnect/finaljoin races cannot justify unattended deletion. Current manualclose requires readiness/rawvoice empty guards;still native race remains.
- Ownershiptransfer/fullcontrol/occupied mute-hide-ban controls:omitted safety. Ownership/audience rewrite or thirdparty punishment needs reviewed authority/native behavior,not an unchecked button.
- Button dropdowncustomization:omitted safety for unsupported control surfaces;fixedthreebuttons are explicit safe subset.
- Fullsysteminstantdelete:omitted safety. Existingcategory/lobby never deleted;trackedemptyownerroom is the only manualclose target.
- All-time/last24hours/currentweek:explicitly adapted to90UTCdays/today/today+previous6days,never silently called literal equivalents.
- Message/voice rewards:only member-confirmed claims,never surpriseautomaticgrants. Counts reset/privacy do not revoke roles;unknown or successful receipts prevent regrant.
- Voiceadminadjustment/wholeguildreset:explicit safetyomissions,ownerase available. No stats falsely credited by manager input.

Machine evidence:data/activity-closure.json;installedpaths validated by ledger tests;referenced current module docs/services inspected. Native Discord/voice/button effects and pixels still unverified.
