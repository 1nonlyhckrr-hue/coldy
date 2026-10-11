# Discord helpers

Three original paths under `/tools`,all private localized Luna embeds,no mentions/storage/native API reads or changes.

- `snowflake id`: accepts positive decimal unsigned64bit string,uses BigInt to decode timestamp/internal worker/process/increment fields. Reports encoded UTC/client timestamp,not proof of existence,object type,owner or current state. Never treats suppliedID as a member/contact.
- `timestamp seconds [style]`: explicit Unix seconds0-253402300799,not milliseconds or inferred local dates. Styles t,T,d,D,f,F,s,S,R,defaultf. Shows UTC,rendered timestamp and copyable syntax. Each viewer uses their client timezone/locale. No scheduling/reminder.
- `color hex`: six hex digits with optional#,returns normalizedhex/RGB/decimal. No color-setting mutation.

Protocol source checked October12,2026: https://docs.discord.com/developers/reference (snowflake64bits/epoch1420070400000/bitlayout and timestamp styles/seconds/clientlocale). Local tests cover deterministic bitprecision/bounds/options/localized payloads. Live Discord client render/pixels unverified.

## Explicit named-zone and elapsed-time helpers

`localtimestamp local timezone [style]` converts explicit YYYY-MM-DDTHH:mm:ss and namedzone to Unixseconds/UTCISO/Discordmarkup. Reuses the tested namedzone resolver;rejects DSTgap/overlap/calendar invalids,never silently chooses a repeated clock time. Timestamp range remains0-253402300799Unixseconds and same9documentedstyles. No relative-day/location inference,reminder or scheduledsend.

`timezone seconds timezone` displays the explicit Unixinstant in one namedzone,using installed runtime timezone data and canonical zone label. Does not infer user's zone/location or claim timezone data always current. `timedifference start end` returns signed elapsedseconds and absolute24hourday/hour/minute/second remainder. Not a count of localcalendar days and no DST/week/month scheduling inference. Both reject malformed/out-of-range inputs. Pure no fetch/storage/native effects,private3locale/shared no-ping embeds. Sourceprotocol https://docs.discord.com/developers/reference .Local exact arithmetic/DST/roundtrip tests;nativeclient timestamp display/pixels unverified.

## Additional exact conversions

`/tools permissions bits` decodes explicit unsigned64bit decimal using BigInt,lists known installed-library flags and unknown bits separately. No effective permission calculation,member/channel lookup or implicit administrator expansion. Administrator bit warning explains overwrite bypass,not a permission grant.

`rgb red green blue` converts integer0-255components to canonical six-digit hex/RGB/decimal,no settings changes. `isotimestamp iso [style]` converts exact calendar/time seconds with Z or signed offset(up to14hours) into Discord timestamp markup/normalizedUTC/Unixseconds. Rejects rollover dates,24hours,leap seconds,fractional seconds,missingoffset and out-of-supportedUnixrange. No relative-time assumption or schedule. Three tests exact bits/components/calendar/offset limits and private3localecommands. No storage/native mutations/clientpixel verification.
