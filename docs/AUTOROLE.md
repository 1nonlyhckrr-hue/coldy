# AutoRole

Verified reference-led feature: https://docs.zynrax.site/configuration/roles/autorole . Original Emika implementation,not exact full benchmark equivalence. Native Discord acceptance pending.

- `/autorole add kind role`: future-join policy for humans/bots;up to10roles per group. Requires member events and fresh manager Manage Server + Manage Roles. Uses reviewed safe community permission allowlist,unmanaged/non-everyone roles below both manager and bot. Does not assign roles to existing members.
- `/autorole remove kind role-id`: exact saved policy removal including deleted role ID. Existing roles untouched.
- `/autorole reset kind`: humans,bots,all choices clear matching policies only. No role removal or receipt reset.
- `/autorole config`: private saved policy JSON,not native membership/grant proof.

On a recent verified join,forced member/role/bot/configuring-manager reads run twice;wrong guild/ID/join timestamp,bot-kind mismatch,lost authority/dangerous role/hierarchy/config revision change fail closed. Target server owner skipped. Bot must outrank target and role. Existing role is no-op. No retrospective member census or startup backfill. Setting/removing/resetting policies does not make native effects.

Each guild/member/join-timestamp/role effect has one persistent receipt,reserved before adding. Forced exact native post-observation verifies membership or leaves uncertain. Replays and reserved-restart ambiguity never retry. Receipt cleanup after30days;only events newer than5minutes accepted,so expired old join cannot replay. At startup reserved receipts become uncertain. No message alerts or DMs. Local unit/mock/SQLite tests are not native live verification.
