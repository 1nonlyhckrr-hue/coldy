# Member-confirmed activity rewards

Five paths: `/rankreward set`, `remove`, `config`, `eligible`, `claim`. No automatic grants. The guild owner explicitly configures at most10existing roles, each with a message or sampled-voice-minute threshold1-900000. Metrics are the retained90UTCday counters, not all-time activity or speaking quality. Message/voice tracking must be enabled and the claiming member must not be opted out of that metric. Eligibility is only the requesting member's own count.

Roles must have zero guild permissions, be unmanaged and below bot hierarchy. Owner identity, member/bot identity and native ManageRoles are rechecked. Zero guild permissions does not mean no channel access: channel overwrites can give a role private access. The configuring owner must review the role's current channel access before confirmation. Luna cannot certify every channel overwrite from a role alone. Role or channel permission changes after the grant can change what members can access.

Claim grants one selected configured role to the requesting human only, after explicit confirmation. Already-held roles are refused. A persistent guild/member/role receipt is reserved before effects. Immediately before the grant, Luna rechecks native role safety, policy revision, privacy, tracking and retained threshold. A forced fetch must show the member now has that exact role; role/policy/privacy/threshold checks follow. Unknown errors, post-effect changes or restart during reservation become uncertain and permanently block blind reclaims. A successful receipt also blocks automatic regrant if someone later removes the role. Rules may be removed/replaced, but receipts survive. Removing a rule never removes a member's role. Changing retention counts, opting out, erasing counts or dropping below threshold does not revoke an already-granted role.

This is one in-flight claim per guild/process. Native role grants are not compare-and-swap: a final-gap owner change, count reset or role-permission change can race the grant. Detection afterward freezes the receipt; it never silently removes a role or rolls back a grant. The bot does not assign invite rewards and cannot attribute an inviter exactly from ambiguous use-counter deltas.

SQLite stores rule role IDs, kind, threshold and revision, plus member/role receipt status and revision. No message contents or source message IDs are copied into reward records. Other leaderboard privacy/retention rules still apply. Private config/eligibility/claim JSON and localized embeds carry the explicit scope warning.

## Reference behavior closure

Source: https://docs.zynrax.site/configuration/leaderboard

- Message milestone role rewards: adapted to owner-configured zero-permission roles and explicit member claims against retained90day counts. No all-time milestone claim.
- Automatic message rewards: omitted for safety. A transparent member-confirmed grant avoids surprising permissions/access changes and prevents retry-based role reassignments.
- Voice role rewards: Luna extension using sampled connected minutes, not spoken audio or certified continuous presence, with the same explicit claim rules.
- Invite milestone roles: not implemented here. Automatic reward based on guessed inviter attribution is omitted for safety; invite family behavior mapping still needs its own closure ledger.
- Removal/regrant/revocation automation: omitted for safety. Another moderator's role removal is respected; receipt does not authorize regrant. Privacy/reset changes do not silently revoke a role.

Six local tests cover policy defaults/bounds/persistence/isolation, both metric grants/exact proof/receipt survival, roles/native guards, privacy/disabled/reset/retention/already-held checks, unknown/postproof/policy races/restart, and allfive paths in three locales. Native Discord grants, hierarchy changes, rate limits, channel access and visual embeds remain unverified. No token/deployment used.
