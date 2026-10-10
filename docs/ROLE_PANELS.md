# Self-service role panels

Commands: `/reactionroles create`, `list`, `disable`. This implementation uses Discord buttons, not emoji reactions. One safe role per panel. Existing emoji-reaction parity is not claimed.

Requires Manage Roles to configure and Manage Roles for Luna. Role/channel permissions and hierarchy are refreshed before publishing. Every click re-fetches the member, role and bot and refuses unsafe or deleted roles. Only a reviewed set of basic community permissions is allowed; new/unknown staff permissions are rejected by default. Managed/everyone roles, role hierarchy violations, foreign/copied messages and disabled panels are refused.

Panels are stored with their original guild, channel, message, role and status. Storage reservations precede sending. A send failure is marked uncertain, without auto-retry. A send followed by database finalization failure leaves an inactive record and explicit warning. Disable changes the stored gate; the old button can remain visible but refuses role changes. No hidden staff permissions or additional role grants occur.

Clicks are serialized per guild/member within the process and use a cooldown. Deploy one replica; multi-process serialization is not supported. Existing roles are toggled; API failure tells the member to check current roles before retrying. No promised exactly-once role toggle after a crash.

Local tests cover dangerous permissions, hierarchy, managed/foreign roles, duplicate panel publication, uncertain sends, grant/revoke, cooldowns, copied messages, disabled panels, deleted roles and API failures. No live Discord verification yet.
