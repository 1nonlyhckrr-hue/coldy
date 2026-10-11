# Command index

## Installed Luna commands

41 top-level commands, 212 executable paths. Registry-derived original Luna behavior. Local mock/unit coverage only;no live Discord acceptance or deployment. Reference equivalence is separate. See docs/MODULE_STATUS.md for current verification and limitations.

| Slash path | Behavior | Tested |
| --- | --- | --- |
| /antinuke config | Show alert settings and limitations. | Local mock/unit only |
| /antinuke disable | Stop alert-only audit monitoring. | Local mock/unit only |
| /antinuke enable | Enable alert-only detection for supported audit actions. | Local mock/unit only |
| /antinuke incidents | Show20 recent stored audit burst alerts. | Local mock/unit only |
| /antinuke threshold | Set mixed-action count and observation window. | Local mock/unit only |
| /antinuke trust | Exempt a current member from audit alerts only. | Local mock/unit only |
| /antinuke unresolved | Privately inspect stored unresolved alert metadata;no retry or punishment. | Local mock/unit only |
| /automation cancel | Cancel a pending or uncertain schedule. | Local mock/unit only |
| /automation cancelpending | Confirm cancellation of all pending guild schedules;in-flight/uncertain untouched. | Local mock/unit only |
| /automation config | Show schedule limits and restart policy. | Local mock/unit only |
| /automation create | Schedule one message or a fixed elapsed-time repeat. | Local mock/unit only |
| /automation createzone | Schedule one message using explicit local date/time and named timezone. | Local mock/unit only |
| /automation destination | Move one pending message schedule to a validated channel;does not send now. | Local mock/unit only |
| /automation edit | Replace text of a pending schedule only;time/destination unchanged. | Local mock/unit only |
| /automation forget | Erase stored text of a completed/cancelled schedule,not Discord messages. | Local mock/unit only |
| /automation inspect | Privately review one stored schedule,text and metadata;no native effects. | Local mock/unit only |
| /automation list | List recent schedule records. | Local mock/unit only |
| /automation overview | Privately count stored schedule states;not delivery receipts or live readiness. | Local mock/unit only |
| /automation repeat | Change pending elapsed repeat;omit minutes to make next send one-time. | Local mock/unit only |
| /automation reschedule | Move pending next send to explicit offset time;repeat stays elapsed interval. | Local mock/unit only |
| /automation reschedulezone | Move one pending schedule using explicit local time and named timezone. | Local mock/unit only |
| /automation upcoming | Privately inspect pending sends ordered by time;no content or sending. | Local mock/unit only |
| /automod config | Show configured rules and limits. | Local mock/unit only |
| /automod disable | Stop automatic message moderation. | Local mock/unit only |
| /automod enable | Enable configured rules; all rules start disabled. | Local mock/unit only |
| /automod exempt | Add or remove an exempt server role. | Local mock/unit only |
| /automod ignorechannel | Ignore/unignore one channel for automatic message moderation. | Local mock/unit only |
| /automod incidents | Show 20 recent action outcomes, no message content. | Local mock/unit only |
| /automod removepolicy | Remove one stored ignored channel/exempt role ID,including deleted subjects. | Local mock/unit only |
| /automod rule | Enable or disable one rule. | Local mock/unit only |
| /automod spamthresholds | Tune bounded spam counts/window;does not enable moderation. | Local mock/unit only |
| /automod testtext | Private dry-run of literal/caps/link rules,no punishment or spam tracking. | Local mock/unit only |
| /automod thresholds | Tune mention/caps thresholds;does not enable rules or moderation. | Local mock/unit only |
| /automod timeoutminutes | Set automatic timeout duration1-60 minutes;does not enable rules. | Local mock/unit only |
| /automod unresolved | Privately inspect unresolved stored incident metadata;never retries actions. | Local mock/unit only |
| /automod wordadd | Add a literal word/phrase to the filter. | Local mock/unit only |
| /automod wordlist | Privately inspect twenty stored literal phrases per page. | Local mock/unit only |
| /automod wordremove | Remove a literal filtered word/phrase. | Local mock/unit only |
| /autoresponder config | List trigger configuration. | Local mock/unit only |
| /autoresponder cooldown | Change one stored trigger cooldown10-3600s;last-send/replay history retained. | Local mock/unit only |
| /autoresponder create | Create an exact or literal keyword trigger. | Local mock/unit only |
| /autoresponder delete | Delete an existing trigger. | Local mock/unit only |
| /autoresponder edit | Edit the response for an existing trigger. | Local mock/unit only |
| /autoresponder mode | Set literal exact/keyword matching,retaining response/cooldown/replay history. | Local mock/unit only |
| /autoresponder preview | Privately preview stored response,no send or cooldown change. | Local mock/unit only |
| /autoresponder rename | Change one stored trigger while preserving response and replay history. | Local mock/unit only |
| /autoresponder toggle | Pause/resume one trigger,retaining response/cooldown/history. | Local mock/unit only |
| /customrole claim | Assign one configured safe role to yourself. | Local mock/unit only |
| /customrole claimown | Assign your verified zero-permission created role to yourself. | Local mock/unit only |
| /customrole clear | Manage Roles:remove all mappings,leaving native roles,assignments and eligibility unchanged. | Local mock/unit only |
| /customrole created | Privately inspect your stored creation record,no native role changes. | Local mock/unit only |
| /customrole createown | Create one unassigned zero-permission role for yourself,if manager enabled. | Local mock/unit only |
| /customrole creation | ManageRoles:opt in/out of unassigned zero-permission member role creation. | Local mock/unit only |
| /customrole creations | ManageRoles:private paged creation records,status and IDs only. | Local mock/unit only |
| /customrole list | Show mapped names and eligibility role. | Local mock/unit only |
| /customrole map | Manage Roles: map a name to an existing safe role. | Local mock/unit only |
| /customrole reconcile | ManageRoles:verify observed uncertain creation,no native changes. | Local mock/unit only |
| /customrole release | Remove one configured role from yourself. | Local mock/unit only |
| /customrole releaseown | Remove your created role from yourself,no deletion. | Local mock/unit only |
| /customrole required | Manage Roles: set eligibility role or remove the gate. | Local mock/unit only |
| /customrole unmap | Manage Roles: remove a mapping, leaving existing assignments. | Local mock/unit only |
| /fun 8ball | Get a playful random answer, not advice. | Local mock/unit only |
| /fun choose | Pick one of 2-20 choices separated by \|. | Local mock/unit only |
| /fun coin | Flip a coin. | Local mock/unit only |
| /fun dare | Get an optional, safe solo activity. | Local mock/unit only |
| /fun dice | Roll up to ten dice. | Local mock/unit only |
| /fun dicekeep | Roll bounded dice,keep highest or lowest results;no stakes or saved state. | Local mock/unit only |
| /fun number | One uniform integer in an inclusive bounded range;not advice. | Local mock/unit only |
| /fun rps | Play one round of rock, paper, scissors against Luna. | Local mock/unit only |
| /fun rpsseries | Play2-10 preselected RPS rounds against Luna;private score,no stakes. | Local mock/unit only |
| /fun sample | Pick1-20 distinct waiting labels without replacement;no assignments. | Local mock/unit only |
| /fun shuffle | Privately randomize all 2-20 distinct choices,no assignments. | Local mock/unit only |
| /fun teams | Privately split 2-20 distinct labels into balanced random groups,no invites. | Local mock/unit only |
| /fun truth | Get an optional, low-pressure reflection prompt. | Local mock/unit only |
| /about | Show Luna version and implementation status. | Local mock/unit only |
| /config language | Set English, Hindi or Hinglish for this server. | Local mock/unit only |
| /config view | View this server configuration. | Local mock/unit only |
| /help | Privately browse installed paths by page,category or literal search. | Local mock/unit only |
| /ping | Show Luna gateway latency. | Local mock/unit only |
| /uptime | Show how long this process has been running. | Local mock/unit only |
| /giveaway config | Show giveaway limits and policies. | Local mock/unit only |
| /giveaway end | End and publish a stored draw, or retry publishing it. | Local mock/unit only |
| /giveaway list | List recent giveaway records. | Local mock/unit only |
| /giveaway reroll | Draw again, excluding the immediately previous winners. | Local mock/unit only |
| /giveaway start | Create a giveaway with checked eligibility. | Local mock/unit only |
| /giveawayleave | Withdraw only your own entry from an active giveaway before its deadline. | Local mock/unit only |
| /leaderboard activity | Only your retained90UTC-day counts,active days and longest run;not quality. | Local mock/unit only |
| /leaderboard config | View tracking status and excluded IDs. | Local mock/unit only |
| /leaderboard daily | Show only your retained daily message counts,ten UTC days per page. | Local mock/unit only |
| /leaderboard disable | Manage Server: stop counting; keep stored counts. | Local mock/unit only |
| /leaderboard enable | Manage Server: start counting future eligible messages. | Local mock/unit only |
| /leaderboard eraseuser | Manage Server: erase one user retained counts, not their preference. | Local mock/unit only |
| /leaderboard exclude | Manage Server: exclude/include a text channel or category. | Local mock/unit only |
| /leaderboard optin | Allow future counts when this server has tracking enabled. | Local mock/unit only |
| /leaderboard optout | Stop counting your future messages and erase your counts. | Local mock/unit only |
| /leaderboard position | Show only your retained message rank and count,UTC window. | Local mock/unit only |
| /leaderboard privacy | Only your stored counting preference and server tracking switch;no changes. | Local mock/unit only |
| /leaderboard removeexclude | Manage Server: remove one exact stored exclusion,including deleted channels. | Local mock/unit only |
| /leaderboard resetmine | Delete only your retained message counts. | Local mock/unit only |
| /leaderboard stats | Show your own retained message counts. | Local mock/unit only |
| /leaderboard top | Show retained message ranks, ten per page. | Local mock/unit only |
| /logging channel | Choose the server log channel. | Local mock/unit only |
| /logging config | Show case-log settings. | Local mock/unit only |
| /logging disable | Disable delivery without deleting config. | Local mock/unit only |
| /logging enable | Enable case logs after configuring a channel. | Local mock/unit only |
| /logging event | Enable/disable one metadata event, no message content. | Local mock/unit only |
| /logging test | Send one test log to the configured channel. | Local mock/unit only |
| /moderation ban | ban: one member, checked and recorded. | Local mock/unit only |
| /moderation clearwarns | clearwarns: one member, checked and recorded. | Local mock/unit only |
| /moderation kick | kick: one member, checked and recorded. | Local mock/unit only |
| /moderation purgeconfirm | Delete only your exact previewed IDs, expires in2 minutes. | Local mock/unit only |
| /moderation purgepreview | Preview exact IDs among up to 10 recent messages, no deletion. | Local mock/unit only |
| /moderation timeout | timeout: one member, checked and recorded. | Local mock/unit only |
| /moderation unban | unban: one member, checked and recorded. | Local mock/unit only |
| /moderation untimeout | untimeout: one member, checked and recorded. | Local mock/unit only |
| /moderation warn | warn: one member, checked and recorded. | Local mock/unit only |
| /moderation warnings | warnings: one member, checked and recorded. | Local mock/unit only |
| /nickname | Confirmed one-member nickname update or explicit reset,no bulk changes. | Local mock/unit only |
| /slowmode | Confirmed single text-channel slowmode,0 disables,no bulk changes. | Local mock/unit only |
| /music clear | Clear waiting tracks only;current track keeps playing. | Local mock/unit only |
| /music nowplaying | Show current track. | Local mock/unit only |
| /music pause | Pause current track. | Local mock/unit only |
| /music play | Queue first YouTube search result or exact11-character video ID. | Local mock/unit only |
| /music queue | Show ten queued tracks per page;current track separate. | Local mock/unit only |
| /music remove | Remove one queued position;never stops current track. | Local mock/unit only |
| /music resume | Resume current track. | Local mock/unit only |
| /music shuffle | Randomize waiting tracks only;current track unchanged. | Local mock/unit only |
| /music skip | Stop current track once and advance waiting queue;uncertain failures freeze. | Local mock/unit only |
| /music stay | Keep idle VC connection while this process/node are healthy;not uptime guarantee. | Local mock/unit only |
| /music stop | Disconnect and clear this server session. | Local mock/unit only |
| /permit blockrole | Block a role for one entire command. | Local mock/unit only |
| /permit blockuser | Block a user for one entire command. | Local mock/unit only |
| /permit clear | Remove all restrictions for one command. | Local mock/unit only |
| /permit list | Show configured restrictions, ten per page. | Local mock/unit only |
| /permit remove | Remove one exact stored restriction,including departed/deleted subject IDs. | Local mock/unit only |
| /permit status | Check your current stored command restriction only,not Discord permissions. | Local mock/unit only |
| /permit unblockrole | Unblock a role for one entire command. | Local mock/unit only |
| /permit unblockuser | Unblock a user for one entire command. | Local mock/unit only |
| /reactionroles create | Publish one role toggle button. | Local mock/unit only |
| /reactionroles disable | Disable a panel in storage; its old button becomes inactive. | Local mock/unit only |
| /reactionroles disableactive | Confirm disabling active panels in storage only;pending/uncertain untouched. | Local mock/unit only |
| /reactionroles inspect | Privately inspect stored panel mappings,status and binding IDs only. | Local mock/unit only |
| /reactionroles list | List ten complete panel records per page,newest100maximum. | Local mock/unit only |
| /reactionroles multi | Publish 2-5 independent safe role toggle buttons. | Local mock/unit only |
| /reactionroles receipts | Privately inspect ten unresolved stored role clicks for one member. | Local mock/unit only |
| /reactionroles reconcileclick | Resolve a directed uncertain receipt only when observed role state matches intent. | Local mock/unit only |
| /ticket claim | Assign the current open ticket to yourself. | Local mock/unit only |
| /ticket close | Store transcript and make the owner read-only. | Local mock/unit only |
| /ticket config | Show ticket configuration to server managers. | Local mock/unit only |
| /ticket forgettranscript | Erase stored snapshot for this ticket, not native messages. | Local mock/unit only |
| /ticket open | Open one private support ticket. | Local mock/unit only |
| /ticket panel | Publish a ticket-open button. | Local mock/unit only |
| /ticket queue | Manage Server:inspect unresolved stored ticket IDs,not content or live access. | Local mock/unit only |
| /ticket reopen | Restore the ticket owner write access. | Local mock/unit only |
| /ticket retention | Manage Server: set stored transcript maximum age 1-30 days. | Local mock/unit only |
| /ticket setup | Set the category and role that can view new tickets. | Local mock/unit only |
| /ticket status | Privately show your ten latest stored ticket states,no live access or transcript. | Local mock/unit only |
| /ticket transcript | Export current ticket history privately. | Local mock/unit only |
| /ticket unclaim | Release your own claim on this open ticket,without changing access. | Local mock/unit only |
| /afk clear | Erase your status and reason here. | Local mock/unit only |
| /afk set | Set status up to7days,clear on your next eligible server message. | Local mock/unit only |
| /afk status | Privately view your status and disclosure channel. | Local mock/unit only |
| /avatar | Show a public avatar link. | Local mock/unit only |
| /banner | Fetch a public user profile banner link,no guild membership assumption. | Local mock/unit only |
| /boostcount | Fetch current server boost count and premium tier. | Local mock/unit only |
| /emojiinfo | Read one current server custom emoji,no uploader or role enumeration. | Local mock/unit only |
| /list emojis | List current server emojis,ten per page with optional literal name search. | Local mock/unit only |
| /list roles | List current server roles,ten per page with optional literal name search. | Local mock/unit only |
| /list stickers | List current server stickers,ten per page with optional literal name search. | Local mock/unit only |
| /membercount | Fresh approximate server member/presence counts,no member enumeration. | Local mock/unit only |
| /poll | Manage Server: publish a native Discord poll with2-10 answers. | Local mock/unit only |
| /roleinfo | Read current role ID,color,position and permission flags. | Local mock/unit only |
| /serverbanner | Fetch current server banner link,no member enumeration. | Local mock/unit only |
| /servericon | Fetch current server icon link,no member enumeration. | Local mock/unit only |
| /serverinfo | Fresh server name/ID and approximate count,no member enumeration. | Local mock/unit only |
| /stats | Show build command counts and process memory usage. | Local mock/unit only |
| /stickerinfo | Read current server sticker metadata,no uploader or file download. | Local mock/unit only |
| /userinfo | Show public user information. | Local mock/unit only |
| /guildtag refresh | Check your current primary-guild identity and own reward role. | Local mock/unit only |
| /guildtag reset | Manage Roles: stop tag rewards, leaving assigned roles unchanged. | Local mock/unit only |
| /guildtag setup | Manage Roles: configure one safe tag reward role. | Local mock/unit only |
| /guildtag show | Show tag reward configuration. | Local mock/unit only |
| /guildtag status | Privately inspect only your stored tag-grant state;no live identity claim. | Local mock/unit only |
| /voice deafen | deafen: one current voice member. | Local mock/unit only |
| /voice disconnect | disconnect: one current voice member. | Local mock/unit only |
| /voice move | move: one current voice member. | Local mock/unit only |
| /voice mute | mute: one current voice member. | Local mock/unit only |
| /voice undeafen | undeafen: one current voice member. | Local mock/unit only |
| /voice unmute | unmute: one current voice member. | Local mock/unit only |
| /voicemaster close | Delete only your tracked empty private channel. | Local mock/unit only |
| /voicemaster config | Show configured private channel category and limits. | Local mock/unit only |
| /voicemaster limit | Set your channel capacity; access stays private. | Local mock/unit only |
| /voicemaster lock | Empty tracked channel: restore owner-only view/connect access. | Local mock/unit only |
| /voicemaster open | Create your own private standard voice channel. | Local mock/unit only |
| /voicemaster reconcile | Recheck your recorded channel, safely repair stored ownership state. | Local mock/unit only |
| /voicemaster rename | Rename your own tracked private channel. | Local mock/unit only |
| /voicemaster setup | Manage Channels: set private voice creation category. | Local mock/unit only |
| /voicemaster status | Privately inspect your stored voice ownership record,not live channel state. | Local mock/unit only |
| /voicemaster unlock | Empty tracked channel: explicitly allow all server members view/connect. | Local mock/unit only |
| /welcome channel | Choose the destination. | Local mock/unit only |
| /welcome clearchannel | Disable welcome/goodbye and remove stored destination;templates kept. | Local mock/unit only |
| /welcome color | Set welcome/goodbye embed color,or reset to Luna default. | Local mock/unit only |
| /welcome config | Show current settings. | Local mock/unit only |
| /welcome disable | Disable welcome messages. | Local mock/unit only |
| /welcome enable | Enable welcome messages. | Local mock/unit only |
| /welcome goodbye | Set goodbye template and enable or disable it. | Local mock/unit only |
| /welcome mentions | Choose whether welcome delivery may ping only the arriving member;goodbye never. | Local mock/unit only |
| /welcome message | Set welcome template. | Local mock/unit only |
| /welcome preview | Privately preview current welcome/goodbye template for yourself. | Local mock/unit only |
| /welcome resettemplate | Restore one localized default template,leaving delivery settings unchanged. | Local mock/unit only |
| /welcome test | Send one welcome message for yourself. | Local mock/unit only |
| /welcome title | Set static welcome/goodbye title;omit text to restore Luna title. | Local mock/unit only |

## Zynrax reference inventory

`data/commands.json` and `data/commands.csv` contain **319 documented command paths**, not 319 Luna commands. Documented shortcuts live in aliases and are not counted as commands. Each row preserves source URL, original syntax, description and verification flags. Parameters preserve documented brackets, not invented types. `referenceVerified` means the named syntax exists in fetched public docs, not that Zynrax behavior was tested. `implemented` and `tested` are false for all reference rows until an equivalent Luna implementation and relevant tests exist. `/serverinfo` is a foundation implementation with narrower behavior, so its richer reference row remains false.

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

The official homepage settles at a 541+ marketing count. These docs do not establish all 541 paths. No padding was added. Prefix differences (`?` vs `,`), undeclared permissions, conflicting fun/moderation `kick`, and overloaded ticket transcript syntax need reconciliation with live help or owner screenshots. Empty permission/alias arrays mean not documented, never unrestricted. Luna category labels are planning mappings rather than claims of Zynrax's exact help taxonomy.

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
