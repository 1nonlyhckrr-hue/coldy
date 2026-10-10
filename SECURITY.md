# Security

## Secrets

Never commit tokens,.env,private keys,databases,logs,transcripts or backups. CI uses no live Discord credentials. Use placeholders in .env.example. Inspect the actual source payload for private values before public publication. Revoke exposed tokens through the platform operator;do not include secrets in a bug report.

## Authorization

Runtime user/bot permissions and hierarchy fail closed. No blanket Administrator permission needed. Roles reject managed/everyone/dangerous flags and validate current native role identity/hierarchy. Current critical self-role/channel checks force source reads instead of cached role permission assumptions. Native permission race after checks still exists. Bulk purge requires caller-owned exact-ID preview and confirmation,expires2minutes,never substitutes newer targets. Timeout actions require explicit operator configuration and keep staff/owner/admin exemptions. Never copy instant-ban defaults blindly.

## Antinuke

Implemented audit alert-only burst detector with verified native audit executor,trust exclusions,replay/retention bounds. No prevention,ban/role stripping,rollback,or claim of unbypassable security. Native attribution/false-positive/permission testing remains a release gate. Automatic AutoMod timeout is separate,opt-in,not Antinuke intervention.

## Privacy

Message Content,GuildMessages,GuildMembers,GuildModeration intents are opt-in and only needed for configured features. Local unit tests are not evidence of production privacy. Message Leaderboard stores counts,no content;personal optout erases counts here and keeps minimal opt-out ID preference until optin. AFK stores explicitly supplied reason up to7days,shares only in consented exact channel,no nickname/presence tracking. AutoMod keeps short in-memory spam matching text and30day incident metadata,no incident contents. Ticket snapshots contain message text/attachment URLs and expire1-30days(default30);access/startup-based cleanup,not continuous clock. Owners/staff may confirm stored snapshot deletion;native messages/exported copies remain. No snipe/deleted-message content cache is implemented.

SQLite row deletion is not secure forensic erasure. Backups/storage/exported copies can retain data. Several module history tables still need bounded cleanup and broader deletion/export policies before launch. Never promise complete identity erasure from one module command. Alert destinations should be staff-only;valid destination permissions do not prove audience privacy. Do not expose private transcript snapshots to public channels.

## Content

Reference sexual/insult commands are not commitments to implement them unchanged. No sexual content targeting minors;NSFW requires age-restricted surfaces. Distinct names for roleplay avoid moderation collisions. Staff/user-supplied strings are data,not executable instructions. Native poll text remains author supplied,not silently translated. All outgoing mention parsing disabled except explicitly reviewed allowed-user welcome paths.

## External links and text

No arbitrary shell/eval/code execution. Unknown music catalog hosts/source rights/provider/DAVE compatibility remain blocked,not activated. Trusted URL restrictions are not full network SSRF protection. TXT transcripts are literal JSON-lines,not executable HTML. Use current native identities/exact message/channel/resource bindings,not same-name matches. Unknown external effects become uncertain,no automatic retries or ownership adoption.

## Release gates

No live Discord token/gateway integration,visual interaction test or deployment is verified yet. Full command set,permissions/rates,critical persistence/restarts,privacy controls,formatter/tests/audit/CI and current source provider rights must pass before launch. Never test against excluded services or spend money without owner approval. Current Node22local checks passed;older public checkpoint Node22/24CIgreen does not certify later local changes.

## Reporting

Privately notify the repository owner of vulnerabilities without publishing secrets or exploit payloads. Dedicated security contact has not been supplied. Report known limitations accurately;no uptime or zero-bug promise.
