# Current public metadata utilities

`roleinfo role` fetches selected server role and shows name/ID/color/position/managed state and reviewed native permission flag names. Not a member's effective channel permissions. No roles edited or member enumeration. `banner user` fetches public user profile banner,not guild-specific member banner. Defaults self;no banner means explicit absence,not avatar substitution. `boostcount` fetches current server boost count and premium tier;unknown fields fail instead of assuming zero.

All force source fetch and reject wrong identities. Private shared EN/Hindi/Hinglish embeds,mentions disabled,native API error contained by shared dispatcher. No persistent data/API keys/external media service.29 top-level124paths228project tests pass;four new tests for utilities. No actual live fetch/render verified. Reference leads: https://docs.zynrax.site/miscellaneous/utility. Luna implementation is original slash command syntax,not claim of prefix aliases.

## Current metadata lists

`list roles` and `list emojis` fetch native full current server metadata,ten/page,deterministic role position/name sorting and ID tie break. Empty current result valid;missing page fails. Reject foreign server rows. No cache fallback/member counting,bans/admin/online presence enumeration. Names escaped for display,no pings,private localized embeds.32top-level131paths248project tests,three new list tests. Native full list fetch/provider rate limits and actual pixels unverified.
