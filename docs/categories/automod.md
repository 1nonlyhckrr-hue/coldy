# automod

Reference-only inventory, not installed Luna functionality. Permissions not stated in sources remain unknown. Search by command name using your editor or filter the JSON/CSV.

## antibot add

```text
,antibot add #channel
```

Add a channel to the auto-purge list. Zynrax will delete all bot messages sent in this channel (unless the bot is whitelisted).

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/antibot

## antibot config

```text
,antibot config
```

See all channels currently configured for auto-purge and the list of whitelisted bots.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/antibot

## antibot remove

```text
,antibot remove #channel
```

Stop auto-purging bot messages in a specific channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/antibot

## antibot reset

```text
,antibot reset
```

Clear all channels and whitelisted bots from the AntiBot configuration.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/antibot

## antibot wl add

```text
,antibot wl add @bot
```

Add a bot to the whitelist to prevent its messages from being deleted in auto-purge channels.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/antibot

## antibot wl remove

```text
,antibot wl remove @bot
```

Remove a bot from the whitelist.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/antibot

## automod config

```text
,automod config
```

Stay informed about Automod actions by setting a dedicated logging channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/automod

## automod disable

```text
,automod disable
```

To begin setting up Automod, use the `automod enable` command. This will open an interactive setup where you can choose which security events to activate.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/automod

## automod enable

```text
,automod enable
```

To begin setting up Automod, use the `automod enable` command. This will open an interactive setup where you can choose which security events to activate.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/automod

## automod ignore channel

```text
,automod ignore channel #channel
```

You can exempt specific channels or roles from being affected by Automod.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/automod

## automod ignore reset

```text
,automod ignore reset
```

You can exempt specific channels or roles from being affected by Automod.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/automod

## automod ignore role

```text
,automod ignore role @role
```

You can exempt specific channels or roles from being affected by Automod.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/automod

## automod logging

```text
,automod logging #channel
```

Stay informed about Automod actions by setting a dedicated logging channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/automod

## automod punishment

```text
,automod punishment
```

You can customize the punishment for each event (except Anti NSFW). Available actions are **Mute**, **Kick**, and **Ban**.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/security/automod

## media bypass add

```text
,media bypass add (member)
```

Grant a user permission to bypass the media-only restriction.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/media

## media bypass remove

```text
,media bypass remove (member)
```

Revoke a user's bypass permission.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/media

## media bypass show

```text
,media bypass show
```

View all members who currently have bypass permissions.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/media

## media config

```text
,media config
```

Check which channel is currently set as media-only.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/media

## media remove

```text
,media remove
```

Disable the media-only restriction for the server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/media

## media setup

```text
,media setup (channel)
```

Designate a text channel as media-only.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/media

