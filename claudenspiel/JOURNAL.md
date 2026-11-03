# Journal

Claude's decision log for Claudenspiel, newest first: what changed, why, and what the bots measured. "Win index" is wins divided by the wins a seat would get by chance; 1.0 is par.

## 3 November 2026 · 0.2, ground, gold and the race

**Seat order, measured properly first.** With 630 more 3–4 player games on 0.1, the later seats really did win too often under the last round: 3 players 0.69 · 1.02 · 1.30, 4 players 0.63 · 0.93 · 1.23 · 1.21. Later seats see the score they have to beat, and earlier seats' cards sit open to attack longer. Kartenspiel's Seat start pushed the wrong way (more ● for later seats), so 0.2 does the opposite: earlier seats start with ◇ for every seat after them. Tested 2◇ and 3◇ per seat on the same deals; 3◇ evened it (3 players 1.03 · 0.95 · 1.03, 4 players 1.00 · 1.06 · 0.89 · 1.06). Two players were already even in 0.1, and with 0.2's economy a paired test of 0◇ against 1◇ (850+ games each) confirmed it: 0.99 · 1.01 with none, so two players get no handicap.

**Changes, and why.**
- *Grounds* (Marsh, Battlefield, Crossroads; 2 copies each, deck 122). Kartenspiel listed the Grounds type but had no cards. Terrain gives placement a second dimension: where you build now depends on the land, not only on your neighbours. Grounds are never claimed, never counted as enemies and never Overwhelmed. The archetype ban applies to them too (a Gardener can't lay a Goblet Crossroads); that seemed right, so it stays.
- *Banking* (6● → 1◇, at most 2◇ a turn) and *buying a second claim* (10●). In Kartenspiel about half of all ● went unspent and ● per turn barely changed the scoring pace, because one claim a turn is the limit. Both rules give ● a use.
- *A bought claim can't be paid with Reserves.* The first 0.2 test let Warcamp's Reserves buy a claim nearly every turn: the Warmonger jumped to 1.48. Paid from this turn's ● only, it came back to 1.01.
- *Obelisk* 6◇ (was 8), still doubled when surrounded: the strongest card under every bot in Kartenspiel. *Fountain* 3◇ per Leaf neighbour and any side (was 2◇, north and south only): the weakest card, and it now pairs with Marsh.
- *Race bar* above the board: every player's ◇ on one track to the target, with the last round announced. The wishlist's first UI item.

**Measured** (mixed greedy, tactician and raider bots, 1,146 games of 2–4 players, before the 2-player handicap was set to 0):

| | 0.1 | 0.2 |
|---|---|---|
| Archbishop | 1.05 | 0.96 |
| Cryptkeeper | 1.07 | 0.89 |
| Gardener | 0.99 | 0.97 |
| Hedonist | 1.03 | 1.08 |
| Philosopher | 0.95 | 1.08 |
| Warmonger | 0.91 | 1.01 |
| **Spread** | 0.16 | 0.19 |

Seat index, 0.2: 3 players 1.07 · 0.91 · 1.01; 4 players 1.20 · 0.94 · 0.98 · 0.88 (127 games, so within noise). Median game length 5 rounds (6 in 0.1): banking and second claims speed the race up.

**Open questions.**
- Games are a round shorter. Watch whether 48◇ should rise to 52◇ so the board gets fuller.
- Cryptkeeper slipped to 0.89; next balance pass.
- The bots barely use Grounds. Teach them (the Genius's danger term should see Marsh), then measure the cards properly.

## 3 November 2026 · 0.1, the fork

**Setup.** Forked from Kartenspiel at commit 1b43db7 into `claudenspiel/`, as the offline edition (single player, pass-and-play, sandbox, card builder). No server and no service worker; the GitHub Pages deploy is untouched. Storage keys renamed `ks.*` → `cs.*` so the two games never share saves, settings or painted cards. New logo and colours, so the fork never passes for the original.

**Changes, and why.**
- *116-card deck* (from 81). Kartenspiel's deck runs out at big tables (a reshuffle in 36% of 4-player games and 67% of 5-player games) and every game sees a thin slice of each suit. The copy counts are the ones that tested best in Kartenspiel's deck study: staples ×2–3, the strongest and strangest cards ×1, every suit 18–20 cards, Sceptre Structures 5 → 9 for the Archbishop, Phalanx and Halberd Strike ×2 so Ruins stay as common.
- *The last round.* Reaching 48◇ starts the last round instead of winning at once, so everyone gets the same number of turns; the highest total wins, ties to whoever got there first. It removes the first-player edge at the source.
- *Seat start off by default.* It gave later seats extra ● to make up for moving later; with equal turns that became a double bonus (3-player seat 3 at 1.49 against seat 1 at 0.50 in the first test).
- *Orchard 3◇ a card* (was 4). Gardener was the strongest archetype everywhere (1.44 with the archetype-aware bots, 1.19 with Genius bots).
- *Observatory +10◇ when all six suits are in the Kingdom* (5◇ a suit stays). Philosopher was the weakest (0.76). A first try at 6◇ a suit plus the bonus overshot to 1.25.
- *Revenge and Repent* can also be played from hand (draw 2, discard 1), and *Brambles* can be placed like any Structure. No bot ever played them in 1,000+ Kartenspiel games: a card that is dead in hand is a design bug.

**Measured** (mixed greedy, tactician and raider bots, 2–4 players):

| | Kartenspiel (610 games) | 0.1 first try (393) | 0.1 as shipped (384) |
|---|---|---|---|
| Archbishop | 0.89 | 0.83 | 1.05 |
| Cryptkeeper | 1.01 | 1.06 | 1.07 |
| Gardener | 1.44 | 1.02 | 0.99 |
| Hedonist | 1.01 | 0.98 | 1.03 |
| Philosopher | 0.76 | 1.25 | 0.95 |
| Warmonger | 0.91 | 0.88 | 0.91 |
| **Spread** | **0.68** | 0.42 | **0.16** |

2-player seats are now exactly even (1.00 / 1.00).

**Open questions.**
- In 3- and 4-player games seat 1 still looks weak (3-player: 0.61, 1.07, 1.32 by seat), but with ~100 three-player and ~30 four-player games that is within noise. Next: a few hundred more multi-player games, then decide whether seat 1 needs help (a first-turn card, or the last seat losing its tiebreak).
- All of this is with the quick bots; confirm with Genius-only games before the next balance release.
