# Scheduled messages

Four original Luna paths: `/automation create`, `cancel`, `list`, `config`. Manage Server is checked from current membership. Create requires a destination, message and an ISO timestamp with seconds and an explicit offset or Z. Optional repeat is 10 minutes to 30 days. First send must be at least one minute ahead and within one year. At most 25 unresolved records per guild.

Explicit offsets are converted to UTC; invalid dates and timezone-free input are refused. Repeats are elapsed-time intervals, not timezone-name/DST-aware calendar recurrences. The runner checks due records once a minute while online. After downtime, it sends at most one catch-up message for each due record and advances repeats to the next future interval, not a burst of missed messages.

SQLite claim-before-send prevents concurrent workers/repeated ticks from sending the same claimed occurrence. On success the record finishes or advances; unconfirmed sends stop as uncertain without automatic retry. On restart any in-flight sending records become uncertain. Managers may cancel uncertain/pending records, not a send already in flight. Mentions are disabled and destination permissions rechecked at send time. Message body is owner-authored and remains verbatim; embed labels follow server language.

The newest 100 records are listed ten per page. Message bodies are not disclosed by the list. Storage includes scheduled content, so backups may contain private text. Retention/resume/edit/DST-aware recurrence, autoroles and other reference automations remain unfinished. This module's commands are original Luna scheduling controls, not fabricated reference matches.

Six local tests cover calendar parsing, limits, duplicate sources, guild isolation, cancellation, atomic claiming, concurrent ticks, ambiguous sends, mention suppression, skip-backlog repeats, restart state, timer lifecycle, all four paths and Hindi output. No live Discord scheduler/deployment test yet.

## Named timezone, one-time

`createzone` accepts exact local date/time with named IANA-style zone,not a relative date or unqualified clock time. Runtime Intl timezone rules compute possible offsets sampled around requested date,then exact round-trip matches. Zero matches: clock-gap error. Multiple matches: overlap error,use offset-based `create` to pick exact occurrence. Invalid normalized dates are rejected. UTC response confirms chosen instant. Only one-time: no daily/weekly wall-clock recurrence. Existing repeat-minutes is fixed elapsed-time,may shift local clock across DST.

Current runtime TZ data governs future rules,which governments can change. Stored UTC instant stays fixed after creation even if timezone rules change. No timezone setting saved per guild. Scheduling worker checks once per minute and can be later on downtime/permission/service failures,not exact-time delivery. Healthy messages may arrive up to one minute after due time. Unknown sends remain uncertain,never auto-replayed. Four new tests cover seasonal offsets,New York/Lord Howe gaps+overlaps,strict bounds and locales.220 project tests pass,no actual scheduled gateway delivery/visual test.
