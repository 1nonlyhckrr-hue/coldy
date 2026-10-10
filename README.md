# Luna

Professional multipurpose Discord bot project. Repository name: `coldy`. Node.js LTS, discord.js stable, SQLite persistence.

## Honest status

**This is not a finished 541-command bot.** Thirty-two top-level slash commands provide 133 executable paths. Built scope includes moderation, welcome/goodbye settings, case logs, button roles, utilities, autoresponders, giveaways, private tickets, scheduled messages, AutoMod, solo Fun, Permit restrictions, single-member Voice, CustomRole mappings and message Leaderboard. Antinuke is alert-only, GuildTag uses manual refresh, and VoiceMaster creates explicit private channels. Music queue/adapter core is tested but not activated or counted as commands. See [module scope and remaining work](docs/MODULE_STATUS.md) and docs/PHASE3_STATUS.md. Empty category directories are not implemented modules.

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

Local tests cover configuration, SQLite migrations/restarts, guild isolation, permissions/hierarchy, input bounds, cooldowns, mock command execution and side-effect failure states. All261 distinct automated tests pass locally; these are not live Discord integration tests. The earlier188-test public checkpoint passed Node22/24 CI at [the verified head run](https://github.com/1nonlyhckrr-hue/coldy/actions/runs/38081947689). Later changes need their own verification. No Discord token, live visual test, Docker build or deployment has been verified.

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

`npm run inventory:luna` generates `data/luna-commands.json` and CSV from the actual slash registry.133 installed paths are original Luna behavior,not claimed reference equivalence. Runtime permission conditions are documented separately from static/default fields. Local mocks passed261tests;live-tested flag stays false until native acceptance.

## Source style and checks

Pinned Prettier formats source/scripts/tests;`npm run format:check` verifies style in CI. `npm run format` applies it locally. Safety ESLint rules check undefined identifiers,duplicate keys,unreachable statements and dynamic-code execution. These targeted checks do not establish complete semantic correctness. CI also regenerates both inventories and checks for drift. No live token is used.

`npm run lint` uses pinned ESLint10.12.0;current Node minimum22.13+ keeps tooling compatible. CI includes lint with formatter/tests and inventory drift checks.
