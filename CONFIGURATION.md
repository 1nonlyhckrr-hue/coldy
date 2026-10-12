# Configuration

Copy `.env.example` into a private `.env`. Schema validation refuses missing/malformed required values and logs field names, not values.

| Variable | Required | Meaning |
| --- | --- | --- |
| DISCORD_TOKEN | Yes | Secret Emika bot token |
| DISCORD_CLIENT_ID | Yes | Emika Application ID, 17-20 digits |
| DISCORD_GUILD_ID | Registration only | Test server ID; no global registration in v0.1 |
| OWNER_IDS | Yes | Comma-separated bot owner Discord IDs |
| DATABASE_PATH | No | Default `./var/luna.sqlite` |
| LOG_LEVEL | No | `info`; trace/debug/warn/error/fatal/silent supported |
| ENABLE_MEMBER_EVENTS | No | Default false. Set true only after authorizing Server Members intent for welcome/goodbye events |
| ENABLE_AUDIT_EVENTS | No | Default false. GuildModeration intent and bot View Audit Log for opt-in Antinuke alerts only |
| ENABLE_MESSAGE_EVENTS | No | Default false. Shared opt-in GuildMessages/MessageContent for AutoMod, autoresponder and message metrics |
| NODE_ENV | No | development, test, or production |

Configure the owner's Discord ID privately in OWNER_IDS. Validate it with the owner before granting any future privileged command. Being the bot owner must not override server role hierarchy or grant authority in other servers.

Only guild slash commands are implemented. No prefix command listener exists yet. Reference prefixes `?` and `,` are Zynrax syntax, not Emika configuration.

Per-server settings use SQLite keyed by guild ID. Future configuration writes must use `GuildSettings.patch` or equivalent transactions and validate feature-specific schemas before saving.
