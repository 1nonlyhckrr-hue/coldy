# CustomRole: local checkpoint

Fourteen original Luna paths:map,unmap,required,clear,list,claim,release,creation,createown,created,creations,claimown,releaseown,reconcile. These are not claimed exact reference equivalents. Local tests are not live Discord acceptance.

## Existing-role mappings

Map existing reviewed roles to stable names,not dynamic slash commands. Names:lowercase letter first,1-24 letters/digits/_/-. Maximum20 mappings/guild;one name/role. Fresh exact actor ManageRoles for config. Native role identity/guild,safe permission whitelist,bot/actor hierarchy checked. Managed roles/@everyone refused. Eligibility gate cannot overlap mapping;claims require gate,release does not. Unmap/confirmed clear remove only mapping records,not native roles/assignments/gate/cases. Unsafe edited roles remain manager-review only,even for release. No mass revoke.

## Member-created roles

Default disabled. Fresh manager `/customrole creation enabled confirm:true` opts in/out. `/customrole createown label [hex]` creates one UNASSIGNED role/member with explicit zero permissions,no hoist/no mentionable. Names1-32,no @/controls;color optional six hex digits. Maximum50 durable records/guild includes uncertain records. Gate applies. Exact member/bot/guild,current ManageRoles and app permission verified;reserve before native create. Returned observed ID is stored before force-fetch shape verification. Bot force-refetched post-create;current hierarchy/permission required. Completion must update exactly one pending row. Failed/unknown checks retain uncertain record and any observed ID,no automatic retry,assignment,rollback or deletion. Restart in-flight creation becomes uncertain.

`created` privately shows your own record. Manager-only `creations [page]` privately pages ten records,total50:IDs/localized stored state only,no owner-authored labels. Stored state is explicitly not current native validation. Unknown role ID cannot safely be recovered by guessing names.

## Explicit created-role self actions

`claimown`/`releaseown` act only on requester's verified created role. Creation does not assign automatically. Fresh exact member/bot/role and guild bindings,zero permissions/unmanaged/no hoist/no mentionable/bot hierarchy required. Claim requires enabled policy/current eligibility;release does not require policy/gate. Recheck stored creation/config after async validation. Pending/uncertain own-effect case blocks further self changes pending operator review. Case reserved before native add/remove. Definitive native rejection recorded failed;unknown result uncertain;accepted effect with failed finalization leaves blocking pending state. Completed cases prevent same interaction replay. State survives SQLite reopen. No automatic retries.

## Remaining gates

Created-role customization and assignment-case reconciliation still absent. No role delete,other-member assignment,automatic uncertainty repair or reference parity claim. Current safety checks may block release of a role edited by managers into an unsafe state;manager must inspect/remove it. All payloads private,mentions disabled,shared EN/HI/Hinglish embeds;slash metadata English.358 distinct project tests pass,37 top-level156 installed paths,SQLite24. Native permissions/hierarchy/gateway/rate limits and actual embed pixels remain unverified. No deployment.

Native source: https://docs.discord.com/developers/resources/guild . Create-role omitted permissions inherit @everyone,so Luna passes explicit0n. Add/remove member role requires ManageRoles.

## Observed creation reconciliation

`reconcile member confirm:true` repairs stored uncertain creation status only. Previously observed ID mandatory:no supplied/guessed attachment,missing/deleted role remains blocked. Fresh exact manager/bot/guild and ManageRoles/app permissions;exact current observed role with original name/color,zero permissions,no managed/hoist/mentionable and actor/bot hierarchy. Atomic conditional status update includes original role ID/name/color;race fails closed. No native mutations or assignment-case clearing. Policy/gate remain unchanged. Native operator acceptance still pending.
