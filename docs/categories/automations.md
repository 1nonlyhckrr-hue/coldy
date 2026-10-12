# automations

Reference-only inventory, not installed Emika functionality. Permissions not stated in sources remain unknown. Search by command name using your editor or filter the JSON/CSV.

## autorole bots add

```text
,autorole bots add @Bots
```

Specify roles for bot accounts.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/roles/autorole

## autorole bots remove

```text
,autorole bots remove @Bots
```

Specify roles for bot accounts.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/roles/autorole

## autorole config

```text
,autorole config
```

Check which roles are currently set to be assigned automatically.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/roles/autorole

## autorole humans add

```text
,autorole humans add @Member
```

Specify roles for human members.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/roles/autorole

## autorole humans remove

```text
,autorole humans remove @Member
```

Specify roles for human members.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/roles/autorole

## autorole reset all

```text
,autorole reset all
```

Clear all autorole settings for both humans and bots at once.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/roles/autorole

## autorole reset bots

```text
,autorole reset bots
```

Specify roles for bot accounts.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/roles/autorole

## autorole reset humans

```text
,autorole reset humans
```

Specify roles for human members.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/roles/autorole

## event disable

```text
,event disable
```

Hide the Event Category and restore all original channel permissions.

Aliases: em disable. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/eventmanager

## event enable

```text
,event enable
```

Hide all server channels and reveal the Event Category.

Aliases: em enable. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/eventmanager

## event reset

```text
,event reset
```

Delete the Event Category and clear all saved configurations.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/eventmanager

## event setup

```text
,event setup
```

Initialize the event category and all required channels. Zynrax will automatically save your current channel permissions so they can be restored later.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/eventmanager

## react add

```text
,react add (trigger) (emojis)
```

Create a new trigger that will automatically react with the specified emojis.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/autoreact

## react list

```text
,react list
```

See all currently configured auto-reactions in your server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/autoreact

## react remove

```text
,react remove (trigger)
```

Delete an existing trigger so the bot stops reacting to it.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/autoreact

## react reset

```text
,react reset
```

Instantly delete all configured auto-reaction triggers.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/autoreact


Original Emika `/automation forget id confirm:true` erases stored text only for done/cancelled schedules. Pending,sending and uncertain jobs are blocked until cancelled/reconciled. Discord messages are not deleted. Schedule ID,interaction replay guard,status and timestamp metadata remain. Current ManageGuild,confirmation,guild isolation and failure gates apply. No SQL schema change required.
