# Moderation reference closure - October12

This ledger maps every59documented moderation inventory row. Adapted does not mean literal reference parity,live acceptance or a new alias. Omitted rows have named safety/native-limit reasons. Reference inventory itself stays unchanged and is not promoted to equivalent implementation.

Source: https://docs.zynrax.site/security/moderation

| Reference | Disposition | Luna paths / reason |
| --- | --- | --- |
| ban | adapted | /moderation ban - One current target,permissions/hierarchy/case guards;keeps message history,not a bulk ban. |
| clearwarns | adapted | /moderation clearwarns - Marks warnings cleared,keeps audit cases;does not lift a native timeout. |
| clone | omitted (safety) | Exact channel clone cannot preserve message history,thread/access/integration state or certify permissions for all children;creating a seemingly equivalent channel would mislead operators. |
| delemoji | omitted (safety) | Irreversible guild asset deletion can break messages and integrations;no automatic asset destroy workflow. |
| delsticker | omitted (safety) | Reply-based sticker identity can be ambiguous and irreversible deletion breaks existing use;no guessed asset deletion. |
| enlarge | adapted | /enlarge - Currentguild custom emoji CDN image request4096,not Unicode/foreign-emoji guessing. |
| hide | omitted (safety) | General everyone overwrite edits can conflict with category inheritance,role/member allows and concurrent admin changes. No global visibility/isolation claim or unowned allow/reset. Event mode is only existingvisiblecategory+1-10selected normaltext exact-owned visibility;not this general command. |
| hideall | omitted (safety) | General everyone overwrite edits can conflict with category inheritance,role/member allows and concurrent admin changes. No global visibility/isolation claim or unowned allow/reset. Event mode is only existingvisiblecategory+1-10selected normaltext exact-owned visibility;not this general command. |
| kick | adapted | /moderation kick - One current target,permissions/hierarchy/case guards. |
| lock | omitted (safety) | General everyone overwrite edits can conflict with category inheritance,role/member allows and concurrent admin changes. No global visibility/isolation claim or unowned allow/reset. Event mode is only existingvisiblecategory+1-10selected normaltext exact-owned visibility;not this general command. |
| lockall | omitted (safety) | General everyone overwrite edits can conflict with category inheritance,role/member allows and concurrent admin changes. No global visibility/isolation claim or unowned allow/reset. Event mode is only existingvisiblecategory+1-10selected normaltext exact-owned visibility;not this general command. |
| mute | adapted | /moderation timeout - Explicit1s-28d native timeout,current target guards;no permanent punishment. |
| nick | adapted | /nickname - One confirmed bounded nickname/reset,current permissions/hierarchy/exact post-proof. |
| nuke | omitted (safety) | Deleting/recreating a channel irreversibly destroys messages and disrupts channel IDs,links,webhooks,threads and permissions;no automatic destructive server maintenance. |
| pb | omitted (safety) | Bot-only broad deletion not implemented;deleting bots can remove safety/moderation audit messages. Current exact-ID preview is unfiltered. |
| purge | adapted | /moderation purgepreview, /moderation purgeconfirm - Exact recent1-10IDs/120s confirmed deletion,not999messages or broad filters;no content retained. |
| purge user | omitted (safety) | Content/user-filtered broad deletion not implemented;current exact-ID recent10preview does not claim target-filter selection or999coverage. |
| removerole all | omitted (safety) | Automatic guild-wide/group role mutations can conflict with managed/automation roles,access policy and concurrent membership. Single explicit safe human add/remove remains. Avatar absence is not proof a person is unverified. |
| removerole bots | omitted (safety) | Automatic guild-wide/group role mutations can conflict with managed/automation roles,access policy and concurrent membership. Single explicit safe human add/remove remains. Avatar absence is not proof a person is unverified. |
| removerole humans | omitted (safety) | Automatic guild-wide/group role mutations can conflict with managed/automation roles,access policy and concurrent membership. Single explicit safe human add/remove remains. Avatar absence is not proof a person is unverified. |
| role | adapted | /role add, /role remove - Explicit confirmed add/remove for one human/safe-role allowlist,not ambiguous toggle or privileged automation-owned grants. |
| role all | omitted (safety) | Automatic guild-wide/group role mutations can conflict with managed/automation roles,access policy and concurrent membership. Single explicit safe human add/remove remains. Avatar absence is not proof a person is unverified. |
| role bots | omitted (safety) | Automatic guild-wide/group role mutations can conflict with managed/automation roles,access policy and concurrent membership. Single explicit safe human add/remove remains. Avatar absence is not proof a person is unverified. |
| role create | adapted | /role create - Creates one unassigned zero-permission role,no privileged permissions/position/grant. |
| role delete | omitted (safety) | Deletion destroys memberships/channel-overwrite links/integration dependencies without complete restoration;do not delete potentially automation-owned roles. |
| role humans | omitted (safety) | Automatic guild-wide/group role mutations can conflict with managed/automation roles,access policy and concurrent membership. Single explicit safe human add/remove remains. Avatar absence is not proof a person is unverified. |
| role rename | adapted | /role rename - One unmanaged safe-role confirmed metadata change,current hierarchy/post-proof. |
| role unverified | omitted (safety) | Automatic guild-wide/group role mutations can conflict with managed/automation roles,access policy and concurrent membership. Single explicit safe human add/remove remains. Avatar absence is not proof a person is unverified. |
| roleicon | omitted (native-limit) | Boost-dependent capability and remote image decoding/size/content need verified media handling;no blind remote fetch or unsupported icon claim. |
| slowmode | adapted | /slowmode - One confirmed normal text channel0-21600seconds,not every channel/type or bypassing native enforcement. |
| snipe | omitted (safety) | Retaining and resurfacing deleted message/attachment content violates deletion expectations and privacy;no deleted-content archive. |
| unban | adapted | /moderation unban - One explicit user ID,native BanMembers/case/no-retry guards;not full-list clearing. |
| unbanall | omitted (native-limit) | No ban generation/version is exposed by native ban records. An exact ID/reason preview cannot distinguish an intervening unban/reban with the same reason;batch clearing could undo a newer moderator decision. Single explicit unban remains available;whole-list automaticclear omitted. |
| unhide | omitted (safety) | General everyone overwrite edits can conflict with category inheritance,role/member allows and concurrent admin changes. No global visibility/isolation claim or unowned allow/reset. Event mode is only existingvisiblecategory+1-10selected normaltext exact-owned visibility;not this general command. |
| unhideall | omitted (safety) | General everyone overwrite edits can conflict with category inheritance,role/member allows and concurrent admin changes. No global visibility/isolation claim or unowned allow/reset. Event mode is only existingvisiblecategory+1-10selected normaltext exact-owned visibility;not this general command. |
| unlock | omitted (safety) | General everyone overwrite edits can conflict with category inheritance,role/member allows and concurrent admin changes. No global visibility/isolation claim or unowned allow/reset. Event mode is only existingvisiblecategory+1-10selected normaltext exact-owned visibility;not this general command. |
| unlockall | omitted (safety) | General everyone overwrite edits can conflict with category inheritance,role/member allows and concurrent admin changes. No global visibility/isolation claim or unowned allow/reset. Event mode is only existingvisiblecategory+1-10selected normaltext exact-owned visibility;not this general command. |
| unmute | adapted | /moderation untimeout - One current target timeout clear,case guards;native state not compare-and-swap. |
| unmuteall | adapted | /bulktimeout preview, /bulktimeout confirm - Adapted to1-10explicit human IDs/exact current deadline preview/120s confirmed clear;serverwide selection omitted safety. |
| unslowmode | adapted | /slowmode - Adapted to explicit seconds0 with confirmation;no separate alias inflation. |
| warn | adapted | /moderation warn - Stored warning/case only;automatic4+warning timeout omitted safety to avoid unreviewed punishment from accumulated/reset/edited history. |
| voice deafen | adapted | /voice deafen - One current normalvoice human,server deafen not client self-deafen. |
| voice deafenall | omitted (safety) | Automatic group occupancy selection/mass effects can chase changing membership or erase another moderator decision. Single explicit native voice actions remain;no unreviewed group punishment/moves. |
| voice kick | adapted | /voice disconnect - One exact current normalvoice human disconnect with runtime/hierarchy/permission guards. |
| voice kickall | omitted (safety) | Automatic group occupancy selection/mass effects can chase changing membership or erase another moderator decision. Single explicit native voice actions remain;no unreviewed group punishment/moves. |
| voice lock | omitted (safety) | General voice-channel permission rewrites omitted;can affect unrelated occupants and inheritance. Owned empty VoiceMaster lock/unlock is a separate narrow workflow,not general channel isolation. |
| voice move | adapted | /voice move - One exact current normalvoice human,destination access/capacity/runtime/hierarchy guards. |
| voice moveall | omitted (safety) | Automatic group occupancy selection/mass effects can chase changing membership or erase another moderator decision. Single explicit native voice actions remain;no unreviewed group punishment/moves. |
| voice mute | adapted | /voice mute - One current normalvoice human,voice runtime/readiness/access/hierarchy,server mute not self-mute. |
| voice muteall | omitted (safety) | Automatic group occupancy selection/mass effects can chase changing membership or erase another moderator decision. Single explicit native voice actions remain;no unreviewed group punishment/moves. |
| voice private | omitted (safety) | General voice-channel permission rewrites omitted;can affect unrelated occupants and inheritance. Owned empty VoiceMaster lock/unlock is a separate narrow workflow,not general channel isolation. |
| voice pull | adapted | /voice move - Adapted to explicit destination voice channel,not automatic current-caller channel guessing. |
| voice pullall | omitted (safety) | Automatic group occupancy selection/mass effects can chase changing membership or erase another moderator decision. Single explicit native voice actions remain;no unreviewed group punishment/moves. |
| voice undeafen | adapted | /voice undeafen - One current normalvoice human,server deafen clear. |
| voice undeafenall | omitted (safety) | Automatic group occupancy selection/mass effects can chase changing membership or erase another moderator decision. Single explicit native voice actions remain;no unreviewed group punishment/moves. |
| voice unlock | omitted (safety) | General voice-channel permission rewrites omitted;can affect unrelated occupants and inheritance. Owned empty VoiceMaster lock/unlock is a separate narrow workflow,not general channel isolation. |
| voice unmute | adapted | /voice unmute - One current normalvoice human,server mute clear;not self-microphone override. |
| voice unmuteall | omitted (safety) | Automatic group occupancy selection/mass effects can chase changing membership or erase another moderator decision. Single explicit native voice actions remain;no unreviewed group punishment/moves. |
| voice unprivate | omitted (safety) | General voice-channel permission rewrites omitted;can affect unrelated occupants and inheritance. Owned empty VoiceMaster lock/unlock is a separate narrow workflow,not general channel isolation. |

## Behavior details beyond inventory syntax

- Warning auto4+timeout:explicitly omitted for safety;historical/edited/reset warning counts are not permission for another native punishment.
- Purge images/embeds/files/customemoji/contains/reactions:explicitly omitted for safety. Content-selection races,reaction removal semantics and broad irreversible deletion need a separate exact preview design. Current unfiltered10message deletion is not proof those filters work.
- Purge999messages:omitted for native/safety bounds. Discord bulk delete has per-call bounds and old-message restrictions;Luna uses recent13day1-10exact IDs,skips pinned/system and requires120sconfirm. No quantity silently increased.
- Lock/hide bypasses:everyone denials are not confidentiality or complete isolation because roles/member allows/admins can bypass;general lock/hide is omitted,not sold as secured.
- Generalvoice privacy/lock is not own VoiceMaster control. Existing own-room access controls remain documented separately.
- Group roleunverified based on no avatar:classification omitted safety;avatar absence proves neither verification nor trust.
- No delete/clone operation or counter-only fake grant is introduced to make the installed count resemble a reference.

Evidence:machine ledger data/moderation-closure.json;current installed data/luna-commands.json;referenced module docs and current source services inspected. Ledger tests enforce59unique reference rows/exact syntax/source/current installed adapted paths/explicit omission reasons. All code remains local/mock verified;native Discord/UI/rate limits/deployment gates are separate.
