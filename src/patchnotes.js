/* Kartenspiel patch notes, newest first. Add an entry at the top when you push a change players will notice:
   players who have played before see the newest entry in a "What's new" window the next time they open the game
   (unless they've turned that off), and every entry is on the Patch notes page (Help → Patch notes).
   v must be new for each entry (the date, plus a number for a second update that day). */
var KPatch = [
  { v: '2026.11.02.1', date: '2 November 2026', title: 'Bots that know their archetype', notes: [
    'Every bot now plays for its <b>archetype’s goal</b>: Archbishops hold Sceptre cards, Hedonists Goblets, Philosophers a card of each missing suit, Cryptkeepers cards to bury, Gardeners cards to grow their region, Warmongers War.',
    'Bots get rid of cards they can’t play first, use <b>Discard 2, draw 1</b>, place their Foundation with room to grow, and take back a meeple when they run out.',
    'Warmonger bots now <b>spend their Reserves</b>.'
  ] },
  { v: '2026.11.01.2', date: '1 November 2026', title: 'Patch notes and a clearer Help', notes: [
    'This page: <b>patch notes</b>, with a short “What’s new” when the game updates. You can turn those off.',
    '<b>Help</b> is rewritten as short sections with a table of contents.'
  ] },
  { v: '2026.11.01.1', date: '1 November 2026', title: 'Smoother turns', notes: [
    '<b>Hints</b> on your turn suggest a next step, like playing your Foundation first.',
    'Ending a turn while you could still play or claim a card <b>asks once</b>.',
    'Your next turn opens with <b>what everyone else did</b> since your last one.',
    'Cards you can’t play say why. <b>⇅ Sort</b> your hand by suit or cost.',
    'Set how fast <b>bots</b> play, start a <b>Rematch</b>, and your last setup is remembered.'
  ] },
  { v: '2026.10.31.3', date: '31 October 2026', title: 'Paint your own cards', notes: [
    '<b>Dithry</b>, a pixel-art paint tool in the game’s dithered style, at <i>dithry/</i>.',
    'Its card mode paints each card’s face, in hand and on the board, behind its text. Saving shows it in the game straight away.',
    'Each suit has its own muted palette, and a painted card can use light text over a dark painting.'
  ] },
  { v: '2026.10.31.2', date: '31 October 2026', title: 'A medieval look', notes: [
    'A gilded Fraktur logo, a heraldic crest and blackletter headings.',
    'Every card has a faint dithered pattern of its suit: flames, masonry, vines, headstones, waves, bubbles.',
    'The board is a night prairie with a walled city on the horizon. Cards on the board are square.',
    'Overwhelm pressure shows as chevrons between cards, in the colour of the suit doing the pressing.'
  ] },
  { v: '2026.10.31.1', date: '31 October 2026', title: 'iPhone fix', notes: [
    'Moving and zooming the board on iPhone no longer zooms by itself or jumps.'
  ] },
  { v: '2026.10.30.2', date: '30 October 2026', title: 'Phones, apps and guests', notes: [
    'A phone layout, and <b>drag and drop</b> for cards and meeples.',
    '<b>Install</b> Kartenspiel as an app; single player and pass-and-play work offline.',
    '<b>Log in as guest</b> to play online without an account.',
    'The suit wheel (who pressures whom) and placement arrows, keyboard shortcuts, and the Quickview and War overlays.'
  ] },
  { v: '2026.10.30.1', date: '30 October 2026', title: 'Kartenspiel goes online', notes: [
    'This site: <b>single player</b> against bots, <b>pass-and-play</b>, and <b>online</b> tables with profiles and stats.',
    'A clearer pixel font.'
  ] }
];
if (typeof module !== 'undefined') module.exports = KPatch;
