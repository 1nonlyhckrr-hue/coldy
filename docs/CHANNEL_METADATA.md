# Visible channel metadata

Three original paths `/channel info [channel]`, `/channel permissions [channel] [page]`, `/channel list [page] [search]`. Private localized no-ping replies. Read-only,no storage or permission changes.

Info reads exact current supported non-thread channel and forced current actor,requires ViewChannel. Shows escaped name,ID,type,position,not topic/messages/member counts. Own permissions shows paginated10 effective nativeflags,Administrator expansion included. Flags are a snapshot,not proof every operation will succeed. Info page must1.

List fetches current server channels and fresh actor,filters ViewChannel before name search/page selection. Ten/page,max100pages,case-insensitive literal search1-80chars. Hidden channels and all threads omitted. Unsupported channeltypes omitted. Malformed/foreign supported rows fail instead of guessed output. No bot permission fallback for actor access.

Local tests verify payloads/auth/hidden filtering/pagination/native options in3locales. Live channel permission races/client rendering remain unverified. Native discord.js14.27.0 channelmanager/read semantics inspected locally.

## Confirmed one-channel metadata changes

`rename channel text confirm:true`,`topic channel text confirm:true`,`cleartopic channel confirm:true` target only one normal text channel,not announcements/forums/voice/categories/threads. Name1-100lowercase ASCII letters,digits,_ or - to avoid normalization surprises. Topic1-1024characters;no @/controls/edge whitespace. Clear topic sets null. Current exact caller/application bot and forced native channel require ViewChannel+ManageChannels,plus application ManageChannels. Caller is refreshed after channel lookup. No native overwrite/access/message edits/deletion. These paths intentionally use no default whole-command manager restriction so read-only channel helpers remain accessible;action-specific checks always enforce management.

Case records store generic reason,not old/new topic/name text. Reservation precedes effect,then forced native exact property observation is required. API rejection can finish failed;unknown/accepted-but-unobserved/storage outcomes leave pending/uncertain cases blocking further rename/topic edits for this channel,no automatic retry. No-op creates no case. Already-applied change is not rolled back. Manager manual review/reconciliation is still a release gate. All acknowledgments private localized/no-ping shared embeds. Local native mocks only,not live Discord/rate-limit/visual acceptance.

## Confirmed empty voice-channel settings

`voicelimit channel value confirm:true` sets0-99usercapacity(0unlimited),`voicebitrate channel value confirm:true` sets8-96kbps,and `voiceregionauto channel confirm:true` clears fixedRTCregion to null. Normal voice channels only,not Stage. Requires opted-in voice runtime/initialready/safe shard/currentnative empty occupancy/exactchannel/exactfreshcaller/applicationbot/currentViewChannel+ManageChannels+app permission. No owner-only restriction:these are current channel-manager operations,unlike own VoiceMaster room controls. No member enumeration/display,moves,overwrites/access changes. Bitrate ceiling stays96kbps regardless of boosts.

Native case reservation before effect,forcedexactpostsetting observation,case completion only if matching. Unknown/acceptedbutunobserved/storage outcome pending/uncertain blocks further three setting changes here,no retry. Empty check has ordinary concurrency race:someone can join after last check;no disconnect or occupancy enforcement. Manual operator review remains releasegate. Native API methods inspected in installeddiscord.js14.27.0,local mocks only,not live voice/pixels acceptance.

## New thread defaults and one-way age restriction

`/channel threadarchive channel value confirm:true` sets new-thread default autoarchive minutes60/1440/4320/10080 on one normal text channel. `/channel threadslowmode channel value confirm:true` sets new-thread default slowmode0-21600seconds. Existing threads/messages are untouched. Values unsupported by the current server/native API can be rejected;no capability guarantee.

`/channel agerestrict channel confirm:true` marks one normal text channel age-restricted. This can change who can view the channel;it does not moderate or erase content. This path only enables the restriction,never removes it.

All three use current exact native actor/bot channel View+ManageChannels,application permission,server/channel identity,explicit confirmation and shared pending/uncertain metadata guards. One allowed property is edited,case before effect,forced exact post-observation before completed. Unknown outcomes freeze metadata edits pending manual operator review,no retry. No permission-overwrite/position/type changes. Three tests cover exact effects/no-op/locales,validation/confirmation/unknown blocking and invalid native/post/storage states. Installeddiscord.js14.27.0 GuildChannelManager edit maps default_auto_archive_duration/default_thread_rate_limit_per_user/nsfw;not live acceptance or clientpixel verification.
