# moderation

Reference-only inventory, not installed Emika functionality. Permissions not stated in sources remain unknown. Search by command name using your editor or filter the JSON/CSV.

## ban

```text
,ban (member) [reason]
```

Remove a member permanently from the server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## clearwarns

```text
,clearwarns (member)
```

Remove all warnings from a specific member.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## clone

```text
,clone (channel)
```

Duplicate a specific channel with its exact permissions and settings.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## delemoji

```text
,delemoji [emoji]
```

Remove a custom emoji from the server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## delsticker

```text
,delsticker [reply]
```

Remove a sticker from the server by replying to it.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## enlarge

```text
,enlarge (emoji)
```

Send a high-quality, enlarged version of any emoji.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## hide

```text
,hide
```

Make the current channel invisible to @everyone.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## hideall

```text
,hideall
```

Limit how often users can send messages. Use `,unslowmode` to quickly remove any active slowmode. Apply permissions across the entire server instantly: * **lockall**: Disables `send_messages` for @everyone in every channel. * **unlockall**: Re-enables `send_messages` for @everyone in every channel. * **hideall**: Disables `view_channel` for @everyone in every channel. * **unhideall**: Re-enables `view_channel` for @everyone in every channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## jail

```text
,jail (member) [duration] [reason]
```

Punish a member by jailing them for a specific duration or permanently.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/jail

## jail config

```text
,jail config
```

Check your current jail settings, including the configured role and channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/jail

## jail list

```text
,jail list
```

View a list of all currently jailed members and their remaining time.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/jail

## jail reset

```text
,jail reset
```

Remove the current jail configuration and reset it to default.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/jail

## jail setup

```text
,jail setup
```

Open an interactive menu to set up your jail role and channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/jail

## kick

```text
,kick (member) [reason]
```

Instantly remove a member from the server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## lock

```text
,lock
```

Disable sending messages for @everyone in the current channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## lockall

```text
,lockall
```

Limit how often users can send messages. Use `,unslowmode` to quickly remove any active slowmode. Apply permissions across the entire server instantly: * **lockall**: Disables `send_messages` for @everyone in every channel. * **unlockall**: Re-enables `send_messages` for @everyone in every channel. * **hideall**: Disables `view_channel` for @everyone in every channel. * **unhideall**: Re-enables `view_channel` for @everyone in every channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## mute

```text
,mute (member) (duration) [reason]
```

Temporarily restrict a user's ability to speak or interact using Discord's timeout system.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## nick

```text
,nick (member) [new_nick]
```

Manage nicknames and basic server identity.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## nuke

```text
,nuke
```

Completely delete and clone the current channel, wiping its message history.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## pb

```text
,pb [amount]
```

Purge Engine (see source for full description).

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## purge

```text
,purge (amount)
,purge (filter) [amount]
```

Delete large amounts of messages (up to 999) with specialized filters.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## purge user

```text
,purge user @user [amount]
```

Delete large amounts of messages (up to 999) with specialized filters.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## removerole all

```text
,removerole all (role)
```

Bulk Role Operations (see source for full description).

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## removerole bots

```text
,removerole bots (role)
```

Bulk Role Operations (see source for full description).

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## removerole humans

```text
,removerole humans (role)
```

Bulk Role Operations (see source for full description).

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## role

```text
,role (member) (role)
```

Toggle a specific role for a member.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## role all

```text
,role all (role)
```

Assign or remove roles from entire groups of users at once. Assign a role to large groups of users simultaneously: * **role all**: Gives the role to every single member. * **role humans**: Gives the role only to human accounts. * **role bots**: Gives the role to all bot accounts. * **role unverified**: Gives the role to members who do not have an avatar.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## role bots

```text
,role bots (role)
```

Assign or remove roles from entire groups of users at once. Assign a role to large groups of users simultaneously: * **role all**: Gives the role to every single member. * **role humans**: Gives the role only to human accounts. * **role bots**: Gives the role to all bot accounts. * **role unverified**: Gives the role to members who do not have an avatar.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## role create

```text
,role create (name)
```

Create a new role in your server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## role delete

```text
,role delete (role)
```

Delete an existing role from your server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## role humans

```text
,role humans (role)
```

Assign or remove roles from entire groups of users at once. Assign a role to large groups of users simultaneously: * **role all**: Gives the role to every single member. * **role humans**: Gives the role only to human accounts. * **role bots**: Gives the role to all bot accounts. * **role unverified**: Gives the role to members who do not have an avatar.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## role rename

```text
,role rename (role) (name)
```

Change the name of an existing role.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## role unverified

```text
,role unverified (role)
```

Assign or remove roles from entire groups of users at once. Assign a role to large groups of users simultaneously: * **role all**: Gives the role to every single member. * **role humans**: Gives the role only to human accounts. * **role bots**: Gives the role to all bot accounts. * **role unverified**: Gives the role to members who do not have an avatar.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## roleicon

```text
,roleicon (role) [icon]
```

Apply an image as an icon for a specific role (requires server boosts).

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## slowmode

```text
,slowmode (seconds)
```

Limit how often users can send messages.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## snipe

```text
,snipe
```

View content that was recently removed from the channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## unban

```text
,unban (member) [reason]
```

Restore a member's access to the server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## unbanall

```text
,unbanall
```

Clear the entire server ban list at once.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## unhide

```text
,unhide
```

Make the current channel visible to @everyone again.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## unhideall

```text
,unhideall
```

Limit how often users can send messages. Use `,unslowmode` to quickly remove any active slowmode. Apply permissions across the entire server instantly: * **lockall**: Disables `send_messages` for @everyone in every channel. * **unlockall**: Re-enables `send_messages` for @everyone in every channel. * **hideall**: Disables `view_channel` for @everyone in every channel. * **unhideall**: Re-enables `view_channel` for @everyone in every channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## unjail

```text
,unjail (member) [reason]
```

Release a member from jail and restore their original roles.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/jail

## unlock

```text
,unlock
```

Enable sending messages for @everyone in the current channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## unlockall

```text
,unlockall
```

Limit how often users can send messages. Use `,unslowmode` to quickly remove any active slowmode. Apply permissions across the entire server instantly: * **lockall**: Disables `send_messages` for @everyone in every channel. * **unlockall**: Re-enables `send_messages` for @everyone in every channel. * **hideall**: Disables `view_channel` for @everyone in every channel. * **unhideall**: Re-enables `view_channel` for @everyone in every channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## unmute

```text
,unmute (member)
```

Remove a timeout from a member.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## unmuteall

```text
,unmuteall
```

Lift all active timeouts in the server simultaneously.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## unslowmode

```text
,unslowmode
```

Documented inline command; see source for behavior.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

## warn

```text
,warn (member) [reason]
```

Keep track of member violations. Zynrax automatically applies a **timeout** if a user reaches 4+ warnings.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/security/moderation

