# Fun

Seven original slash paths: `/fun 8ball question`, `coin`, `dice [sides] [count]`, `choose choices`, `truth`, `dare`, `rps move`.

Cryptographic random selection with `node:crypto.randomInt`. Dice: 2-1000 sides, 1-10 dice. Choices: 2-20 different entries separated by |, 1-100 characters each, 1800 total; control characters and duplicates rejected. User choice output escapes markdown and suppresses all mentions. 8-ball questions are validated but not echoed or stored. All replies are ephemeral shared Luna embeds in the stored guild locale. Five-second per-user/guild/subcommand cooldown in central dispatch. Nothing is stored in SQLite and no external GIF/search API is used.

Truth/dare use fixed low-pressure prompts that can be skipped. No sexual-content percentages, identity judgments, insults, gambling, money, directed contact, punishment or unsafe physical challenges. RPS is one self-contained round against Luna, not a persistent multiplayer game. No rigged win rate. Slash labels/descriptions stay English in this checkpoint.

Eight new distinct tests cover selection endpoints/bad RNG, dice bounds, choices, all nine RPS outcomes, command metadata, every path in all three locales, malformed runtime input, and complete prompt dictionaries. All 110 project tests pass after fixing newline validation. No live Discord interaction or pixel verification yet. These paths don't promote similar Zynrax reference rows as exact equivalents.
