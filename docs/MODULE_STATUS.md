# Module status: local checkpoint

32 top-level slash commands,133 executable paths,261 distinct automated tests passing. These are local mock/unit tests and SQLite persistence tests, not live Discord integration or visual tests. Full541 reference target remains unverified;319 documented reference paths are separate from these original Luna paths. No deployment/release.

| Required area | Current built scope | Major remaining work |
| --- | --- | --- |
| Antinuke | Configurable audit burst alerts, trust-user exclusions, replay-safe incidents | Prevention, safe intervention/recovery, live attribution and false-positive testing |
| AutoMod | Literal words, invite/HTTP links, spam, caps, mentions; warning record/single delete/bounded opt-in timeout | Richer policies,false-positive tuning,live limits |
| Automations | Persistent offset/named-zone one-time messages,elapsed repeats,cancel/list/config | Daily/weekly wall-clock timezone recurrence,richer tasks |
| Autoresponder | Exact/literal keyword create/edit/delete/config, cooldown, replay guard | Broader reference equivalence and live Message Content behavior |
| CustomRole | Safe existing-role mapping, eligibility gate, explicit self claim/release | Self-created role/customization, other-member assignment where authorized |
| Fun | 8-ball,coin,dice,choice,optional truth/dare,solo RPS | More reviewed safe games, multiplayer state if requested, external-media source vetting |
| General | Help,about,ping,uptime,server/user info,settings | Richer reference parity, translated slash/help metadata |
| Giveaway | Persistent starts/draws/rerolls/list/config, entrant button, validated winners | Full eligibility/config/retention/reference scope, live buttons and restart tests |
| Leaderboard | Opt-in retained message metrics, exclusions, stats/top/self-delete/personal opt-out/admin count erasure | Voice/invite tracking, rewards, rewards and richer data export controls |
| Logging | Configured case/action logs and six opt-in member/role/channel metadata events | Message/server/update event coverage, retention/privacy controls |
| Moderation | Single-member warns/timeouts/kick/ban/unban, case logs, exact-ID preview/confirmed bounded purge | Broader confirmed moderation operations and reference parity |
| Music | Prepared tested queue/direct-audio adapter core, protocol/source/provider research; no activation | No executable Music path yet; actual rights-cleared catalog and free node/source rights, queue/adapter/DAVE live validation,24/7 VC behavior |
| Permit | Additive persistent per-command user/role restrictions, recovery exemptions | Full channel/subcommand trust policy, reference-specific behavior |
| ReactionRoles | Safe single/multi button panel create/list/disable, self add/remove | Reaction variants/exclusive groups/panel edit/reconciliation |
| Ticket | Config/panel/open/claim/close/reopen/private TXT transcripts,stored-content retention/deletion | HTML/multiple categories/user access management/native delete/reconciliation |
| Utility | Avatar/public banner/role flags/current boosts/native polls/explicit same-channel AFK/role+emoji lists/user/server info/bot stats | Other verified practical utilities and richer inputs |
| Vanityroles | Current primary-guild identity manual self-refresh reward | Automatic tag update tracking, announcement behavior, uncertain-grant repair |
| Voice | Six single-member server voice actions, native access/case checks | Safe bulk/channel controls, voice role events |
| VoiceMaster | Explicit private owner channel create/config/rename/limit/empty close/observed-state repair/confirmed empty-channel lock-unlock | Join-to-create/invite access/transfer/safe orphan cleanup |
| Welcomer | Persistent welcome/goodbye text templates, events, locale defaults | Richer image/embed options, setup previews/live gateway verification |

The188-test source checkpoint is published at https://github.com/1nonlyhckrr-hue/coldy. Final head5a06a3f passed Node22/24 CI: https://github.com/1nonlyhckrr-hue/coldy/actions/runs/38081947689. All190 source files byte-verified against the audited local tree.13 normal commits, original history preserved; temporary archive/publisher removed. This is still not a live release.

Cross-module release gates: native live Discord permissions/hierarchy/rate limits, slash/buttons/menus/visual embeds, startup/restarts under real gateway events, current token/host setup, data retention/export/deletion and operator reconciliation for uncertain side effects. Never test or deploy against unrelated services. Local coverage percentage is not project completion percentage. No paid component or uptime claim.
