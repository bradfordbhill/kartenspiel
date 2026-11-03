# Claudenspiel

Claude's own fork of Kartenspiel: a long-running side project to grow the game into the best version it can be, with more cards, more mechanics, a new interface and new design, without being bound by the original's vision. Kartenspiel stays exactly as it is; everything here is separate.

Open `claudenspiel.html` in a browser to play: single player against bots (greedy, tactician, warlord, Genius), pass-and-play, the sandbox and the card builder. There is no online play yet.

## The charter

- **Goal:** the best possible game, judged by how it plays, not by faithfulness to Kartenspiel.
- **Claude decides.** Every change is Claude's call, recorded with its reasons in [JOURNAL.md](JOURNAL.md).
- **Measure, then change.** Balance changes are checked with bot self-play (`tools/sim2.js`, the Genius bot) before and after; the journal keeps the numbers.
- **Four wishlists** hold everything still to do: [UI](wishlists/ui.md), [gameplay](wishlists/gameplay.md), [progression](wishlists/progression.md) and [moonshots](wishlists/moonshot.md). Items move to done with a release.

## Kept apart from Kartenspiel

- Everything lives in `claudenspiel/`: its own `src/`, `tests/`, `tools/`, `assets/` and build. Nothing outside this folder is changed by Claudenspiel work, and Kartenspiel's build, tests and site never read anything in it.
- `build.sh` writes only `claudenspiel/claudenspiel.html`.
- Browser storage uses `cs.*` keys (Kartenspiel uses `ks.*`), so saved games, settings, the remembered setup and painted cards never mix, even in the same browser.
- Its own logo (verdigris Fraktur, drawn by `tools/logo.js`), colours (`src/claudenspiel.css`, loaded after the shared base styles) and patch notes (`src/patchnotes.js`).
- The fork started from Kartenspiel as of 3 November 2026 (commit 1b43db7). Kartenspiel fixes are not pulled in automatically; ones worth having are copied by hand and noted in the journal.

## Build and test

```
./build.sh
```

```
for t in tests/*.js; do node "$t"; done
```

`tests/cs*.js` cover Claudenspiel's own rules; the `qc*.js` files are Kartenspiel's checks, kept and updated where Claudenspiel's rules differ. `qc3.js` prints only failures, then a pass count.

```
node tools/sim2.js 2 0 200 /tmp/cs-p2.json     # bot self-play: players, first game, last game, output
node tools/rewrite-data.js changes.json         # apply a batch of card changes to src/data.js, keeping its layout
node tools/logo.js                              # redraw the logo (needs Playwright and the network)
```

## Publishing

Claudenspiel is published on its own at https://bradfordbhill.github.io/claudenspiel/, from its own repository, `bradfordbhill/claudenspiel`, never from Kartenspiel's site. The published page is the offline edition (no online play).

```
tools/publish.sh
```

It builds the game and force-pushes it as `index.html` to that repository's `main` branch, which GitHub Pages serves as-is (Settings → Pages → Deploy from a branch → `main`, `/ (root)`). The repository holds only the published page; the source stays here.

## Releases

| Version | What changed |
|---|---|
| 0.1 | The fork: separate saves and look; a 116-card deck; the last round; Seat start off; Orchard 3◇ a card; Observatory +10◇ for all six suits; Revenge and Repent playable from hand; Brambles placeable. Archetype spread 0.68 → 0.16 |
| 0.2 | Grounds (Marsh, Battlefield, Crossroads); banking; buying a second claim; a seat handicap for 3+ players; the race bar; Obelisk 6◇; Fountain reworked. Seats even at every table size |
