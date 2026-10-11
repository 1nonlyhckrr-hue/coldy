# ticket

Reference-only inventory, not installed Luna functionality. Permissions not stated in sources remain unknown. Search by command name using your editor or filter the JSON/CSV.

## ticket addcategory

```text
,ticket addcategory
```

Start the interactive setup to add a new ticket type (max 3 categories).

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket adduser

```text
,ticket adduser (user)
```

Add or remove users from a specific ticket.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket categories

```text
,ticket categories
```

List all configured ticket categories.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket close

```text
,ticket close
```

Closes the ticket, generates a transcript, and restricts access.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket config

```text
,ticket config
```

Shows the current ticket configuration, including staff role and active channels.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket delete

```text
,ticket delete
```

Instantly deletes the ticket channel (use after closing).

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket edit

```text
,ticket edit
```

Modify the ticket welcome message or panel message interactively.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket panel

```text
,ticket panel (channel)
```

Post the interactive button panel that users click to open tickets.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket removecategory

```text
,ticket removecategory (id)
```

Delete an existing ticket category by its ID.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket removeuser

```text
,ticket removeuser (user)
```

Add or remove users from a specific ticket.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket reset

```text
,ticket reset
```

Resets the entire ticket system configuration (prompts for confirmation).

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket setup

```text
,ticket setup
```

Configure the base settings including the ticket category and welcome messages.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket staff

```text
,ticket staff (role)
```

Define which role can view and manage all tickets.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets

## ticket transcript

```text
,ticket transcript (channel)
,ticket transcript
```

Set a channel where HTML transcripts will be sent after a ticket is closed.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/tickets


Original Luna `/ticket unclaim` releases only the invoking current staff member's own claim on the current open ticket. No other member claim can be released,even by a manager. Channel access,roles,messages and transcripts are unchanged. Current staff access and exact actor ID are refetched;DB update is guild/status/claimant-conditional.
