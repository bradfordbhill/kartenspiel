# Claudenspiel

A two-to-four player deckbuilder with a tableau on the side. Dominion's deck cycling meets Carcassonne's linked regions, with four asymmetric Houses.

**Play:** open `index.html` in a browser (no build, no install). You face a bot.

**The hook:** a tile you place leaves your deck for good. It pays you income, abilities and points, but your deck gets thinner and you have fewer cards to buy with. Every tile must touch your tableau, and the whole tableau must fit in a 4×4 window, so you plan where each tile goes. Orthogonally linked tiles of one suit score as a region (2 tiles = 1 VP, 4 = 3, 6 = 6, 8 = 11). Wild tiles link every suit.

**Setup:** each game draws 6 tiles and 4 events out of 17 tiles and 8 events, so no two games share a market. Houses: Verdant (Wood pays coin), Crypt (placing draws and pays), Tide (bigger hand while small), Forge (two placements a turn).

| File | Purpose |
| --- | --- |
| `engine.js` | Pure rules engine, seeded and deterministic (Node and browser) |
| `bot.js` | Bots: `builder`, `balanced`, `money` |
| `ui.js`, `style.css`, `index.html` | The game |
| `tests/rules.js` | Rules checks plus 500 bot games |
| `tests/sim.js` | Balance sim: `node tests/sim.js 600 builder,builder` |
| `tests/e2e.js` | Plays a full game in a browser (needs Playwright) |

## Balance notes (600 bot games, builder vs builder)
First seat wins 49%, second 50%, ties 1%. Houses win 46–54%. Builder beats Big Money about 78% of the time, so building pays but money isn't dead.

## Ideas for next
More tiles per suit, a draft-the-market variant, one-shot house powers, an online mode.
