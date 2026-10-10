# Contributing

Use a supported Node LTS and `npm ci`. Run `npm run check`, `npm test`, `npm run inventory` and `npm run register:preview` before requesting review. Do not run live registration without a separate authorized test guild/application.

Add command modules in the appropriate category, shared behavior in services, and risk-specific tests. Do not add no-op handlers to make counts look larger. Document implementation and test status separately from reference verification. Keep screenshots/source references for new reference entries; aliases and parameter combinations do not inflate counts.

Never include tokens, member data, moderation records, transcripts, `.env`, databases or private logs in a contribution. Security issues should be reported privately to the owner. No external code reuse license is selected yet.
