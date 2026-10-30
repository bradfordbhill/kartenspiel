# Kartenspiel — playtest table

An asymmetric tableau-building card game for 2–5 players, with six archetypes (Archbishop, Hedonist, Warmonger, Cryptkeeper, Gardener, Philosopher), and this browser app to playtest it.

## Play

Open `index.html` in any modern browser. It is one self-contained file, so there's nothing to install and no server to run. Games save in the browser automatically.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The built app. `build.sh` generates it, so don't edit it by hand |
| `src/data.js` | The card library: all 87 starter cards |
| `src/engine.js` | The rules engine: a pure `apply(state, action) → state`, no DOM |
| `src/ui.js` | The interface: game, sandbox, library, card builder, help |
| `src/style.css` | Windows 95–style look, light and dark modes |
| `cards.json` | The same 87 cards as plain JSON, for spreadsheets or other tools. Nothing in the build reads it |
| `tests/` | Rules checks, one file per batch of cards and rules |
| `tools/sim2.js` | Bot self-play for balance analysis (greedy, tactician and raider bots) |
| `tools/analyze2.js` | Summarizes simulation output |

## Build, test, simulate

You need Node.js for everything except playing.

```
./build.sh
```

This joins `src/` into `index.html`. **Run it after every change to `src/`.** Then reload the page.

```
for t in tests/*.js; do node "$t"; done
```

Every line should read PASS (`qc3.js` prints only its failures, then a pass count). One check currently fails: `qc5.js`, "You’ll Regret That | Trebuchet cursed".

```
mkdir -p tools/simout
node tools/sim2.js 2 0 100 tools/simout/p2.json   # players, first game, last game, output
node tools/analyze2.js
```

## How it fits together

```
 data.js            engine.js                         ui.js
 ───────            ─────────                         ─────
 KData.STARTER ──▶  KEngine.newGame(cards, setup) ──▶ state
 (card defs)                                            │
                    KEngine.apply(state, action) ◀── dispatch(ctx, action)  ◀── clicks
                          │                             │
                          └──▶ new state ──────────────▶ render()  ──▶ HTML
```

The three scripts load in that order and each exposes one global: `KData`, `KEngine`, then `ui.js`, which runs the page. The engine never touches the page, so the tests and the simulator use it from Node with `require`.

### The rule that keeps it simple

**All game logic lives in `engine.js`, and the only way to change a game is `apply(state, action)`.** It deep-copies the state, applies the action and returns the copy. When an action is against the rules, the returned state carries `state.error` and nothing has changed. This is why undo is just "go back to the previous state", and why saving a game is just `JSON.stringify(state)`.

Actions are small objects such as `{ t: 'play', uid: 'c12', k: '1,0' }`. The main ones are `startTurn`, `play` (place a card), `cast` (play from hand without placing), `claim`, `ability`, `swap`, `answer`, `endTurn` and `reclaim`. The ones starting with `sb` are referee and sandbox edits that skip the rules. The tests use these to set up boards quickly.

### The state

| Field | What it holds |
| --- | --- |
| `defs` | Card definitions by id: the game's own snapshot of the library |
| `cards` | Every physical card by uid (`"c12"`): its definition id plus in-play state (`ruined`, `claimants`, `tokens`, changed `suit`, ...) |
| `board` | `"x,y"` → stack of uids. Index 0 is the visible top card; the rest are buried under it. x grows east, y grows south |
| `players` | Name, archetype, `hand`, `ap` (●), `tokens` (banked ◇), `meeples`, `reserve`, `debt`, `out`, ... |
| `deck`, `discard` | uids |
| `cur`, `round`, `turn` | Whose turn it is, and this turn's bookkeeping (claimed yet? last cell placed?) |
| `res`, `pending` | The effect being resolved, and the question it's waiting on (see below) |
| `reactions` | Queued interrupts from other players' hands (Repent, Brambles, Revenge, ...) |
| `opts` | Game options and rule variants from the New game page |
| `log`, `seed`, `winner` | Game log, random seed for shuffles, winner's index |

### Card effects

A card's `onPlay` is a list of steps, for example Gluttony's `[{ do: 'draw', n: 2 }, { do: 'discard', n: 1 }]`. Each `do` names a handler in the `H` object in `engine.js`.

When a step needs a decision ("choose a card to Ruin"), its handler returns a prompt. The prompt goes into `state.pending` and the engine stops. The UI shows the prompt, the player answers, and the UI sends `{ t: 'answer', v: ... }`. The engine then calls the same handler again with the answer and carries on through the remaining steps. This is the trickiest part of the code; the comment above `pend()` in `engine.js` walks through it.

After anything changes the board, `afterBoardChange` runs the automatic rules: movement triggers, Defense tokens and Ascension, Overwhelm, Alchemy Lab, Brambles offers, then queued reactions.

### The interface

`ui.js` is plain JavaScript with no framework. On every change it rebuilds the page's HTML from scratch (`render()` → `renderNow()`). Buttons and cells don't have their own listeners. Instead they carry `data-` attributes (`data-act="endTurn"`, `data-cell="1,0"`, ...), and one click handler at the bottom of the file reads those attributes and routes each click.

The game page and the sandbox are each a *context*: `{ state, hist (undo history), ui (selection, zoom, toggles) }`. `dispatch(ctx, action)` is the only way the UI talks to the engine.

The file runs top to bottom like this: helpers and icons → app state and library loading → dispatch and undo → animations (`FX`) → card faces → board → inspector panel → players and log → one function per page → event handlers → hover magnifier.

Saved in the browser's localStorage: `ks.lib` (the card library), `ks.game` and `ks.sandbox`.

## Glossary

| Term | Meaning |
| --- | --- |
| ● | Aktion points (AP). Spent to place cards; gained each turn from cards you own |
| ◇ | Victory points. First to the target (48 by default) at the end of their turn wins |
| Claim / meeple | Putting a meeple on a card makes you its owner (`claimants` in the code) |
| Kingdom | The cards a player owns |
| Foundation | Each archetype's starting card. It can't be targeted; if it is Overwhelmed, that player is out |
| Weak to | The one suit an archetype can't play, which also counts as an enemy suit for Overwhelm |
| Ruined | Flipped: no effects, no owner. Overwhelmed cards are Ruined too |
| Overwhelm | Ruined automatically when enough enemy-suit cards are adjacent (3 by default) |
| Buried | Cards under the top card of a stack. Played Actions end up buried |
| Cursed | Has a Curse tucked under it, or covering it (Sarcophagus) |

## Common changes

**Edit a card's numbers or text.** Edit it in `src/data.js` and rebuild. ⚠ The app prefers the library saved in your browser over the built-in one, so open **Library → Restore starter cards…** (or clear the site's storage) to see your change. Update `cards.json` too if you use it. You can also tweak cards live in the app's **Card builder**, then copy the result back with **Library → Export…**.

**Add a card that only uses existing mechanics.** Copy a similar card's entry in `data.js` and give it a new `id`. The comment above `STARTER` lists what each field does.

**Add a new kind of effect.** Add a handler to `H` in `engine.js`. Copy a similar one: `ruin` or `curse` if it picks a card, `draw` if it doesn't. If the card has to be placed next to the cards it affects, add the step name to the `AREA` list in `needsPlacement`. To offer it in the card builder, add it to `STEP_PRESETS` and `PRESET_STEPS` in `ui.js`. Then write a test.

**Add a new way to score.** Add a `case` to `cardValue0` in `engine.js`, a label in `SCORE_KINDS`, and a line in `scoreText` (both in `ui.js`).

**Add a rule option.** Read it into `opts` in `newGame` (`engine.js`) and use it via `st.opts`. In `ui.js`, add a default to `setup`, a checkbox in `newGamePage`, and pass the option through in the `'start'` case of `act()`.

**Write a test.** Copy the pattern in `tests/qc7.js`: start a `game()`, set up the board with `sbPlace`/`sbClaim`/`give`, play the card with `A({ t: 'play' ... })` or `A({ t: 'cast' ... })`, answer prompts with `ans(...)`, then `chk(name, condition, message)`.

**Debugging.** The **Copy debug report** button above the board copies the log, a text map of the board and the full state. Paste the state into **New game → Load a game from text…** to reproduce a bug.

## Notes

The live app also syncs cards with a shared online library; this repo holds the built-in copy of that library as of the export date. Decay and Standard Bearer have placeholder costs, and Decay tokens have no effect yet.
