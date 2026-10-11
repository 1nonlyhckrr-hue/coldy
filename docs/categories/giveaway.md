# giveaway

Reference-only inventory, not installed Luna functionality. Permissions not stated in sources remain unknown. Search by command name using your editor or filter the JSON/CSV.

## gconfig

```text
,gconfig
```

Check your server's giveaway settings.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/miscellaneous/giveaway

## gembed reset

```text
,gembed reset
```

Set a custom banner image that will appear at the bottom of all giveaway messages.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/miscellaneous/giveaway

## gembed set

```text
,gembed set (url/upload)
```

Set a custom banner image that will appear at the bottom of all giveaway messages.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/miscellaneous/giveaway

## gend

```text
,gend [message_id]
```

Instantly end a currently running giveaway and pick winners.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/miscellaneous/giveaway

## glist

```text
,glist
```

View all active giveaways in your server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/miscellaneous/giveaway

## greroll

```text
,greroll
```

Pick a new winner for an already ended giveaway.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/miscellaneous/giveaway

## gstaff reset

```text
,gstaff reset
```

Allow specific roles to manage giveaways without needing administrator permissions.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/miscellaneous/giveaway

## gstaff role

```text
,gstaff role @GiveawayManager
```

Allow specific roles to manage giveaways without needing administrator permissions.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/miscellaneous/giveaway

## gstart

```text
,gstart (time) (winners) (prize)
```

Launch a giveaway with a specified duration, number of winners, and prize.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/miscellaneous/giveaway


Original Luna `/giveawayleave id` withdraws only your own current-server entry before an active giveaway deadline. No management permission is required. Wrong actor identity,foreign records,ending/ended/expired records are blocked. No winner reroll or public announcement occurs;reentry before deadline is allowed. This path is separate because management-only `/giveaway` access stays unchanged.
