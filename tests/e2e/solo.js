// End-to-end browser test of single player: you against a tactician and a warlord bot on the public site.
// Needs Playwright with Chromium. Run: ./build.sh && node tests/e2e/solo.js [screenshot folder]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const REPO = path.join(__dirname, '..', '..'), SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ks-solo-'));
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);

(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 900 } }), errs = [];
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

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(out.join('\n')); process.exit(0);
})().catch(e => { console.log(out.join('\n')); console.log('ERROR', e.message); process.exit(1); });
