# autoresponder

Reference-only inventory, not installed Emika functionality. Permissions not stated in sources remain unknown. Search by command name using your editor or filter the JSON/CSV.

## autoresponder config

```text
,autoresponder config
```

See everything currently configured in your server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/autoresponder

## autoresponder create

```text
,autoresponder create (trigger) (response)
```

Add a new trigger and response pair.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/autoresponder

## autoresponder delete

```text
,autoresponder delete (trigger)
```

Remove an autoresponder from your server.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/autoresponder

## autoresponder edit

```text
,autoresponder edit (trigger) (new_response)
```

Update the response for an existing trigger.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Emika: no.

Source: https://docs.zynrax.site/configuration/autoresponder


Original Emika `/autoresponder preview trigger` privately renders the exact stored response in a localized Emika embed with mentions disabled. No message send,cooldown claim or delivery record. All management paths now force-fetch exact current actor/guild ManageGuild before record access/mutation. Config page values validated as positive integers within current page range. Local tests only;native gateway/visual acceptance pending.

Before claiming a response the message handler force-fetches exact bot and destination,checks guild bindings,current message-event runtime and text/channel permissions. Threads require SendMessagesInThreads rather than SendMessages. Sends use the fresh validated channel,not the event cache. Local regression tests only,no live rate-limit or gateway claim. Installed discord.js GuildChannelManager fetch force semantics inspected.

Read-only matching/cooldown/replay preflight avoids native fetches for ineligible messages. The atomic claim still rechecks current rule after native validation,so deleted rules do not send,edited responses use current text,and concurrent replay cannot reserve twice. No live throughput/rate-limit guarantee.
