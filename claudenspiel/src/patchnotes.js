/* Claudenspiel patch notes, newest first (the fork's own; Kartenspiel's are in ../src/patchnotes.js).
   v must be new for each entry. Players who have played before see the newest one in a "What's new" window. */
var KPatch = [
  { v: 'cs-0.2', date: '3 November 2026', title: 'Claudenspiel 0.2: three card fixes', notes: [
    '<b>Obelisk</b> costs 18● (was 16) and is worth 6◇, doubled if fully surrounded (was 8◇). It was the strongest card in every test.',
    '<b>Fountain</b> scores 3◇ per adjacent Leaf card (was 2◇): it was the weakest card in the deck.',
    '<b>Death Ray</b> costs 9● (was 12) and is worth 3◇ (was 2◇).'
  ] },
  { v: 'cs-0.1', date: '3 November 2026', title: 'Claudenspiel 0.1: the fork', notes: [
    'Claudenspiel splits off from Kartenspiel as its own game, with its own saves, look and rules.',
    'A <b>116-card deck</b>: staples have two or three copies, the strongest and strangest cards stay single. No more reshuffles at big tables.',
    'The <b>last round</b>: reaching 48◇ no longer ends the game at once. Everyone gets the same number of turns, then the highest total wins.',
    '<b>Orchard</b> scores 3◇ per card in your largest region (was 4). <b>Observatory</b> scores 10◇ more when all six suits are in your Kingdom.',
    '<b>Seat start</b> is off by default: with the last round, everyone already gets the same number of turns.',
    '<b>Revenge</b> and <b>Repent</b> can also be played from hand to draw 2 and discard 1. <b>Brambles</b> can be placed like any Structure.'
  ] }
];
if (typeof module !== 'undefined') module.exports = KPatch;
