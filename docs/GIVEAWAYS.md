# Giveaways

Five installed Emika paths: `/giveaway start`, `end`, `reroll`, `list`, `config`. Manage Server is required and refreshed before each management action. Start accepts destination, prize text, minutes, winners and an optional required role. Emika records the described prize but does not buy, transfer or deliver it.

Limits: 1-20 winners, 1 minute to 30 days, 1,000 entries, 20 unresolved giveaways per guild. Bot entries are refused. Entry buttons must match the original stored message/channel/guild. Optional role membership is checked on entry and again before drawing; current server membership is also checked again. Missing members are excluded. Network errors stop a new draw rather than silently treating members as ineligible.

Giveaways, entries, end times, draw versions and winners are persisted in SQLite. Duplicate entries and duplicate create interactions are prevented. Random winners are sampled without replacement using Node's cryptographic random generator. If fewer eligible entrants exist, fewer winners are returned; an empty result is stated honestly.

Emika checks due records once per minute while online and catches up after restart. Winners are saved before editing the original giveaway message. Failed edits leave an ending record; the same stored winners are used on retry, never a new draw. A sent-but-unconfirmed creation remains uncertain and must be checked by the operator. No blind creation retry occurs. Result edits disable the entry button and do not ping winners, roles or everyone.

`end` supports early ending. `reroll` applies only to ended giveaways and excludes the immediately previous winners, not all historical winners. Results carry a draw version. A retry of an interrupted ending only republishes the stored draw. List shows ten records per page, from the newest 100 stored records. Config describes runtime policy.

Local tests cover schema, isolation, duplicate protection, bounded unique sampling, joins, late joins, current eligibility, vanished members, network failures, stored-result retries, button message matching, bots, locale output, scheduler lifecycle and all five management paths. Live Discord button and restart behavior has not been tested yet. Prize policy, giveaway staff-role grants, banner customization and cancellation commands are not implemented. Emika slash syntax is original; the nine verified Zynrax reference paths are not marked equivalent or fully implemented.

Reference: https://docs.zynrax.site/miscellaneous/giveaway

## Inspect, stop and erase entrant records

`inspect id` privately shows stored prize/state/destination/deadline/maxwinners/drawversion and entrant count,no entrant IDs/live membership/eligibility/delivery proof. `cancel id confirm:true` changes only active stored status to cancelled,preventing future entries and draws. No pending/ending/uncertain/ended cancellation or publish rollback. Native announcement/button remains visible but cannot accept entries. This deliberately does not publish a cancellation notice or modify/delete native messages. Entrants retained until explicitly erased. A draw that has already reached ending is not cancelled.

`forgetentries id confirm:true` erases entrant IDs only for ended/cancelled giveaway. Keeps prize/metadata/winnerhistory/cases/native messages. Future rerolls cannot use erased entrants,so may produce no winners. Existing winnerIDs are not erased,explicitly disclosed. Not secure erase of backups/native announcements. Current exact ManageGuild required for all three paths;private localized no-ping replies. Cancelling during async eligibility causes draw state check to reject before publication. Local mocks only,no native button/visual acceptance.

## Bulk stored giveaway controls

`/giveaway cancelall confirm:true` cancels every active stored giveaway only. Pending/ending/uncertain states remain,no native message/button update or announcement,no entrant deletion. In-flight draws may finish.

`forgetfinishedentries confirm:true` erases entrant IDs only for ended/cancelled giveaways in this server. Other states,stored winner history,native messages and other servers remain. Later rerolls lose erased candidates.

`export` privately attaches latest100stored giveaway records with total/truncated:prize,state,channel/message binding,deadline,winner-count and required-role setting. No entrant/winner/staff/source IDs. Keep authored prize/bindings private;not full backup or native message readiness. Fresh native Manage Server before reading/writing,private3locale/no-ping. Three tests scope/state/native-binding retention,isolation/exporttruncation/databaseabort and authority/confirmation/attachmentbytes. No live/client visual acceptance.

## Scoped minimal metadata

`inspectmetadata id` returns exact stored giveawayID/channel/state/due/winnerCount/drawVersion/created metadata or JSONnull;`channelmetadata channel-id` returns latest100samefields for exactstoredchannel,total/truncated;`exportunresolved` returns latest100pending/ending/uncertain records. No prize,winner/member/sourceIDs,draw/retry/cleanup or native existence/delivery/eligibility proof. FreshManageGuild/private3locale branded no-ping JSON,nonmutating/guildisolated. IDs of deletedchannels permitted,no native targetlookup.3tests exact/null/isolation/bounds/minimalkeys/100truncation/statefilter/privatepermissionbytes.
