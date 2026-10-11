# Luna

Professional multipurpose Discord bot project. Repository name: `coldy`. Node.js LTS, discord.js stable, SQLite persistence.

## Honest status

**This is not a finished 541-command bot.** 47 top-level slash commands provide 352 executable paths. Built scope includes moderation, welcome/goodbye settings, case logs, button roles, utilities, autoresponders, giveaways, private tickets, scheduled messages, AutoMod, solo Fun, Permit restrictions, single-member Voice, CustomRole mappings and message Leaderboard. Antinuke is alert-only, GuildTag uses manual refresh, and VoiceMaster creates explicit private channels. Music has18 experimental opt-in paths,off by default;live playback/client compatibility remain unverified;one stable4.2.2 node metadata candidate verified,not configured. See [module scope and remaining work](docs/MODULE_STATUS.md) and docs/PHASE3_STATUS.md. Empty category directories are not implemented modules.

The official Zynrax documentation yields 319 distinct documented command paths after shortcut deduplication. These are reference-only rows, not Luna implementations. The reference inventory is not advertised as the complete 541-command list. Aliases do not count as separate commands. Examples and parameter values do not count as new commands.

## Quick start

```sh
npm ci
cp .env.example .env
# Fill the required variables locally. Never send or commit secrets.
npm run check
npm test
npm run register:preview
# After creating a separate Luna application and test server:
npm run register:guild
npm start
```

Read [INSTALLATION](INSTALLATION.md), [CONFIGURATION](CONFIGURATION.md), [DEPLOYMENT](DEPLOYMENT.md), [TROUBLESHOOTING](TROUBLESHOOTING.md), [COMMAND_INDEX](COMMAND_INDEX.md), [SECURITY](SECURITY.md), [ARCHITECTURE](ARCHITECTURE.md), and [ROADMAP](ROADMAP.md).

## Verification

Local tests cover configuration, SQLite migrations/restarts, guild isolation, permissions/hierarchy, input bounds, cooldowns, mock command execution and side-effect failure states. All976 distinct automated tests pass locally; these are not live Discord integration tests. The659-test/214-path published checkpoint passed Node22/24 CI at [the verified published-head run](https://github.com/1nonlyhckrr-hue/coldy/actions/runs/38142183664). 659/214 source publication and exact-head Node22/24CI are verified;Later local changes need their own publication and CI verification. No Discord token, live visual test, Docker build or deployment has been verified.

## Reference sources

- https://www.zynrax.site/
- https://docs.zynrax.site/
- https://docs.zynrax.site/llms.txt
- https://top.gg/bot/1402377137087840378
- https://discordbotlist.com/bots/zynrax

Luna is original code. Zynrax is a reference benchmark; there is no affiliation or claim to its code or brand.

## License

No public reuse license has been selected yet. `UNLICENSED` is deliberate until the owner chooses one. Public visibility alone does not grant a license.

## Separate installed inventory

`npm run inventory:luna` generates `data/luna-commands.json` and CSV from the actual slash registry.352 installed paths are original Luna behavior,not claimed reference equivalence. Runtime permission conditions are documented separately from static/default fields. Local mocks passed976tests;live-tested flag stays false until native acceptance.

## Source style and checks

Pinned Prettier formats source/scripts/tests;`npm run format:check` verifies style in CI. `npm run format` applies it locally. Safety ESLint rules check undefined identifiers,duplicate keys,unreachable statements and dynamic-code execution. These targeted checks do not establish complete semantic correctness. CI also regenerates both inventories and checks for drift. The installed inventory generator refreshes the human-readable command index from the same registry. No live token is used.

`npm run lint` uses pinned ESLint10.12.0;current Node minimum22.13+ keeps tooling compatible. CI includes lint with formatter/tests and inventory drift checks.

Repository visibility:PUBLIC as of October11,2026,2:54PM,after explicit owner confirmation reversing the morning private decision. Current published checkpoint659/214 (041890f35e06647be9ae0b7c34d080145f1bf93a),exact-headCI verified;this receipt update is local. Never commit tokens or private runtime data.

Private source publication on October11,2026:506-test/182-path source checkpoint commit `0d2fff5d1356b56e06227adf7695b061ac79228b`. [Publisher verification](https://github.com/1nonlyhckrr-hue/coldy/actions/runs/38125749267) passed;[current-head Node22/24 CI](https://github.com/1nonlyhckrr-hue/coldy/actions/runs/38125897895) passed. Temporary transfer release/asset/tag deleted. No deployment or live Discord acceptance. This local publication receipt was added after the published checkpoint;later archive will include it.

## Railway / bhai ke liye deploy

Follow [Railway quickstart](docs/RAILWAY_QUICKSTART.md):separate service,Dockerfile Node22,secret env variables,persistent writable `/app/var` volume,correct Luna/Cuties IDs,and one-time guild command registration. `npm start` is available. No token or real database is included. This is prepared/tested code,not proof of a live Railway deployment. Experimental Music stays off until a verifiable compatible node is configured.

Help supports exact category and literal case-insensitive search filters with eight full rows/page. Command descriptions remain English;headers/errors use saved guild locale. No claim of full translated slash metadata.

`npm run doctor` is an offline preflight after setting env:Node version,required field shapes,guild-registration ID and command registry. Prints no token/node-auth/database-path values and performs no login/network/registration/DB write. Missing required env exits1. Passing is not live readiness:token validity,volume ownership,intents,permissions and provider playback still need actual verification.
