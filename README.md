# Emika

Professional multipurpose Discord bot project. Repository name: `coldy`. Node.js LTS, discord.js stable, SQLite persistence.

## Honest status

**This is not a finished 541-command bot.** 87 top-level slash commands provide 679 executable paths. Built scope includes moderation, welcome/goodbye settings, case logs, button roles, utilities, autoresponders, giveaways, private tickets, scheduled messages, AutoMod, solo Fun, Permit restrictions, single-member Voice, CustomRole mappings and message/sampled-voice Leaderboards. Antinuke is alert-only, GuildTag uses manual refresh, and VoiceMaster creates private channels explicitly or from an opt-in existing lobby. Music has18 experimental opt-in paths,off by default;live playback/client compatibility remain unverified;one stable4.2.2 node metadata candidate verified,not configured. See [module scope and remaining work](docs/MODULE_STATUS.md) and docs/PHASE3_STATUS.md. Empty category directories are not implemented modules.

The official Zynrax documentation yields 319 distinct documented command paths after shortcut deduplication. These are reference-only rows, not Emika implementations. The reference inventory is not advertised as the complete 541-command list. Aliases do not count as separate commands. Examples and parameter values do not count as new commands.

## Quick start

```sh
npm ci
cp .env.example .env
# Fill the required variables locally. Never send or commit secrets.
npm run check
npm test
npm run register:preview
# After creating a separate Emika application and test server:
npm run register:guild
npm start
```

Read [INSTALLATION](INSTALLATION.md), [CONFIGURATION](CONFIGURATION.md), [DEPLOYMENT](DEPLOYMENT.md), [TROUBLESHOOTING](TROUBLESHOOTING.md), [COMMAND_INDEX](COMMAND_INDEX.md), [SECURITY](SECURITY.md), [ARCHITECTURE](ARCHITECTURE.md), and [ROADMAP](ROADMAP.md).

## Verification

Local tests cover configuration, SQLite migrations/restarts, guild isolation, permissions/hierarchy, input bounds, cooldowns, mock command execution and side-effect failure states. All1302 distinct automated tests pass locally; these are not live Discord integration tests. The1205-test/555-path published checkpoint passed Node22/24 CI at [the verified published-head run](https://github.com/1nonlyhckrr-hue/coldy/actions/runs/38211667918). 1205/555 source publication and exact-head Node22/24 CI are verified; later local changes need their own publication and CI verification. This receipt was updated locally after publication and will enter the next source milestone. No Discord token, live visual test, Docker build or deployment has been verified.

## Reference sources

- https://www.zynrax.site/
- https://docs.zynrax.site/
- https://docs.zynrax.site/llms.txt
- https://top.gg/bot/1402377137087840378
- https://discordbotlist.com/bots/zynrax

Emika is original code. Zynrax is a reference benchmark; there is no affiliation or claim to its code or brand.

## License

No public reuse license has been selected yet. `UNLICENSED` is deliberate until the owner chooses one. Public visibility alone does not grant a license.

## Separate installed inventory

`npm run inventory:luna` generates `data/luna-commands.json` and CSV from the actual slash registry.549 installed paths are original Emika behavior,not claimed reference equivalence. Runtime permission conditions are documented separately from static/default fields. Local mocks passed1198tests;live-tested flag stays false until native acceptance.

## Source style and checks

Pinned Prettier formats source/scripts/tests;`npm run format:check` verifies style in CI. `npm run format` applies it locally. Safety ESLint rules check undefined identifiers,duplicate keys,unreachable statements and dynamic-code execution. These targeted checks do not establish complete semantic correctness. CI also regenerates both inventories and checks for drift. The installed inventory generator refreshes the human-readable command index from the same registry. No live token is used.

`npm run lint` uses pinned ESLint10.12.0;current Node minimum22.13+ keeps tooling compatible. CI includes lint with formatter/tests and inventory drift checks.

Repository visibility:PUBLIC as of October11,2026,2:54PM,after explicit owner confirmation reversing the morning private decision. Current published checkpoint1132/505 (dd2d3ecb6b92166c0b81b0900700e8d52ec5eb1b),exact-headCI verified;this receipt update is local. Never commit tokens or private runtime data.

Private source publication on October11,2026:506-test/182-path source checkpoint commit `0d2fff5d1356b56e06227adf7695b061ac79228b`. [Publisher verification](https://github.com/1nonlyhckrr-hue/coldy/actions/runs/38125749267) passed;[current-head Node22/24 CI](https://github.com/1nonlyhckrr-hue/coldy/actions/runs/38125897895) passed. Temporary transfer release/asset/tag deleted. No deployment or live Discord acceptance. This local publication receipt was added after the published checkpoint;later archive will include it.

## Railway / bhai ke liye deploy

Follow [Railway quickstart](docs/RAILWAY_QUICKSTART.md):separate service,Dockerfile Node22,secret env variables,persistent writable `/app/var` volume,correct Emika/Cuties IDs,and one-time guild command registration. `npm start` is available. No token or real database is included. This is prepared/tested code,not proof of a live Railway deployment. Experimental Music stays off until a verifiable compatible node is configured.

Help supports exact category and literal case-insensitive search filters with eight full rows/page. Command descriptions remain English;headers/errors use saved guild locale. No claim of full translated slash metadata.

`npm run doctor` is an offline preflight after setting env:Node version,required field shapes,guild-registration ID and command registry. Prints no token/node-auth/database-path values and performs no login/network/registration/DB write. Missing required env exits1. Passing is not live readiness:token validity,volume ownership,intents,permissions and provider playback still need actual verification.

## Documented reference scope

[Behavior closure](docs/REFERENCE_CLOSURE_MAP.md) maps319exact registry rows to bounded adaptations or explicit safety/native-limit omissions. [Supplemental scope](docs/SUPPLEMENTAL_CLOSURE.md) covers the5non-registry introduction/premium/legal/privacy pages,including3Premium command rows outside the original319inventory. All34official index pages have source-level dispositions. This is not541+numeric parity,live Discord acceptance or production readiness. Known music resolution diagnosis and native/client/audio acceptance remain open.

### Global slash commands

Preview remains credential-free: `node scripts/register.js --global`. Apply the same validated command set globally with `node scripts/register.js --apply --global` (no DISCORD_GUILD_ID required). Existing `npm run register:guild` still registers to DISCORD_GUILD_ID.

To migrate without duplicate guild overrides, register globally first, confirm success, then explicitly clear each intended guild with `node scripts/register.js --clear-guild <guild-id>`. Clearing immediately replaces only that guild command set with an empty array; it does not remove global commands. Never clear a guild after a failed global registration. Discord clients may take time to show global updates. These commands use the configured application ID/token; use Emika credentials only.

### Public command directory

`/help` posts a public Emika command directory. Everyone in the channel can browse the category menu and Home/Previous/Next buttons. It covers all589 installed paths across20categories, with eight complete command rows per page. Existing category/search/page/command options still work; parameter details keep bounded pagination. Navigation sessions expire after30minutes or a process restart, with at most500 active sessions. Controls browse information only, never execute the displayed command or grant permissions.

The layout is locally previewed and mock-tested; Discord-side visual acceptance still needs a live guild check.
