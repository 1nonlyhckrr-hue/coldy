# Installation

## Requirements

- Supported Node.js LTS22.13+ (22.x) or24.x. Local tests on22.23.3. Earlier public188test checkpoint Node22/24CIgreen,later local source still needs its own CI.
- npm,internet for installation,writable persistent disk. Latest pinned ESLint requires22.13+;avoid obsolete unsupported tooling.
- Separate Luna Discord application and test guild. No Koki/FortiX tokens/services.

Use `npm ci` from reviewed lockfile. better-sqlite3 may need compiler/Python toolchain if platform prebuilt unavailable. SQLite storage must persist across restarts;ephemeral containers lose state. No deployment verified yet.

## Discord setup after release readiness

1. Create separate Luna application in Discord Developer Portal. Store token privately using environment variables,never code/commits.
2. Set DISCORD_CLIENT_ID and test DISCORD_GUILD_ID. `.env.example` has placeholders only.
3. Invite with bot and applications.commands scopes. No blanket Administrator permission. Enable only per-module native rights needed by configured features. Private channel/role/poll/moderation rights differ;read module guides.
4. Defaults use Guilds only. ENABLE_MEMBER_EVENTS enables GuildMembers for welcome/member logs and requires Server Members approval. ENABLE_MESSAGE_EVENTS enables GuildMessages+MessageContent for configured autoresponders/AutoMod/AFK/message metrics and requires Message Content approval. ENABLE_AUDIT_EVENTS enables GuildModeration for native audit alerts,plus ViewAuditLog. ENABLE_VOICE_EVENTS enables non-privileged GuildVoiceStates required by voice utilities and VoiceMaster occupancy checks. Defaults false;those effects fail closed when disabled. No presence tracking. Music remains unactivated.
5. `npm run register:preview` performs no mutation. `npm run register:guild` replaces only this application's test-guild command set;review target before applying. Do not register/go live until full requested command scope and release gates are met.
6. `npm start` connects to Discord and can perform configured automated actions. Do not run on excluded services or before explicit release readiness. Validate actual privileges,gateway/buttons/native provider replies,visual embeds,rate limits,storage failures,restarts and privacy in separate test guild before production.

## Offline checks

`npm run check`, `npm run lint`, `npm run format:check`, `npm test`, `npm run inventory`, `npm run inventory:luna`, `npm run register:preview`, `npm audit`. All current local261tests pass;no live Discord proof implied. ESLint safety rules cover undefined identifiers/duplicate keys/unreachable statements/dynamic eval,not all possible semantic bugs. Formatter controls source style,not correctness.

## Remaining setup

Actual token/source host approval,live integration/visual tests,Docker/host deployment and uptime remain unverified. Zero-cost Music provider/catalog rights/DAVE session unresolved. Full541help evidence missing;319reference paths established. Never say hosted24/7 without deployment proof.
