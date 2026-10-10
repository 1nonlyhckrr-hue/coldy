# Command index

## Installed Luna commands

26 top-level commands, 110 executable paths. 188 local tests pass. No live Discord test or deployment. Reference equivalence is a separate check. Antinuke alert-only; GuildTag manual refresh; VoiceMaster private explicit channels.

| Slash path | Behavior | Tested |
| --- | --- | --- |
| /antinuke enable | Enable alert-only detection for supported audit actions. | Local mock/unit only |
| /antinuke disable | Stop alert-only audit monitoring. | Local mock/unit only |
| /antinuke threshold | Set mixed-action count and observation window. | Local mock/unit only |
| /antinuke trust | Exempt a current member from audit alerts only. | Local mock/unit only |
| /antinuke config | Show alert settings and limitations. | Local mock/unit only |
| /antinuke incidents | Show20 recent stored audit burst alerts. | Local mock/unit only |
| /automation create | Schedule one message or a fixed elapsed-time repeat. | Local mock/unit only |
| /automation cancel | Cancel a pending or uncertain schedule. | Local mock/unit only |
| /automation list | List recent schedule records. | Local mock/unit only |
| /automation config | Show schedule limits and restart policy. | Local mock/unit only |
| /automod enable | Enable configured rules; all rules start disabled. | Local mock/unit only |
| /automod disable | Stop automatic message moderation. | Local mock/unit only |
| /automod rule | Enable or disable one rule. | Local mock/unit only |
| /automod wordadd | Add a literal word/phrase to the filter. | Local mock/unit only |
| /automod wordremove | Remove a literal filtered word/phrase. | Local mock/unit only |
| /automod exempt | Add or remove an exempt server role. | Local mock/unit only |
| /automod config | Show configured rules and limits. | Local mock/unit only |
| /automod incidents | Show 20 recent action outcomes, no message content. | Local mock/unit only |
| /autoresponder create | Create an exact or literal keyword trigger. | Local mock/unit only |
| /autoresponder edit | Edit the response for an existing trigger. | Local mock/unit only |
| /autoresponder delete | Delete an existing trigger. | Local mock/unit only |
| /autoresponder config | List trigger configuration. | Local mock/unit only |
| /customrole map | Manage Roles: map a name to an existing safe role. | Local mock/unit only |
| /customrole unmap | Manage Roles: remove a mapping, leaving existing assignments. | Local mock/unit only |
| /customrole required | Manage Roles: set eligibility role or remove the gate. | Local mock/unit only |
| /customrole list | Show mapped names and eligibility role. | Local mock/unit only |
| /customrole claim | Assign one configured safe role to yourself. | Local mock/unit only |
| /customrole release | Remove one configured role from yourself. | Local mock/unit only |
| /fun 8ball | Get a playful random answer, not advice. | Local mock/unit only |
| /fun coin | Flip a coin. | Local mock/unit only |
| /fun dice | Roll up to ten dice. | Local mock/unit only |
| /fun choose | Pick one of 2-20 choices separated by |. | Local mock/unit only |
| /fun truth | Get an optional, low-pressure reflection prompt. | Local mock/unit only |
| /fun dare | Get an optional, safe solo activity. | Local mock/unit only |
| /fun rps | Play one round of rock, paper, scissors against Luna. | Local mock/unit only |
| /about | Show Luna version and implementation status. | Local mock/unit only |
| /config view | View this server configuration. | Local mock/unit only |
| /config language | Set English, Hindi or Hinglish for this server. | Local mock/unit only |
| /help | Show installed commands with pagination. | Local mock/unit only |
| /ping | Show Luna gateway latency. | Local mock/unit only |
| /uptime | Show how long this process has been running. | Local mock/unit only |
| /giveaway start | Create a giveaway with checked eligibility. | Local mock/unit only |
| /giveaway end | End and publish a stored draw, or retry publishing it. | Local mock/unit only |
| /giveaway reroll | Draw again, excluding the immediately previous winners. | Local mock/unit only |
| /giveaway list | List recent giveaway records. | Local mock/unit only |
| /giveaway config | Show giveaway limits and policies. | Local mock/unit only |
| /leaderboard enable | Manage Server: start counting future eligible messages. | Local mock/unit only |
| /leaderboard disable | Manage Server: stop counting; keep stored counts. | Local mock/unit only |
| /leaderboard exclude | Manage Server: exclude/include a text channel or category. | Local mock/unit only |
| /leaderboard config | View tracking status and excluded IDs. | Local mock/unit only |
| /leaderboard stats | Show your own retained message counts. | Local mock/unit only |
| /leaderboard top | Show retained message ranks, ten per page. | Local mock/unit only |
| /leaderboard resetmine | Delete only your retained message counts. | Local mock/unit only |
| /logging channel | Choose the server log channel. | Local mock/unit only |
| /logging enable | Enable case logs after configuring a channel. | Local mock/unit only |
| /logging disable | Disable delivery without deleting config. | Local mock/unit only |
| /logging config | Show case-log settings. | Local mock/unit only |
| /logging test | Send one test log to the configured channel. | Local mock/unit only |
| /moderation warn | warn: one member, checked and recorded. | Local mock/unit only |
| /moderation warnings | warnings: one member, checked and recorded. | Local mock/unit only |
| /moderation clearwarns | clearwarns: one member, checked and recorded. | Local mock/unit only |
| /moderation timeout | timeout: one member, checked and recorded. | Local mock/unit only |
| /moderation untimeout | untimeout: one member, checked and recorded. | Local mock/unit only |
| /moderation kick | kick: one member, checked and recorded. | Local mock/unit only |
| /moderation ban | ban: one member, checked and recorded. | Local mock/unit only |
| /moderation unban | unban: one member, checked and recorded. | Local mock/unit only |
| /permit blockuser | Block a user for one entire command. | Local mock/unit only |
| /permit unblockuser | Unblock a user for one entire command. | Local mock/unit only |
| /permit blockrole | Block a role for one entire command. | Local mock/unit only |
| /permit unblockrole | Unblock a role for one entire command. | Local mock/unit only |
| /permit list | Show configured restrictions, ten per page. | Local mock/unit only |
| /permit clear | Remove all restrictions for one command. | Local mock/unit only |
| /reactionroles create | Publish one role toggle button. | Local mock/unit only |
| /reactionroles list | List the newest 20 panel records. | Local mock/unit only |
| /reactionroles disable | Disable a panel in storage; its old button becomes inactive. | Local mock/unit only |
| /ticket setup | Set the category and role that can view new tickets. | Local mock/unit only |
| /ticket panel | Publish a ticket-open button. | Local mock/unit only |
| /ticket open | Open one private support ticket. | Local mock/unit only |
| /ticket claim | Assign the current open ticket to yourself. | Local mock/unit only |
| /ticket close | Store transcript and make the owner read-only. | Local mock/unit only |
| /ticket reopen | Restore the ticket owner write access. | Local mock/unit only |
| /ticket transcript | Export current ticket history privately. | Local mock/unit only |
| /ticket config | Show ticket configuration to server managers. | Local mock/unit only |
| /avatar | Show a public avatar link. | Local mock/unit only |
| /serverinfo | Show basic information about this server. | Local mock/unit only |
| /stats | Show build command counts and process memory usage. | Local mock/unit only |
| /userinfo | Show public user information. | Local mock/unit only |
| /guildtag setup | Manage Roles: configure one safe tag reward role. | Local mock/unit only |
| /guildtag show | Show tag reward configuration. | Local mock/unit only |
| /guildtag reset | Manage Roles: stop tag rewards, leaving assigned roles unchanged. | Local mock/unit only |
| /guildtag refresh | Check your current primary-guild identity and own reward role. | Local mock/unit only |
| /voice mute | mute: one current voice member. | Local mock/unit only |
| /voice unmute | unmute: one current voice member. | Local mock/unit only |
| /voice deafen | deafen: one current voice member. | Local mock/unit only |
| /voice undeafen | undeafen: one current voice member. | Local mock/unit only |
| /voice disconnect | disconnect: one current voice member. | Local mock/unit only |
| /voice move | move: one current voice member. | Local mock/unit only |
| /voicemaster setup | Manage Channels: set private voice creation category. | Local mock/unit only |
| /voicemaster config | Show configured private channel category and limits. | Local mock/unit only |
| /voicemaster open | Create your own private standard voice channel. | Local mock/unit only |
| /voicemaster rename | Rename your own tracked private channel. | Local mock/unit only |
| /voicemaster limit | Set your channel capacity; access stays private. | Local mock/unit only |
| /voicemaster close | Delete only your tracked empty private channel. | Local mock/unit only |
| /welcome channel | Choose the destination. | Local mock/unit only |
| /welcome message | Set welcome template. | Local mock/unit only |
| /welcome goodbye | Set goodbye template and enable or disable it. | Local mock/unit only |
| /welcome enable | Enable welcome messages. | Local mock/unit only |
| /welcome disable | Disable welcome messages. | Local mock/unit only |
| /welcome config | Show current settings. | Local mock/unit only |
| /welcome test | Send one welcome message for yourself. | Local mock/unit only |

## Zynrax reference inventory

`data/commands.json` and `data/commands.csv` contain **318 documented command paths**, not 318 Luna commands. Documented shortcuts live in aliases and are not counted as commands. Each row preserves source URL, original syntax, description and verification flags. Parameters preserve documented brackets, not invented types. `referenceVerified` means the named syntax exists in fetched public docs, not that Zynrax behavior was tested. `implemented` and `tested` are false for all reference rows until an equivalent Luna implementation and relevant tests exist. `/serverinfo` is a foundation implementation with narrower behavior, so its richer reference row remains false.

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

## Phase 3 batch 2 additions

- /logging channel, enable, disable, config, test (Manage Server).
- /welcome channel, message, goodbye, enable, disable, config, test (Manage Server).
- /userinfo [user], /avatar [user], /uptime, /stats.
- /help page:<number> paginates installed command paths.

Totals: 11 top-level slash commands, 28 executable paths. All have local mock/unit paths exercised; none has live Discord verification. Server logs currently cover moderation case metadata only, not a full Discord event audit suite. Welcome images/embeds are not implemented.

## Role panel batch

/reactionroles create, list, disable add button-based role panels with persistent message bindings and revalidated safe-role checks. Not emoji reactions. Totals: 12 top-level slash commands, 31 executable paths. Local tests only, no live Discord verification. See docs/ROLE_PANELS.md.

## Configuration and localization foundation

/config language and /config view. Validated per-guild en/hi/hinglish locale, localized configuration response. Full response translation remains in progress. All existing output paths have the shared embed retrofit, but actual Discord pixels remain unverified. Totals: 13 top-level slash commands, 33 executable paths. See docs/LOCALIZATION_STATUS.md.
