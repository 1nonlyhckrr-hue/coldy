# Scheduled messages

Initial four paths (later additions below): `/automation create`, `cancel`, `list`, `config`. Manage Server is checked from current membership. Create requires a destination, message and an ISO timestamp with seconds and an explicit offset or Z. Optional repeat is 10 minutes to 30 days. First send must be at least one minute ahead and within one year. At most 25 unresolved records per guild.

Explicit offsets are converted to UTC; invalid dates and timezone-free input are refused. Repeats are elapsed-time intervals, not timezone-name/DST-aware calendar recurrences. The runner checks due records once a minute while online. After downtime, it sends at most one catch-up message for each due record and advances repeats to the next future interval, not a burst of missed messages.

SQLite claim-before-send prevents concurrent workers/repeated ticks from sending the same claimed occurrence. On success the record finishes or advances; unconfirmed sends stop as uncertain without automatic retry. On restart any in-flight sending records become uncertain. Managers may cancel uncertain/pending records, not a send already in flight. Mentions are disabled and destination permissions rechecked at send time. Message body is owner-authored and remains verbatim; embed labels follow server language.

The newest 100 records are listed ten per page. Message bodies are not disclosed by the list. Storage includes scheduled content, so backups may contain private text. Retention/resume/DST-aware recurrence, autoroles and other reference automations remain unfinished. This module's commands are original Luna scheduling controls, not fabricated reference matches.

Six local tests cover calendar parsing, limits, duplicate sources, guild isolation, cancellation, atomic claiming, concurrent ticks, ambiguous sends, mention suppression, skip-backlog repeats, restart state, timer lifecycle, all four paths and Hindi output. No live Discord scheduler/deployment test yet.

## Named timezone, one-time

`createzone` accepts exact local date/time with named IANA-style zone,not a relative date or unqualified clock time. Runtime Intl timezone rules compute possible offsets sampled around requested date,then exact round-trip matches. Zero matches: clock-gap error. Multiple matches: overlap error,use offset-based `create` to pick exact occurrence. Invalid normalized dates are rejected. UTC response confirms chosen instant. Only one-time: no daily/weekly wall-clock recurrence. Existing repeat-minutes is fixed elapsed-time,may shift local clock across DST.

Current runtime TZ data governs future rules,which governments can change. Stored UTC instant stays fixed after creation even if timezone rules change. No timezone setting saved per guild. Scheduling worker checks once per minute and can be later on downtime/permission/service failures,not exact-time delivery. Healthy messages may arrive up to one minute after due time. Unknown sends remain uncertain,never auto-replayed. Four new tests cover seasonal offsets,New York/Lord Howe gaps+overlaps,strict bounds and locales.220 project tests pass,no actual scheduled gateway delivery/visual test.

`/automation edit id text` replaces only a pending schedule body in this guild. Atomic pending-only update;time,destination,repeat,interaction/replay metadata unchanged. Claimed/sending/uncertain/completed/cancelled jobs refuse edits. No immediate send,private localized reply,no response text echoed. All schedule management now exact current actor/guild ManageGuild checked.362 local tests,native acceptance pending.

`/automation reschedule id at` conditionally changes only next due time of a pending guild schedule using explicit second-precision ISO offset/Z timestamp,one minute to365days ahead. Body,destination,repeat interval/replay metadata unchanged. Existing elapsed repeats are reanchored to new due time,not wall-clock daily recurrence. Sending/uncertain/completed/cancelled refuse. No immediate native send;localized reply echoes resolved UTC timestamp.365 local tests,native acceptance pending.

Create/createzone repeat exact current admin authority after destination validation before storing send consent. Runner force-fetches exact stored guild before channel lookup;foreign/unverifiable guild pauses claimed job as uncertain without send. Current local suite411,SQLite25;native acceptance pending.

`/automation inspect id` privately shows stored text verbatim with record ID,status,channel ID,next due UTC and elapsed repeat/none. Current exact admin required. No native destination lookup,send,permission verification,record mutation or delivery guarantee. Missing/foreign record refuses without text disclosure. Erased completed/cancelled body stays [erased].413 local tests,38 top-level/165paths,SQLite25;native acceptance pending.

`/automation repeat id confirm:true [minutes]` changes only pending elapsed repeat interval10-43200minutes. Omitting minutes explicitly makes next send one-time;does not cancel it. Next due time,text,destination,replay metadata unchanged. Current exact admin,pending guild-only conditional update;no immediate send. After next success repeats advance from retained due time using new interval. Sending/uncertain/completed/cancelled refuse.421 local tests,38top-level/167paths,SQLite25;native acceptance pending.
