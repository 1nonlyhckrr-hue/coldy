# VoiceMaster reconciliation

`/voicemaster reconcile confirm:true` checks only your existing recorded channel ID, using forced native fetch. No guessing name matches or adopting arbitrary channels. Exact guild/channel/type and minimal private overwrite checks must pass, plus current bot Manage Channels. Present verified channel repairs recorded state to active. Native observed null or Unknown Channel404 repairs to closed so another explicit open is possible. Other403/network/ambiguous responses do not change state.

This performs local database repair only. No channel creation/deletion/movement/overwrite edits. Caller is recorded owner; lock shared with open/edit; stored row is checked again after fetch. Case is written before atomic status/case completion. Unknown creation with no stored ID remains blocked for manual operator investigation; auto freeing it could leak duplicate channels.

Five new tests cover present/missing/denied/network/foreign/drift/noID/confirmation, races, transaction failure, duplicate source and locales.209 full-project tests pass; real Discord404/fetch permission behavior and visual replies remain unverified. No automatic orphan deletion, member-join-create or additional audience access is claimed.
