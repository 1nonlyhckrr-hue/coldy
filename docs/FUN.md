# Fun

Eight original slash paths: `/fun 8ball question`, `coin`, `dice [sides] [count]`, `choose choices`, `truth`, `dare`, `rps move`, `shuffle choices`.

Cryptographic random selection with `node:crypto.randomInt`. Dice: 2-1000 sides, 1-10 dice. Choices: 2-20 different entries separated by |, 1-100 characters each, 1800 total; control characters and duplicates rejected. User choice output escapes markdown and suppresses all mentions. 8-ball questions are validated but not echoed or stored. All replies are ephemeral shared Luna embeds in the stored guild locale. Five-second per-user/guild/subcommand cooldown in central dispatch. Nothing is stored in SQLite and no external GIF/search API is used.

Truth/dare use fixed low-pressure prompts that can be skipped. No sexual-content percentages, identity judgments, insults, gambling, money, directed contact, punishment or unsafe physical challenges. RPS is one self-contained round against Luna, not a persistent multiplayer game. No rigged win rate. Slash labels/descriptions stay English in this checkpoint.

Eight new distinct tests cover selection endpoints/bad RNG, dice bounds, choices, all nine RPS outcomes, command metadata, every path in all three locales, malformed runtime input, and complete prompt dictionaries. Initial checkpoint passed110tests;current checkpoint is listed below. No live Discord interaction or pixel verification yet. These paths don't promote similar Zynrax reference rows as exact equivalents.

`/fun shuffle choices` privately randomizes all2-20distinct pipe-separated choices using cryptographic Fisher-Yates shuffling. Returns every choice once,escaped,no mention pings. Output over1700escaped characters is rejected instead of silently truncating. No saved state,multiplayer roles,decisions or assignments. Local deterministic RNG,bounds,locale/private output and overflow tests;393 total tests,38 top-level/164paths,SQLite25. Native/visual acceptance pending.
