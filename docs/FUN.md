# Fun

Thirteen original slash paths: `/fun 8ball question`, `coin`, `dice [sides] [count]`, `choose choices`, `truth`, `dare`, `rps move`, `shuffle choices`, `teams labels groups`, `number minimum maximum`, `sample choices count`.

Cryptographic random selection with `node:crypto.randomInt`. Dice: 2-1000 sides, 1-10 dice. Choices: 2-20 different entries separated by |, 1-100 characters each, 1800 total; control characters and duplicates rejected. User choice output escapes markdown and suppresses all mentions. 8-ball questions are validated but not echoed or stored. All replies are ephemeral shared Emika embeds in the stored guild locale. Five-second per-user/guild/subcommand cooldown in central dispatch. Nothing is stored in SQLite and no external GIF/search API is used.

Truth/dare use fixed low-pressure prompts that can be skipped. No sexual-content percentages, identity judgments, insults, gambling, money, directed contact, punishment or unsafe physical challenges. RPS is one self-contained round or a stateless preselected-move series against Emika,not a persistent multiplayer game. No rigged win rate. Slash labels/descriptions stay English in this checkpoint.

Eight new distinct tests cover selection endpoints/bad RNG, dice bounds, choices, all nine RPS outcomes, command metadata, every path in all three locales, malformed runtime input, and complete prompt dictionaries. Initial checkpoint passed110tests;current checkpoint is listed below. No live Discord interaction or pixel verification yet. These paths don't promote similar Zynrax reference rows as exact equivalents.

`/fun shuffle choices` privately randomizes all2-20distinct pipe-separated choices using cryptographic Fisher-Yates shuffling. Returns every choice once,escaped,no mention pings. Output over1700escaped characters is rejected instead of silently truncating. No saved state,multiplayer roles,decisions or assignments. Local deterministic RNG,bounds,locale/private output and overflow tests;393 total tests,38 top-level/164paths,SQLite25. Native/visual acceptance pending.

Number uses inclusive bounds from-1000000to1000000,unbiased system RNG,including singleton. Sample picks1-N distinct labels without replacement,no native member assignments/invites. Labels/output safety identical to shuffle;escaped oversized output refuses before reply.549localtests,198installedpaths;no live acceptance.

`dicekeep count keep mode [sides]`:roll1-10dice,sides2-1000(default6),keep1-count highest/lowest. Shows originalrolls,keptsortedvalues,sum;tiesareindividualdice,notdistinctvalue filtering. `rpsseries moves`:2-10 pipe-separated rock/paper/scissors,case-insensitive;duplicates allowed. EntireinputvalidatedbeforeRNG,independentcryptographicbotmoveeachround,completeperroundresults pluswin/loss/drawcounts andwin-vs-lossseriesresult. No persistentstate,stakes ortargetperson.6new tests,586fullsuite/207installedpaths;livepixelacceptancepending.

## Fresh card draw and word/dice activities

`/fun cards [count]` draws1-10distinct cards without replacement from a fresh52card deck per invocation;no saved hand,stakes or betting. Cryptographic RNG,localized suit labels. `wordscramble word` scrambles3-20ASCIIletters with at least2distinctletters,lowercases input,shows answer in a spoiler. Preserves exact letter multiset and changes order;fallback swap if shuffle happens to match original,so not an unbiased distinct-anagram sampler. Suppliedword only,no dictionary/guess history.

`dicetarget target [count] [sides]` rolls1-10dice,sides2-1000(default6),counts rolls at least target2-sides,inclusive. No saved game/stakes/otherperson. Private3locale/no mentions,no native effects/storage. Three tests deck/multiset/endpoints/RNG/bounds/target/privatepayloads.16Funpaths total;no live/client visual acceptance.

## Fresh game preparation

`bracket labels` randomizes2-16distinct labels(max40characters each),returns first-round matches with explicit single-label byes to the next power-of-two bracket. No winners, later-round pairings, dates, member lookup/assignment or tournament storage.

`bingo` generates a fresh75ball5x5card: B1-15,I16-30,N31-45,G46-60,O61-75. Each column has unique numbers,centerN is JSONnull/free. No calls, prizes, multiplayer state or win validation.

`dominoes count` draws1-7unique unordered tiles from fresh double-six28tile set (0-6pips),reports remaining count. No bets, opponent hand, rules enforcement or saved game. All three use bounded cryptographic randomness and private localized branded no-ping JSON attachments. Local deterministic structure/bounds and command tests,not live Discord/client visual acceptance.
