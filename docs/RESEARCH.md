# Reference research - 2026-10-10

Zynrax's own website links to https://docs.zynrax.site/. Its public documentation index lists 34 markdown pages. Downloaded these public pages, extracting explicitly documented syntax and command tables. After discarding examples, treating explicit shortcuts as aliases and excluding arbitrary parameter values, the inventory contains 318 command paths across Luna's 20 requested planning categories.

Sources cover official docs, bot directories, a community listing, and primary runtime/storage/platform documentation. Product behavior is established only by the official docs; directories support identity/features, not command syntax.

## Gaps

The complete 541-command help menu is not established. Docs disagree on default prefix and use examples containing concrete argument values. Antinuke includes commands illustrated in images rather than text; those are not inferred into the text inventory. Permission/alias fields not stated in docs remain empty with explicit unknown notes. Some syntax is overloaded or collides across categories. Owner screenshots can help, but category/count-only screenshots do not prove every command path or its permissions.

## Runtime decision

Node's current release page lists 22 and 24 as LTS. Installed package metadata reports discord.js stable 14.27.0, minimum Node >=18, and better-sqlite3 13.0.3, minimum >=22. The discord.js main-branch documentation instead requires Node 24.17+, so v1 follows installed pinned stable-package metadata, not unreleased main-branch requirements. Local install and tests ran on 22.23.3. The published188-test checkpoint subsequently passed GitHub CI on Node22 and24;current local later expansion has not been published/tested on24.

## Sources

- https://www.zynrax.site/
- https://docs.zynrax.site/
- https://docs.zynrax.site/llms.txt
- https://docs.zynrax.site/security/moderation
- https://docs.zynrax.site/security/antinuke
- https://docs.zynrax.site/miscellaneous/music
- https://docs.zynrax.site/configuration/voicemaster
- https://top.gg/bot/1402377137087840378
- https://discordbotlist.com/bots/zynrax
- https://disdex.io/server/1415328129521815696
- https://nodejs.org/en/about/previous-releases
- https://discord.js.org/docs/packages/discord.js/main
- https://registry.npmjs.org/discord.js
- https://www.npmjs.com/package/better-sqlite3
- https://github.com/WiseLibs/better-sqlite3
- https://discord.com/developers/docs/interactions/application-commands

Raw public source snippets are retained in `data/reference-evidence.json`; full third-party marketing prose is not shipped in the code repository.

## Oct11 visual reference follow-up

Official antinuke screenshots inspected at https://docs.zynrax.site/security/antinuke. Standalone ,antinuke menu is visually established and added as one path:319reference rows. antilimit ban4 and anticonfig images corroborate existing parameterized commands;not additional commands. Screenshot menu buttons are configuration controls,not invented slash paths. Threshold event choices are parameter values,not distinct commands. Complete541help inventory remains missing.
