import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { STAGE_SECONDS } from '../src/data/stage01.ts';

const base = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const results = [];
const errors = [];
await fs.mkdir('artifacts', { recursive: true });
const note = (name, detail = '') => { results.push({ name, status: 'passed', detail }); console.log(`PASS ${name} ${detail}`); };
const snapshot = page => page.evaluate(() => window.__game.snapshot());
const action = (page, action, detail) => page.evaluate(({ action, detail }) => window.__game.action(action, detail), { action, detail });
const click = (page, action) => page.locator(`[data-action="${action}"]`).first().click();
const shot = async (page, name) => { await page.waitForTimeout(250); return page.screenshot({ path: `artifacts/${name}.png`, animations: 'disabled' }); };
const end = async (page, choice) => {
  await page.locator(`[data-action="choose"][data-detail="${choice}"]`).click();
  await page.evaluate(() => window.__game.cinematic(window.__game.snapshot().cinematicDuration - 0.2));
  await page.waitForFunction(() => window.__game.snapshot().phase === 'ENDING');
  assert.equal((await snapshot(page)).choice, choice);
};

try {
  for (const [width, height] of [[360, 800], [390, 844], [320, 568]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}?qa=1&fixture=original`);
    await page.waitForFunction(() => window.__game?.snapshot().phase === 'TITLE');
    await shot(page, `title-${width}`);
    await click(page, 'start');
    assert.equal((await snapshot(page)).phase, 'INTRO');
    await click(page, 'explore');
    assert.equal((await snapshot(page)).phase, 'EXPLORE');
    await shot(page, `explore-${width}`);
    for (const selector of ['#joystick', '[data-action="decision"]', '[data-action="menu"]']) {
      const rect = await page.locator(selector).first().boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1, selector);
    }
    await click(page, 'menu');
    const beforePause = (await snapshot(page)).remaining;
    await page.waitForTimeout(600);
    assert.equal((await snapshot(page)).remaining, beforePause);
    await click(page, 'close');
    await click(page, 'decision');
    assert.equal(await page.locator('[data-action="choose"]').count(), 3);
    await shot(page, `decision-${width}`);
    await end(page, 'A');
    await shot(page, `ending-a-${width}`);
    await click(page, 'retry');
    const reset = await snapshot(page);
    assert.equal(reset.phase, 'EXPLORE'); assert.equal(reset.found.length, 0); assert.equal(reset.choice, null);
    assert.ok(reset.remaining > STAGE_SECONDS - 1 && reset.remaining <= STAGE_SECONDS); assert.equal(reset.x, 0); assert.equal(reset.z, -0.25);
    note(`mobile ${width}×${height}`, 'title / intro / explore / pause / decision / ending A / retry');
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?qa=1&fixture=original`);
  await page.waitForFunction(() => window.__game);
  await shot(page, 'title-desktop');
  await click(page, 'start'); await click(page, 'explore');
  await click(page, 'journal');
  assert.equal(await page.locator('.journal-entry').count(), 0);
  assert.doesNotMatch(await page.locator('#ui').innerText(), /巨大コンテナ|上司の付箋|廊下|PC|デスク/);
  await shot(page, 'journal-empty');
  await click(page, 'close');
  note('discovery-only journal', 'no uninspected object names or locations');
  const pos = await snapshot(page);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  assert.ok((await snapshot(page)).z < pos.z - 0.3);
  note('keyboard movement');
  const collider = (await page.evaluate(() => window.__game.colliders())).find(c => c.minX < -3.5 && c.maxX > -3.5 && c.minZ < -1.8 && c.maxZ > -1.8);
  if (collider) {
    await page.evaluate(c => window.__game.teleport((c.minX + c.maxX) / 2, c.maxZ + 0.6), collider);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
    assert.ok((await snapshot(page)).z >= collider.maxZ + 0.25);
    note('desk collision', 'walking into the desk stops at its AABB');
  }
  await page.evaluate(() => window.__game.teleport(3.3, 3.8));
  await page.waitForFunction(() => window.__game.snapshot().nearest === null);
  assert.equal((await snapshot(page)).nearest, null);
  await action(page, 'inspect'); assert.equal((await snapshot(page)).phase, 'EXPLORE');
  note('proximity gate', 'remote inspection rejected');

  const clueLocations = [
    ['C01', -3.5, -1.8], ['C02', 0.6, -2], ['C03', 8, 2.8], ['C04', 3.1, -4.1],
    ['C05', 5.4, -2.7], ['C06', 0.8, 1.5], ['C07', -3.4, 1.8],
  ];
  const reachability = await page.evaluate(clues => {
    const colliders = window.__game.colliders();
    const valid = (x, z) => {
      if (!((x >= -5.7 && x <= 5.7 && z >= -4.2 && z <= 4.2) || (x >= 5.7 && x <= 8.7 && z >= -0.2 && z <= 4.2))) return false;
      return !colliders.some(c => x > c.minX - 0.27 && x < c.maxX + 0.27 && z > c.minZ - 0.27 && z < c.maxZ + 0.27);
    };
    const queue = [[0, -1]]; const seen = new Set(['0,-1']); const reachable = {};
    for (let head = 0; head < queue.length; head++) {
      const [gx, gz] = queue[head]; const x = gx * 0.2; const z = gz * 0.2;
      for (const [id, cx, cz] of clues) {
        const distance = Math.hypot(x - cx, z - cz);
        if (distance < 1.7 && (!reachable[id] || distance < reachable[id].distance)) reachable[id] = { x, z, distance };
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + dx; const nz = gz + dz; const key = `${nx},${nz}`;
        if (!seen.has(key) && valid(nx * 0.2, nz * 0.2)) { seen.add(key); queue.push([nx, nz]); }
      }
    }
    return reachable;
  }, clueLocations);
  assert.equal(Object.keys(reachability).length, 7);
  note('all clues reachable', 'grid flood-fill from actual starting position, radius1.7');
  for (const [id] of clueLocations) {
    await page.evaluate(p => window.__game.teleport(p.x, p.z), reachability[id]);
    await page.waitForFunction(id => window.__game.snapshot().nearest === id, id);
    assert.equal((await snapshot(page)).nearest, id);
    assert.equal(await page.locator('#context-name').innerText(), '近くのものを調べる');
    await page.keyboard.press('KeyE');
    assert.equal((await snapshot(page)).phase, 'INSPECT');
    assert.equal((await snapshot(page)).inspected, id);
    assert.equal(await page.locator('.inspect-panel .player-thought').count(), 0);
    if (id === 'C03') assert.equal(await page.locator('.evidence-document p').innerText(), 'コンテナには『移動式オフィス収納ユニット』と書かれている。');
    if (id === 'C07') assert.equal(await page.locator('.evidence-document p').innerText(), '『中身だけじゃなく、箱まで頼む！』');
    const remaining = (await snapshot(page)).remaining;
    await page.waitForTimeout(150);
    assert.equal((await snapshot(page)).remaining, remaining);
    if (id === 'C03') await shot(page, 'inspect-container');
    if (id === 'C07') await shot(page, 'inspect-sticky-note');
    await page.keyboard.press('Escape');
    assert.equal((await snapshot(page)).phase, 'EXPLORE');
  }
  assert.equal((await snapshot(page)).found.length, 7);
  await click(page, 'journal'); await shot(page, 'journal-desktop'); await click(page, 'close');
  note('seven clues + inspection pause + journal');
  await click(page, 'decision');
  await page.locator('[data-action="choose"][data-detail="C"]').click();
  await page.waitForTimeout(4500); await shot(page, 'cinematic-storage');
  await page.waitForFunction(() => window.__game.snapshot().phase === 'ENDING', { timeout: 15000 });
  await shot(page, 'ending-c-desktop');
  assert.equal((await snapshot(page)).choice, 'C');
  note('C ending', 'actual 8 second animation plus evidence review');
  await click(page, 'retry');
  await click(page, 'decision'); await end(page, 'B'); await shot(page, 'ending-b-desktop');
  note('B ending');
  await click(page, 'retry');
  await page.evaluate(seconds => window.__game.advance(seconds), STAGE_SECONDS + 1);
  assert.equal((await snapshot(page)).phase, 'DECISION'); assert.equal((await snapshot(page)).timedOut, true);
  await action(page, 'back'); assert.equal((await snapshot(page)).phase, 'DECISION');
  note('two minute deadline', 'forced decision cannot return to expired exploration');
  await context.close();
  const touchContext = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const touchPage = await touchContext.newPage();
  touchPage.on('pageerror', e => errors.push(e.message));
  await touchPage.goto(`${base}?qa=1&fixture=original`);
  await touchPage.waitForFunction(() => window.__game);
  await click(touchPage, 'start'); await click(touchPage, 'explore');
  await touchPage.waitForTimeout(300);
  const stick = await touchPage.locator('#joystick').boundingBox();
  const sx = stick.x + stick.width / 2; const sy = stick.y + stick.height / 2;
  const cdp = await touchContext.newCDPSession(touchPage);
  const begin = await snapshot(touchPage);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy - 36, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy - 36, id: 1 }, { x: 300, y: 300, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy - 36, id: 1 }, { x: 330, y: 315, id: 2 }] });
  await touchPage.waitForTimeout(600);
  const moved = await snapshot(touchPage);
  assert.ok(Math.hypot(moved.x - begin.x, moved.z - begin.z) > 0.2, JSON.stringify({begin,moved}));
  assert.ok(Math.abs(moved.yaw - begin.yaw) > 0.1);
  await shot(touchPage, 'touch-simultaneous');
  await action(touchPage, 'menu');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await click(touchPage, 'close');
  const stop = await snapshot(touchPage); await touchPage.waitForTimeout(350);
  const stopped = await snapshot(touchPage); assert.equal(stopped.x, stop.x); assert.equal(stopped.z, stop.z);
  note('simultaneous touch movement + camera', 'two genuine CDP touches; opening overlay clears held stick');
  await touchPage.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hiddenRemaining = (await snapshot(touchPage)).remaining;
  await touchPage.waitForTimeout(600);
  assert.equal((await snapshot(touchPage)).remaining, hiddenRemaining);
  await touchPage.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await touchPage.waitForTimeout(150);
  assert.ok(hiddenRemaining - (await snapshot(touchPage)).remaining < 0.4);
  note('visibility pause wiring', 'simulated document.hidden change; actual OS backgrounding remains a device check');
  await touchPage.setViewportSize({ width: 800, height: 360 });
  await shot(touchPage, 'landscape');
  assert.equal((await snapshot(touchPage)).phase, 'EXPLORE');
  note('orientation resize');
  await touchContext.close();
  assert.deepEqual(errors, []);
  note('browser runtime', 'no uncaught page errors');
} catch (error) {
  results.push({ name: 'failure', status: 'failed', detail: error.stack });
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile('artifacts/playtest-results.json', JSON.stringify({ date: new Date().toISOString(), browser: await browser.version(), base, results, errors }, null, 2));
  await browser.close();
}
