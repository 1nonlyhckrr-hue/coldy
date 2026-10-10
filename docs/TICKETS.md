# Private support tickets

Eight Luna paths: `/ticket setup`, `panel`, `open`, `claim`, `close`, `reopen`, `transcript`, `config`. Setup/panel/config require current Manage Server permission. Other paths check the current ticket owner, the ticket's recorded support role or a server manager. Claim/reopen require staff. Server administrators can always bypass channel restrictions; this is Discord behavior, not a promise of privacy from administrators.

Setup takes a server category and an unmanaged support role. It applies only to future tickets. Existing tickets retain their recorded support role, so changing setup does not silently disclose existing conversations to a new group. Panels carry an explicit notice that the support role and administrators can view tickets.

Channel creation uses explicit overwrites rather than category inheritance: everyone is denied View Channel, only the bot/owner/support role receive the reviewed permissions. The returned overwrite set is checked before activation. One unresolved ticket per member and 100 per guild; duplicate source interactions and concurrent opens are guarded in SQLite. An uncertain create blocks repeats pending operator review, avoiding duplicate private channels.

Close stores a bounded text transcript first, then changes the owner to read-only. Support staff retain access. Reopen restores owner writes. Unexpected overwrite changes stop close/reopen/transcript instead of overwriting arbitrary server changes or exporting content under uncertain privacy. Interrupted transitions remain uncertain after restart and require an operator to compare the channel with the database before repair. No blind channel creation or access-change retry.

Transcripts are UTF-8 JSON lines, not executable HTML. They include message content, author/message IDs, dates, attachment names/URLs and embed counts. Attachment URLs may expire. Embed contents are not exported. At most 1,000 recent messages and roughly 1 MB are exported; partial exports are labelled. They are stored locally in SQLite and returned as an attachment only in an ephemeral command response to the owner/support staff/manager, never a public log channel. Database backups therefore contain private ticket conversation data and must be protected. Closed transcripts reflect the history captured on close; later staff messages are not automatically appended.

Local tests cover exact overwrite sets, deny-everyone/read-only closure, guild isolation, duplicates, ambiguous creation, changed privacy, access denial, copied panels, transcript bounds, close/reopen, local language and eight command paths. No live Discord privacy test or rendered transcript UX test yet. HTML transcripts, added participants, multiple categories, delete/reset/edit/staff commands and retention tooling are not implemented. Reference inventory entries remain reference-only rather than marking a partial Luna module equivalent.

Reference: https://docs.zynrax.site/configuration/tickets
