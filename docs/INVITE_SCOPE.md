# Invite behavior closure

Source: https://docs.zynrax.site/configuration/leaderboard

Luna provides `/inviteinfo`, a private read-only snapshot of the requesting human's own current active invite codes and native usage counters. The bot needs current ManageGuild permissions. Native guild/member/bot identity is checked;other members' invites,foreign guild metadata and expired invites are excluded. Up to25records with explicit total/truncated metadata,from at most1000native invite rows. No invite history or join attribution is persisted. Codes are server access links;the private localized response warns the member before they share the JSON. Counters are native code uses,not verified successful joins or exact inviter identity.

## Each documented invite behavior

| Reference behavior | Luna disposition | Reason |
| --- | --- | --- |
| Invite tracking on/off | Omitted | No join-attribution tracker is installed. A switch pretending to enable it would be misleading. Native invite-info reads work without retained tracking. |
| Joins/leaves/rejoins stats | Omitted for native limits | Discord member-join events do not carry the used invite code. Invite-use counter deltas can race concurrent joins,deleted/single-use invites,vanity links and offline gaps. A guessed inviter would miscredit or penalize real members. |
| Fake/alt invite counts | Omitted for safety | Account age is not proof an account is fake or abusive. No automated fake/alt labels or rewards/punishments based on them. |
| All-time invite leaderboard | Omitted for native limits/privacy | Without reliable attribution,rankings misstate members' contributions. No indefinite join/person relationship history is collected. |
| Regular invite leaderboard | Omitted for native limits | Counter delta does not prove successful regular joins,departures or exact inviter ownership. |
| Fake invite leaderboard | Omitted for safety | Would publicly label people as fake/alt based on unsupported inference. |
| Exact inviter search | Omitted for native limits | Exact used-invite identity is absent from member-join event;do not manufacture an answer. |
| Paginated invited-member list | Omitted for native limits/privacy | No verified inviter-to-member relationship exists and no such relationship history is stored. |
| Invite info owned by member | Adapted/implemented | `/inviteinfo` shows only the requester their own current active native codes and usage metadata privately,cap25,total,truncated. Not other members' code lookup or historical contribution proof. |
| Automatic invite milestone role | Omitted for safety/native limits | Native uses are not reliable successful-join attribution. No permissions/access grant based on guessed inviter counts. |
| Alt account-age threshold | Omitted for safety | An account-age threshold cannot truthfully classify fake accounts. |
| Clear all tracked invite stats | Omitted | No tracked join attribution database exists to clear. This command must not delete actual invite codes. |
| Reset my tracked invites | Omitted | No persistent own invite stats exist;native invite counters cannot be reset by Luna without deleting/recreating access links. |

The above intentionally closes the documented invite behaviors as safe adaptations or explicit safety/native omissions,not literal reference parity. An opt-in approximate invitation analytics tracker could be a future separately reviewed feature,but is not silently substituted for exact attribution. No native invites are created,deleted,revoked or shared with other members.

Four local tests cover own-only native reads,privacy/locales/emptydata,metadata/identity/permission guards,last-member departure and explicit cap/total. Native Discord invite fetch behavior and visual embeds remain unverified. No token or deployment used.
