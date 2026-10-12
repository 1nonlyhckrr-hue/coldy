# welcomer

Reference-only inventory, not installed Emika functionality. Permissions not stated in sources remain unknown. Search by command name using your editor or filter the JSON/CSV.

## greet autodelete

```text
,greet autodelete (seconds)
```

Optionally set a timer for how long the welcome message remains in the channel.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/welcome

## greet channel

```text
,greet channel #channel
```

Set where the welcome messages should be sent.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/welcome

## greet config

```text
,greet config
```

Check your current welcomer setup.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/welcome

## greet disable

```text
,greet disable
```

Turn off the welcomer module for your server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/welcome

## greet enable

```text
,greet enable
```

Turn on the welcomer module for your server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/welcome

## greet reset

```text
,greet reset
```

Wipe your welcomer settings clean.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/welcome

## greet test

```text
,greet test
```

Send a test welcome message to yourself to verify the configuration.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/welcome


Original Emika `/welcome preview kind:welcome|goodbye` renders the current configured/default template for the invoking current ManageGuild member,privately. It needs no destination,enabled member intent or active welcome/goodbye delivery. Templates stay verbatim;mentions are suppressed. Unlike `/welcome test`,it sends nothing to the configured server channel. Automated fixtures do not establish live visual acceptance.

Original Emika `/welcome color [hex]` saves a six-digit RGB color for welcome/goodbye server embeds and private previews. Optional leading # is allowed. Omit hex to reset Emika default. ManageGuild is refetched;numeric schema is bounded0-16777215. No remote images or URLs are fetched. Template,branding and mention rules stay unchanged. API color semantics: https://docs.discord.com/developers/resources/message . Native visual acceptance remains unverified.

Welcome test now uses current persisted locale/color after member refresh,matching private previews/events. Enable/goodbye opt-in rechecks destination and member-event runtime after channel validation and refuses races. Local regression coverage only;actual embed pixels and gateway events remain unverified.

`/welcome resettemplate kind confirm:true` restores one stored welcome/goodbye template to localized default without changing destination,color,enabled states or the other template. Custom text is replaced only after true confirmation. No native send/intents needed. Defaults render using current saved locale;private preview verifies payload locally.346 project tests,native visuals pending.
