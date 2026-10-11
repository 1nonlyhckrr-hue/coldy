# Welcomer

`mentions enabled` controls arriving-member ping only forwelcome deliveries andexplicitselftest. Defaulttrue preservesexistingbehavior,includinglegacystoredJSON;false suppressesallpingswithoutchangingcontent/enabled/channel. Role/everyone/otheruserpingsneverallowed;goodbye/previewneverping. `clearchannel confirm:true` disableswelcome/goodbye andclearsstoreddestination together,withoutnativechannel lookup(removingdeletedchannel supported);templates/customflags/title/color/mention policy kept. No message deletionorautomaticre-enable. Currentmanager/private3locales,6tests,602localfullsuite/211paths;nativepixelsnotverified.

## Image styles

`/welcome image kind [url]` and `/welcome thumbnail kind [url]` store separate welcome/goodbye HTTPS URLs. Omit URL to clear that one asset. Public-host syntax only,no credentials/custom ports/IP literals/private-host names. Luna does not fetch/validate bytes,DNS,MIME,reachability or visibility;Discord fetches the URL when rendering. Use public images you control,never signed/private links or secrets. Images are third-party requests and may fail to load. This does not enable delivery or send a test automatically. Existing private preview,explicit test and configured events include assets.

`/welcome resetstyle confirm:true` clears both titles/images/thumbnails/shared color while keeping templates,destination,enabled status and ping policy. Allthree require current ManageGuild,private localized no-ping replies. URLs persist in SQLite,old config defaults no assets. No live pixel rendering acceptance yet.

## Portable template/style library

`/welcome export` privately exports current template/style fields as JSON,including custom-template provenance flags,mention setting and asset URLs. No destination or welcome/goodbye enable flags. Keep text/URLs private. Maximal libraries can exceed the4000character import cap;this is not a full settings backup.

`/welcome import json confirm:true` replaces the complete template/style library from a strict object up to4000characters. Same schema limits apply,including public HTTPS asset URL validation,no server-side fetching. Missing fields restore defaults rather than retaining previous custom styles. Both message types become disabled;existing destination,language and logging remain. No new automatic delivery. Review and enable each later. 

`/welcome reset confirm:true` restores defaults,disables both message types and forgets destination and every custom template/style field. Native messages,delivery guards and unrelated settings remain. In-flight sends may finish. All3paths require current native Manage Server,private localized embeds/no mentions. Three tests cover replacement/optional-field erasure/invalidJSON/limits/isolation/storage failure and three-locale attachment bytes. No live/native/client visual acceptance.
