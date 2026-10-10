# Command index

## Installed Luna commands

| Slash command | Behavior | Tested |
| --- | --- | --- |
| /ping | Gateway latency | Mock/unit only |
| /help | Installed command list | Mock/unit only |
| /about | Build version/status | Mock/unit only |
| /serverinfo | Basic server name, ID, member count | Mock/unit only |

`/moderation` adds warn, warnings, clearwarns, timeout, untimeout, kick, ban and unban with case tracking. Locally tested with mocked Discord APIs and real SQLite. None has been live-tested against Discord.

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
