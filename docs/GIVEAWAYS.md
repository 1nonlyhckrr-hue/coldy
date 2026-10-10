# Giveaways

Five installed Luna paths: `/giveaway start`, `end`, `reroll`, `list`, `config`. Manage Server is required and refreshed before each management action. Start accepts destination, prize text, minutes, winners and an optional required role. Luna records the described prize but does not buy, transfer or deliver it.

Limits: 1-20 winners, 1 minute to 30 days, 1,000 entries, 20 unresolved giveaways per guild. Bot entries are refused. Entry buttons must match the original stored message/channel/guild. Optional role membership is checked on entry and again before drawing; current server membership is also checked again. Missing members are excluded. Network errors stop a new draw rather than silently treating members as ineligible.

Giveaways, entries, end times, draw versions and winners are persisted in SQLite. Duplicate entries and duplicate create interactions are prevented. Random winners are sampled without replacement using Node's cryptographic random generator. If fewer eligible entrants exist, fewer winners are returned; an empty result is stated honestly.

Luna checks due records once per minute while online and catches up after restart. Winners are saved before editing the original giveaway message. Failed edits leave an ending record; the same stored winners are used on retry, never a new draw. A sent-but-unconfirmed creation remains uncertain and must be checked by the operator. No blind creation retry occurs. Result edits disable the entry button and do not ping winners, roles or everyone.

`end` supports early ending. `reroll` applies only to ended giveaways and excludes the immediately previous winners, not all historical winners. Results carry a draw version. A retry of an interrupted ending only republishes the stored draw. List shows ten records per page, from the newest 100 stored records. Config describes runtime policy.

Local tests cover schema, isolation, duplicate protection, bounded unique sampling, joins, late joins, current eligibility, vanished members, network failures, stored-result retries, button message matching, bots, locale output, scheduler lifecycle and all five management paths. Live Discord button and restart behavior has not been tested yet. Prize policy, giveaway staff-role grants, banner customization and cancellation commands are not implemented. Luna slash syntax is original; the nine verified Zynrax reference paths are not marked equivalent or fully implemented.

Reference: https://docs.zynrax.site/miscellaneous/giveaway
