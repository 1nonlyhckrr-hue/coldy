# Luna

Professional multipurpose Discord bot project. Repository name: `coldy`. Node.js LTS, discord.js stable, SQLite persistence.

## Honest status

Phase 1 public research and Phase 2 foundation are available. **This is not a finished 541-command bot.** Twenty-six top-level slash commands provide 110 executable paths, including moderation, welcome/goodbye configuration, case logs, button-role panels, utilities, and persistent autoresponders, and persistent giveaways, and private tickets, scheduled messages, opt-in AutoMod, and seven safe solo Fun paths, and additive per-command Permit restrictions, and six single-member Voice moderation paths, and six safe CustomRole mapping paths, and seven opt-in message Leaderboard paths, and six alert-only Antinuke paths (no prevention/recovery yet), and four manual GuildTag reward paths and six private explicit VoiceMaster paths. See [module scope and remaining work](docs/MODULE_STATUS.md) and docs/PHASE3_STATUS.md. Other category directories reserve the modular layout; empty directories are not implemented modules.

The official Zynrax documentation yields 318 distinct documented command paths after shortcut deduplication. These are reference-only rows, not Luna implementations. The reference inventory is not advertised as the complete 541-command list. Aliases do not count as separate commands. Examples and parameter values do not count as new commands.

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

Local tests cover config validation, SQLite migrations and restart persistence, guild isolation, parameterized storage, permissions and role hierarchy, cooldowns, command serialization/mock execution, dispatch and error responses. These are automated local tests, not Discord integration tests. No Discord token was supplied. The earlier 51-test public checkpoint passed GitHub-hosted CI on Node 22 and 24. The 102-test module checkpoint is now published. The newer newer module checkpoint has 188 passing local tests and is not yet published. The public 102-test checkpoint passed final Node 22/24 CI. Docker and live Discord execution remain unverified.

## Reference sources

- https://www.zynrax.site/
- https://docs.zynrax.site/
- https://docs.zynrax.site/llms.txt
- https://top.gg/bot/1402377137087840378
- https://discordbotlist.com/bots/zynrax

Luna is original code. Zynrax is a reference benchmark; there is no affiliation or claim to its code or brand.

## License

No public reuse license has been selected yet. `UNLICENSED` is deliberate until the owner chooses one. Public visibility alone does not grant a license.
