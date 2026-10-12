# Native polls

`/poll` publishes one native Discord poll with2-10 distinct text answers,one question,explicit destination,1-768hours(default24),multiselect(defaultfalse). Current Manage Server plus caller destination View/Send/SendPolls;bot destination View/Send/Embed/SendPolls. Only text+announcement channels here. Native poll owns votes/expiry,not Emika persistence or simulated buttons. Question/answer supplied by staff remain verbatim apart from trim. Shared localized Emika wrapper,no mentions. No automatic question translation.

Official source verified https://docs.discord.com/developers/resources/poll:question300chars,answer55,max10,up to32days,immutable after creation,apps cannot vote. In-progress results may be missing/approximate;only finalized true yields final tally. Emika stores no voters or answer content and never enumerates voters. `/pollmanage results` now fetches aggregate answer counts privately.

SQLitev20 persists server/staff/channel/message/source IDs,status,time. Reserve before send;10publication attempts/server/hour,30day metadata pruning on next reservation. Pending restart becomes uncertain,never resent. Unknown send requires operator inspect before new request. Old source replay after30day metadata expiry is outside retention protection,not global exactly-once delivery. No native API or visual poll test yet. Current local suite:384 tests,SQLite25. No paid service/key/new intent required.

Publication force-fetches the destination before refreshing caller and bot authority. Caller ID/member guild/interaction guild and current application bot ID/member guild must match before reserving or publishing. This blocks substitute native results and permission loss while awaiting destination. Local tests cover identity rejects and that lookup race;they do not establish native acceptance.

Poll outcome writes require exactly one sending reservation;completed/uncertain/missing records cannot be rewritten as successful. Accepted send without returned message identity marks uncertain immediately and cannot replay source. If storage itself fails,pending record stays non-replayable and startup recovers uncertain.419 local tests,SQLite25;native acceptance pending.

## Stored poll management

`/pollmanage list` shows the latest 20 server-scoped stored poll IDs, channel IDs and send-receipt states. A sent receipt is not evidence that voting is still open. Metadata is retained under the existing 30-day publication-time cleanup policy.

`/pollmanage results id` force-fetches the exact sent bot-created poll message. Current Manage Server and channel View/Read History are checked again after fetching. Bot identity, server/channel/message identity and bot read permissions must match. Displays only native answer counts and finalized flag, not unique people or voter IDs. Counts can be approximate while unfinalized; multi-answer totals can overlap. No vote content persists.

`/pollmanage end id confirm:true` ends voting early only for that verified bot-owned poll with a future expiry. Persists a pending case before the native request, then force-fetches and checks exact identity and expired timestamp before completion. Pending/uncertain cases block retries across interactions/restarts; manual operator review remains required after unknown outcomes. Native messages and send receipts remain intact. Permissions can change after the last check; API rejection/unknown observation fails closed. Three tests cover identity, authorization, expiry, unknown effects, retry guards and private localized command execution. No live poll API or client-pixel verification.

`/pollmanage channelmetadata channel-id`, `statemetadata state`, `exportunresolved` privately filter latest100minimalstoredreceiptID/channel/state/time JSON byexactstoredchannel,sending/sent/uncertain,or sending/uncertain set. Total/truncated included,guildisolated/nonmutating. No actor/message/sourceIDs,voters,answertext/nativepolllookup,votingstate/deliveryproof,retry/repair/cleanup. FreshManageGuild/private3locale branded no-ping JSON.3tests scope/IDstatebounds/order/100truncation/minimalkeys/deniedpermissions/privatebytes.
