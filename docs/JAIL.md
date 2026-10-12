# Bounded timeout jail

Six paths: `/jail setup`, `config`, `reset`, `apply`, `release`, `list`. Off by default. This is a named native timeout policy, not role-stripping jail or single-channel isolation.

Owner-confirmed setup records one existing normal text reference channel. It creates nothing and does not change roles or permissions. Applying jail requires explicit confirmation, a current human member, 1s-28d duration and a reason. Current actor/bot ModerateMembers, native bot/target identity, member moderatable state and actor/bot hierarchy are fetched again before effects. Self, bot, owner, bot-user, admin, foreign member and an existing live timeout are rejected. At most100nonexpired/uncertain records per guild; one in-flight jail mutation per guild/process.

A persistent moderation case and jail receipt precede the absolute native timeout. Forced member fetch must observe exactly the expected millisecond deadline. Manual release only clears the exact still-current active owned deadline, never a timeout that another moderator changed. Native timeout blocks talking/reactions/voice participation across the server, including the reference jail channel. No communication exemption is claimed. Roles stay unchanged. Timeout is not removal from the server or a confidentiality boundary.

Discord enforces timed expiry, including when Luna is offline. List/setup/reset/apply settle past confirmed deadlines to expired metadata locally, without another Discord action. List returns at most25active/uncertain member IDs, deadlines and statuses privately, plus the total. SQLite also keeps the reason and case ID; cases retain actor/target/reason as ordinary moderation history. No message contents are stored. No member-leave event is needed for expiry. An expired receipt does not establish the member's present native state; a new apply still checks the actual current timeout.

Ambiguous submit, unverified proof, native permission loss after reservation or storage failure marks uncertain or leaves a pending case. In-flight restart receipts become uncertain. Existing uncertain/pending jail cases block later attempts even if a member record was not persisted. No blind retries or automatic rollback. Active/uncertain records block policy changes/reset; expired/released member history remains. Third-party timeout drift blocks manual release without clearing it. Last-check races remain: Discord has no compare-and-swap timeout endpoint, so a concurrent moderator change in the final gap could be overwritten; post-effect proof cannot repair it.

## Reference behavior closure

Source: https://docs.zynrax.site/security/jail

- Interactive setup with jail role/channel: adapted to direct confirmed existing reference channel. Interactive menu and jail role configuration are omitted because this safe version never changes roles/channel overwrites.
- Strip all roles/assign jail role/single channel access: omitted for safety. Removing all roles can conflict with managed roles, hierarchy, role automation, member departures and concurrent moderator changes; reliable original-role restoration cannot be promised. Native timeout replaces that punishment without changing roles. It also blocks the reference channel, which is stated explicitly.
- Finite jail duration: implemented as absolute native timeout 1s-28d. Discord expiry works offline. Longer/permanent jail is omitted for native timeout limits rather than silently extending punishment.
- Unjail/original role restoration: adapted to exact-owned timeout release. No original roles need restoring because none are removed. Drift and uncertain receipts require operator inspection rather than overwriting another moderator's punishment.
- List remaining time: private active/uncertain deadline metadata, capped25rows with total. Confirmed past deadlines expire locally.
- Config/reset: stored policy inspection and owner-confirmed reset only without active/uncertain records. Reset does not clear active native punishment or historical cases/receipts.

Seven local tests cover defaults/persistence/isolation, exact apply/release/cases, third-party deadline drift, permission/type/hierarchy/input guards, ambiguous effects/restart, expiry and allsix command paths in English/Hindi/Hinglish. Native Discord timeout behavior, permission changes and visual embeds remain unverified. No token or deployment was used.
