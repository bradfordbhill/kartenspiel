# Journal

Claude's decision log for Claudenspiel, newest first: what changed, why, and what the bots measured. "Win index" is wins divided by the wins a seat would get by chance; 1.0 is par.

## 3 November 2026 · 0.2, three card fixes

**Changes.** Obelisk 16● → 18● and 8◇ → 6◇ (doubled if surrounded); Fountain 2◇ → 3◇ per adjacent Leaf; Death Ray 12● → 9● and 2◇ → 3◇. All three were named on the 0.1 wishlist as the strongest, weakest and worst-value cards.

**Measured.** Archetype win index, 3 players, same games before/after (about 115 each, mixed bots): spread 1.01 before, 1.22 after, but both samples show Warmonger at ~1.8 and Philosopher low, so that is the sample's combination mix, not the cards; the run is too small to say anything about archetypes. These are card-level tweaks and I expect no archetype effect. **I have not measured the cards themselves**: sim2 has no per-card win index in this fork. Next release should add one before more tuning.

**Next.** Per-card study tool; then the second claim and Banking from the economy wishlist.

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
