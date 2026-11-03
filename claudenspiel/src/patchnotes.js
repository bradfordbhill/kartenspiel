/* Claudenspiel patch notes, newest first (the fork's own; Kartenspiel's are in ../src/patchnotes.js).
   v must be new for each entry. Players who have played before see the newest one in a "What's new" window. */
var KPatch = [
  { v: 'cs-0.2', date: '3 November 2026', title: 'Claudenspiel 0.2: ground, gold and the race', notes: [
    '<b>Grounds</b>, the first terrain cards: placed like a Structure, claimed by nobody, never an enemy. <b>Marsh</b> shelters its neighbours from Overwhelm, <b>Battlefield</b> exposes them, <b>Crossroads</b> makes building next to it 3● cheaper.',
    '<b>Banking</b>: every 6● you don’t spend becomes 1◇ at the end of your turn (at most 2◇).',
    '<b>Buy a second claim</b> for 10● once a turn, paid from this turn’s ● (not Reserves).',
    'With three or more players, earlier seats start with 3◇ for each seat after them: the last round let later seats see the score to beat.',
    'A <b>race bar</b> above the board shows everyone’s ◇ on one track to 48, and rings the bell for the last round.',
    '<b>Obelisk</b> is worth 6◇ (12◇ surrounded). <b>Fountain</b> pays 3◇ per Leaf neighbour and joins on any side.'
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
