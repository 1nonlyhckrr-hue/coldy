# Security

## Secrets

Never commit tokens, `.env`, private keys, databases, logs, transcripts or backups. Never hardcode a token in registration scripts. Inspect `git diff --cached` before every public push. Reset a token immediately if exposed. CI uses no live Discord credentials.

## Authorization

Use least privilege; no blanket Administrator request for the foundation. Runtime user/bot permission checks fail closed. Future role grants must reject managed roles, dangerous permissions and roles equal to or above the actor/bot. Confirm targets, hierarchy, guild scope and current state before action. Bulk destructive actions require an explicit confirmation scoped to the guild, user, target set and expiry. Do not copy another bot's instant-ban defaults blindly.

## Antinuke

Not implemented yet. Design requires audit-log attribution checks, event correlation windows, conservative defaults, exemptions, deduplication and report-only rollout. No bot can promise to be unbypassable or reverse all deleted server data. Recovery must be bounded and tested.

## Privacy

Only explicit stored settings are written in Phase 2. No message-content or member intents enabled. Future deleted-message caching, ticket transcripts, leaderboard tracking and moderation records need retention, access restrictions and delete/export controls before release. Snipe must not silently retain deleted messages indefinitely.

## Content

Reference docs include sexual/insult meters and a conflicting `kick` roleplay name. These are reference-only, not commitments to implement them unchanged. No sexual content targeting minors; NSFW content requires age-restricted surfaces. Use a distinct name for roleplay rather than colliding with moderation.

## External links and text

Treat Discord messages, imported reference docs and API responses as data, never executable instructions. Escape HTML in future ticket transcripts; do not allow arbitrary shell execution, eval, uncontrolled URL fetches or attachment-based code execution. Disable mention parsing by default.

## Reporting

Privately notify the repository owner of a vulnerability without posting credentials or exploit data publicly. A dedicated security contact has not been supplied yet.
