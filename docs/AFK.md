# Explicit own away status

`afk set reason share:true` stores own server/user/channel/reason/time for up to7days. Reason supplied by user must be suitable for exact current-channel disclosure. Notice sends only when mentioned in that same channel,not in another channel or DM. Public no-ping localized embed includes user ID,reason and elapsed minutes. Names/profile/contents of triggering messages not stored. No nickname changes. `status` privately shows own record. `clear` erases it. Up to1000active records/server.

Next new eligible message from that user in any channel of same server clears status without a return announcement. Bots/webhooks/system/stale replay ignored. AFK runs only when AutoMod did not intercept the event;blocked/moderated messages do not clear it. Notice considers at most5mentioned users,10reservations/min/server,one/channel/30seconds. Stored incoming message-ID reservation prevents repeating failed/uncertain notice.24hour notice-ID retention;statuses expire7days on startup/access. Not forensic secure erase;backups may retain copies. Policy is explicit exact-channel disclosure,not claimed prefix parity or cross-channel away reason broadcast.

SQLitev21. Current local suite:382 tests,37 top-level/162 paths,SQLite25. No live mention/gateway/privacy/visual test. Runtime Message Content/GuildMessages needed already opt-in,not secretly enabled. Unknown sends contained,no auto retry. Member presence not tracked,no account status inference.

Notice destination is force-fetched and must match exact channel ID,guild and text/announcement/thread type. Bot identity must match current application and guild before current output permissions are checked. Thread destinations require SendMessagesInThreads;normal channels require SendMessages,plus ViewChannel and EmbedLinks. Runtime is rechecked after asynchronous lookup. Send uses fresh destination,not event-channel snapshot. Consent/status recheck and replay reservation remain in place. Native/private-thread permission acceptance is still unverified.

## Manage existing disclosure

`reason reason share:true` changes only own existing stored public reason in its original disclosure channel. Does not extend the original7day expiry. Requires current exact caller/guild identity and enabled message runtime,plus renewed consent for the edited reason. Does not send a preview/notice.

`move share:true` changes own existing disclosure to the interaction's exact current channel. No user-selected third-party channel. Forces exact native text/announcement/thread identity,current caller and ViewChannel;runtime rechecked after lookup. Existing reason and original expiry retained. Consent explicitly names sharing the stored reason in this current channel. Future mentions in old channel no longer disclose;pending notices compare latest channel/reason before reservation. No presence inference or bot permission readiness promise.

`clearall confirm:true` needs fresh current ManageGuild and erases all guild AFK states/reasons,not another guild or native messages. Retained notice replay/cooldown guards stay. Already-sent notices or exported copies cannot be recalled. Pending notices recheck state before reservation;there is no atomic guarantee against an already-in-flight send. All replies private/localized/no-ping;no native message send in these commands.19AFK tests,868project tests locally;live/visual acceptance remains pending.

## Scoped erasure and own portability

`/afk exportmine` privately exports only the current caller's retained away reason/channel/created/expiry timestamps,or JSONnull when none remains. Fresh native caller/guild identity,no manager requirement. No user ID,other reasons,notice/replay IDs,presence inference or runtime requirement. File is sensitive,keep private. Access applies existing7day cleanup.

`clearchannel id confirm:true` erases stored reasons/states bound to one exact channel ID here;`clearuser id confirm:true` erases only that exact user state here. Fresh native Manage Server,confirmation;departed/deleted resource IDs allowed because this only erases storage,no target lookup. Other states/guilds/notice replay guards and native/exported copies remain. In-flight notices may finish. Three tests scopes/isolation/replay/databaseabort/IDlimits/currentidentity/manager/confirm/private3locale exactownbytes. No live/client visual acceptance.
