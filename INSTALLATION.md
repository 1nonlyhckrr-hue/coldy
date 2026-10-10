# Installation

## Requirements

- Supported Node.js LTS 22.12+ (22.x) or 24.x. Tested locally on 22.23.3; Node 24 is configured in CI, not locally verified.
- npm, an internet connection for installation, and a writable persistent disk.
- A separate Discord application and test server before connecting to Discord.

Pinned installed versions are in `package-lock.json`. Run `npm ci`, not an unreviewed bulk upgrade. `better-sqlite3` is a native dependency; when no prebuilt binary is available, install the compiler/Python build toolchain described in its official troubleshooting docs.

## Discord setup

1. Create Luna in the Discord Developer Portal. Do not reuse Koki or FortiX's token.
2. Create/reset the bot token and store it securely. Fill `DISCORD_TOKEN` in your private environment, never in code.
3. Copy the Application ID into `DISCORD_CLIENT_ID`.
4. Invite with bot and applications.commands scopes. The foundation needs no Administrator permission. Optional welcome/goodbye events require Server Members intent plus ENABLE_MEMBER_EVENTS=true. Presence and Message Content remain unused.
5. Copy a test server ID into `DISCORD_GUILD_ID`. `npm run register:guild` replaces only that application's command set in this test server.
6. Run `npm start`. The first live test must verify all four commands and permission/error behavior.

Future modules will document their additional intents and permissions before enabling them. Do not enable all privileged intents in anticipation.
