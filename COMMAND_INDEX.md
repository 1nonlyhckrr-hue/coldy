# Command index

## Installed Emika commands

75 top-level commands, 614 executable paths. Registry-derived original Emika behavior. Local mock/unit coverage only;no live Discord acceptance or deployment. Reference equivalence is separate. See docs/MODULE_STATUS.md for current verification and limitations.

| Slash path | Behavior | Tested |
| --- | --- | --- |
| /activity clear | Remove the custom activity. | Local mock/unit only |
| /activity set | Set the bot activity. | Local mock/unit only |
| /activity show | Show the saved activity. | Local mock/unit only |
| /antinuke actioncounts | Private retained alert-incident counts by audit action/state,not all audit events. | Local mock/unit only |
| /antinuke actionincidents | Latest100retainedincidents forwatchedauditactionJSON,total/truncation,no actors/sourceIDs. | Local mock/unit only |
| /antinuke clearchannel | Stop monitoring and forget alert destination;threshold/trust/history kept. | Local mock/unit only |
| /antinuke cleartrust | Clear all stored user exemptions;owner/bot exemptions kept,alert-only. | Local mock/unit only |
| /antinuke config | Show alert settings and limitations. | Local mock/unit only |
| /antinuke disable | Stop alert-only audit monitoring. | Local mock/unit only |
| /antinuke enable | Enable alert-only detection for supported audit actions. | Local mock/unit only |
| /antinuke exportincidents | Private latest100 minimalincidentmetadata JSON,total/truncation,no actor/sourceIDs. | Local mock/unit only |
| /antinuke exportpolicy | Private storedalert config/trustedIDs JSON,not audit history/preventionproof. | Local mock/unit only |
| /antinuke exportunresolved | Latest100recorded/uncertain/unavailable metadataJSON;not replay,retry or prevention. | Local mock/unit only |
| /antinuke importpolicy | Replace stored alert policy from strict JSON,force disabled,no native actions. | Local mock/unit only |
| /antinuke incidents | Show20 recent stored audit burst alerts. | Local mock/unit only |
| /antinuke inspectincident | ExactstoredincidentID minimalmetadataJSON/null,no actor/auditentryIDs or native lookup. | Local mock/unit only |
| /antinuke punishrole | Choose the role given by auto-quarantine; leave empty for the default. | Local mock/unit only |
| /antinuke release | Release a quarantined member and give back the roles that were removed. | Local mock/unit only |
| /antinuke removetrust | Confirmed remove one exactstored trustedID,including departedusers,not nativeaccess. | Local mock/unit only |
| /antinuke resetpolicy | Confirmed stopalerts/forgetdestination/trust/defaultthresholds,receipts kept. | Local mock/unit only |
| /antinuke summary | Private retained incident counts by state,no actor/source IDs or protection claim. | Local mock/unit only |
| /antinuke tamperhold | Opt in or out: re-apply quarantine if it is removed or edited (default off). | Local mock/unit only |
| /antinuke threshold | Set mixed-action count and observation window. | Local mock/unit only |
| /antinuke trust | Exempt a current member from audit alerts only. | Local mock/unit only |
| /antinuke trustlist | Private stored trusteduser IDs only,no native membership/permission claim. | Local mock/unit only |
| /antinuke unresolved | Privately inspect stored unresolved alert metadata;no retry or punishment. | Local mock/unit only |
| /backup create | Save roles, channels and permissions as a backup (keeps the latest 5). | Local mock/unit only |
| /backup delete | Delete one saved backup. | Local mock/unit only |
| /backup export | Download one backup as JSON. | Local mock/unit only |
| /backup list | Show saved backups. | Local mock/unit only |
| /backup restore | Recreate missing roles and channels from a backup. Nothing is deleted or edited. | Local mock/unit only |
| /guard botadd | Act when an untrusted user adds a bot. Trusted users may add any bot. | Local mock/unit only |
| /guard config | Show all guard settings. | Local mock/unit only |
| /guard permalert | Act when an untrusted user gives a role dangerous permissions. | Local mock/unit only |
| /guard webhook | Act when an untrusted user creates a webhook. | Local mock/unit only |
| /joinraid config | Show the current settings. | Local mock/unit only |
| /joinraid disable | Turn anti join-raid off. | Local mock/unit only |
| /joinraid enable | Turn on and set the limits. | Local mock/unit only |
| /lockdown | Panic mode: stop @everyone from sending messages or joining voice. Undo: /unlockdown. | Local mock/unit only |
| /owner allow | Let a member use a security feature (default: nobody is delegated). | Local mock/unit only |
| /owner list | Show delegated users in this server. | Local mock/unit only |
| /owner revoke | Remove a delegation (one feature, or everything if feature is empty). | Local mock/unit only |
| /unlockdown | End /lockdown and restore the exact previous channel permissions. | Local mock/unit only |
| /verification config | Show the current settings. | Local mock/unit only |
| /verification disable | Turn verification off (roles and channel hiding are kept). | Local mock/unit only |
| /verification setup | Turn on verification, hide other channels from new members and post the panel. | Local mock/unit only |
| /automation cancel | Cancel a pending or uncertain schedule. | Local mock/unit only |
| /automation cancelchannel | Cancel pending schedules for stored channel ID; sending/uncertain/history untouched. | Local mock/unit only |
| /automation cancelpending | Confirm cancellation of all pending guild schedules; in-flight/uncertain untouched. | Local mock/unit only |
| /automation channelrecords | Private latest 100 stored schedule metadata for exact channel ID, no native validity claim. | Local mock/unit only |
| /automation clearfinished | Delete done/cancelled schedule records; active/uncertain/native messages kept. | Local mock/unit only |
| /automation clone | Confirmed copy of pending body/destination into new one-time future send, no repeats. | Local mock/unit only |
| /automation config | Show schedule limits and restart policy. | Local mock/unit only |
| /automation create | Schedule one message or a fixed elapsed-time repeat. | Local mock/unit only |
| /automation createzone | Schedule one message using explicit local date/time and named timezone. | Local mock/unit only |
| /automation destination | Move one pending message schedule to a validated channel; does not send now. | Local mock/unit only |
| /automation edit | Replace text of a pending schedule only; time/destination unchanged. | Local mock/unit only |
| /automation export | Private JSON of latest 100 stored schedules including body/destination; not backup/replay. | Local mock/unit only |
| /automation exportmetadata | Private latest 100 schedule metadata JSON, total/truncation, no message text/source IDs. | Local mock/unit only |
| /automation forget | Erase stored text of a completed/cancelled schedule, not Discord messages. | Local mock/unit only |
| /automation forgetfinished | Erase bodies of done/cancelled schedules; metadata kept, no native message change. | Local mock/unit only |
| /automation inspect | Privately review one stored schedule, text and metadata; no native effects. | Local mock/unit only |
| /automation list | List recent schedule records. | Local mock/unit only |
| /automation overview | Privately count stored schedule states; not delivery receipts or live readiness. | Local mock/unit only |
| /automation repeat | Change pending elapsed repeat; omit minutes to make next send one-time. | Local mock/unit only |
| /automation reschedule | Move pending next send to explicit offset time; repeat stays elapsed interval. | Local mock/unit only |
| /automation reschedulezone | Move one pending schedule using explicit local time and named timezone. | Local mock/unit only |
| /automation shift | Confirmed pending next send offset +/- minutes; repeat interval/body/channel kept. | Local mock/unit only |
| /automation stoprepeats | Make all pending repeats one-time; next due/body/channel preserved, sending untouched. | Local mock/unit only |
| /automation upcoming | Privately inspect pending sends ordered by time; no content or sending. | Local mock/unit only |
| /autorole add | Configure safe role for future human/bot joins, max 10 per kind; requires member events. | Local mock/unit only |
| /autorole config | Private saved human/bot role policies; not native grants or current member proof. | Local mock/unit only |
| /autorole remove | Remove exact saved role policy; does not remove existing member roles. | Local mock/unit only |
| /autorole reset | Clear human/bot/all policies only; existing member roles and receipts unchanged. | Local mock/unit only |
| /event config | Private stored policy/receipt states, not proof complete server isolation. | Local mock/unit only |
| /event disable | Confirm exact snapshot owned restore only; third party drift/uncertainty blocks overwrite. | Local mock/unit only |
| /event enable | Confirm selected everyone View denies; event category unchanged; partial effects possible. | Local mock/unit only |
| /event reset | Forget inactive fully restored policy only; never delete category/channels. | Local mock/unit only |
| /event setup | Select a visible event category and 1-10 outside text channels; at least 100 members, no creation. | Local mock/unit only |
| /react add | Set a single-word trigger with 1-10 distinct emoji; up to 10 rules, future messages only. | Local mock/unit only |
| /react list | Private saved trigger/emoji JSON, not native reactions proof. | Local mock/unit only |
| /react remove | Remove one literal single word rule; existing reactions unchanged. | Local mock/unit only |
| /react reset | Clear all auto-reaction rules only; existing reactions and receipts unchanged. | Local mock/unit only |
| /schedulecleanup cancel | Cancel pending schedules in one stored destination; unknown/in-flight left alone. | Local mock/unit only |
| /schedulecleanup erasefinished | Erase done/cancelled text in one stored destination; pending/unknown/in-flight kept. | Local mock/unit only |
| /schedulecleanup stoprepeats | Make pending repeats in one stored destination one-time; next sends still happen. | Local mock/unit only |
| /antibot add | Enable bot-message deletion in one text channel, max 25; explicit confirm required. | Local mock/unit only |
| /antibot config | Private saved channel and bot whitelist IDs; not live deletion proof. | Local mock/unit only |
| /antibot remove | Stop future bot-message deletion in one channel; submitted effects may finish. | Local mock/unit only |
| /antibot reset | Clear channels and whitelist; existing receipts/messages untouched. | Local mock/unit only |
| /antibot wladd | Whitelist one current bot member, max 100; Emika always exempt. | Local mock/unit only |
| /antibot wlremove | Remove one exact stored bot ID, including departed bots. | Local mock/unit only |
| /automod clearexempt | Clear role exemptions; if enabled, future messages by these roles may be moderated. | Local mock/unit only |
| /automod clearignored | Clear ignored channels; if enabled, future messages there may be moderated. | Local mock/unit only |
| /automod clearwords | Confirmed remove all stored literal blocked words; other rules/settings kept. | Local mock/unit only |
| /automod config | Show configured rules and limits. | Local mock/unit only |
| /automod disable | Stop automatic message moderation. | Local mock/unit only |
| /automod disablerules | Disable all six moderation rules, keep enabled switch/action/exclusions/words/history. | Local mock/unit only |
| /automod enable | Enable configured rules; all rules start disabled. | Local mock/unit only |
| /automod exempt | Add or remove an exempt server role. | Local mock/unit only |
| /automod exportpolicy | Private JSON of stored rules/literal words/exempt IDs, not incident/message history. | Local mock/unit only |
| /automod ignorechannel | Ignore/unignore one channel for automatic message moderation. | Local mock/unit only |
| /automod importpolicy | Replace strict policy JSON, force disabled, clear own spam memory; no native effects. | Local mock/unit only |
| /automod incidents | Show 20 recent stored outcomes, optionally filtered, no message content. | Local mock/unit only |
| /automod removepolicy | Remove one stored ignored channel/exempt role ID, including deleted subjects. | Local mock/unit only |
| /automod resetpolicy | Confirmed disabled/default policy reset, words/exemptions cleared; incidents/cases kept. | Local mock/unit only |
| /automod resetthresholds | Reset caps/mentions/spam limits to defaults, keep switches/action/exclusions/words/history. | Local mock/unit only |
| /automod rule | Enable or disable one rule. | Local mock/unit only |
| /automod spamthresholds | Tune bounded spam counts/window; does not enable moderation. | Local mock/unit only |
| /automod stats | Private aggregate stored incident outcomes; no content, IDs or retries. | Local mock/unit only |
| /automod testtext | Private dry-run of literal/caps/link rules, no punishment or spam tracking. | Local mock/unit only |
| /automod thresholds | Tune mention/caps thresholds; does not enable rules or moderation. | Local mock/unit only |
| /automod timeoutminutes | Set automatic timeout duration 1-60 minutes; does not enable rules. | Local mock/unit only |
| /automod unresolved | Privately inspect unresolved stored incident metadata; never retries actions. | Local mock/unit only |
| /automod wordadd | Add a literal word/phrase to the filter. | Local mock/unit only |
| /automod wordlist | Privately inspect twenty stored literal phrases per page. | Local mock/unit only |
| /automod wordremove | Remove a literal filtered word/phrase. | Local mock/unit only |
| /media bypassadd | Exempt one confirmed current human member, max 100 saved bypasses. | Local mock/unit only |
| /media bypassremove | Remove one exact stored bypass member ID, including departed members. | Local mock/unit only |
| /media bypassshow | Private saved bypass IDs only, not native membership proof. | Local mock/unit only |
| /media config | Private saved media policy, bypasses count and runtime caveats. | Local mock/unit only |
| /media remove | Disable future attachment-only deletion; already submitted deletion may finish. | Local mock/unit only |
| /media setup | Enable one normal text channel attachment-only policy; explicit confirm required. | Local mock/unit only |
| /mentionguard off | Disable protected-member mention timeouts; existing timeout unchanged. | Local mock/unit only |
| /mentionguard set | Enable fourth direct-mention-message timeout in 10 minutes; explicit 1 s-28 d duration. | Local mock/unit only |
| /mentionguard status | Private saved policy and last result; not native timeout proof. | Local mock/unit only |
| /autoresponder clone | Copy response/mode/cooldown into a new paused rule; no send or replay history copy. | Local mock/unit only |
| /autoresponder config | List stored trigger configuration, optionally filtered by enabled state. | Local mock/unit only |
| /autoresponder cooldown | Change one stored trigger cooldown 10-3600 s; last-send/replay history retained. | Local mock/unit only |
| /autoresponder cooldownall | Set all stored rule cooldowns; last-send/replay/enable states kept. | Local mock/unit only |
| /autoresponder create | Create an exact or literal keyword trigger. | Local mock/unit only |
| /autoresponder delete | Delete an existing trigger. | Local mock/unit only |
| /autoresponder deleteall | Delete all guild response rules; retained replay receipts kept, no message deletion. | Local mock/unit only |
| /autoresponder deletepaused | Delete paused rule text/settings only; retain enabled rules and all replay receipts. | Local mock/unit only |
| /autoresponder deliveryoverview | Private stored receipt counts per rule/state, not current delivery or recovery. | Local mock/unit only |
| /autoresponder disableall | Pause all stored guild triggers; in-flight responses may finish, history retained. | Local mock/unit only |
| /autoresponder disablemode | Pause enabled exact or keyword rules; in-flight sends may finish, history kept. | Local mock/unit only |
| /autoresponder dryrun | Private literal-match diagnostic, no content storage/send/cooldown change. | Local mock/unit only |
| /autoresponder edit | Edit the response for an existing trigger. | Local mock/unit only |
| /autoresponder export | Private JSON of guild rule text/settings, no receipts or automatic enable. | Local mock/unit only |
| /autoresponder exportreceipts | Private latest 100 receipt metadata JSON, total/truncation, no message IDs or text. | Local mock/unit only |
| /autoresponder import | Atomically add 1-10 unique rules from JSON, all paused; no automatic send. | Local mock/unit only |
| /autoresponder info | Privately inspect one stored trigger settings and response; no native delivery. | Local mock/unit only |
| /autoresponder mode | Set literal exact/keyword matching, retaining response/cooldown/replay history. | Local mock/unit only |
| /autoresponder preview | Privately preview stored response, no send or cooldown change. | Local mock/unit only |
| /autoresponder rename | Change one stored trigger while preserving response and replay history. | Local mock/unit only |
| /autoresponder replace | Replace 1-10 existing rule settings atomically; pause them, retain IDs/replay/cooldowns. | Local mock/unit only |
| /autoresponder stats | Private stored rule/receipt counts only; not live delivery or readiness. | Local mock/unit only |
| /autoresponder toggle | Pause/resume one trigger, retaining response/cooldown/history. | Local mock/unit only |
| /customrole claim | Assign one configured safe role to yourself. | Local mock/unit only |
| /customrole claimown | Assign your verified zero-permission created role to yourself. | Local mock/unit only |
| /customrole clear | Manage Roles: remove all mappings, leaving native roles, assignments and eligibility unchanged. | Local mock/unit only |
| /customrole clearrequired | Manage Roles: remove eligibility gate, allowing otherwise eligible future self claims. | Local mock/unit only |
| /customrole colorown | Confirmed own zero-permission created role primary RGB color only. | Local mock/unit only |
| /customrole created | Privately inspect your stored creation record, no native role changes. | Local mock/unit only |
| /customrole createown | Create one unassigned zero-permission role for yourself, if manager enabled. | Local mock/unit only |
| /customrole creation | Manage Roles: opt in/out of unassigned zero-permission member role creation. | Local mock/unit only |
| /customrole creations | Manage Roles: private paged creation records, status and IDs only. | Local mock/unit only |
| /customrole eligibility | Privately check your current stored gate membership, no role grants/safety/readiness claim. | Local mock/unit only |
| /customrole exportmappings | Manage Roles: private JSON mapping names/role IDs/gate/policy, no ownership/member history. | Local mock/unit only |
| /customrole list | Show mapped names and eligibility role. | Local mock/unit only |
| /customrole map | Manage Roles: map a name to an existing safe role. | Local mock/unit only |
| /customrole reconcile | Manage Roles: verify observed uncertain creation, no native changes. | Local mock/unit only |
| /customrole release | Remove one configured role from yourself. | Local mock/unit only |
| /customrole releaseown | Remove your created role from yourself, no deletion. | Local mock/unit only |
| /customrole renamemapping | Manage Roles: change only stored mapping alias, not native role name/access. | Local mock/unit only |
| /customrole renameown | Confirmed own zero-permission created role name, not mapping/native other roles. | Local mock/unit only |
| /customrole required | Manage Roles: set eligibility role or remove the gate. | Local mock/unit only |
| /customrole resetconfig | Manage Roles: forget mappings/gate and stop creation, ownership/native roles/cases kept. | Local mock/unit only |
| /customrole resetstyle | Confirmed own created role primary color reset to 0; name/access retained. | Local mock/unit only |
| /customrole unmap | Manage Roles: remove a mapping, leaving existing assignments. | Local mock/unit only |
| /customrole unmaprole | Manage Roles: remove exact stored mapped role ID, no native assignments changed. | Local mock/unit only |
| /customroleaudit exportmine | Your stored role ID, name, color, state and time JSON, null if absent. | Local mock/unit only |
| /customroleaudit exportpolicy | Manage Roles: stored creation switch, gate role and mappings JSON. | Local mock/unit only |
| /customroleaudit summary | Manage Roles: stored creation counts by state, no owner IDs or native effects. | Local mock/unit only |
| /fun 8ball | Get a playful random answer, not advice. | Local mock/unit only |
| /fun bingo | Private fresh 75 ball 5 x 5 BINGO card, free N center, no called numbers/prizes/saved game. | Local mock/unit only |
| /fun bracket | Private randomized first-round single-elimination bracket 2-16 labels, no winners or assignments. | Local mock/unit only |
| /fun cards | Draw 1-10 distinct cards from a fresh 52 card deck, no betting/saved game. | Local mock/unit only |
| /fun choose | Pick one of 2-20 choices separated by \|. | Local mock/unit only |
| /fun coin | Flip a coin. | Local mock/unit only |
| /fun dare | Get an optional, safe solo activity. | Local mock/unit only |
| /fun dealhands | Private 2-5 numbered hands, 1-5 cards each, unique standard deck, no bets/secret delivery. | Local mock/unit only |
| /fun dice | Roll up to ten dice. | Local mock/unit only |
| /fun dicehistogram | Private 1-100 independent dice rolls summarized by face, count/total, no stored state. | Local mock/unit only |
| /fun dicekeep | Roll bounded dice, keep highest or lowest results; no stakes or saved state. | Local mock/unit only |
| /fun dicetarget | Roll dice and count values at or above an explicit target, no stakes. | Local mock/unit only |
| /fun dominoes | Private draw 1-7 unique double-six domino tiles from fresh 28 tile set, no bets/saved game. | Local mock/unit only |
| /fun exchange | Private one-cycle label exchange; no self match, no messages or secret delivery. | Local mock/unit only |
| /fun number | One uniform integer in an inclusive bounded range; not advice. | Local mock/unit only |
| /fun pairs | Private random pairings of 2-20 labels, odd label gets bye; no member assignment. | Local mock/unit only |
| /fun roundrobin | Private complete pair schedule for 2-10 labels, no dates/member assignments. | Local mock/unit only |
| /fun rps | Play one round of rock, paper, scissors against Emika. | Local mock/unit only |
| /fun rpsseries | Play 2-10 preselected RPS rounds against Emika; private score, no stakes. | Local mock/unit only |
| /fun sample | Pick 1-20 distinct waiting labels without replacement; no assignments. | Local mock/unit only |
| /fun shuffle | Privately randomize all 2-20 distinct choices, no assignments. | Local mock/unit only |
| /fun teams | Privately split 2-20 distinct labels into balanced random groups, no invites. | Local mock/unit only |
| /fun truth | Get an optional, low-pressure reflection prompt. | Local mock/unit only |
| /fun weightedchoice | Private weighted draw from explicit labels/positive integer weights, not advice. | Local mock/unit only |
| /fun wordscramble | Scramble your supplied ASCII word, answer in spoiler; no dictionary/guess tracking. | Local mock/unit only |
| /about | Show Emika version and implementation status. | Local mock/unit only |
| /autosetup | Save a default Emika setup for the layout from /setupstructure; safe to rerun. | Local mock/unit only |
| /config export | Private stored language/welcome/logging JSON, includes templates/channel IDs, no token/runtime. | Local mock/unit only |
| /config language | Set English, Hindi or Hinglish for this server. | Local mock/unit only |
| /config pause | Stop welcome/goodbye/logging delivery; keep destination/templates/options/language. | Local mock/unit only |
| /config resetdelivery | Stop and forget welcome/goodbye/logging settings; keep language/other modules/history. | Local mock/unit only |
| /config view | View this server configuration. | Local mock/unit only |
| /help | Public interactive command directory with categories, pages and details. | Local mock/unit only |
| /ping | Show Emika gateway latency. | Local mock/unit only |
| /setupstructure | Create the Emika Gothic server layout; existing categories and channels are kept. | Local mock/unit only |
| /uptime | Show how long this process has been running. | Local mock/unit only |
| /giveaway cancel | Confirmed stop stored active giveaway, no native announcement/button edit. | Local mock/unit only |
| /giveaway cancelall | Cancel all active giveaways in storage only; no native message edits or announcements. | Local mock/unit only |
| /giveaway cancelchannel | Confirmed cancel only active giveaways in exact stored channel, no native announcements/deletes. | Local mock/unit only |
| /giveaway channelcounts | Private stored giveaway counts by channel ID/state, no entries/member IDs/current activity proof. | Local mock/unit only |
| /giveaway channelmetadata | Latest 100 minimal giveaway metadata for exact stored channel ID, no prize/member/native lookup. | Local mock/unit only |
| /giveaway channelrecords | Private latest 100 metadata for exact stored channel ID, total/truncated, no entrant IDs. | Local mock/unit only |
| /giveaway config | Show giveaway limits and policies. | Local mock/unit only |
| /giveaway end | End and publish a stored draw, or retry publishing it. | Local mock/unit only |
| /giveaway entrycounts | Export entry counts for up to 100 stored giveaways; total and truncation, no member IDs. | Local mock/unit only |
| /giveaway export | Private latest 100 stored giveaway prize/schedule/binding records, no entrant/winner IDs. | Local mock/unit only |
| /giveaway exportmetadata | Private latest 100 minimal ID/channel/state/due/count/draw version/time JSON, no prize/source IDs. | Local mock/unit only |
| /giveaway exportunresolved | Latest 100 pending/ending/uncertain minimal giveaway metadata, no draw/retry/native outcome proof. | Local mock/unit only |
| /giveaway forgetentries | Confirmed erase ended/cancelled entrant IDs; future rerolls lose candidates. | Local mock/unit only |
| /giveaway forgetfinishedentries | Erase entrant IDs for ended/cancelled giveaways; winner history/native messages kept. | Local mock/unit only |
| /giveaway inspect | Private stored prize/state/entry count, no entrant IDs/live readiness. | Local mock/unit only |
| /giveaway inspectmetadata | Exact stored giveaway ID minimal metadata JSON/null, no prize/winner/member/source IDs/native proof. | Local mock/unit only |
| /giveaway list | List latest 100 stored records, 2 complete prizes/page, no live delivery claim. | Local mock/unit only |
| /giveaway reroll | Draw again, excluding the immediately previous winners. | Local mock/unit only |
| /giveaway start | Create a giveaway with checked eligibility. | Local mock/unit only |
| /giveaway summary | Private stored giveaway state/retained-entry counts, no entrant/winner identities. | Local mock/unit only |
| /giveawayleave | Withdraw only your own entry from an active giveaway before its deadline. | Local mock/unit only |
| /inviteinfo | Private current native metadata for your own active invites; no join attribution or tracking. | Local mock/unit only |
| /leaderboard activity | Only your retained 90 UTC-day counts, active days and longest run; not quality. | Local mock/unit only |
| /leaderboard clearexclusions | Clear stored exclusion IDs; tracking/counts/preferences/replay guards stay as-is. | Local mock/unit only |
| /leaderboard config | View tracking status and excluded IDs. | Local mock/unit only |
| /leaderboard daily | Show only your retained daily message counts, ten UTC days per page. | Local mock/unit only |
| /leaderboard dailyoverview | Manage Server: ten retained UTC daily contributor/count aggregates, no identities. | Local mock/unit only |
| /leaderboard disable | Manage Server: stop counting; keep stored counts. | Local mock/unit only |
| /leaderboard enable | Manage Server: start counting future eligible messages. | Local mock/unit only |
| /leaderboard erasebefore | Manage Server: erase stored counts strictly before explicit UTC date; guards kept. | Local mock/unit only |
| /leaderboard eraseuser | Manage Server: erase one user retained counts, not their preference. | Local mock/unit only |
| /leaderboard exclude | Manage Server: exclude/include a text channel or category. | Local mock/unit only |
| /leaderboard exportconfig | Private stored tracking switch/excluded IDs only; no people, counts or privacy records. | Local mock/unit only |
| /leaderboard exportmine | Private CSV of only your retained UTC daily counts; no message content. | Local mock/unit only |
| /leaderboard optin | Allow future counts when this server has tracking enabled. | Local mock/unit only |
| /leaderboard optout | Stop counting your future messages and erase your counts. | Local mock/unit only |
| /leaderboard overview | Manage Server: aggregate retained contributors/messages/days, no identities. | Local mock/unit only |
| /leaderboard position | Show only your retained message rank and count, UTC window. | Local mock/unit only |
| /leaderboard privacy | Only your stored counting preference and server tracking switch; no changes. | Local mock/unit only |
| /leaderboard removeexclude | Manage Server: remove one exact stored exclusion, including deleted channels. | Local mock/unit only |
| /leaderboard resetall | Manage Server: erase all retained guild counts; tracking/preferences/replay guards kept. | Local mock/unit only |
| /leaderboard resetmine | Delete only your retained message counts. | Local mock/unit only |
| /leaderboard resetpolicy | Stop tracking and forget exclusions; retain counts/preferences/replay guards. | Local mock/unit only |
| /leaderboard stats | Show your own retained message counts. | Local mock/unit only |
| /leaderboard top | Show retained message ranks, ten per page. | Local mock/unit only |
| /leaderboard weeklymine | Only your 90 retained UTC days in 13 disjoint newest-first elapsed 7-day buckets. | Local mock/unit only |
| /rankreward claim | Your explicit one-shot role grant; no automatic claim/regrant/revocation. | Local mock/unit only |
| /rankreward config | Private stored milestone rules, not count or role-access guarantee. | Local mock/unit only |
| /rankreward eligible | Only your retained 90 day eligibility; tracking/privacy checks, no grant. | Local mock/unit only |
| /rankreward remove | Owner confirm: remove rule only; never remove granted roles or erase receipts. | Local mock/unit only |
| /rankreward set | Owner confirm: zero-permission existing role; retained 90 day messages or sampled voice minutes. | Local mock/unit only |
| /voicelb config | Private saved voice tracking switch and your privacy preference. | Local mock/unit only |
| /voicelb disable | Manage Server: stop sampling and discard unfinished intervals; counts retained. | Local mock/unit only |
| /voicelb enable | Manage Server: start future voice join sampling; no credit for already connected sessions. | Local mock/unit only |
| /voicelb optin | Allow future join samples if server tracking enabled; no existing-call backfill. | Local mock/unit only |
| /voicelb optout | Erase your counts/active sample and stop future sampling here. | Local mock/unit only |
| /voicelb resetmine | Erase only your voice counts and active sample; privacy preference kept. | Local mock/unit only |
| /voicelb stats | Only your settled sampled voice milliseconds today/week/90 retained UTC days. | Local mock/unit only |
| /voicelb top | Private ten sampled voice ranks/page; not full call duration or speaking activity. | Local mock/unit only |
| /casehistory actioncounts | Stored case counts by action/state, no identities/reasons/current native state claims. | Local mock/unit only |
| /casehistory actor | Private storedcase metadata for exact actor ID,10/page,no native lookup. | Local mock/unit only |
| /casehistory export | Private latest 100 case metadata/reasons JSON, total/truncated, no recovery/grant. | Local mock/unit only |
| /casehistory exportmetadata | Export up to 100 case metadata records; total and truncation, no reasons or actor/target IDs. | Local mock/unit only |
| /casehistory exportunresolved | Latest 100 pending/uncertain case ID/action/state/time JSON, no recovery/retry/native proof. | Local mock/unit only |
| /casehistory inspect | Read one exact stored case identity/reason/status, not current native state. | Local mock/unit only |
| /casehistory list | Page stored case metadata, ten per page, optional exact status filter. | Local mock/unit only |
| /casehistory summary | Private all stored case counts by status, no identities/reasons or native claims. | Local mock/unit only |
| /casehistory target | Private storedcase metadata for exact target ID,10/page,no native lookup. | Local mock/unit only |
| /logging channel | Choose the server log channel. | Local mock/unit only |
| /logging clearchannel | Stop logging and forget only destination; event opt-ins/history retained. | Local mock/unit only |
| /logging config | Show case-log settings. | Local mock/unit only |
| /logging deliverysummary | Private stored metadata-event receipt counts by state, no native verification. | Local mock/unit only |
| /logging disable | Disable delivery without deleting config. | Local mock/unit only |
| /logging enable | Enable case logs after configuring a channel. | Local mock/unit only |
| /logging event | Enable/disable one metadata event, no message content. | Local mock/unit only |
| /logging export | Private stored logging policy JSON; no case or delivery history. | Local mock/unit only |
| /logging exportreceipts | Private latest 100 metadata-event state/time JSON, total/truncation, no source IDs. | Local mock/unit only |
| /logging import | Replace strict stored logging policy JSON, force disabled; review destination later. | Local mock/unit only |
| /logging pauseevents | Confirmed clear all metadata-event opt-ins; case master/channel/replay receipts kept. | Local mock/unit only |
| /logging pausegroup | Stop member, role or channel metadata-event opt-ins; case logging/settings kept. | Local mock/unit only |
| /logging preview | Private sample case-log payload only, no native delivery or readiness claim. | Local mock/unit only |
| /logging reset | Confirmed stop logging and forget destination/event opt-ins, no native log deletion. | Local mock/unit only |
| /logging statereceipts | Latest 100 stored receipts in explicit state, state/time JSON, total/truncated, no source IDs. | Local mock/unit only |
| /logging test | Send one test log to the configured channel. | Local mock/unit only |
| /logging unresolvedreceipts | Latest 100 reserved/uncertain/unavailable stored receipts, no retry or native outcome proof. | Local mock/unit only |
| /logging windowreceipts | Read up to 100 stored receipts in a Unix millisecond window; no relative dates or source IDs. | Local mock/unit only |
| /bulktimeout confirm | Your exact unexpired preview; fresh permission/deadline guards, partial/uncertain stops, no retry. | Local mock/unit only |
| /bulktimeout preview | Explicit 1-10 member ID strings JSON; private exact deadline preview valid 120 s, no effects. | Local mock/unit only |
| /jail apply | Confirmed 1 s-28 d native timeout; roles unchanged, no existing timeout overwritten. | Local mock/unit only |
| /jail config | Private stored reference channel policy, not isolation proof. | Local mock/unit only |
| /jail list | Up to 25 active/uncertain jail metadata; expired native timeouts settle locally. | Local mock/unit only |
| /jail release | Confirmed clear exact owned current timeout only; drift/uncertain blocks. | Local mock/unit only |
| /jail reset | Owner: forget policy only when no live or uncertain jail records. | Local mock/unit only |
| /jail setup | Owner: record existing normal text jail reference channel, no permission or role edits. | Local mock/unit only |
| /moderation ban | ban: one member, checked and recorded. | Local mock/unit only |
| /moderation clearwarning | CurrentModerateMembers/hierarchy:one target stored warning clearwarning. | Local mock/unit only |
| /moderation clearwarns | clearwarns: one member, checked and recorded. | Local mock/unit only |
| /moderation editwarning | CurrentModerateMembers/hierarchy:one target stored warning editwarning. | Local mock/unit only |
| /moderation exportwarnings | CurrentModerateMembers/hierarchy:one target stored warning exportwarnings. | Local mock/unit only |
| /moderation kick | kick: one member, checked and recorded. | Local mock/unit only |
| /moderation purgeconfirm | Delete only your exact previewed IDs, expires in 2 minutes. | Local mock/unit only |
| /moderation purgepreview | Preview exact IDs among up to 10 recent messages, no deletion. | Local mock/unit only |
| /moderation timeout | timeout: one member, checked and recorded. | Local mock/unit only |
| /moderation unban | unban: one member, checked and recorded. | Local mock/unit only |
| /moderation untimeout | untimeout: one member, checked and recorded. | Local mock/unit only |
| /moderation warn | warn: one member, checked and recorded. | Local mock/unit only |
| /moderation warnings | warnings: one member, checked and recorded. | Local mock/unit only |
| /nickname | Confirmed one-member nickname update or explicit reset, no bulk changes. | Local mock/unit only |
| /role add | Confirmed onehuman safe role add,no managed/panel/autorole/selfcreated roles. | Local mock/unit only |
| /role color | CurrentManageRoles/hierarchy safeexistingrole color,no assignments/permissionchange. | Local mock/unit only |
| /role create | Confirmed unassigned zero-permission role create, no member assignment. | Local mock/unit only |
| /role mentionable | CurrentManageRoles/hierarchy safeexistingrole mentionable,no assignments/permissionchange. | Local mock/unit only |
| /role remove | Confirmed onehuman safe role remove,no managed/panel/autorole/selfcreated roles. | Local mock/unit only |
| /role rename | CurrentManageRoles/hierarchy safeexistingrole rename,no assignments/permissionchange. | Local mock/unit only |
| /slowmode | Confirmed single text-channel slowmode, 0 disables, no bulk changes. | Local mock/unit only |
| /music clear | Clear waiting tracks only; current track keeps playing. | Local mock/unit only |
| /music deduplicate | Keep the first queued track per provider ID; current track and requester history are not compared. | Local mock/unit only |
| /music duplicate | Append one waiting track copy attributed to you; current playback unchanged. | Local mock/unit only |
| /music move | Move one waiting track to exact final queue position; current playback untouched. | Local mock/unit only |
| /music nowplaying | Show current track. | Local mock/unit only |
| /music pause | Pause current track. | Local mock/unit only |
| /music play | Queue the first YouTube search result or an exact 11-character video ID. | Local mock/unit only |
| /music queue | Show ten queued tracks per page; current track separate. | Local mock/unit only |
| /music remove | Remove one queued position; never stops current track. | Local mock/unit only |
| /music removeown | Remove only waiting tracks requested by you; current playback unchanged. | Local mock/unit only |
| /music removerange | Remove inclusive waiting position range, current playback untouched. | Local mock/unit only |
| /music resume | Resume current track. | Local mock/unit only |
| /music reverse | Reverse waiting track order only, current playback unchanged. | Local mock/unit only |
| /music shuffle | Randomize waiting tracks only; current track unchanged. | Local mock/unit only |
| /music skip | Stop current track once and advance waiting queue; uncertain failures freeze. | Local mock/unit only |
| /music stay | Keep idle VC connection while this process/node are healthy; not uptime guarantee. | Local mock/unit only |
| /music stop | Disconnect and clear this server session. | Local mock/unit only |
| /music trim | Keep first N waiting tracks, discard later ones; current playback unchanged. | Local mock/unit only |
| /permit blockchannel | Deny one command in this exact channel, no inheritance/Discord overwrite. | Local mock/unit only |
| /permit blockrole | Block a role for one entire command. | Local mock/unit only |
| /permit blockuser | Block a user for one entire command. | Local mock/unit only |
| /permit channelrules | Private stored channel denies, ten per page; not Discord permissions. | Local mock/unit only |
| /permit clear | Remove all restrictions for one command. | Local mock/unit only |
| /permit clearall | Confirmed remove all guild Emika denies, user/role/channel; native permissions unchanged. | Local mock/unit only |
| /permit clearchannel | Remove all stored channel denies across commands;no Discord permission grants. | Local mock/unit only |
| /permit clearcommand | Confirmed remove both subject/channel denies for one stored command, including removed ones. | Local mock/unit only |
| /permit clearobsolete | Erase denies for registry-absent commands, may affect them if reinstalled later. | Local mock/unit only |
| /permit clearrole | Remove all stored role denies across commands;no Discord permission grants. | Local mock/unit only |
| /permit clearuser | Remove all stored user denies across commands;no Discord permission grants. | Local mock/unit only |
| /permit commandcounts | Private stored deny counts per command, no subject IDs or effective permission claim. | Local mock/unit only |
| /permit export | Private JSON of stored user/role/channel deny IDs, no permissions or native grants. | Local mock/unit only |
| /permit exportcommand | Private all stored subject/channel denies for exact command name, including absent commands. | Local mock/unit only |
| /permit list | Inspect stored deny rules, optional command/kind filters; no permission grants. | Local mock/unit only |
| /permit obsolete | Private JSON denies for commands absent from current registry; no deletion/resource claims. | Local mock/unit only |
| /permit remove | Remove one exact stored restriction, including departed/deleted subject IDs. | Local mock/unit only |
| /permit searchid | Private exact stored ID lookup across user/role/channel denies, no native lookup. | Local mock/unit only |
| /permit status | Check your current stored command restriction only, not Discord permissions. | Local mock/unit only |
| /permit summary | Private stored deny counts by kind/command, no native permissions or IDs. | Local mock/unit only |
| /permit unblockchannel | Remove exact stored channel deny, including deleted channels. | Local mock/unit only |
| /permit unblockrole | Unblock a role for one entire command. | Local mock/unit only |
| /permit unblockuser | Unblock a user for one entire command. | Local mock/unit only |
| /reactionroles channelcounts | Private stored panel counts by channel ID/state, no member/role/source IDs or native validation. | Local mock/unit only |
| /reactionroles channelmetadata | Latest 100 minimal panel metadata for exact stored channel ID, no roles/labels/native lookup. | Local mock/unit only |
| /reactionroles channelrecords | Private latest 100 complete bindings/mappings for stored channel ID, no click receipts. | Local mock/unit only |
| /reactionroles clicksummary | Private retained role-click counts by state/action, no member or source IDs. | Local mock/unit only |
| /reactionroles create | Publish one role toggle button. | Local mock/unit only |
| /reactionroles disable | Disable a panel in storage; its old button becomes inactive. | Local mock/unit only |
| /reactionroles disableactive | Confirm disabling active panels in storage only; pending/uncertain untouched. | Local mock/unit only |
| /reactionroles disablechannel | Disable active panels for one stored channel ID; no native edits or role changes. | Local mock/unit only |
| /reactionroles disablerole | Disable entire active panels containing one role ID; no native edits or role changes. | Local mock/unit only |
| /reactionroles export | Private latest 100 stored panel bindings/button mappings; no member or click receipts. | Local mock/unit only |
| /reactionroles exportclicks | Private latest 100 click state/action/time JSON, total/truncation, no member/role/source IDs. | Local mock/unit only |
| /reactionroles exportmetadata | Export up to 100 panel metadata records; total and truncation, no role/source IDs or labels. | Local mock/unit only |
| /reactionroles exportunresolved | Latest 100 pending/uncertain minimal panel metadata, no retry/repair/native existence proof. | Local mock/unit only |
| /reactionroles inspect | Privately inspect stored panel mappings, status and binding IDs only. | Local mock/unit only |
| /reactionroles inspectmetadata | Exact stored panel ID minimal metadata JSON/null, no role/member/message/source IDs/labels. | Local mock/unit only |
| /reactionroles list | List ten complete panel records per page, newest 100 maximum. | Local mock/unit only |
| /reactionroles multi | Publish 2-5 independent safe role toggle buttons. | Local mock/unit only |
| /reactionroles receipts | Privately inspect ten unresolved stored role clicks for one member. | Local mock/unit only |
| /reactionroles reconcileclick | Resolve a directed uncertain receipt only when observed role state matches intent. | Local mock/unit only |
| /reactionroles summary | Private stored panel counts by state, no native readiness or effects. | Local mock/unit only |
| /ticket claim | Assign the current open ticket to yourself. | Local mock/unit only |
| /ticket claimsummary | Manage Server: stored ticket state/claimed-flag counts only, no staff/owner IDs. | Local mock/unit only |
| /ticket close | Store transcript and make the owner read-only. | Local mock/unit only |
| /ticket config | Show ticket configuration to server managers. | Local mock/unit only |
| /ticket exportconfig | Manage Server: private stored category/support role/retention JSON, no live validation. | Local mock/unit only |
| /ticket exportmine | Private latest 100 only your ticket metadata, total/truncated, no staff/source/transcript content. | Local mock/unit only |
| /ticket exportrecords | Manage Server: latest 100 stored ticket metadata JSON, total/truncation, no owner/staff/source IDs. | Local mock/unit only |
| /ticket forgetalltranscripts | Confirmed erase all guild stored transcripts, no native/exported message deletion. | Local mock/unit only |
| /ticket forgetbyid | Erase one stored ticket snapshot by ID, not native messages or ticket state. | Local mock/unit only |
| /ticket forgetclosedtranscripts | Erase snapshots of closed tickets only; open/uncertain snapshots and native history kept. | Local mock/unit only |
| /ticket forgettranscript | Erase stored snapshot for this ticket, not native messages. | Local mock/unit only |
| /ticket forgetusertranscripts | Erase all stored snapshots for one owner ID here; no native messages or state changes. | Local mock/unit only |
| /ticket open | Open one private support ticket. | Local mock/unit only |
| /ticket panel | Publish a ticket-open button. | Local mock/unit only |
| /ticket queue | Manage Server: inspect unresolved stored ticket IDs, not content or live access. | Local mock/unit only |
| /ticket releaseclaims | Confirmed release all open stored claims, not access/ownership/native channels. | Local mock/unit only |
| /ticket reopen | Restore the ticket owner write access. | Local mock/unit only |
| /ticket resetsetup | Confirmed stop new ticket opens/panels by forgetting setup; existing tickets/native channels kept. | Local mock/unit only |
| /ticket retention | Manage Server: set stored transcript maximum age 1-30 days. | Local mock/unit only |
| /ticket setup | Set the category and role that can view new tickets. | Local mock/unit only |
| /ticket status | Privately show your ten latest stored ticket states, no live access or transcript. | Local mock/unit only |
| /ticket summary | Manage Server: private stored ticket states/snapshot count, no identities/content. | Local mock/unit only |
| /ticket transcript | Export current ticket history privately. | Local mock/unit only |
| /ticket transcriptmetadata | Manage Server: latest 100 snapshot ticket ID/count/truncated/time, no message body/member IDs. | Local mock/unit only |
| /ticket unclaim | Release your own claim on this open ticket, without changing access. | Local mock/unit only |
| /afk agebands | Manage Server: count unexpired stored statuses by age; no reasons, user IDs or live status claim. | Local mock/unit only |
| /afk channelcounts | Manage Server: count unexpired stored AFK statuses per channel; no user IDs or reasons. | Local mock/unit only |
| /afk channelmetadata | Manage Server: read up to 100 stored statuses for a channel; no reasons, user IDs or live lookup. | Local mock/unit only |
| /afk clear | Erase your status and reason here. | Local mock/unit only |
| /afk clearall | Manage Server: erase all stored guild AFK reasons; no native message deletion. | Local mock/unit only |
| /afk clearchannel | Manage Server: erase stored away reasons shared in one exact channel, no native deletes. | Local mock/unit only |
| /afk clearuser | Manage Server: erase one exact user away reason/status, no native deletes. | Local mock/unit only |
| /afk exportmine | Private JSON of only your stored away reason/channel/expiry, no notice IDs. | Local mock/unit only |
| /afk exportnotices | Manage Server: private latest 100 notice channel/time JSON, no message/member IDs. | Local mock/unit only |
| /afk exportstatuses | Manage Server: export up to 100 unexpired status records; includes total, no reasons or user IDs. | Local mock/unit only |
| /afk move | Move own existing reason sharing to this current channel, without extending expiry. | Local mock/unit only |
| /afk reason | Edit own existing public reason without extending expiry; confirm exact-channel sharing. | Local mock/unit only |
| /afk set | Set status up to 7 days, clear on your next eligible server message. | Local mock/unit only |
| /afk status | Privately view your status and disclosure channel. | Local mock/unit only |
| /afk summary | Manage Server: unexpired stored status/notice counts, no reasons or user IDs. | Local mock/unit only |
| /avatar | Show a public avatar link. | Local mock/unit only |
| /banner | Fetch a public user profile banner link, no guild membership assumption. | Local mock/unit only |
| /boostcount | Fetch current server boost count and premium tier. | Local mock/unit only |
| /channel agerestrict | Mark one text channel age-restricted; changes audience visibility, no removal here. | Local mock/unit only |
| /channel cleartopic | Confirmed one text-channel cleartopic;currentchannel ManageChannels/case checks. | Local mock/unit only |
| /channel info | Inspect visible server channel ID/type/position; no content or member enumeration. | Local mock/unit only |
| /channel list | List only channels you can currently view; no threads, topics or member counts. | Local mock/unit only |
| /channel permissions | List your current effective channel permission flags; not other members. | Local mock/unit only |
| /channel rename | Confirmed one text-channel rename;currentchannel ManageChannels/case checks. | Local mock/unit only |
| /channel threadarchive | Set auto-archive default for newly created text-channel threads; existing threads untouched. | Local mock/unit only |
| /channel threadslowmode | Set slowmode default for newly created text-channel threads; existing threads untouched. | Local mock/unit only |
| /channel topic | Confirmed one text-channel topic;currentchannel ManageChannels/case checks. | Local mock/unit only |
| /channel voicebitrate | Confirmed empty normal voice channel setting, current Manage Channels+gateway readiness. | Local mock/unit only |
| /channel voicelimit | Confirmed empty normal voice channel setting, current Manage Channels+gateway readiness. | Local mock/unit only |
| /channel voiceregionauto | Confirmed empty normal voice channel setting, current Manage Channels+gateway readiness. | Local mock/unit only |
| /emojiinfo | Read one current server custom emoji, no uploader or role enumeration. | Local mock/unit only |
| /enlarge | Private high-resolution current guild custom emoji image; no foreign emoji/Unicode rendering. | Local mock/unit only |
| /list admins | Manager-only current admins member snapshot,ten/page,no presences or storage. | Local mock/unit only |
| /list bans | Manager+Ban Members-only current bans, max 100 per fetch, no reasons; optional after-ID. | Local mock/unit only |
| /list boosters | Manager-only current boosters member snapshot,ten/page,no presences or storage. | Local mock/unit only |
| /list bots | Manager-only current bots member snapshot,ten/page,no presences or storage. | Local mock/unit only |
| /list emojis | List current server emojis,ten per page with optional literal name search. | Local mock/unit only |
| /list inrole | Manager-only fresh members holding one confirmed role, ten/page, no presences/storage. | Local mock/unit only |
| /list roles | List current server roles,ten per page with optional literal name search. | Local mock/unit only |
| /list stickers | List current server stickers,ten per page with optional literal name search. | Local mock/unit only |
| /matrix add | Add equal shape 1-4 integer matrices JSON; exact output decimal strings. | Local mock/unit only |
| /matrix adjugate | Transpose cofactor matrix, not inverse; square 1-4 integers, singular accepted. | Local mock/unit only |
| /matrix cofactor | Signed minors of square 1-4 integer matrix; 1 by 1 cofactor is 1, singular accepted. | Local mock/unit only |
| /matrix columnspace | Independent original integer column vectors, zero-based pivot columns. | Local mock/unit only |
| /matrix determinant | Exact determinant of square 1-4 integer matrix JSON; result decimal string. | Local mock/unit only |
| /matrix inverse | Exact rational inverse of square 1-4 integer matrix; singular rejected. | Local mock/unit only |
| /matrix multiply | Multiply compatible 1-4 by 1-4 integer matrices JSON; exact outputs decimal strings. | Local mock/unit only |
| /matrix nullspace | Exact rational nullspace basis vectors; zero-based free columns, no tolerance. | Local mock/unit only |
| /matrix power | Square integer matrix power 0-10, 0 identity; exact output decimal strings. | Local mock/unit only |
| /matrix rank | Exact rational rank of 1-4 by 1-4 integer matrix, no floating point tolerance. | Local mock/unit only |
| /matrix rowspace | Exact rational independent row space basis from reduced row echelon form. | Local mock/unit only |
| /matrix rref | Exact rational reduced row echelon form with zero-based pivot columns. | Local mock/unit only |
| /matrix scale | Multiply each matrix integer by explicit bounded scalar; exact output decimal strings. | Local mock/unit only |
| /matrix solve | Solve square 1-4 integer system with one-column RHS; unique rational solution only. | Local mock/unit only |
| /matrix solvegeneral | Rectangular 1-4 integer system: inconsistent/unique/infinite rational affine solution. | Local mock/unit only |
| /matrix subtract | Subtract equal shape 1-4 integer matrices; exact decimal strings. | Local mock/unit only |
| /matrix trace | Exact trace of square 1-4 integer matrix; decimal string output. | Local mock/unit only |
| /matrix transpose | Transpose 1-4 by 1-4 integer matrix JSON; exact integer outputs are decimal strings. | Local mock/unit only |
| /membercount | Fresh approximate server member/presence counts, no member enumeration. | Local mock/unit only |
| /poll | Manage Server: publish a native Discord poll with 2-10 answers. | Local mock/unit only |
| /pollmanage channelcounts | Stored poll send receipt counts by channel ID/state, no voting counts or native lookup. | Local mock/unit only |
| /pollmanage channelmetadata | Latest 100 minimal stored poll receipt metadata for exact channel ID, no source IDs/voting lookup. | Local mock/unit only |
| /pollmanage channelreceipts | Private latest 100 stored send receipts for exact channel ID, no native channel/voting lookup. | Local mock/unit only |
| /pollmanage end | End voting early on one bot-created poll after confirmation. | Local mock/unit only |
| /pollmanage export | Private latest 100 stored receipt bindings/timestamps JSON, total/truncated, no actors/voters. | Local mock/unit only |
| /pollmanage exportmetadata | Latest 100 minimal stored receipt ID/channel/state/time JSON, total/truncation, no source IDs. | Local mock/unit only |
| /pollmanage exportunresolved | Latest 100 sending/uncertain minimal poll receipt metadata, no native lookup/retry/repair. | Local mock/unit only |
| /pollmanage inspectreceipt | Exact stored receipt ID minimal metadata JSON/null, no native poll/message lookup or voter IDs. | Local mock/unit only |
| /pollmanage list | List the latest 20 stored poll receipts, not live voting states. | Local mock/unit only |
| /pollmanage results | Read current answer counts, which may not be finalized. | Local mock/unit only |
| /pollmanage statemetadata | Latest 100 minimal stored poll receipt metadata in exact state, no native outcome proof. | Local mock/unit only |
| /pollmanage summary | Private stored send-receipt counts by state, not voting counts/active polls. | Local mock/unit only |
| /roleinfo | Read current role ID, color, position and permission flags. | Local mock/unit only |
| /serverbanner | Fetch current server banner link, no member enumeration. | Local mock/unit only |
| /servericon | Fetch current server icon link, no member enumeration. | Local mock/unit only |
| /serverinfo | Fresh server name/ID and approximate count, no member enumeration. | Local mock/unit only |
| /stats | Show build command counts and process memory usage. | Local mock/unit only |
| /stickerinfo | Read current server sticker metadata, no uploader or file download. | Local mock/unit only |
| /text csvdecode | Strict single CSV record to JSON array, 1-50 fields; quoted newlines kept, no formula execution. | Local mock/unit only |
| /text csvencode | JSON array of 1-50 strings to quoted single CSV record; not spreadsheet formula sanitization. | Local mock/unit only |
| /text findlines | Exact case-sensitive literal matching lines/1 based numbers JSON, max 100 lines; no regex. | Local mock/unit only |
| /text hexdecode | Even length strict hex to valid UTF-8 TXT, no NUL/replacement decoding/execution. | Local mock/unit only |
| /text hexencode | Literal UTF-8 text to lowercase hexadecimal TXT, no encryption or execution. | Local mock/unit only |
| /text htmldecode | Decode amp/lt/gt/quot/#39 once; other entities unchanged, no parsing or execution. | Local mock/unit only |
| /text htmlencode | Encode five HTML entities in literal text; not a sanitizer or HTML parser. | Local mock/unit only |
| /text indent | Prefix 1-16 ASCII spaces to every line, blank lines included, CRLF/CR to LF, max 100 lines. | Local mock/unit only |
| /text join | JSON array 0-100 literal strings to joined TXT, empties preserved, no evaluation. | Local mock/unit only |
| /text jsonarraytypes | JSON array top-level type counts/length JSON, no numeric statistics or schema validation. | Local mock/unit only |
| /text jsonkeys | JSON object own top-level keys in parser order JSON, no recursion, duplicate keys last wins. | Local mock/unit only |
| /text jsonpointer | Select exact own JSON value by RFC 6901 pointer; no inherited properties, parser number semantics. | Local mock/unit only |
| /text jsonquote | Literal text to one quoted JSON string; keeps Unicode, no parsing, execution or HTML safety. | Local mock/unit only |
| /text jsonunquote | Decode exactly one JSON string to literal UTF-8 TXT, no NUL/unpaired surrogates or execution. | Local mock/unit only |
| /text lineendings | Convert all CRLF/CR/LF line breaks to LF or CRLF TXT, no trimming/trailing line addition. | Local mock/unit only |
| /text numberlines | Number 1-100 exact lines, normalize CRLF/CR to LF; blank lines preserved, no trimming. | Local mock/unit only |
| /text outdent | Remove up to 1-16 leading ASCII spaces per line, no tabs/other whitespace, CRLF/CR to LF. | Local mock/unit only |
| /text querydecode | Strict raw form query to key/value pairs JSON, + is space, repeats kept, no leading? or fragment. | Local mock/unit only |
| /text queryencode | JSON 1-50 string key/value pairs to form query, + for space, repeats kept, no URL fetch. | Local mock/unit only |
| /text replace | Replace all case-sensitive non-overlapping literal matches, JSON count/text; no regex. | Local mock/unit only |
| /text reverselines | Reverse exact 1-100 lines TXT, blank lines preserved, CRLF/CR to LF, no character reversal. | Local mock/unit only |
| /text slice | Exact 1 based Unicode code point slice TXT; not graphemes, may split combining sequences. | Local mock/unit only |
| /text split | Literal case-sensitive non-overlapping split to JSON strings, empty parts kept, no regex. | Local mock/unit only |
| /text urlparts | Parse absolute HTTP(S) URL into normalized parts JSON; no credentials, fetch or safety check. | Local mock/unit only |
| /tools base64decode | Private canonical padded standard Base64 to valid UTF-8 TXT, no evaluation. | Local mock/unit only |
| /tools base64encode | Private exact UTF-8 text to standard Base64 TXT, not encryption/no evaluation. | Local mock/unit only |
| /tools baseconvert | Private unsigned 64 bit integer base 2/8/10/16 conversion, no prefixes/signs. | Local mock/unit only |
| /tools color | Convert six hex digits to RGB/decimal; does not change bot settings. | Local mock/unit only |
| /tools comparelines | Private exact-line sets JSON: only left/only right/common, no full diff or evaluation. | Local mock/unit only |
| /tools duration | Parse explicit elapsed duration into seconds; no reminder/calendar arithmetic. | Local mock/unit only |
| /tools escapetext | Escape common Discord markdown and neutralize @ in supplied text privately. | Local mock/unit only |
| /tools gcdlcm | Private exact GCD/LCM of two positive integers, no settings changed. | Local mock/unit only |
| /tools integerstats | Private count/sum/min/max/mean/median of 2-20 explicit integers, no storage. | Local mock/unit only |
| /tools isotimestamp | Convert explicit ISO seconds with Z/offset into Discord timestamp, not schedule. | Local mock/unit only |
| /tools jsonformat | Private pretty JSON TXT, keeps number spelling/key order/duplicates; no execution/storage. | Local mock/unit only |
| /tools localtimestamp | Convert explicit local date time/named zone to Discord timestamp, not a scheduled send. | Local mock/unit only |
| /tools normalize | Private explicit Unicode normalization TXT; compatibility forms may change meaning. | Local mock/unit only |
| /tools permissions | Decode explicit raw permission bits; not effective member/channel permissions. | Local mock/unit only |
| /tools rgb | Convert explicit RGB components to six-digit hex and decimal, no settings changed. | Local mock/unit only |
| /tools sha256 | SHA256 of explicit exact UTF-8 text, no URL/file fetch/password storage. | Local mock/unit only |
| /tools snowflake | Decode supplied ID timestamp/bits; does not fetch or verify an object. | Local mock/unit only |
| /tools sortlines | Private exact-line UTF-16 sort TXT, no trimming or locale collation. | Local mock/unit only |
| /tools textstats | Count explicit text UTF-16/code points/graphemes/UTF-8 bytes/lines privately. | Local mock/unit only |
| /tools timedifference | Signed elapsed seconds and absolute day/hour/minute/second breakdown, no calendar days. | Local mock/unit only |
| /tools timestamp | Format explicit Unix seconds for client-local Discord display; not a reminder. | Local mock/unit only |
| /tools timezone | Display explicit Unix seconds in one named zone, not inferred time/location. | Local mock/unit only |
| /tools uniquelines | Private exact-line deduplication TXT, first occurrence order kept, no trimming. | Local mock/unit only |
| /tools urlcomponent | Private URI component encoding/decoding TXT, not a URL fetch or form parser. | Local mock/unit only |
| /userinfo | Show public user information. | Local mock/unit only |
| /vector cross | Exact ordered right-hand 3D cross product of integer vectors JSON; decimal strings. | Local mock/unit only |
| /vector distancesquared | Exact squared Euclidean distance of equal-length 1-4 integer vectors; not square root. | Local mock/unit only |
| /vector dot | Exact dot product of equal-length 1-4 integer vectors JSON; decimal string output. | Local mock/unit only |
| /vector normsquared | Exact squared Euclidean norm of 1-4 integer vector JSON; not square root/normalization. | Local mock/unit only |
| /vector project | Exact rational projection of left onto nonzero right vector; no unit normalization. | Local mock/unit only |
| /vector reject | Exact rational perpendicular remainder left minus projection onto nonzero right. | Local mock/unit only |
| /guildtag exportconfig | Manage Roles: private stored reward role ID/null JSON, no live validation. | Local mock/unit only |
| /guildtag exportgrants | Manage Roles: private first 100 stored user ID/role ID/state JSON, total/truncation, no live claims. | Local mock/unit only |
| /guildtag exportmine | Private JSON of only your stored role grant/state, null if absent, no live identity claim. | Local mock/unit only |
| /guildtag grants | Manage Roles: inspect stored grant metadata, no live identity/access or changes. | Local mock/unit only |
| /guildtag inspectuser | Manage Roles: exact stored user grant role/state or null, no lookup, refresh or changes. | Local mock/unit only |
| /guildtag refresh | Check your current primary-guild identity and own reward role. | Local mock/unit only |
| /guildtag reset | Manage Roles: stop tag rewards, leaving assigned roles unchanged. | Local mock/unit only |
| /guildtag rolecounts | Manage Roles: stored grant counts by role ID/state, no member IDs or native validation. | Local mock/unit only |
| /guildtag setup | Manage Roles: configure one safe tag reward role. | Local mock/unit only |
| /guildtag show | Show tag reward configuration. | Local mock/unit only |
| /guildtag status | Privately inspect only your stored tag-grant state; no live identity claim. | Local mock/unit only |
| /guildtag summary | Manage Roles: private stored grant counts by state, no identities/native access claims. | Local mock/unit only |
| /vcrole add | Configure one safe role for future human voice joins; existing memberships untouched. | Local mock/unit only |
| /vcrole remove | Disable future grants; existing Emika-owned grants retain future-disconnect cleanup. | Local mock/unit only |
| /vcrole show | Private saved policy and retained grant counts, not native voice/membership proof. | Local mock/unit only |
| /voice deafen | deafen: one current voice member. | Local mock/unit only |
| /voice disconnect | disconnect: one current voice member. | Local mock/unit only |
| /voice move | move: one current voice member. | Local mock/unit only |
| /voice mute | mute: one current voice member. | Local mock/unit only |
| /voice undeafen | undeafen: one current voice member. | Local mock/unit only |
| /voice unmute | unmute: one current voice member. | Local mock/unit only |
| /vmjoin config | Private saved lobby and actor IDs, not native state or automatic cleanup proof. | Local mock/unit only |
| /vmjoin off | Stop future join-to-create; existing owned channels/uncertain moves retained. | Local mock/unit only |
| /vmjoin setup | Use existing normal voice lobby; confirm future private channel creation and member move. | Local mock/unit only |
| /voicemaster bitrate | Set empty owned voice channel bitrate 8-96 kbps; private access unchanged. | Local mock/unit only |
| /voicemaster buttons | Private owner one-use 10 min controls: empty channel lock, share everyone/unlock, delete close. | Local mock/unit only |
| /voicemaster channelrecords | Manage Channels: latest 100 stored records for channel IDJSON, total/truncated, no native lookup. | Local mock/unit only |
| /voicemaster close | Delete only your tracked empty private channel. | Local mock/unit only |
| /voicemaster config | Show configured private channel category and limits. | Local mock/unit only |
| /voicemaster exportconfig | Manage Channels: private stored category configuration only, not ownership/access backup. | Local mock/unit only |
| /voicemaster exportmine | Private latest 100 only your stored channel metadata, no native access/current membership claim. | Local mock/unit only |
| /voicemaster exportrecords | Manage Channels: private latest 100 channel state metadata, no owner/source IDs, total/truncated. | Local mock/unit only |
| /voicemaster exportrecovery | Manage Channels: read up to 100 unresolved channel records; no recovery, retry or repair. | Local mock/unit only |
| /voicemaster inspect | Privately read your current tracked channel name/capacity/bitrate; no members. | Local mock/unit only |
| /voicemaster inspectrecord | Manage Channels: exact stored record ID metadata JSON/null, no owner/source IDs or channel lookup. | Local mock/unit only |
| /voicemaster limit | Set your channel capacity; access stays private. | Local mock/unit only |
| /voicemaster lock | Empty tracked channel: restore owner-only view/connect access. | Local mock/unit only |
| /voicemaster open | Create your own private standard voice channel. | Local mock/unit only |
| /voicemaster reconcile | Recheck your recorded channel, safely repair stored ownership state. | Local mock/unit only |
| /voicemaster records | Manage Channels: private stored ownership records only, not live state/access/member list. | Local mock/unit only |
| /voicemaster regionauto | Return empty owned channel to automatic RTC region; access unchanged. | Local mock/unit only |
| /voicemaster rename | Rename your own tracked private channel. | Local mock/unit only |
| /voicemaster resetsetup | Manage Channels: forget creation category, existing ownership/access/channels kept. | Local mock/unit only |
| /voicemaster setup | Manage Channels: set private voice creation category. | Local mock/unit only |
| /voicemaster status | Privately inspect your stored voice ownership record, not live channel state. | Local mock/unit only |
| /voicemaster summary | Manage Channels: private stored state/public flag counts, no owners/native access claim. | Local mock/unit only |
| /voicemaster unlock | Empty tracked channel: explicitly allow all server members view/connect. | Local mock/unit only |
| /welcome channel | Choose the destination. | Local mock/unit only |
| /welcome clearassets | Clear welcome or goodbye image/thumbnail only; title/color/template/delivery kept. | Local mock/unit only |
| /welcome clearchannel | Disable welcome/goodbye and remove stored destination; templates kept. | Local mock/unit only |
| /welcome color | Set welcome/goodbye embed color, or reset to Emika default. | Local mock/unit only |
| /welcome config | Show current settings. | Local mock/unit only |
| /welcome disable | Disable welcome messages. | Local mock/unit only |
| /welcome enable | Enable welcome messages. | Local mock/unit only |
| /welcome export | Private welcome/goodbye template/style JSON; no channel IDs or enable flags. | Local mock/unit only |
| /welcome exportconfig | Private complete stored welcome/goodbye config including destination, not runtime/history. | Local mock/unit only |
| /welcome goodbye | Set goodbye template and enable or disable it. | Local mock/unit only |
| /welcome image | Set HTTPS embed image for welcome/goodbye; omit URL to clear. | Local mock/unit only |
| /welcome import | Replace template/style library from JSON, disable both sends, keep destination. | Local mock/unit only |
| /welcome mentions | Choose whether welcome delivery may ping only the arriving member; goodbye never. | Local mock/unit only |
| /welcome message | Set welcome template. | Local mock/unit only |
| /welcome pauseboth | Stop welcome and goodbye delivery; all templates/styles/channel/history kept. | Local mock/unit only |
| /welcome preview | Privately preview current welcome/goodbye template for yourself. | Local mock/unit only |
| /welcome reset | Restore defaults, stop both message types, forget destination and all style/template settings. | Local mock/unit only |
| /welcome resetstyle | Clear welcome/goodbye titles/images/thumbnails/shared color; templates kept. | Local mock/unit only |
| /welcome resettemplate | Restore one localized default template, leaving delivery settings unchanged. | Local mock/unit only |
| /welcome test | Send one welcome message for yourself. | Local mock/unit only |
| /welcome thumbnail | Set HTTPS embed thumbnail for welcome/goodbye; omit URL to clear. | Local mock/unit only |
| /welcome title | Set static welcome/goodbye title; omit text to restore Emika title. | Local mock/unit only |

## Zynrax reference inventory

`data/commands.json` and `data/commands.csv` contain **319 documented command paths**, not 319 Emika commands. Documented shortcuts live in aliases and are not counted as commands. Each row preserves source URL, original syntax, description and verification flags. Parameters preserve documented brackets, not invented types. `referenceVerified` means the named syntax exists in fetched public docs, not that Zynrax behavior was tested. `implemented` and `tested` are false for all reference rows until an equivalent Emika implementation and relevant tests exist. `/serverinfo` is a foundation implementation with narrower behavior, so its richer reference row remains false.

| Category | Documented paths |
| --- | --- |
| antinuke | 7 |
| automod | 20 |
| automations | 16 |
| autoresponder | 4 |
| customrole | 15 |
| fun | 35 |
| general | 8 |
| giveaway | 9 |
| leaderboard | 34 |
| logging | 6 |
| moderation | 47 |
| music | 20 |
| permit | 15 |
| reactionroles | 4 |
| ticket | 14 |
| utility | 29 |
| vanityroles | 3 |
| voice | 21 |
| voicemaster | 4 |
| welcomer | 7 |

The official homepage settles at a 541+ marketing count. These docs do not establish all 541 paths. No padding was added. Prefix differences (`?` vs `,`), undeclared permissions, conflicting fun/moderation `kick`, and overloaded ticket transcript syntax need reconciliation with live help or owner screenshots. Empty permission/alias arrays mean not documented, never unrestricted. Emika category labels are planning mappings rather than claims of Zynrax's exact help taxonomy.

Regenerate CSV using `npm run inventory`. Keep arbitrary parameter values, aliases and option combinations out of command totals. Spreadsheet formula prefixes are neutralized by the CSV exporter.

## Historical checkpoints (not current totals)

The following batches describe earlier stages only. Current totals and paths are generated above.

### Phase 3 batch 2 additions

- /logging channel, enable, disable, config, test (Manage Server).
- /welcome channel, message, goodbye, enable, disable, config, test (Manage Server).
- /userinfo [user], /avatar [user], /uptime, /stats.
- /help page:<number> paginates installed command paths.

Totals: 11 top-level slash commands, 28 executable paths. All have local mock/unit paths exercised; none has live Discord verification. Server logs currently cover moderation case metadata only, not a full Discord event audit suite. Welcome images/embeds are not implemented.

### Role panel batch

/reactionroles create, list, disable add button-based role panels with persistent message bindings and revalidated safe-role checks. Not emoji reactions. Totals: 12 top-level slash commands, 31 executable paths. Local tests only, no live Discord verification. See docs/ROLE_PANELS.md.

### Configuration and localization foundation

/config language and /config view. Validated per-guild en/hi/hinglish locale, localized configuration response. Full response translation remains in progress. All existing output paths have the shared embed retrofit, but actual Discord pixels remain unverified. Totals: 13 top-level slash commands, 33 executable paths. See docs/LOCALIZATION_STATUS.md.
