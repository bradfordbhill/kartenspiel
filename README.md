# Kartenspiel — playtest table

An asymmetric tableau-building card game for 2–5 players, with six archetypes (Archbishop, Hedonist, Warmonger, Cryptkeeper, Gardener, Philosopher).

This repo builds two apps from the same source:

- **The playtest table** (`index.html`): for designing the game. It has the card builder, sandbox and referee tools. Open it in any browser; nothing to install.
- **The public site** (`site/index.html`, published to GitHub Pages): for playing. It has **Single player** against bots, **Pass-and-Play** on one device, and **Online Multiplayer** with a server list, public and private tables, first-come-first-served archetypes, and player profiles (win/loss record, most played archetypes and cards, recent games). The card library is fixed: there's no card builder or sandbox.

Online play needs the game server in `server/`, which you host yourself (see [Deploying](#deploying)).

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The built playtest table. `build.sh` generates it, so don't edit it by hand |
| `site/index.html` | The built public site (not committed; `build.sh` makes it) |
| `src/data.js` | The card library: all 87 starter cards |
| `src/engine.js` | The rules engine: a pure `apply(state, action) → state`, no DOM. Also `redact()`, which hides other players' cards for online play |
| `src/ui.js` | The interface for both apps. `KConfig.edition === 'online'` switches on the public site's pages |
| `src/bots.js` | The bots (greedy, tactician, raider, warlord): single player in both apps, and the simulator |
| `src/net.js` | Public site only: the connection to the game server |
| `src/cardface.js` | Shared by the game and Dithry: card-face markup, suit icons, the suit textures, and the painted faces (`KFace.faces()`) |
| `src/cardart.js` | Painted card faces built into the game for every player (`KCardArt`), merged in from an art pack by `tools/cardart.js` |
| `src/sw.js`, `assets/` | The service worker (offline play), app manifest and icons, which `build.sh` copies into `site/`; and `assets/logo.png`, the Fraktur logo, which `build.sh` inlines into both apps |
| `server/server.js` | The game server: accounts, profiles, lobbies, and every online game's real state |
| `server/store.js` | Accounts and stats, saved to one JSON file |
| `src/style.css` | Windows 95–style look, light and dark modes |
| `dithry/` | **Dithry**, the pixel-art and dithered-gradient paint app: `engine.js` (the pixel work, no DOM), `app.js` (the interface), `dithry.css`. `build.sh` makes `dithry.html` and `site/dithry/index.html` |
| `cards.json` | The same 87 cards as plain JSON, for spreadsheets or other tools. Nothing in the build reads it |
| `tests/` | Rules checks, one file per batch of cards and rules. `qc8` covers redact/resign, `qc9-server` the server, `qc10-bots` the single-player bots, `e2e/online.js` two browsers playing online, `e2e/solo.js` a game against bots, `e2e/keys.js` the keyboard shortcuts and Help's contents, `e2e/mobile.js` the phone layout and drag and drop (real touch events), `e2e/pressure.js` the Overwhelm pressure chevrons, `e2e/app.js` installing as an app and playing offline, `e2e/suits.js` the suit wheel and placement chevrons, `e2e/dithry.js` the Dithry paint app (every tool, layers, files, and art going into the Card Builder) |
| `.github/workflows/pages.yml`, `render.yaml`, `Dockerfile` | Deployment: the site to GitHub Pages, the server to Render or any Docker host |
| `tools/sim2.js` | Bot self-play for balance analysis, using the bots in `src/bots.js` |
| `tools/analyze2.js` | Summarizes simulation output |
| `tools/cardart.js` | Merges a card art pack from Dithry into `src/cardart.js` (`node tools/cardart.js kartenspiel-card-art.json`) |
| `tools/art.js` | Redraws the Fraktur logo and the app icons as pixel art (`node tools/art.js`, then `./build.sh`) |

## Build, test, simulate

You need Node.js for everything except playing.

```
./build.sh
```

This joins `src/` into `index.html` and `site/index.html`. **Run it after every change to `src/`.** Then reload the page.

To run the online version on your own computer:

```
npm install
npm start
```

Then open http://localhost:8080. The server hosts the site itself, so this is the complete game; open a second browser window (or a private window) to play against yourself.

```
for t in tests/*.js; do node "$t"; done
```

Every line should read PASS (`qc3.js` prints only its failures, then a pass count). `qc9-server.js` needs `npm install` first. The browser test needs Playwright: `node tests/e2e/online.js`.

```
mkdir -p tools/simout
node tools/sim2.js 2 0 100 tools/simout/p2.json   # players, first game, last game, output
node tools/sim2.js 3 0 100 tools/simout/w3.json "Warmonger=warlord,*=greedy"   # fixed styles; Warmonger in every game
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

**Phones** get their own game layout (`gamePageMobile`): top bar, board, hand strip and Players / Log / Card / Menu sheets, switched by screen width (`MOBILE_Q`), so the desktop page is unchanged. **Drag and drop** and the touch gestures (pinch, pan, press-and-hold) live in the "touch and drag" section and use pointer events, so mouse, touch and pen share one path. A drop sends the same engine action a click would. Tests can fix the shuffle with `window.ksSeed` and the bots' pace with `window.ksBotDelay`; `KS_SEED=n node tests/e2e/mobile.js` replays one deal.

**Comforts** (all in `ui.js`):
- **Hints:** `hintBar` suggests a next step on your turn.
- **End-turn check:** `leftToDo` asks once before you end a turn while you could still play or claim a card.
- **Recap:** `recapHTML` shows, in the turn dialogs, what everyone else did since your last turn.
- **Unplayable cards:** each one carries a short reason (`blockShort`).
- **Hand order:** `handOrder` sorts the hand as drawn, by suit or by cost. Only the display changes.
- **Bot speed:** set with `BOT_SPEED`.
- **Rematch:** the `rematch` action starts a new game with the same players and rules.
- **Remembered setup:** the last game's setup is kept in `ks.setup`.

Player preferences live in `ks.prefs` (`hints`, `confirmEnd`, `botSpeed`, `handSort`). Help can turn the hints and the end-turn check back on.

Keyboard shortcuts (`onKey` in `ui.js`) mostly press the same on-screen button a click would, so they follow its rules; press **?** in the app for the list.

The file runs top to bottom like this: helpers and icons → app state and library loading → dispatch and undo → animations (`FX`) → card faces → board → inspector panel → players and log → one function per page → event handlers → hover magnifier.

Saved in the browser's localStorage: `ks.lib` (the card library), `ks.game` and `ks.sandbox`; on the public site also `ks.token` (your sign-in) and `ks.server` (a server address you chose).

### Single player

Any seat on the New game page (Play locally on the public site) can be a **Greedy**, **Tactician** or **Warlord** bot. Bots are players whose state carries `bot: '<style>'`; `src/bots.js` decides their moves, the same code the simulator uses.

- **Visible moves.** A bot plans its whole turn at once (`KBots.plan`), then the UI plays it out one action per tick (`botDriver` / `botStep` in `ui.js`), so each move animates and lands in the log like a person's.
- **Your decisions stay yours.** If a bot's move asks you something, it waits for your answer, then plans again from the new position.
- **One human at the table** gets the online-style view: your hand always shows, and there are no pass-the-device screens. Undo steps back past the bots' moves to your own last action.
- **Fair play, mostly.** Bots judge moves by trying them on a copy of the game, which holds everything. They don't read your hand, but a look-ahead can touch hidden cards: the warlord's suit guess for Fortune Teller effectively sees the top card of the deck.

### Online play

The server owns every online game. Browsers never run game rules for an online game; they send actions, and the server does three things with each one:

1. **Checks it's that player's move.** Only the current player may act, except to answer a question the game asked them. Referee and sandbox actions are refused.
2. **Runs `KEngine.apply`.** This is the same engine as everywhere else.
3. **Sends each player their own view of the new state.** `KEngine.redact(state, seat)` replaces other players' hands with "Hidden card" placeholders and hides the deck order and the shuffle seed.

The server is `server/server.js`, built on Node's `http` module plus the `ws` package. Messages are small JSON objects: `hello` signs a connection in with a session token, then `create`, `join`, `pick` (archetype), `opts`, `start`, `act` (a game action) and `leave`. The server replies with `room`, `defs` (the card definitions, sent once per game), `state`, `lobbies` and `error`. Accounts and profiles go over plain HTTP: `POST /api/register`, `POST /api/login`, `GET /api/profile/NAME`.

- **Disconnects.** A player who disconnects keeps their seat for 2 minutes (20 seconds in a lobby). After that they resign: the engine's `resign` action puts them out, as if their Foundation had been Overwhelmed. Leaving a game in progress counts as a loss.
- **Stats.** These are recorded when a game ends, for everyone who played: wins and losses, games per archetype, how many times each card was played, and the last 30 games. Passwords are stored as salted scrypt hashes.
- **Guests.** **Log in as guest** (`POST /api/guest`) gives a one-tap session under a made-up name like Guest-K7QX. Guests play fully but have no profile or saved stats; their opponents' records still count the game. Guest sessions live in the server's memory for a day, and names starting with "Guest" can't be registered.
- **Limits.** Sign-up and sign-in allow 10 attempts a minute per address; an account keeps its 20 newest sessions; each connection may send about 20 messages a second. Games live in the server's memory, so restarting the server ends any games in progress (accounts and stats are on disk).

## Dithry: drawing art in the game's style

Dithry (`dithry/`, live at `<site>/dithry/`, linked from the Home page, Help and the Card Builder) is a Paint-style app for making card art that matches Kartenspiel's dithered look. Every tool builds a **mask** (which pixels it touches); `engine.js`'s `paint()` then fills the mask with the current **style**:

- **Ramp:** 1–4 colours, each with its own alpha, so a style can tint what's underneath (the card wash is brown at 7%).
- **Gradient field:** a value from 0 to 1 for each pixel. It can be linear, radial, diamond, around a point, following the shape's edge, or flat. It spans each shape, or the two handles the Gradient tool sets, with start, end, midpoint and softness controls.
- **Ripples:** they bend that field into waves, and turbulence roughens it.
- **Dither pattern:** it turns the field into the ramp's colours. There are 16 patterns: the Bayer matrices, halftone, ruled and slanted lines, masonry, wind-bent grass, swoosh streaks, waves, vines, scales and scatter.

The tools are:
- **Drawing:** select, pencil, brush, eraser and line.
- **Shapes:** rectangle, ellipse, polygon and freehand shape.
- **Filling:** fill and gradient.
- **Other:** picker, move, hand and zoom.

Layers have visibility, lock and opacity. Undo and redo cover pixel changes and layer-structure changes. Mirror drawing, selections (with copy, cut and paste), and **Dither layer by brightness** (which turns an imported picture into pixel art) round it out.

**On phones**, either way up (`(max-width: 820px), (max-height: 520px)`):
- **Layout.** The canvas fills the screen, with a top bar (☰ menu, Undo, Redo, Fit) and a strip of tools. A tab bar (Tool, Colour, Style, Layers, Card) opens the panels in a sheet: from the bottom when the phone is upright, from the right when it's on its side. The picture slides out from under the sheet.
- **Gestures.** Tap with two fingers to undo and three to redo, pinch to zoom, and press and hold to pick a colour. A Finish / Last point / Cancel bar finishes polygons, and a "Snap" option stands in for Shift.
- **Taps.** Buttons act when a finger lifts (`onTap`), because Chrome drops a tap that comes straight after a stroke. Fields are 16px, so iPhones don't zoom in when you tap one.

Projects save as `.dithry` files (JSON with a PNG per layer) and autosave in the browser. **Export PNG** scales by whole steps so pixels stay square. The Card Builder keeps PNGs with 256 colours or fewer as crisp, unsmoothed pixel art (`isPixelArt` in `ui.js`), and draws them with `image-rendering: pixelated`.

### Painting the cards

**Card mode** (File → Paint the Kartenspiel cards; or `dithry.html#cards`, or `#card=<id>`; linked from the Library and the Card Builder) steps through the library one card at a time.

**One canvas, two versions.** The card's hand version (75 × 103, shown at 2× on a 150 × 206 desktop hand card) and its board version (52 × 52, on a 104 × 104 cell) sit side by side on one canvas. The gap between them and the space below the square card can't be painted (`app.allow`).

**The text stays in front.** The card's own text is drawn on top of the paint with the game's face markup (`KFace.handFace` / `KFace.boardBlank`) and its stylesheet, inside a shadow root.

**What you start from.** A card begins as its suit colour plus its usual dithered texture, on a `Card` layer, with an empty `Paint` layer above it. The colour palette switches to that suit's own (muted, ancient tones, dark to light, ending at the suit's card colours: `PALETTES` in `dithry/app.js`).

**Saving.** **Save to Kartenspiel** writes the two pictures to this browser's `ks.faces`. The game reads it through `KFace.faces()` and redraws on the `storage` event, so an open Kartenspiel tab updates right away. Dithry keeps the card's layers in `dithry.card.<id>`, so you can reopen it and carry on. **Reset** removes a card's painting.

**For every player.** **Art pack… → Download** saves every painted card in one file. Then:
1. Run `node tools/cardart.js kartenspiel-card-art.json` to write them into `src/cardart.js`.
2. Rebuild and push.

Painted faces show wherever the card is drawn: in hand, on the board, the Library preview and the drag ghost. Ruined and Ascended cards keep their own looks.

To add a dither pattern, add an entry to `PATTERNS` in `dithry/engine.js`: it returns a threshold from 0 to 1 for each pixel, where lower thresholds show first. To add a style preset, add it to `PRESETS`.

## Deploying

The site and the server deploy separately: GitHub Pages can only host static files, so the server needs a host that runs Node.

**Installing as an app.** The public site is a Progressive Web App: players can add it to their home screen (Android and desktop Chrome: the Home page's **Install app** button; iPhone and iPad: Share → Add to Home Screen) and it then opens full screen with its own icon. Single player and pass-and-play work offline; online play needs the server as usual. The page is fetched fresh whenever there's a connection, so updates arrive on the next launch.

**The site (GitHub Pages).** `.github/workflows/pages.yml` builds and publishes it on every push to `main`. It's served at https://bradfordbhill.github.io/kartenspiel/. Pass-and-Play works there with no server.

**The server.** Pick any one of these:
- **Render:** New → Blueprint → choose this repo. It reads `render.yaml`.
- **Docker:** `docker build -t kartenspiel . && docker run -p 8080:8080 -v kartenspiel-data:/data kartenspiel`
- **Any Node host:** `npm ci && npm start`. Settings: `PORT` (default 8080) and `DATA_DIR` (default `server/data`).

Accounts and stats live in `DATA_DIR/db.json`. That folder must be on a disk that survives restarts; Render's free plan wipes its disk, so stats reset there. The server's own address also serves the full site.

**Connecting them.** Add a repository variable `KARTENSPIEL_SERVER` set to the server's address (GitHub → Settings → Secrets and variables → Actions → Variables), then re-run the Pages workflow. Until then, a player can paste a server address on the site's Online page, or add `?server=https://...` to the URL.

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

**Add a rule option.** Read it into `opts` in `newGame` (`engine.js`) and use it via `st.opts`. In `ui.js`, add a default to `setup`, a checkbox in `newGamePage`, and pass the option through in the `'start'` case of `act()`. For online games, also add it to `DEFAULT_OPTS` and `cleanOpts` in `server/server.js` and to the options in `roomHTML` (`ui.js`).

**Change the cards on the public site.** The site and the server both use the built-in cards in `src/data.js`; edit them there and redeploy both. Cards made in the playtest table's card builder don't reach the site until you copy them into `data.js` (Library → Export… gives you the JSON).

**Write a test.** Copy the pattern in `tests/qc7.js`: start a `game()`, set up the board with `sbPlace`/`sbClaim`/`give`, play the card with `A({ t: 'play' ... })` or `A({ t: 'cast' ... })`, answer prompts with `ans(...)`, then `chk(name, condition, message)`.

**Debugging.** The **Copy debug report** button above the board copies the log, a text map of the board and the full state. Paste the state into **New game → Load a game from text…** to reproduce a bug.

## Notes

The live app also syncs cards with a shared online library; this repo holds the built-in copy of that library as of the export date. Decay and Standard Bearer have placeholder costs, and Decay tokens have no effect yet.
