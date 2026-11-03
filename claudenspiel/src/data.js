/* Kartenspiel — starter data. Card definitions are plain JSON so they can live in a db later. */
var KData = (function () {
  var SUITS = ['Sceptre', 'Goblet', 'Sword', 'Bone', 'Leaf', 'Tome'];
  var TYPES = ['Foundation', 'Structure', 'Grounds', 'Action', 'Blessing', 'Curse'];
  var ALL4 = ['N', 'E', 'S', 'W'];

  // Every card gets every field: defaults first, then the card's own values on top.
  function c(o) {
    var d = {
      id: '', name: '', suit: 'Sceptre', type: 'Structure', cost: 0, copies: 1,
      income: 0, text: '', place: ALL4.slice(), overwhelm: null,
      score: { kind: 'none' }, sees: { area: 'none' }, onPlay: [],
      curse: null, ability: null, perTurn: null, incomePerToken: 0, mods: {},
      archetype: '', weakTo: '', art: '', note: ''
    };
    for (var k in o) d[k] = o[k];
    return d;
  }

  // The starter library (87 cards). Card fields:
  //   id                    unique; used in saves and to look the card up
  //   name, suit, type      type is one of TYPES above
  //   cost, income          ● to place it; ● it gives its owner each turn
  //   copies                how many go in the deck (Foundations start in hand instead)
  //   text, note            rules text shown on the card; designer note shown in the library
  //   place                 sides that may touch existing cards: some of N/E/S/W, or 'diag' for corners only
  //   overwhelm             enemy neighbours needed to Overwhelm it; null = default (3, Foundations 8)
  //   score                 how it is worth ◇: { kind, n, m, suit }. Formulas: cardValue0 in engine.js
  //   sees                  what the UI highlights when the card is selected
  //   onPlay                effect steps run when it's played. Handlers: H in engine.js
  //   ability               once-per-turn ability: { kind, pay, gain, ... }
  //   curse                 Curse cards only: { mode: 'under' | 'top', effect, releasedBy }
  //   perTurn, incomePerToken   token growth and ● per token (Acorn)
  //   mods                  special rule flags the engine looks for (adjacentCost, multiClaim, reaction, ...)
  //   archetype, weakTo     Foundations only: the archetype it belongs to, and the suit that archetype can't play
  //   art                   image as a data URL ('' for none)
  var STARTER = [
   {
    "id": "mausoleum",
    "name": "Mausoleum",
    "suit": "Bone",
    "type": "Foundation",
    "cost": 0,
    "copies": 1,
    "income": 8,
    "text": "3◇ per buried card in your Kingdom. You cannot play Leaf cards.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perBuriedInKingdom",
     "n": 3
    },
    "sees": {
     "area": "kingdom"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "Cryptkeeper",
    "weakTo": "Leaf",
    "art": "",
    "note": ""
   },
   {
    "id": "burial-rites",
    "name": "Burial Rites",
    "suit": "Bone",
    "type": "Action",
    "cost": 3,
    "copies": 1,
    "income": 0,
    "text": "Pick a Ruined card and flip it back over. Its suit is now Bone.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "board"
    },
    "onPlay": [
     {
      "do": "unruin",
      "setSuit": "Bone"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "embalm",
    "name": "Embalm",
    "suit": "Bone",
    "type": "Action",
    "cost": 3,
    "copies": 2,
    "income": 0,
    "text": "Bury a card from your hand under your Foundation. Do it twice if you’re the Cryptkeeper.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "bonusArchetype": "Cryptkeeper",
      "bonusN": 2,
      "do": "buryFromHand",
      "n": 1
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "living-death",
    "name": "Living Death",
    "suit": "Bone",
    "type": "Action",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "Draw two buried cards to hand from under unclaimed cards or cards you own.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "drawBuried",
      "n": 2
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "sarcophagus",
    "name": "Sarcophagus",
    "suit": "Bone",
    "type": "Curse",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "Place this card on top of an adjacent card. That card loses its effects and owner. If a Leaf card is played adjacent to this card, destroy the Curse and return the card to its previous owner.",
    "place": [
     "N",
     "E"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [
     {
      "area": "adjacent",
      "do": "curse"
     }
    ],
    "curse": {
     "effect": "cover",
     "mode": "top",
     "releasedBy": "Leaf"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "procession",
    "name": "Procession",
    "suit": "Bone",
    "type": "Action",
    "cost": 3,
    "copies": 2,
    "income": 0,
    "text": "Choose a non-Cryptkeeper player. That player must give you all Bone cards in their hand. If you didn’t choose a player, draw a card.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "takeSuitFromHand",
      "notArchetype": "Cryptkeeper",
      "orDraw": 1,
      "suit": "Bone"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "obelisk",
    "name": "Obelisk",
    "suit": "Bone",
    "type": "Structure",
    "cost": 18,
    "copies": 1,
    "income": 6,
    "text": "Worth 6◇. Double its value if fully surrounded.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flatDoubledIfSurrounded",
     "n": 6
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "last-will",
    "name": "Last Will and Testament",
    "suit": "Bone",
    "type": "Action",
    "cost": 9,
    "copies": 1,
    "income": 0,
    "text": "Choose a card from your hand and set it aside. You may play it for free next turn.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "setAside"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "If you don’t play it on your next turn, it stays in your hand at its normal cost."
   },
   {
    "id": "funeral-pyre",
    "name": "Funeral Pyre",
    "suit": "Bone",
    "type": "Structure",
    "cost": 6,
    "copies": 2,
    "income": 2,
    "text": "Once per turn, you may bury a card from your hand under this card.",
    "place": [
     "E",
     "W",
     "S"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": {
     "kind": "buryHand",
     "pay": 0
    },
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "crumbling-ossuary",
    "name": "Crumbling Ossuary",
    "suit": "Bone",
    "type": "Structure",
    "cost": 9,
    "copies": 2,
    "income": 0,
    "text": "Whenever a non-Cryptkeeper player claims this card or an adjacent card, they lose their remaining ● for their turn.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 6
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "claimDrain": "Cryptkeeper"
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "palace",
    "name": "Palace",
    "suit": "Goblet",
    "type": "Foundation",
    "cost": 0,
    "copies": 1,
    "income": 8,
    "text": "4◇ per Goblet card in your Kingdom, 3◇ per Goblet card not in it. You cannot play Sceptre cards.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perSuitSplit",
     "m": 3,
     "n": 4,
     "suit": "Goblet"
    },
    "sees": {
     "area": "board",
     "suit": "Goblet"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "Hedonist",
    "weakTo": "Sceptre",
    "art": "",
    "note": ""
   },
   {
    "id": "gluttony",
    "name": "Gluttony",
    "suit": "Goblet",
    "type": "Blessing",
    "cost": 3,
    "copies": 2,
    "income": 0,
    "text": "Draw 2 cards, then discard 1. You cannot play this card if you own more than 3 Sceptre cards.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "draw",
      "n": 2
     },
     {
      "do": "discard",
      "n": 1
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "cannotPlayIfOwnMore": {
      "n": 3,
      "suit": "Sceptre"
     }
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "The library sheet lists this as a Curse; kept as a Blessing because it has no Curse effect."
   },
   {
    "id": "gundy-and-dundy",
    "name": "Gundy and Dundy",
    "suit": "Goblet",
    "type": "Structure",
    "cost": 6,
    "copies": 2,
    "income": 3,
    "text": "Any number of players can claim this card. Worth 8◇, minus 2◇ for each claimant beyond 1.",
    "place": [
     "E",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flatMinusPerExtraClaimant",
     "m": 2,
     "n": 8
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "multiClaim": true
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "choreography",
    "name": "Choreography and Merriment",
    "suit": "Goblet",
    "type": "Structure",
    "cost": 6,
    "copies": 2,
    "income": 3,
    "text": "1◇ per Goblet card in your Kingdom. Once per turn, you may move this card to an adjacent space.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perSuitInKingdom",
     "m": 0,
     "n": 1,
     "suit": "Goblet"
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [],
    "curse": null,
    "ability": {
     "kind": "move",
     "pay": 0
    },
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "fairgrounds",
    "name": "Fairgrounds",
    "suit": "Goblet",
    "type": "Structure",
    "cost": 9,
    "copies": 2,
    "income": 3,
    "text": "",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 4
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "secrets-and-whispers",
    "name": "Secrets and Whispers",
    "suit": "Goblet",
    "type": "Action",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "Curse a card adjacent to one of yours. That card cannot generate ●.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "adjacentToOwn"
    },
    "onPlay": [
     {
      "area": "adjacentToOwn",
      "do": "curse"
     }
    ],
    "curse": {
     "effect": "noIncome",
     "mode": "under"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "den-of-sin",
    "name": "Den of Sin",
    "suit": "Goblet",
    "type": "Structure",
    "cost": 12,
    "copies": 1,
    "income": 6,
    "text": "You may corrupt two adjacent cards. Their suit is now Goblet. 2◇ per adjacent Goblet card.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perAdjacentSuit",
     "n": 2,
     "suit": "Goblet"
    },
    "sees": {
     "area": "adjacent",
     "suit": "Goblet"
    },
    "onPlay": [
     {
      "area": "adjacent",
      "count": 2,
      "do": "setSuit",
      "optional": true,
      "suit": "Goblet"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "ballroom",
    "name": "Ballroom",
    "suit": "Goblet",
    "type": "Structure",
    "cost": 12,
    "copies": 2,
    "income": 4,
    "text": "Whenever a card moves adjacent to this card, the owner of Ballroom may draw a card.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 4
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "drawOnMoveIn": 1
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "spice-caravan",
    "name": "Spice Caravan",
    "suit": "Goblet",
    "type": "Structure",
    "cost": 3,
    "copies": 1,
    "income": 8,
    "text": "At the end of your turn, this card moves one space East or West. If both spaces are occupied, Spice Caravan is discarded. If it moved successfully, you get 1◇ token.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "caravan": 1
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Tries East first, then West."
   },
   {
    "id": "sleeping-giant",
    "name": "Sleeping Giant",
    "suit": "Goblet",
    "type": "Structure",
    "cost": 9,
    "copies": 1,
    "income": 1,
    "text": "If a card moves or is Ruined adjacent to this card: the Sleeping Giant moves into that occupied space, leaving behind all cards that were buried under it. The card that was in that space, and all cards buried under it, are buried under the Sleeping Giant. (Burying invalidates claims.)",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 5
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "giant": 1
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Moves into the space of the card that moved or was Ruined."
   },
   {
    "id": "orchard",
    "name": "Orchard",
    "suit": "Leaf",
    "type": "Foundation",
    "cost": 0,
    "copies": 1,
    "income": 8,
    "text": "3◇ for each card in the largest contiguous region in your Kingdom. You cannot play Goblet cards.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "largestRegion",
     "n": 3
    },
    "sees": {
     "area": "kingdom"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "Gardener",
    "weakTo": "Goblet",
    "art": "",
    "note": ""
   },
   {
    "id": "acorn",
    "name": "Acorn",
    "suit": "Leaf",
    "type": "Structure",
    "cost": 6,
    "copies": 2,
    "income": 0,
    "text": "−1◇. At the end of your turn, place 1◇ token on this card. +1● per turn for each token on this card.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flatPlusTokens",
     "n": -1
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": {
     "token": 1,
     "when": "ownerTurnEnd"
    },
    "incomePerToken": 1,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "irrigation-canals",
    "name": "Irrigation Canals",
    "suit": "Leaf",
    "type": "Structure",
    "cost": 6,
    "copies": 2,
    "income": 0,
    "text": "8◇, minus 1 for each adjacent card not owned by this card’s owner.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flatMinusPerAdjacentNotOwned",
     "m": 1,
     "n": 8
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "turn-the-soil",
    "name": "Turn the Soil",
    "suit": "Leaf",
    "type": "Action",
    "cost": 3,
    "copies": 2,
    "income": 0,
    "text": "Discard your hand. Draw up to your hand size, plus one for every two Leaf cards in your Kingdom (rounded down).",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "discardHand"
     },
     {
      "do": "drawTo",
      "plusPer": {
       "per": 2,
       "suit": "Leaf"
      }
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "burrow",
    "name": "Burrow",
    "suit": "Leaf",
    "type": "Structure",
    "cost": 6,
    "copies": 2,
    "income": 3,
    "text": "1◇ per card north of this card.",
    "place": [
     "N",
     "E",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perCardNorth",
     "n": 1
    },
    "sees": {
     "area": "north"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "fountain",
    "name": "Fountain",
    "suit": "Leaf",
    "type": "Structure",
    "cost": 6,
    "copies": 2,
    "income": 3,
    "text": "3◇ per adjacent Leaf card.",
    "place": [
     "N",
     "S"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perAdjacentSuit",
     "n": 3,
     "suit": "Leaf"
    },
    "sees": {
     "area": "adjacent",
     "suit": "Leaf"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "topiary",
    "name": "Topiary",
    "suit": "Leaf",
    "type": "Structure",
    "cost": 12,
    "copies": 1,
    "income": 0,
    "text": "Copy an adjacent card with a cost up to 12●. This card is still a Leaf card.",
    "place": [
     "E",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [
     {
      "area": "adjacent",
      "do": "copy",
      "maxCost": 12
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Copies the target’s ◇ value, income and abilities, not its one-time effects."
   },
   {
    "id": "volcanic-soil",
    "name": "Volcanic Soil",
    "suit": "Leaf",
    "type": "Structure",
    "cost": 12,
    "copies": 1,
    "income": 0,
    "text": "When placed: for each non-buried card in the column north of this one, that card’s owner gets +1◇, or +2◇ if the card has any cards buried under it.",
    "place": [
     "N"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "north"
    },
    "onPlay": [
     {
      "buried": 2,
      "do": "northBonusOnce",
      "plain": 1
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "wise-old-tree",
    "name": "The Wise Old Tree",
    "suit": "Leaf",
    "type": "Structure",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "This card cannot be Ruined, Buried, Cursed, or Overwhelmed. Its suit cannot be modified. Cards cannot be placed on top of it. It cannot be claimed, but it does count as part of the Gardener’s Kingdom.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "immune": true,
     "kingdomOf": "Gardener"
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "proliferation",
    "name": "Proliferation",
    "suit": "Leaf",
    "type": "Action",
    "cost": 9,
    "copies": 1,
    "income": 0,
    "text": "Create a copy of a Leaf card in your Kingdom and add it to your hand.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "copyToHand",
      "suit": "Leaf"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Foundations cannot be copied."
   },
   {
    "id": "cathedral",
    "name": "Cathedral",
    "suit": "Sceptre",
    "type": "Foundation",
    "cost": 0,
    "copies": 1,
    "income": 8,
    "text": "6◇ per Sceptre card in your Kingdom. You cannot play Tome cards.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perSuitInKingdom",
     "n": 6,
     "suit": "Sceptre"
    },
    "sees": {
     "area": "kingdom",
     "suit": "Sceptre"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "Archbishop",
    "weakTo": "Tome",
    "art": "",
    "note": "Assumed “each Sceptre card” means Sceptre cards in your Kingdom."
   },
   {
    "id": "communion",
    "name": "Communion",
    "suit": "Sceptre",
    "type": "Structure",
    "cost": 9,
    "copies": 1,
    "income": 3,
    "text": "Draw a card, then discard a card.",
    "place": [
     "N",
     "S"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 5
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "draw",
      "n": 1
     },
     {
      "do": "discard",
      "n": 1
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "absolution",
    "name": "Absolution",
    "suit": "Sceptre",
    "type": "Action",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "If an adjacent card is Cursed, replace the Curse with this card, destroying it. You may change the card’s suit.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [
     {
      "area": "adjacent",
      "chooseSuit": true,
      "do": "removeCurse"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "convert",
    "name": "Convert",
    "suit": "Sceptre",
    "type": "Action",
    "cost": 6,
    "copies": 2,
    "income": 0,
    "text": "A card adjacent to a card you own has its suit changed to your choice of suit.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "adjacentToOwn"
    },
    "onPlay": [
     {
      "area": "adjacentToOwn",
      "do": "setSuit",
      "suit": "choose"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "inquisition",
    "name": "Inquisition",
    "suit": "Sceptre",
    "type": "Action",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "Choose a suit. Discard cards from the top of the deck until you reveal one of that suit. Draw it to hand.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "searchSuit",
      "rest": "discard"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "sanctuary",
    "name": "Sanctuary",
    "suit": "Sceptre",
    "type": "Structure",
    "cost": 12,
    "copies": 3,
    "income": 6,
    "text": "",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 4
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "lay-on-hands",
    "name": "Lay on Hands",
    "suit": "Sceptre",
    "type": "Action",
    "cost": 9,
    "copies": 1,
    "income": 0,
    "text": "Remove a Curse from a card you own.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "area": "kingdom",
      "do": "removeCurse"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "tithing-hall",
    "name": "Tithing Hall",
    "suit": "Sceptre",
    "type": "Structure",
    "cost": 12,
    "copies": 1,
    "income": 8,
    "text": "Once per turn, you may convert a card adjacent to a card you own to your choice of suit for 6●.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "adjacentToOwn"
    },
    "onPlay": [],
    "curse": null,
    "ability": {
     "area": "adjacentToOwn",
     "kind": "convert",
     "pay": 6
    },
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "tithe",
    "name": "Tithe",
    "suit": "Sceptre",
    "type": "Action",
    "cost": 12,
    "copies": 1,
    "income": 0,
    "text": "Choose a card on the field with at least 2 neighboring Sceptre cards. The owner of that card chooses two cards, then lets you pick a random one to put in your hand.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "tithe",
      "need": 2,
      "suit": "Sceptre"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "confessional",
    "name": "Confessional",
    "suit": "Sceptre",
    "type": "Structure",
    "cost": 15,
    "copies": 2,
    "income": 6,
    "text": "On their turn, any player may turn in a Curse (from a Cursed card on the board, or from their hand). They gain 3◇, and the Archbishop takes the Curse into their hand.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "m": 0,
     "n": 4,
     "suit": "Sceptre"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": {
     "kind": "confess",
     "pay": 0,
     "anyPlayer": true,
     "gain": 3,
     "toArchetype": "Archbishop"
    },
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "The Archbishop can only turn in Curses from the board."
   },
   {
    "id": "flying-buttresses",
    "name": "Flying Buttresses",
    "suit": "Sceptre",
    "type": "Structure",
    "cost": 15,
    "copies": 2,
    "income": 8,
    "text": "This card cannot be Buried.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 6
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "unburiable": true
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "warcamp",
    "name": "Warcamp",
    "suit": "Sword",
    "type": "Foundation",
    "cost": 0,
    "copies": 1,
    "income": 8,
    "text": "4◇ tokens per card you Ruin and 8◇ tokens per card you Overwhelm, paid when it happens. Each time, you also gain 12 Reserves: ● that stay until you spend them. You cannot play Bone cards.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "payoutOnOverwhelm": 8,
     "payoutOnRuin": 4,
     "reserveOnRuin": 12
    },
    "archetype": "Warmonger",
    "weakTo": "Bone",
    "art": "",
    "note": ""
   },
   {
    "id": "phalanx",
    "name": "Phalanx",
    "suit": "Sword",
    "type": "Action",
    "cost": 6,
    "copies": 2,
    "income": 0,
    "text": "Ruin an adjacent non-Bone card.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [
     {
      "area": "adjacent",
      "do": "ruin",
      "notSuit": "Bone"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "encampment",
    "name": "Encampment",
    "suit": "Sword",
    "type": "Structure",
    "cost": 9,
    "copies": 2,
    "income": 6,
    "text": "This card requires 1 additional card to Overwhelm it.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": 4,
    "score": {
     "kind": "flat",
     "n": 2
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "halberd-strike",
    "name": "Halberd Strike",
    "suit": "Sword",
    "type": "Action",
    "cost": 6,
    "copies": 2,
    "income": 0,
    "text": "Ruin a card adjacent to a card you own.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "adjacentToOwn"
    },
    "onPlay": [
     {
      "area": "adjacentToOwn",
      "do": "ruin"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "portcullis",
    "name": "Portcullis",
    "suit": "Sword",
    "type": "Structure",
    "cost": 9,
    "copies": 1,
    "income": 0,
    "text": "Choose a card adjacent to a card you own. That card’s owner discards down to 3 cards in hand.",
    "place": [
     "N",
     "S"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 4
    },
    "sees": {
     "area": "adjacentToOwn"
    },
    "onPlay": [
     {
      "area": "adjacentToOwn",
      "do": "discardDownTo",
      "n": 3
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "trebuchet",
    "name": "Trebuchet",
    "suit": "Sword",
    "type": "Structure",
    "cost": 12,
    "copies": 1,
    "income": 0,
    "text": "Ruin a chosen card 3 spaces away (orthogonally).",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 4
    },
    "sees": {
     "area": "ring3"
    },
    "onPlay": [
     {
      "area": "ring3",
      "do": "ruin"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "watchtower",
    "name": "Watchtower",
    "suit": "Sword",
    "type": "Structure",
    "cost": 18,
    "copies": 1,
    "income": 0,
    "text": "Playing adjacent to this card costs 3● more.",
    "place": "diag",
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 6
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "adjacentCost": 3
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "seizure",
    "name": "Seizure",
    "suit": "Sword",
    "type": "Action",
    "cost": 3,
    "copies": 1,
    "income": 0,
    "text": "Name a suit, then reveal cards from the deck until you reveal one of that suit. Draw it to hand.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "searchSuit",
      "rest": "bottom"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "The other revealed cards go to the bottom of the deck."
   },
   {
    "id": "rear-guard",
    "name": "Rear Guard",
    "suit": "Sword",
    "type": "Structure",
    "cost": 8,
    "copies": 2,
    "income": 6,
    "text": "If a card adjacent (or diagonally adjacent) to this card would be Ruined, the owner of this card may choose to swap. If they did, Rear Guard switches places with the targeted card and is Ruined instead.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 4
    },
    "sees": {
     "area": "surround8"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "guard": 1
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Swaps automatically when the targeted card belongs to Rear Guard’s owner."
   },
   {
    "id": "revenge",
    "name": "Revenge",
    "suit": "Sword",
    "type": "Action",
    "cost": 0,
    "copies": 1,
    "income": 0,
    "text": "If a card you own is Overwhelmed, you may reveal this card from your hand. If you did, change the suit of two cards adjacent to the Overwhelmed card to a suit of your choosing. Or play it from your hand: draw 2 cards, then discard 1.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "draw",
      "n": 2
     },
     {
      "do": "discard",
      "n": 1
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "reaction": "overwhelmed",
     "alsoPlay": true
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Only usable as a reaction. It is discarded after use."
   },
   {
    "id": "observatory",
    "name": "Observatory",
    "suit": "Tome",
    "type": "Foundation",
    "cost": 0,
    "copies": 1,
    "income": 8,
    "text": "5◇ for each different suit in your Kingdom, and 10◇ more when all six are there. You cannot play Sword cards.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perDistinctSuitInKingdom",
     "n": 5,
     "m": 10
    },
    "sees": {
     "area": "kingdom"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "Philosopher",
    "weakTo": "Sword",
    "art": "",
    "note": ""
   },
   {
    "id": "eureka",
    "name": "Eureka",
    "suit": "Tome",
    "type": "Action",
    "cost": 3,
    "copies": 1,
    "income": 0,
    "text": "Chosen player reveals their hand.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "revealHand"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "hilltop-relic",
    "name": "Hilltop Relic",
    "suit": "Tome",
    "type": "Structure",
    "cost": 18,
    "copies": 1,
    "income": 0,
    "text": "Once per turn, you may exchange 12● for 2◇.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": {
     "gain": 2,
     "kind": "exchange",
     "pay": 12
    },
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "public-forum",
    "name": "Public Forum",
    "suit": "Tome",
    "type": "Structure",
    "cost": 12,
    "copies": 2,
    "income": 6,
    "text": "4◇ for each adjacent Tome card.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perAdjacentSuit",
     "n": 4,
     "suit": "Tome"
    },
    "sees": {
     "area": "adjacent",
     "suit": "Tome"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "reconstructed-map",
    "name": "Reconstructed Map",
    "suit": "Tome",
    "type": "Structure",
    "cost": 12,
    "copies": 1,
    "income": 0,
    "text": "Draw a card, then discard a card.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 8
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "draw",
      "n": 1
     },
     {
      "do": "discard",
      "n": 1
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "watchmakers-shop",
    "name": "Watchmaker’s Shop",
    "suit": "Tome",
    "type": "Structure",
    "cost": 12,
    "copies": 1,
    "income": 3,
    "text": "When this card becomes fully surrounded, rotate all surrounding cards clockwise once.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 4
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "surroundRotate": true
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "death-ray",
    "name": "Death Ray",
    "suit": "Tome",
    "type": "Structure",
    "cost": 9,
    "copies": 1,
    "income": 3,
    "text": "If you own at least 2 adjacent cards, Ruin the card directly east.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 3
    },
    "sees": {
     "area": "east1"
    },
    "onPlay": [
     {
      "area": "east1",
      "auto": true,
      "do": "ruin",
      "ownAdjacentAtLeast": 2
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "alchemy-lab",
    "name": "Alchemy Lab",
    "suit": "Tome",
    "type": "Structure",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "If this card is surrounded by three or more cards of the same suit, you may choose three different suits and assign them to those three cards.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "alchemy": 3
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "errata",
    "name": "Errata",
    "suit": "Tome",
    "type": "Action",
    "cost": 3,
    "copies": 2,
    "income": 0,
    "text": "You may move one of your deployed meeples to a claimable card anywhere on the board.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "moveMeeple"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "university",
    "name": "University",
    "suit": "Tome",
    "type": "Structure",
    "cost": 12,
    "copies": 2,
    "income": 6,
    "text": "Once per turn, you may offer to swap one of your meeples with an opponent’s. They may deny your request. If they do, place one meeple from your bank onto this card.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 4
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": {
     "kind": "swapMeeple",
     "pay": 0
    },
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "A meeple placed on University stays there until University leaves play."
   },
   {
    "id": "overgrowth",
    "name": "Overgrowth",
    "suit": "Leaf",
    "type": "Structure",
    "cost": 12,
    "copies": 1,
    "income": 6,
    "text": "Choose a Ruined or Overwhelmed card adjacent to a Leaf card. That card is discarded and replaced with this one, unless it would be Overwhelmed by being placed there.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 4
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "overgrow"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "mildew",
    "name": "Mildew",
    "suit": "Leaf",
    "type": "Curse",
    "cost": 3,
    "copies": 1,
    "income": 0,
    "text": "Choose any card adjacent to a Leaf card. That card’s ◇ value is halved, rounded down.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "curse",
      "area": "adjacentToSuit",
      "suit": "Leaf"
     }
    ],
    "curse": {
     "mode": "under",
     "effect": "halveValue"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "intoxicate",
    "name": "Intoxicate",
    "suit": "Goblet",
    "type": "Curse",
    "cost": 3,
    "copies": 1,
    "income": 0,
    "text": "Choose a card adjacent to a Goblet card. That card’s Overwhelm number is reduced by 1, but its ● production is increased by 3 per turn.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "curse",
      "area": "adjacentToSuit",
      "suit": "Goblet"
     }
    ],
    "curse": {
     "mode": "under",
     "effect": "intoxicate"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "fortune-teller",
    "name": "Fortune Teller",
    "suit": "Goblet",
    "type": "Curse",
    "cost": 3,
    "copies": 1,
    "income": 0,
    "text": "Choose a suit. Reveal the top card of the deck. If it is of your chosen suit, you may Curse a card adjacent to a card you own, making it unable to produce ●.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "fortune"
     },
     {
      "do": "curse",
      "area": "adjacentToOwn",
      "requires": "fortuneOk",
      "optional": true,
      "prompt": "The fortune holds: Curse a card next to one of yours (it will produce no ●), or Skip."
     }
    ],
    "curse": {
     "mode": "under",
     "effect": "noIncome"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "The revealed card stays on top of the deck."
   },
   {
    "id": "tunnel",
    "name": "Tunnel",
    "suit": "Sword",
    "type": "Curse",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "Choose a card adjacent to a Sword card you own. Any cards buried underneath that card are removed and the card loses all Defense tokens.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "curse",
      "area": "adjacentToOwnSuit",
      "suit": "Sword",
      "pierce": true
     },
     {
      "do": "curseExtra",
      "kind": "tunnel"
     }
    ],
    "curse": {
     "mode": "under",
     "effect": "none"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Defense tokens do not stop Tunnel."
   },
   {
    "id": "usurp",
    "name": "Usurp",
    "suit": "Sword",
    "type": "Curse",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "You may claim a card adjacent to a card you own, even if it has been claimed already. This does not remove the original claimant.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "curse",
      "area": "adjacentToOwn"
     },
     {
      "do": "curseExtra",
      "kind": "usurp"
     }
    ],
    "curse": {
     "mode": "under",
     "effect": "none"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "ravens-beak",
    "name": "Raven’s Beak",
    "suit": "Bone",
    "type": "Curse",
    "cost": 3,
    "copies": 1,
    "income": 0,
    "text": "Choose a card adjacent to a Bone card you own. That card’s Overwhelm number is reduced by 1.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "curse",
      "area": "adjacentToOwnSuit",
      "suit": "Bone"
     }
    ],
    "curse": {
     "mode": "under",
     "effect": "owMinus"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "eye-of-newt",
    "name": "Eye of Newt",
    "suit": "Bone",
    "type": "Curse",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "Choose a card with at least three empty adjacent spaces. Those spaces now cost 3● more to place a card in.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "curse",
      "area": "emptyAround3"
     },
     {
      "do": "curseExtra",
      "kind": "tax"
     }
    ],
    "curse": {
     "mode": "under",
     "effect": "tax"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "exile",
    "name": "Exile",
    "suit": "Sceptre",
    "type": "Curse",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "Choose a card adjacent to a Sceptre card you own. That card loses its claimant and the meeple is returned to its owner.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "curse",
      "area": "adjacentToOwnSuit",
      "suit": "Sceptre"
     },
     {
      "do": "curseExtra",
      "kind": "exile"
     }
    ],
    "curse": {
     "mode": "under",
     "effect": "none"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "youll-regret-that",
    "name": "You’ll Regret That",
    "suit": "Sceptre",
    "type": "Curse",
    "cost": 3,
    "copies": 1,
    "income": 0,
    "text": "When a Structure is used to Ruin a card you own, you may play this from your hand to Curse that Structure. That Structure can no longer produce ●.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": {
     "mode": "under",
     "effect": "noIncome"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "reaction": "ruinedByStructure"
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Played as a reaction on another player’s turn, at no cost."
   },
   {
    "id": "overwhelming-evidence",
    "name": "Overwhelming Evidence",
    "suit": "Tome",
    "type": "Action",
    "cost": 18,
    "copies": 1,
    "income": 0,
    "text": "Flip over a Ruined or Overwhelmed card. Its suit is now Tome. You may claim it.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "unruin",
      "setSuit": "Tome"
     },
     {
      "do": "offerClaim"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "deep-thought",
    "name": "Deep Thought",
    "suit": "Tome",
    "type": "Curse",
    "cost": 3,
    "copies": 1,
    "income": 0,
    "text": "Choose a card adjacent to a Tome card you own. That card’s ● production is halved, rounded up.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "curse",
      "area": "adjacentToOwnSuit",
      "suit": "Tome"
     }
    ],
    "curse": {
     "mode": "under",
     "effect": "halveIncome"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "brambles",
    "name": "Brambles",
    "suit": "Leaf",
    "type": "Structure",
    "cost": 0,
    "copies": 1,
    "income": 2,
    "text": "Play it like any Structure, or: if a card is one away from being Overwhelmed, you may play Brambles on top of it. The targeted card and all cards buried under it are now buried under Brambles. Costs 3● less next turn.",
    "place": [
     "E",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 2
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "reaction": "oneAway",
     "alsoPlay": true
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Played as a reaction on another player’s turn. Instead of a cost, your next turn starts with 3● less. You claim Brambles if you have a meeple."
   },
   {
    "id": "royal-seal",
    "name": "Royal Seal",
    "suit": "Goblet",
    "type": "Action",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "You may claim any unclaimed card. That card’s placement effect is triggered when you claim it.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "royalClaim"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Only Structures with a placement effect re-trigger. Does not use your claim for the turn."
   },
   {
    "id": "artillery",
    "name": "Artillery",
    "suit": "Sword",
    "type": "Structure",
    "cost": 8,
    "copies": 2,
    "income": 4,
    "text": "Once per turn, you may spend 6● to Ruin an opponent’s card adjacent to a Sword card you own.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 2
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": {
     "kind": "artillery",
     "pay": 6,
     "suit": "Sword"
    },
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "decay",
    "name": "Decay",
    "suit": "Bone",
    "type": "Structure",
    "cost": 3,
    "copies": 2,
    "income": 0,
    "text": "When placed: place a Decay token on an adjacent card.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "decayToken"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "PLACEHOLDER: cost, value and what a Decay token does are not defined yet. The token is tracked but has no effect."
   },
   {
    "id": "scrying-pool",
    "name": "Scrying Pool",
    "suit": "Tome",
    "type": "Structure",
    "cost": 6,
    "copies": 3,
    "income": 2,
    "text": "Once per turn, for 3●: choose a card you own and activate its placement effect an additional time.",
    "place": [
     "N",
     "S"
    ],
    "overwhelm": null,
    "score": {
     "kind": "flat",
     "n": 2
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": {
     "kind": "scry",
     "pay": 3
    },
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Only Structures with a placement effect."
   },
   {
    "id": "repent",
    "name": "Repent",
    "suit": "Sceptre",
    "type": "Action",
    "cost": 0,
    "copies": 1,
    "income": 0,
    "text": "If an opponent Ruins or Overwhelms a card, you may Ruin a card adjacent to a card you own that belongs to that player. Costs 3● less next turn. Or play it from your hand: draw 2 cards, then discard 1.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "draw",
      "n": 2
     },
     {
      "do": "discard",
      "n": 1
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "reaction": "opponentRuins",
     "alsoPlay": true
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Played as a reaction. Instead of a cost, your next turn starts with 3● less."
   },
   {
    "id": "front-lines",
    "name": "Front Lines",
    "suit": "Sword",
    "type": "Structure",
    "cost": 8,
    "copies": 2,
    "income": 4,
    "text": "2◇ for each adjacent (or diagonally adjacent) card owned by an opponent.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perSurroundOpp",
     "n": 2
    },
    "sees": {
     "area": "surround8"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "vineyard",
    "name": "Vineyard",
    "suit": "Goblet",
    "type": "Structure",
    "cost": 8,
    "copies": 2,
    "income": 4,
    "text": "2◇ for each adjacent or buried Leaf card.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perAdjOrBuriedSuit",
     "n": 2,
     "suit": "Leaf"
    },
    "sees": {
     "area": "adjacent",
     "suit": "Leaf"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "post-office",
    "name": "Post Office",
    "suit": "Tome",
    "type": "Structure",
    "cost": 8,
    "copies": 2,
    "income": 4,
    "text": "2◇ for each adjacent or buried card of a different suit.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "perAdjOrBuriedOtherSuit",
     "n": 2
    },
    "sees": {
     "area": "adjacent"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "Different from Post Office’s own suit (Tome)."
   },
   {
    "id": "bread-and-circuses",
    "name": "Bread and Circuses",
    "suit": "Goblet",
    "type": "Action",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "Choose a card. Earn 1◇ for each consecutive non-Ruined card to the East of that card.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "eastChain"
     }
    ],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "flowers",
    "name": "Flowers",
    "suit": "Bone",
    "type": "Blessing",
    "cost": 3,
    "copies": 2,
    "income": 0,
    "text": "The card under which Flowers is buried permanently produces 3 additional ● per turn.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "burialEffect": {
      "ap": 3
     }
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "eye-for-an-eye",
    "name": "Eye for an Eye",
    "suit": "Sceptre",
    "type": "Blessing",
    "cost": 3,
    "copies": 2,
    "income": 0,
    "text": "The card under which Eye for an Eye is buried is permanently worth 3 additional ◇.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "burialEffect": {
      "vp": 3
     }
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "destroying-angel",
    "name": "Destroying Angel",
    "suit": "Leaf",
    "type": "Curse",
    "cost": 8,
    "copies": 1,
    "income": 0,
    "text": "Ruin a card adjacent to a Leaf card you own.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [
     {
      "do": "ruin",
      "area": "adjacentToOwnSuit",
      "suit": "Leaf",
      "asCurse": true
     }
    ],
    "curse": {
     "mode": "under",
     "effect": "none"
    },
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {},
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": ""
   },
   {
    "id": "standard-bearer",
    "name": "Standard Bearer",
    "suit": "Sword",
    "type": "Blessing",
    "cost": 6,
    "copies": 1,
    "income": 0,
    "text": "The card under which Standard Bearer is buried cannot be Ruined or Overwhelmed.",
    "place": [
     "N",
     "E",
     "S",
     "W"
    ],
    "overwhelm": null,
    "score": {
     "kind": "none"
    },
    "sees": {
     "area": "none"
    },
    "onPlay": [],
    "curse": null,
    "ability": null,
    "perTurn": null,
    "incomePerToken": 0,
    "mods": {
     "burialEffect": {
      "protect": true
     }
    },
    "archetype": "",
    "weakTo": "",
    "art": "",
    "note": "PLACEHOLDER cost (the sheet gave none). The protection ends if Standard Bearer is unburied."
   }
  ].map(c);

  return { SUITS: SUITS, TYPES: TYPES, ALL4: ALL4, STARTER: STARTER, make: c };
})();
if (typeof module !== 'undefined') module.exports = KData;
