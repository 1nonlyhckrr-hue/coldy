# Utility, appearance and initial setup reference closure - October12

All37documented rows mapped:28utility,6customization,1setup,1overview prefix,1embed.19adaptations,18explicit safety/native-limit omissions. No prefix/native/fullscope equivalence.

| Reference | Disposition | Emika paths / reason |
| --- | --- | --- |
| customize avatar | omitted (safety) | Bot appearance mutation/reset omitted without verified guild-scoped native support,owned original profile snapshot and reviewed remote-image content/audience policy. Must not change global application identity for other guilds;owner-only reference is not permission to do so. |
| customize banner | omitted (safety) | Bot appearance mutation/reset omitted without verified guild-scoped native support,owned original profile snapshot and reviewed remote-image content/audience policy. Must not change global application identity for other guilds;owner-only reference is not permission to do so. |
| customize reset | omitted (safety) | Bot appearance mutation/reset omitted without verified guild-scoped native support,owned original profile snapshot and reviewed remote-image content/audience policy. Must not change global application identity for other guilds;owner-only reference is not permission to do so. |
| customize resetavatar | omitted (safety) | Bot appearance mutation/reset omitted without verified guild-scoped native support,owned original profile snapshot and reviewed remote-image content/audience policy. Must not change global application identity for other guilds;owner-only reference is not permission to do so. |
| customize resetbanner | omitted (safety) | Bot appearance mutation/reset omitted without verified guild-scoped native support,owned original profile snapshot and reviewed remote-image content/audience policy. Must not change global application identity for other guilds;owner-only reference is not permission to do so. |
| prefix | omitted (native-limit) | Emika uses registered native slash commands only;no prefix parser/runtime exists. Changing prefix cannot affect slash naming or command routing. |
| prefixset | omitted (native-limit) | Overview prefix alias omitted with slash-only native command surface;no invented configurable prefix behavior. |
| security | adapted | /antinuke config, /antinuke enable - Adapted manual configuration/enable of opt-in audit alerts only,not automatic Administrator invitation/extraowner/fullprotection wizard. No punishment/prevention/recovery or top-role hierarchy bypass. |
| afk | adapted | /afk set, /afk status, /afk clear - Explicit own reason share:true,server-scoped7day status and exact-channel notices only. Eligible new message in same guild clears; no nickname edits/global cross-server disclosure or mention-count report. |
| avatar | adapted | /avatar - Force-fetched selected public user profile avatar URL1024size privately; not a native inline photo preview or guild-avatar/membership inference. |
| banner | adapted | /banner - Force-fetched public user profile banner link or honest missing result privately; not guild banner/profile edits or membership inference. |
| boostcount | adapted | /boostcount - Force-fetched exactguild current boost subscription count and tier0-3,private localized output; malformed provider fields fail closed. |
| embed | omitted (safety) | General interactive embed builder/public send omitted without durable session-bound recipient+final-content review and native message ownership proof. Shared Emika embeds and scoped welcome style are not arbitrary rich-message publishing. |
| invite | omitted (native-limit) | No verified deployed application OAuth invite/support destination is configured for this source package. Never invent Zynrax or Emika invite/support links; operators register their own Discord application using documented setup. |
| list admins | adapted | /list admins - Private fresh manager-only guild member snapshot10/page,explicit member-runtime opt-in,without presences/storage. Current membership can change after snapshot;not complete live universal census. |
| list bans | adapted | /list bans - Fresh manager+BanMembers and currentbot/nativepermission checks. Max100 ban IDs/names fetched per cursor page,JSONattachment/private,not reasons/history or unban effect. |
| list boosters | adapted | /list boosters - Private fresh manager-only guild member snapshot10/page,explicit member-runtime opt-in,without presences/storage. Current membership can change after snapshot;not complete live universal census. |
| list bots | adapted | /list bots - Private fresh manager-only guild member snapshot10/page,explicit member-runtime opt-in,without presences/storage. Current membership can change after snapshot;not complete live universal census. |
| list emojis | adapted | /list emojis - Fresh current guild emoji name/ID/animated metadata,10/page,literalnamefilter,private/no-ping;not stolen/reuploaded image content. |
| list inrole | adapted | /list inrole - Private fresh manager-only guild member snapshot10/page,explicit member-runtime opt-in,without presences/storage. Current membership can change after snapshot;not complete live universal census. |
| list roles | adapted | /list roles - Fresh current guild role metadata,10/page,literalnamefilter,private/no-ping;not member enumeration or permission mutation. |
| makeqr | omitted (safety) | Payment QR generation with optional amount omitted without verified beneficiary/amount and secure ownership/encoding workflow. No payment destination or amount is inferred. |
| membercount | adapted | /membercount - Force-fetched approximate total/presence counts with validity bounds,not exact online census or human/bot split. No presence/member enumeration for this path. |
| poll | adapted | /poll - Fresh manager/native output permissions,explicit text/announcement destination,2-10separate textanswers,question300/answers55,hours1-768,multipleflag. Native poll owns votes,not pipe/reply parser or simulated poll. Stored publication receipt prevents blind unknown send retry. |
| removeupi | omitted (safety) | UPI slot deletion omitted with unsupported payment-data store;native/external payment accounts never changed and no secure-erase promise. |
| roleinfo | adapted | /roleinfo - Force-fetched current selected guild role ID/name/color/position/managed/permission flags privately,no member list or role mutation. |
| say | omitted (safety) | Arbitrary bot-identity message relay to text/voice/thread omitted to avoid impersonation and unreviewed audience disclosure. Reviewed module-specific messages are not a general say/send endpoint. |
| serverinfo | adapted | /serverinfo - Force-fetched exactguild name/ID/approximate member count only. Full server settings/detailed stats omitted as unnecessary disclosure; not full configuration inventory. |
| setupi | omitted (safety) | Personal/business payment-identifier slot storage omitted without verified recipient ownership,private-at-rest/payment-data handling policy. Bot is not a wallet or UPI credential store. |
| showupi | omitted (safety) | Payment-identifier listing omitted with unsupported personal slot store to prevent accidental payment-address disclosure. No hidden UPI records are claimed. |
| stats | adapted | /stats - Private local build version/top-level/path counts/processRSS. Shard details and per-user command usage analytics omitted native-limit/privacy; no historical telemetry tracker exists. |
| steal | omitted (safety) | Cross-server emoji URL download/reupload omitted without safe remote-byte validation/content rights and reviewed native asset mutation receipts. Metadata/enlarge links do not add assets. |
| translate | omitted (safety) | Sending arbitrary or replied conversation text to a third-party translation provider omitted without explicit disclosure policy/provider setup. EN/HI/Hinglish bot-label localization is not a text/message translation service. |
| uptime | adapted | /uptime - Private current Node process uptime hours/minutes/seconds only,not service SLA,shard history or prior process lifetime. |
| urban | omitted (native-limit) | No verified Urban Dictionary API/provider integration,availability/content filtering contract or localized error path exists. External phrase lookup is explicitly omitted,not substituted with invented definitions. |
| userinfo | adapted | /userinfo - Force-fetched public selected user name/ID/bot/account creation date only. Join date,member roles and permissions omitted privacy because user profile is not verified guild-member context. |
| weather | omitted (native-limit) | No verified live weather/geocoding provider or credential/configuration contract exists. City current-weather lookup omitted rather than fabricate conditions or silently use cached guesses. |

## Additional described behavior closure

- Aliases si/ui/av/ri/bc/mc:reference aliases are not separate registered Emika paths. Slash-only canonical names,no prefix parser or custom prefix.
- Userinformation full member roles/permissions/join date and membercount human/bot/exactonline breakdown:omitted privacy/native-context limit;public user profile and approximate guild counts remain honestly labelled.
- Stats shard info/command usage:omitted native-limit/privacy,no analytics collection or complete shard inventory. Process uptime is not deployment continuity.
- Urban/translation/weather:external lookup omitted with the provider/privacy limits above. Stored bot locale does not translate user-authored text;replied messages never silently leave Discord.
- AFK global cross-server status/nickname mutation/return mention counts:omitted privacy/safety. Explicit same-server/selected-channel sharing,7dayexpiry,bounded no-ping notices and eligible same-guild message clear only. No default cross-channel disclosure or presence tracking.
- Poll pipe-delimited answers/replied context:separate native slash answer options instead. Native client owns votes/expiry;Emika does not enumerate voters. Unfinalized counts are approximate;live/client visuals pending.
- Embed dropdown/title/description/hexcolor/up-to25fields/thumbnail/image/footericon/authortexticon/sendbutton/channelmention workflow:general public builder omitted safety pending durable recipient/content review,remote media policy and owned-message binding. Fixed shared branded module output is not full builder equivalence.
- Avatar/banner/bio customization,individual/global reset,owner-only review/monitoring/inappropriate-content bot removal:profile mutation and enforcement workflow omitted safety. No bio command row fabricated;no claim content moderation monitors uploads or automatically leaves a guild.
- Initial setup Administrator invite/top-role/extraowner/unbypassable fullyprotected promises:explicitly omitted safety/native-limit. Least needed permissions,module opt-ins and manual operator role placement;no top-role change,blanket Administrator request or extraowner authority grant. Antinuke is audit alerts,not prevention/recovery.

Sources:
- https://docs.zynrax.site/
- https://docs.zynrax.site/miscellaneous/embed
- https://docs.zynrax.site/miscellaneous/utility
- https://docs.zynrax.site/overview/customization
- https://docs.zynrax.site/overview/setup

Evidence:data/utility-closure.json/current commands,memberLists/banLists/polls and AFK/Antinuke docs.37exactrows plus supplemental behavior limits,264of319 machine-ledger rows;55remaining Fun35/Music20. Local tests only;live native/provider acceptance and client pixels unverified.
