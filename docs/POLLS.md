# Native polls

`/poll` publishes one native Discord poll with2-10 distinct text answers,one question,explicit destination,1-768hours(default24),multiselect(defaultfalse). Current Manage Server plus caller destination View/Send/SendPolls;bot destination View/Send/Embed/SendPolls. Only text+announcement channels here. Native poll owns votes/expiry,not Luna persistence or simulated buttons. Question/answer supplied by staff remain verbatim apart from trim. Shared localized Luna wrapper,no mentions. No automatic question translation.

Official source verified https://docs.discord.com/developers/resources/poll:question300chars,answer55,max10,up to32days,immutable after creation,apps cannot vote. In-progress results may be missing/approximate;only finalized true yields final tally. Luna currently has no results/end/voter enumeration commands and stores no voters or answer content.

SQLitev20 persists server/staff/channel/message/source IDs,status,time. Reserve before send;10publication attempts/server/hour,30day metadata pruning on next reservation. Pending restart becomes uncertain,never resent. Unknown send requires operator inspect before new request. Old source replay after30day metadata expiry is outside retention protection,not global exactly-once delivery. No native API or visual poll test yet. Current local suite:384 tests,SQLite25. No paid service/key/new intent required.

Publication force-fetches the destination before refreshing caller and bot authority. Caller ID/member guild/interaction guild and current application bot ID/member guild must match before reserving or publishing. This blocks substitute native results and permission loss while awaiting destination. Local tests cover identity rejects and that lookup race;they do not establish native acceptance.

Poll outcome writes require exactly one sending reservation;completed/uncertain/missing records cannot be rewritten as successful. Accepted send without returned message identity marks uncertain immediately and cannot replay source. If storage itself fails,pending record stays non-replayable and startup recovers uncertain.419 local tests,SQLite25;native acceptance pending.
