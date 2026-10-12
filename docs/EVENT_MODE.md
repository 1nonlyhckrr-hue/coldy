# Bounded event mode

`/event setup`, `enable`, `disable`, `reset`, `config` are five installed paths. This is an owner-confirmed selected-channel visibility aid, not whole-server event isolation. Off by default.

## Setup and effects

Setup records an existing event category already explicitly visible to @everyone and 1-10 distinct normal text channels outside it, supplied as a JSON array of channel ID strings. The reference's minimum 100-member check is retained using Discord guild memberCount. No category, channel, role or member overwrite is created during setup. The bot must already have an explicit member overwrite allowing ViewChannel, ManageRoles and ManageChannels on every selected channel and the event category, plus native guild/channel permissions. Only the current guild owner may operate these paths; setup/enable/disable/reset each require confirm:true.

Enable changes only the selected outside text channels' @everyone ViewChannel bit to deny. The existing visible event category is checked, never edited. Already-denied channels are rejected before effects. This deliberately avoids editing a category whose inherited permissions could fan out to unknown children. Category children with separate visibility remain unchanged. Voice, threads, announcements, categories and unselected channels are not hidden. Other role/member allows and administrators can bypass the everyone deny. This is not a confidentiality boundary or a promise all members can see the event category.

## Owned restore and uncertainty

Before effects, persistent receipts reserve the exact full permission overwrite snapshots. Each channel is freshly fetched before the edit; identity, owner, bot permissions, explicit bot access, policy revision, parent placement and snapshot are checked. After an edit, a forced fetch must match precisely the expected one-bit change; unrelated changes freeze the operation. Other permission bits are never intentionally changed.

Disable only restores confirmed applied effects. The current complete overwrite list must exactly match the owned post-edit snapshot before restoration. A newly added everyone overwrite is removed only when that whole snapshot still matches. Existing everyone overwrites have only ViewChannel restored. Exact original snapshot must be observed afterward. Any changed overwrite, missing channel, lost permission, ambiguous native error or unverified result freezes the policy as uncertain. Restart freezes in-flight receipts. No automatic rollback, blind retry or automatic recovery is supplied. An operator must inspect and repair uncertain effects manually; Emika will not erase those receipts through reset. Multiple native writes are not atomic and can leave partial changes. Permission changes can still race the last check; post-effect detection cannot undo a concurrent overwrite already lost by Discord's merge mechanics.

Restoring may remove an inherited-channel permission sync state. Only overwrite contents are restored, not category inheritance linkage. Reset forgets only inactive, fully restored config/receipts. It never deletes channels or categories. Config returns private receipt statuses without permission snapshots; SQLite retains channel IDs and permission snapshots, not message content. Guild operations are bounded and one in-flight change per process is allowed.

## Reference closure

Source: https://docs.zynrax.site/configuration/eventmanager

- Setup/category + 12 channel creation: omitted for safety. Existing explicitly visible category and manually selected 1-10 outside normal text channels are required; no server-promo creation.
- Enable/all-other-channel hiding: adapted to selected outside normal text everyoneView denies. Whole-server/role isolation is omitted because role/member allows, admins, category inheritance and unknown channel types make that claim unsafe.
- Event category reveal/hide: omitted for safety; an already-visible event category is left unchanged to prevent unbounded inherited child changes.
- Disable/original permissions: adapted to exact-owned snapshot restoration, refusing drift or uncertainty. No unconditional serverwide restore.
- Reset/category deletion: omitted for safety. Reset forgets only fully restored inactive policy; never deletes the user's existing category/channels.
- Minimum 100 members: retained using Discord guild metadata; not a membership census.

Six local mock/persistence tests cover defaults, owner and input bounds, native identity/type/access checks, exact restoration, third-party drift, ambiguous effects/restarts and five command paths in all three locales. Native Discord execution, rate limits, category sync behavior and visual embeds remain unverified. No token or deployment was used.
