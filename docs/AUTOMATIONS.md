# Scheduled messages

Initial four paths (later additions below): `/automation create`, `cancel`, `list`, `config`. Manage Server is checked from current membership. Create requires a destination, message and an ISO timestamp with seconds and an explicit offset or Z. Optional repeat is 10 minutes to 30 days. First send must be at least one minute ahead and within one year. At most 25 unresolved records per guild.

Explicit offsets are converted to UTC; invalid dates and timezone-free input are refused. Repeats are elapsed-time intervals, not timezone-name/DST-aware calendar recurrences. The runner checks due records once a minute while online. After downtime, it sends at most one catch-up message for each due record and advances repeats to the next future interval, not a burst of missed messages.

SQLite claim-before-send prevents concurrent workers/repeated ticks from sending the same claimed occurrence. On success the record finishes or advances; unconfirmed sends stop as uncertain without automatic retry. On restart any in-flight sending records become uncertain. Managers may cancel uncertain/pending records, not a send already in flight. Mentions are disabled and destination permissions rechecked at send time. Message body is owner-authored and remains verbatim; embed labels follow server language.

The newest 100 records are listed ten per page. Message bodies are not disclosed by the list. Storage includes scheduled content, so backups may contain private text. Retention/resume/DST-aware recurrence, autoroles and other reference automations remain unfinished. This module's commands are original Emika scheduling controls, not fabricated reference matches.

Six local tests cover calendar parsing, limits, duplicate sources, guild isolation, cancellation, atomic claiming, concurrent ticks, ambiguous sends, mention suppression, skip-backlog repeats, restart state, timer lifecycle, all four paths and Hindi output. No live Discord scheduler/deployment test yet.

## Named timezone, one-time

`createzone` accepts exact local date/time with named IANA-style zone,not a relative date or unqualified clock time. Runtime Intl timezone rules compute possible offsets sampled around requested date,then exact round-trip matches. Zero matches: clock-gap error. Multiple matches: overlap error,use offset-based `create` to pick exact occurrence. Invalid normalized dates are rejected. UTC response confirms chosen instant. Only one-time: no daily/weekly wall-clock recurrence. Existing repeat-minutes is fixed elapsed-time,may shift local clock across DST.

Current runtime TZ data governs future rules,which governments can change. Stored UTC instant stays fixed after creation even if timezone rules change. No timezone setting saved per guild. Scheduling worker checks once per minute and can be later on downtime/permission/service failures,not exact-time delivery. Healthy messages may arrive up to one minute after due time. Unknown sends remain uncertain,never auto-replayed. Four new tests cover seasonal offsets,New York/Lord Howe gaps+overlaps,strict bounds and locales.220 project tests pass,no actual scheduled gateway delivery/visual test.

`/automation edit id text` replaces only a pending schedule body in this guild. Atomic pending-only update;time,destination,repeat,interaction/replay metadata unchanged. Claimed/sending/uncertain/completed/cancelled jobs refuse edits. No immediate send,private localized reply,no response text echoed. All schedule management now exact current actor/guild ManageGuild checked.362 local tests,native acceptance pending.

`/automation reschedule id at` conditionally changes only next due time of a pending guild schedule using explicit second-precision ISO offset/Z timestamp,one minute to365days ahead. Body,destination,repeat interval/replay metadata unchanged. Existing elapsed repeats are reanchored to new due time,not wall-clock daily recurrence. Sending/uncertain/completed/cancelled refuse. No immediate native send;localized reply echoes resolved UTC timestamp.365 local tests,native acceptance pending.

Create/createzone repeat exact current admin authority after destination validation before storing send consent. Runner force-fetches exact stored guild before channel lookup;foreign/unverifiable guild pauses claimed job as uncertain without send. Current local suite411,SQLite25;native acceptance pending.

`/automation inspect id` privately shows stored text verbatim with record ID,status,channel ID,next due UTC and elapsed repeat/none. Current exact admin required. No native destination lookup,send,permission verification,record mutation or delivery guarantee. Missing/foreign record refuses without text disclosure. Erased completed/cancelled body stays [erased].413 local tests,38 top-level/165paths,SQLite25;native acceptance pending.

`/automation repeat id confirm:true [minutes]` changes only pending elapsed repeat interval10-43200minutes. Omitting minutes explicitly makes next send one-time;does not cancel it. Next due time,text,destination,replay metadata unchanged. Current exact admin,pending guild-only conditional update;no immediate send. After next success repeats advance from retained due time using new interval. Sending/uncertain/completed/cancelled refuse.421 local tests,38top-level/167paths,SQLite25;native acceptance pending.

`/automation cancelpending confirm:true` cancels all still-pending schedules in this guild atomically. Requires exact current manager and explicit confirmation. In-flight/uncertain/terminal/foreign records stay unchanged;not proof a previously claimed send will stop. Text remains stored;individual forget supports cancelled record erasure. No native message deletion or immediate send. Empty/idempotent invocation returns0.552localtests;not live acceptance.

`upcoming [page]`:private manager-only pending queue,oldest due first withIDtie-break,10/page,page1-3. ID/channelID/due/repeat only,notbody. Pending includesoverdue;no send or readinessclaim. `overview`:state counts across allstoredrecords,notlimitedrecent100;earliestpendingdue included. Done means acceptedmessageidentitywasrecorded,notdeliveryreceipt;uncertain jobs neverautomaticallyretry. No record mutations. `/automation list` strictly validatesintegerpage>=1.580localtests/205paths,notnativeverified.

## Confirmed bulk controls

`stoprepeats confirm:true` sets pending repeats to one-time,next due/body/channel preserved. It does **not** cancel their next send or change already-sending/uncertain records. `forgetfinished confirm:true` erases retained bodies of done/cancelled schedules,keeps metadata. `clearfinished confirm:true` deletes done/cancelled records/bodies. Active/uncertain/foreign-guild records and native messages untouched. Allthree require current ManageGuild,private localized no-ping results. Idempotent changed counts. These modify stored future/retained state,not runner uptime or delivery guarantees. Live acceptance pending.

## Adjust, reuse and export stored schedules

`shift id minutes confirm:true` shifts one pending nextsend by signed nonzero integer minutes within +/-525600. New due still must be1minute-365days ahead. Original body,destination,elapsed repeat interval and source interaction remain unchanged. Done/sending/uncertain/cancelled records are not shifted. No timezone recurrence conversion.

`clone id at confirm:true` copies one pending stored body/destination into a new one-time future schedule using explicit offset time. Repeat interval is deliberately not copied. Destination validated fresh;current manager checked again after validation. Original full source snapshot rechecked inside transaction before creation;changed body/time/channel/repeat/state aborts. Existing cap25 and unique interaction ID apply. No send now;this is a confirmed new future send,not paused draft. Source untouched.

`export` privately delivers latest100stored records as JSON including body,channel ID,schedule ID,nextdue,repeat interval and state. No actor/guild/interaction IDs or receipts. Keep file private. Not a full backup,import/replay file,delivery proof or native readiness result;older rows can be omitted. Clear/forget policy still controls retained contents. Export does not change state or send elsewhere. All three paths current exact ManageGuild and private localized/no-ping shared embeds. Local JSON bytes/nativevalidation mocks verified,not live Discord/client pixels.

## Exact stored destination cleanup

`/schedulecleanup cancel channel-id confirm:true` cancels pending schedules bound to one exact stored destination in this server. `stoprepeats` clears recurring intervals of pending schedules in that destination,keeping next pending send. `erasefinished` erases body text only for done/cancelled schedules in that destination.

Unknown/sending states,other destinations/guilds,source IDs,schedule identities and native messages stay intact. Deleted destination IDs can be cleaned without live lookup because these are stored-only stop/erasure operations. Current native Manage Server,explicit confirmation,private3locale/no-ping. Three tests scope/status/identity/storageabort/input/authority/commands. No live/client visual acceptance.
