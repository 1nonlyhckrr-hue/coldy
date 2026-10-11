# customrole

Reference-only inventory, not installed Luna functionality. Permissions not stated in sources remain unknown. Search by command name using your editor or filter the JSON/CSV.

## friend

```text
,friend @Montage
```

Once you have configured a role and hold the `Required Role`, you can toggle it on any member.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## girl

```text
,girl @Montage
```

Once you have configured a role and hold the `Required Role`, you can toggle it on any member.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## guest

```text
,guest @Montage
```

Once you have configured a role and hold the `Required Role`, you can toggle it on any member.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## setup config

```text
,setup config
```

View which roles are currently set up.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## setup create

```text
,setup create <name> <@role>
```

Map a command name to a specific role.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## setup delete

```text
,setup delete <name>
```

Remove a custom role command.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## setup friend

```text
,setup friend <role>
```

Configure the roles for Staff, Girl, VIP, Guest, or Friend slots.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## setup girl

```text
,setup girl <role>
```

Configure the roles for Staff, Girl, VIP, Guest, or Friend slots.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## setup guest

```text
,setup guest <role>
```

Configure the roles for Staff, Girl, VIP, Guest, or Friend slots.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## setup list

```text
,setup list
```

Check all active custom role commands.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## setup reqrole

```text
,setup reqrole <role>
```

This role is **required** for any member to use the toggle commands.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## setup staff

```text
,setup staff <role>
```

Configure the roles for Staff, Girl, VIP, Guest, or Friend slots.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## setup vip

```text
,setup vip <role>
```

Configure the roles for Staff, Girl, VIP, Guest, or Friend slots.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## staff

```text
,staff @Montage
```

Once you have configured a role and hold the `Required Role`, you can toggle it on any member.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom

## vip

```text
,vip @Montage
```

Once you have configured a role and hold the `Required Role`, you can toggle it on any member.

Aliases: not documented. Reference verified: yes. Implemented: no. Tested in Luna: no.

Source: https://docs.zynrax.site/configuration/roles/custom


Original Luna `/customrole clear confirm:true` deletes this guild's mapping records only. It requires freshly fetched exact actor ManageRoles. Existing Discord roles,assignments,eligibility gate and case history remain unchanged. Other guilds are untouched. False confirmation/storage failure produces no native effect.

Original Luna `/customrole creation enabled confirm:true` requires current ManageRoles and explicitly enables/disables native member role creation. Default disabled. `/customrole createown label [hex]` creates one unassigned role with zero permissions,no hoist/no mentionable,verified current role shape/hierarchy. One durable record per guild/member,50records/guild. Eligibility gate applies. Creation is reserved before REST;unknown outcomes/restarts become uncertain and block retries. No automatic role assignment,delete,rollback or repair. Operators must inspect uncertain records;no reconciliation command yet. Source: https://docs.discord.com/developers/resources/guild . Discord's create-role default inherits everyone permissions,so Luna explicitly passes0n. Assignment/customization and actual native behavior remain unverified.

Creation identity checks bind guild,member and bot to the interaction. After REST creation Luna refetches the bot to verify current ManageRoles/hierarchy;zero-row durable completion is uncertain,never success.294 local tests cover these identity/state races;live Discord acceptance still required.

Original `/customrole created` privately reads your own stored creation record. `/customrole creations [page]` requires fresh exact ManageRoles and privately pages ten records,up to five pages:IDs/localized state only,no user-authored labels. Output explicitly distinguishes stored state from current Discord validation. These are read-only diagnostics,no native reads/writes,no automatic retries or uncertainty repair.

Created-role flow records the observed returned role ID before further native checks. If fetch,shape validation or finalization fails,the stored ID remains available in private diagnostics with uncertain status. An observed ID is not verified success. Recording requires one pending row;failure stops follow-up checks/assignment. No operator repair command yet.

Original `/customrole claimown` and `/customrole releaseown` explicitly assign/remove your own previously verified created role. Creation remains unassigned by default. Claims need current enabled policy/eligibility;release does not need policy/gate. Both force-fetch exact member/bot/role,guild bindings,zero permissions/unmanaged/no hoist/no mentionable/bot hierarchy. Case reservation precedes native effect;pending/uncertain assignment records block further changes until operator review. No role deletion or other-member assignment. Completed cases protect same-interaction replay. Source: https://docs.discord.com/developers/resources/guild . Earlier unassigned-only/assignment-not-built notes describe prior checkpoints;311 checkpoint adds these explicit separate self actions. Native acceptance/reconciliation/customization remain pending.

316 checkpoint adds `/customrole reconcile member confirm:true` for observed uncertain creation only. Exact native shape/original name/color/hierarchy/current manager and bot checked;conditional stored status repair only. No unknown-ID guessing,no native effects,no assignment-case clearing. Earlier no-reconcile notes describe old checkpoints.
