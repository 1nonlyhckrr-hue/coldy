# Private support tickets

Eight Luna paths: `/ticket setup`, `panel`, `open`, `claim`, `close`, `reopen`, `transcript`, `config`. Setup/panel/config require current Manage Server permission. Other paths check the current ticket owner, the ticket's recorded support role or a server manager. Claim/reopen require staff. Server administrators can always bypass channel restrictions; this is Discord behavior, not a promise of privacy from administrators.

Setup takes a server category and an unmanaged support role. It applies only to future tickets. Existing tickets retain their recorded support role, so changing setup does not silently disclose existing conversations to a new group. Panels carry an explicit notice that the support role and administrators can view tickets.

Channel creation uses explicit overwrites rather than category inheritance: everyone is denied View Channel, only the bot/owner/support role receive the reviewed permissions. The returned overwrite set is checked before activation. One unresolved ticket per member and 100 per guild; duplicate source interactions and concurrent opens are guarded in SQLite. An uncertain create blocks repeats pending operator review, avoiding duplicate private channels.

Close stores a bounded text transcript first, then changes the owner to read-only. Support staff retain access. Reopen restores owner writes. Unexpected overwrite changes stop close/reopen/transcript instead of overwriting arbitrary server changes or exporting content under uncertain privacy. Interrupted transitions remain uncertain after restart and require an operator to compare the channel with the database before repair. No blind channel creation or access-change retry.

Transcripts are UTF-8 JSON lines, not executable HTML. They include message content, author/message IDs, dates, attachment names/URLs and embed counts. Attachment URLs may expire. Embed contents are not exported. At most 1,000 recent messages and roughly 1 MB are exported; partial exports are labelled. They are stored locally in SQLite and returned as an attachment only in an ephemeral command response to the owner/support staff/manager, never a public log channel. Database backups therefore contain private ticket conversation data and must be protected. Closed transcripts reflect the history captured on close; later staff messages are not automatically appended.

Local tests cover exact overwrite sets, deny-everyone/read-only closure, guild isolation, duplicates, ambiguous creation, changed privacy, access denial, copied panels, transcript bounds, close/reopen, local language and eight command paths. No live Discord privacy test or rendered transcript UX test yet. HTML transcripts, added participants, multiple categories, delete/reset/edit/staff commands and retention tooling are not implemented. Reference inventory entries remain reference-only rather than marking a partial Luna module equivalent.

Reference: https://docs.zynrax.site/configuration/tickets

## Stored-content retention

SQLitev19: stored transcript snapshots expire after30days by default. `retention days confirm` requires current Manage Server,days1-30,true confirmation. Applies this server policy,immediately prunes its expired snapshots. Cleanup also runs startup,before transcript save/access. No continuous cleanup clock yet;idle DB bytes may stay past expiry until next access/restart,though export always prunes first. SQLite deletes rows,not forensic secure erasure;backups/filesystem/exports may contain copies.

`forgettranscript confirm` requires current owner/support/staff access to the current tracked ticket plus exact forced native channel/privacy checks. Deletes only stored snapshot. Does not alter native messages,access,channel or exported copies. Open close/export can capture history again later. Closed erased/expired snapshot returns missing instead of silently recapturing. Minimal ownership/case metadata retained. No full-user-erasure promise.

Privacy checks now bind exact recorded channel ID and overwrite principal type,as well as bitfields. Four new tests;224 full-project tests pass. Live provider privacy and visual transcript flow still unverified. No HTML transcript,guest access,user add/remove,channel-delete,or uncertain-state adoption is implemented by this change.
