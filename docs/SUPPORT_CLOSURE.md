# Ticket and giveaway reference closure - October 12

All 23 documented command rows mapped:14 tickets and9 giveaways.12 adaptations and11 explicit safety omissions. Slash paths are not prefix or full-scope equivalence.

| Reference | Disposition | Luna paths / reason |
| --- | --- | --- |
| gconfig | adapted | /giveaway config - Private current manager view of runtime policy/limits, not nonexistent staff-role/banner settings. |
| gembed reset | omitted | Global banner reset omitted with safety-limited unsupported custom banner state; must not overwrite all native announcements under guessed ownership. Existing fixed Luna presentation remains. |
| gembed set | omitted | Giveaway global URL/upload banner customization omitted for safety: no reviewed remote-image audience/privacy policy, byte validation or durable owned-message update proof. Fixed branded Luna embeds only. |
| gend | adapted | /giveaway end - Explicit positive stored record ID in this guild, not replied/guessed message. Current eligibility checked; bounded stored draw saved before original-message edit. Early end supported, unknown/newdraw failures fail closed. |
| glist | adapted | /giveaway list - Private manager view, two full-prize records per page from latest100 stored records with scope/truncation labels. Not every live active giveaway or proof of eligibility/delivery. |
| greroll | adapted | /giveaway reroll - Explicit ended stored record ID, not reply inference. Fresh eligibility, cryptographic unique selection excludes immediately previous winners only. Persisted draw version reused on publish retry. |
| gstaff reset | omitted | Staff grant reset omitted with safety-limited unsupported delegated-role grants; native permission changes remain server operator work, never automatic role edits. |
| gstaff role | omitted | Delegated giveaway staff-role grants omitted for safety: no source-grounded role-specific permission/revision model for draw/reroll/disclosure authority. Current native Manage Server required, not blanket Administrator. |
| gstart | adapted | /giveaway start - Explicit existing output destination, minutes1-43200, winners1-20, prize text and optional role. Up to1000 entries/20unresolved; fresh manager, persisted announcement binding, no prize purchase/delivery. |
| ticket addcategory | omitted | Multiple ticket-type creation omitted for safety: no durable per-type audience/revision policy, so silently multiplying private support audiences is not allowed. One explicitly reviewed category/support-role configuration only. |
| ticket adduser | omitted | Guest access widening omitted for safety: transcript authorization and exact overwrite ownership bind owner/stored support role only; no durable participant consent/revocation model exists. |
| ticket categories | omitted | Multi-type category listing omitted with the safety-limited single configuration. Config displays the chosen base setup, not a fabricated three-type catalogue. |
| ticket close | adapted | /ticket close - Exact owned privacy snapshot required; bounded JSON-lines transcript saved before owner becomes read-only. Staff retain access, not channel deletion/full HTML or all-party revocation. Unknown transitions freeze. |
| ticket config | adapted | /ticket config - Current server manager sees stored setup privately. Stored queue/metadata are not live channel availability or full private conversation export. |
| ticket delete | omitted | Native ticket channel deletion omitted for safety: destructive removal can erase uncaptured or later staff content, with no recoverable deletion/retention approval receipt. Close is reversible read-only owner adaptation. |
| ticket edit | omitted | Interactive welcome/panel content editing omitted for safety: no durable original-public-message revision proof exists for safe update. Fixed localized panel labels and no automatic arbitrary native message overwrite. |
| ticket panel | adapted | /ticket panel - Explicit existing output channel with fixed open button, stored original guild/channel/message binding and support/admin audience notice. Uncertain send blocks blind retry. |
| ticket removecategory | omitted | Multi-type removal omitted for safety: no durable per-type configuration/ownership exists. Resetsetup stops future opens without deleting a Discord category or existing tickets. |
| ticket removeuser | omitted | Guest access removal omitted for safety because guest grants are not supported and arbitrary overwrite edits must not override operator privacy changes. |
| ticket reset | adapted | /ticket resetsetup - Confirmed manager forgets future setup only. Existing channels, staff access, panel records and transcripts remain; in-flight opens may finish. No whole-system destructive reset. |
| ticket setup | adapted | /ticket setup - Existing category and unmanaged support role selected explicitly for future tickets; one configuration, fixed localized Luna embed, no interactive Simple/Embed/customwelcome wizard. |
| ticket staff | adapted | /ticket setup - Support role selected alongside category for future tickets only. Existing records keep their recorded role; no retroactive disclosure to a newly chosen staff audience. |
| ticket transcript | adapted | /ticket transcript - Private authorized ephemeral UTF-8 JSON-lines snapshot, latest1000 messages/about1MB with partial label, attachment names/URLs and embed counts. No public transcript destination, executable HTML, embed bodies or attachment byte archive. |

## Additional described behavior closure

- Ticket Simple/Embed interactive setup and welcome/panel editing: fixed branded localized embeds only, not arbitrary unreviewed public-content edits. Multi-type max3 categories is omitted for the single reviewed audience policy; no fake menu.
- Ticket full Discord-like HTML with attachments/embeds: executable HTML and full-content embed/attachment archival omitted for privacy/safety. Bounded JSON-lines text, IDs/dates, attachment names/URLs, embed counts; URLs may expire. Transcripts are private ephemeral attachments, not auto-posted to staff log destinations. No direct channel-argument export of unrelated chat.
- Ticket transcript destination variant: omitted safety because automatically posting private history to a new channel widens audience. Close stores privately; manual access follows exact owned channel/privacy checks.
- Ticket close access restriction: owner read-only, staff continue reading/writing; administrators bypass native channel restrictions. Close cannot promise privacy from admins or global isolation. Snapshot30daydefault,config1-30days,pruned startup/access/save rather than continuous secure erasure. Backups/exports remain.
- Ticket reset: setup-only forget, not all tickets/content/permission deletion. Claim/reopen/erasure/retention tools are Luna extensions, not substitute guest management or full reset parity.
- Giveaway time syntax s/m/h/d: slash integer minutes1-43200 only. Seconds/subminute and prefix/reply-context parsers omitted native slash-shape limit, not invented support. No instant-ending availability promise.
- Giveaway reply-to-end/reroll: explicit stored ID required, no inferred message/context or cross-server action. Crypto sample without replacement,current membership/required-role rechecked,no prize payment/fulfilment. Fewer/no eligible entrants reported honestly.
- Giveaway automated deadline draw: online minute scan and restart catch-up, not precise deadline/offline service guarantee. Winners persisted before native edit; failed edit reuses same draw. Pending create uncertainty needs operator review,no blind resend.
- Giveaway all-active list: latest100 stored archive window,2perpage,not exhaustive native census. Winner announcements suppress all pings. Reroll excludes immediately previous winners,not every historical winner.
- Giveaway banner URL/upload and delegated giveaway staff: explicitly safety omitted. Native Manage Server remains required,not Administrator-only. Fixed localized branded embeds only; no remote uploader or custom banner setting is implied.

Sources:
- https://docs.zynrax.site/configuration/tickets
- https://docs.zynrax.site/miscellaneous/giveaway

Evidence:data/support-closure.json, linked implementation docs and inspected ticketDelivery/tickets/ticketTranscripts/giveawayDelivery/giveaways services. Local tests and registry checks only; live Discord privacy/buttons/restart and visual acceptance remain unverified. Total227of319 exact reference rows mapped,92 remaining.
