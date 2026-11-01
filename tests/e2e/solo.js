// End-to-end browser test of single player: you against a tactician and a warlord bot on the public site.
// Needs Playwright with Chromium. Run: ./build.sh && node tests/e2e/solo.js [screenshot folder]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const REPO = path.join(__dirname, '..', '..'), SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ks-solo-'));
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);

(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 900 } }), errs = [];
  await p.addInitScript(() => { if (!localStorage.getItem('ks.prefs')) localStorage.setItem('ks.prefs', '{"confirmEnd":false}'); });   // these tests end turns directly; solo.js tests the end-turn check
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.goto('file://' + REPO + '/site/index.html');
  await p.evaluate(() => { window.ksBotDelay = 30; });

  // Home → Single player: seat 1 human, the rest bots
  await p.click('[data-act="soloSetup"]');
  ok((await p.$eval('[data-pkind="0"]', e => e.value)) === 'human' && (await p.$eval('[data-pkind="1"]', e => e.value)) === 'tactician', 'Single player presets you vs a tactician bot');
  await p.selectOption('[data-set="n"]', '3');
  await p.selectOption('[data-pkind="2"]', 'warlord');
  ok((await p.$eval('[data-pname="2"]', e => e.value)) === 'Warlord bot', 'choosing a bot names the seat after it');
  await p.screenshot({ path: SHOTS + '/1-setup.png' });
  await p.click('[data-act="start"]');

  // your first turn: place your Foundation, end the turn
  await p.click('[data-act="startTurn"]');
  const fIdx = await p.$$eval('.bottom .hcard .nm', els => els.findIndex(e => e.textContent === 'Cathedral'));
  await (await p.$$('.bottom .hcard .cellbtn'))[fIdx].click(); await p.click('.cell.legal .cellbtn');
  await p.click('[data-act="endTurn"]');
  await p.waitForSelector('text=is playing…');
  ok((await p.$$('.bottom .hcard')).length > 0, 'your hand stays visible while the bots play');
  ok(!(await p.$('text=Pass the device')), 'no pass-the-device screen');
  await p.screenshot({ path: SHOTS + '/2-bot-turn.png' });
  await p.waitForSelector('text=Start my turn', { timeout: 60000 });
  const log = await p.textContent('.log');
  ok(/Tactician bot plays/.test(log) && /Warlord bot plays/.test(log), 'both bots played cards (seen in the log)');
  ok((await p.$$('.cell .card')).length >= 3, 'bot cards are on the board');

  // Undo from your turn's start goes back to your own previous turn, not into a bot's
  ok(!!(await p.$('.modal [data-act="undo"]')), 'the Your turn dialog offers Undo');
  await p.click('.modal [data-act="undo"]');
  const back = await p.evaluate(() => JSON.parse(localStorage.getItem('ks.game')));
  ok(back.cur === 0 && back.turn.started, 'Undo skips the bot moves back to your own turn');
  await p.screenshot({ path: SHOTS + '/3-after-undo.png' });

  // keep ending turns until someone wins
  for (let i = 0; i < 40; i++) {
    if (await p.$('text=wins!')) break;
    if (await p.$('[data-act="startTurn"]')) await p.click('[data-act="startTurn"]');
    const pend = await p.$('.modal [data-act="answerHand"], .modal [data-act="answerNo"], .modal [data-answer]');
    if (pend) { // a bot's effect asks you something: take the first option
      const pick = await p.$('.modal [data-pick]'); if (pick) await pick.click();
      await (await p.$('.modal [data-act="answerHand"], .modal [data-act="answerNo"], .modal [data-answer]')).click(); continue; }
    if (await p.$('[data-act="skip"]')) { await p.click('[data-act="skip"]'); continue; }
    const end = await p.$('[data-act="endTurn"]:not([disabled])'); if (end) await end.click();
    await p.waitForFunction(() => /Start my turn|wins!|Waiting for|choose|decide/.test(document.body.innerText) && !/is playing…|is deciding…/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
  }
  const won = await p.$('text=wins!');
  ok(!!won, 'the game ends with a winner' + (won ? ': ' + (await won.textContent()) : ''));
  await p.screenshot({ path: SHOTS + '/4-end.png' });

  // playtest table: the New game page has the same seat choices
  await p.goto('file://' + REPO + '/index.html');
  ok(!!(await p.$('[data-pkind="1"]')), 'the playtest table offers bots too');

  // comforts: hints, unplayable reasons, the end-turn check, hand sorting, bot speed, the recap, rematch, remembered setup
  const q = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); q.on('pageerror', e => errs.push('qol: ' + e.message));
  await q.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  const SITE = 'file://' + REPO + '/site/index.html', qs = () => q.evaluate(() => JSON.parse(localStorage.getItem('ks.game')));
  await q.goto(SITE); await q.evaluate(() => { window.ksBotDelay = 0; window.ksSeed = 3; });
  await q.click('[data-act="soloSetup"]'); await q.selectOption('[data-set="n"]', '3'); await q.click('[data-act="start"]'); await q.click('[data-act="startTurn"]');
  ok(/Start by playing your Foundation/.test(await q.textContent('.prompt.hint')), 'on your first turn, a hint says to play your Foundation first');
  const tags = await q.$$eval('.bottom .hcard.blocked .blocktag', e => e.map(x => x.textContent));
  ok(await q.$$eval('.bottom .hcard.blocked', e => e.length) === tags.length, 'every card you can’t play says why (' + (tags.join(', ') || 'none blocked in this deal') + ')');
  const order0 = await q.$$eval('.bottom [data-hand]', e => e.map(x => x.getAttribute('data-hand')).join());
  await q.click('[data-act="handSort"]');
  const suits = await q.$$eval('.bottom .hcard .card', e => e.map(x => x.className.match(/s-(\w+)/)[1]));
  const S = ['Sceptre', 'Goblet', 'Sword', 'Bone', 'Leaf', 'Tome'];
  ok(/By suit/.test(await q.textContent('[data-act="handSort"]')) && suits.every((x, i) => i === 0 || S.indexOf(suits[i - 1]) <= S.indexOf(x)), 'Sort orders the hand by suit (only the display: the game is unchanged)');
  ok((await qs()).players[0].hand.join() === order0, 'and the hand in the game keeps its order');
  // play the Foundation, then try to end with cards you could still play
  const fu = (await qs()).players[0].foundationUid; await q.click('[data-hand="' + fu + '"]'); await q.click('.cell.legal [data-cell]');
  const left = await q.evaluate(() => { const st = JSON.parse(localStorage.getItem('ks.game')); return st.players[0].ap; });
  await q.click('[data-act="endTurn"]');
  const asked = await q.textContent('.prompt').catch(() => '');
  if (/End your turn anyway/.test(asked)) {
    ok((await qs()).cur === 0, 'ending a turn with cards you could still play or claim asks first: “' + asked.replace(/End turn.*$/, '').trim() + '”');
    await q.click('[data-act="keepPlaying"]'); ok(!/anyway/.test(await q.textContent('.center').catch(() => '')) && (await qs()).cur === 0, 'Keep playing goes back to your turn');
    await q.click('[data-act="endTurn"]'); await q.click('.prompt [data-act="endTurn"]');
  } else ok(left === 0, 'with nothing left to do, End turn ends at once');
  await q.waitForSelector('text=Start my turn', { timeout: 15000 }).catch(() => {});
  ok((await qs()).cur === 0 && (await qs()).turn.started === false && (await qs()).round === 2, 'after confirming, the turn ends and both bots play');
  ok(/Since your last turn/.test(await q.textContent('.modal')) && (await q.$$eval('.modal .recap .log div', e => e.length)) >= 3, 'your next turn opens with what the bots did since your last turn');
  ok(!!(await q.$('[data-pref="botSpeed"]')), 'against bots, a Bots setting sets how fast they play');
  await q.selectOption('[data-pref="botSpeed"]', 'fast'); ok(await q.evaluate(() => JSON.parse(localStorage.getItem('ks.prefs')).botSpeed) === 'fast', 'and is remembered');
  // a finished game offers a rematch with the same players and rules
  await q.evaluate(() => { const st = JSON.parse(localStorage.getItem('ks.game')); st.opts.target = 1; localStorage.setItem('ks.game', JSON.stringify(st)); localStorage.setItem('ks.prefs', '{"confirmEnd":false}'); });
  await q.goto(SITE); await q.evaluate(() => { window.ksBotDelay = 0; }); await q.click('[data-act="resume"]');
  await q.click('[data-act="startTurn"]'); await q.click('[data-act="endTurn"]'); await q.waitForSelector('[data-act="rematch"]', { timeout: 15000 });
  const before = await qs(); await q.click('[data-act="rematch"]'); const after = await qs();
  ok(after.winner == null && after.round === 1 && after.players.map(x => x.name + x.arch + (x.bot || '')).join() === before.players.map(x => x.name + x.arch + (x.bot || '')).join(), 'Rematch starts a new game with the same players, archetypes and bots');
  await q.goto(SITE); await q.click('[data-act="soloSetup"]');
  ok(await q.$eval('[data-set="n"]', e => e.value) === '3', 'the setup you last played is remembered (3 players)');
  // hints can be hidden, and turned back on from Help
  await q.evaluate(() => localStorage.setItem('ks.prefs', '{}')); await q.goto(SITE); await q.click('[data-act="resume"]');
  if (await q.$('[data-act="startTurn"]')) await q.click('[data-act="startTurn"]');
  if (await q.$('.prompt.hint')) { await q.click('[data-act="hideHints"]'); ok(!(await q.$('.prompt.hint')), 'Hide hints turns them off'); }
  await q.click('[data-page="help"]'); ok(!!(await q.$('[data-act="showHints"]')), 'and Help can turn them back on');

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(out.join('\n')); process.exit(0);
})().catch(e => { console.log(out.join('\n')); console.log('ERROR', e.message); process.exit(1); });
