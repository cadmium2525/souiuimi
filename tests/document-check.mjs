import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createCase } from '../src/data/cases.ts';

const base = process.env.GAME_URL || 'http://127.0.0.1:4173/';
const choices = ['A', 'B', 'C'], representatives = {}, results = [], errors = [], samples = [];
for (let seed = 0; seed < 2000 && Object.keys(representatives).length < 3; seed++) {
  const instance = createCase('stage05', seed);
  representatives[instance.correctChoice] ??= seed;
}
assert.equal(Object.keys(representatives).length, 3);
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const pass = name => { results.push(name); console.log(`PASS ${name}`); };
const snap = page => page.evaluate(() => window.__game.snapshot());
const action = (page, name) => page.locator(`[data-action=${name}]`).first().click();
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const seek = async (page, seconds) => { await page.evaluate(value => window.__game.cinematic(value), seconds); await frame(page); };
const shot = (page, name) => page.screenshot({ path: `artifacts/document-${name}.png`, animations: 'disabled' });
async function open(page, seed) {
  const url = new URL(base); url.searchParams.set('qa', '1'); url.searchParams.set('stage', 'stage05'); url.searchParams.set('seed', String(seed));
  await page.goto(url.href); await page.waitForFunction(() => window.__game?.snapshot().phase === 'TITLE');
  assert.equal(await page.locator('.stage-pick').count(), 5);
  assert.equal((await snap(page)).stageId, 'stage05');
  await action(page, 'start'); const instance = await page.evaluate(() => window.__game.instance());
  assert.equal(instance.caseSeed, seed); assert.equal(instance.facts.kind, 'document');
  assert.equal(await page.locator('.boss-message').innerText(), instance.copy.introBoss);
  await action(page, 'explore'); return instance;
}
const paths = page => page.evaluate(() => {
  const colliders = window.__game.colliders(), stage = window.__game.stage();
  const valid = (x, z) => ((x >= -5.7 && x <= 5.7 && z >= -4.2 && z <= 4.2) || (x >= 5.7 && x <= 8.7 && z >= -.2 && z <= 4.2))
    && !colliders.some(c => x > c.minX - .27 && x < c.maxX + .27 && z > c.minZ - .27 && z < c.maxZ + .27);
  const queue = [[Math.round(stage.start.x / .2), Math.round(stage.start.z / .2)]], seen = new Set([queue[0].join(',')]), found = {};
  for (let i = 0; i < queue.length; i++) {
    const [gx, gz] = queue[i], x = gx * .2, z = gz * .2;
    for (const clue of stage.clues) {
      const distance = Math.hypot(x - clue.x, z - clue.z);
      if (distance < clue.radius - .1 && (!found[clue.id] || distance < found[clue.id].distance)) found[clue.id] = { x, z, distance };
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx, nz = gz + dz, key = `${nx},${nz}`;
      if (!seen.has(key) && valid(nx * .2, nz * .2)) { seen.add(key); queue.push([nx, nz]); }
    }
  }
  return found;
});
async function inspect(page, clue, point) {
  await page.evaluate(value => window.__game.teleport(value.x, value.z), point);
  await page.waitForFunction(id => window.__game.snapshot().nearest === id, clue.id);
  await action(page, 'inspect');
  assert.equal(await page.locator('.evidence-document p').innerText(), clue.body);
  assert.equal(await page.locator('.player-thought').count(), 0);
}
async function finish(page, duration) { await seek(page, duration - .05); await page.waitForFunction(() => window.__game.snapshot().phase === 'ENDING'); }
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.on('pageerror', error => errors.push(error.message));
  for (const correct of choices) {
    const seed = representatives[correct], instance = await open(page, seed), original = JSON.stringify(instance), points = await paths(page);
    assert.equal(Object.keys(points).length, 7); await shot(page, `explore-${correct.toLowerCase()}`);
    await action(page, 'journal'); assert.equal(await page.locator('.journal-entry').count(), 0);
    const journalText = await page.locator('.journal-panel').innerText();
    for (const clue of instance.clues) assert.ok(!journalText.includes(clue.title));
    const paused = (await snap(page)).remaining; await page.waitForTimeout(220); assert.equal((await snap(page)).remaining, paused); await action(page, 'close');
    const before = await snap(page); await page.keyboard.down('KeyA'); await page.waitForTimeout(230); await page.keyboard.up('KeyA');
    assert.ok(Math.hypot((await snap(page)).x - before.x, (await snap(page)).z - before.z) > .05);
    for (const clue of instance.clues) { await inspect(page, clue, points[clue.id]); if (clue.id === 'C03') await shot(page, `intakes-${correct.toLowerCase()}`); await action(page, 'close'); }
    assert.equal((await snap(page)).found.length, 7); assert.equal(JSON.stringify(await page.evaluate(() => window.__game.instance())), original);
    for (const choice of [correct, ...choices.filter(value => value !== correct)]) {
      await action(page, 'decision'); assert.equal(await page.locator('.choice-button').count(), 3);
      for (const option of choices) assert.equal(await page.locator(`[data-action=choose][data-detail=${option}] strong`).innerText(), instance.choices[option].label);
      await page.locator(`[data-action=choose][data-detail=${choice}]`).click();
      const duration = instance.cinematicSeconds[choice];
      await seek(page, 2); const middle = await page.evaluate(() => window.__game.visuals());
      assert.equal(middle.clueMarkers, 0); assert.ok(middle.drawCalls < 160);
      await seek(page, duration - .6); const last = await page.evaluate(() => window.__game.visuals());
      assert.deepEqual(last.camera, middle.camera);
      assert.equal(last.document.choice, choice); assert.equal(last.document.intendedChoice, correct);
      assert.equal(last.document.packetId, instance.documentPlan.packetId);
      assert.equal(last.document.setCount, instance.documentPlan.setCount);
      assert.equal(last.document.pageCount, instance.documentPlan.pageCount);
      assert.ok(last.document.maximumWalkingSpeed <= 2.6);
      if (choice === 'A') assert.equal(last.document.summaryReady, true);
      if (choice === 'B') assert.equal(last.document.completedSets, instance.documentPlan.setCount);
      if (choice === 'C') { assert.equal(last.document.clipAttached, true); assert.ok(last.document.cartMoved > 1); assert.ok(last.document.totalHeight > 1.8); }
      if (correct === 'C' && choice === 'C') {
        let previous;
        const motionSamples = [];
        for (let t = .1; t < duration - .3; t += .15) {
          await seek(page, t); const current = await page.evaluate(() => window.__game.visuals());
          if (previous) {
            const elapsed = current.endingTime - previous.endingTime;
            const distance = Math.hypot(current.hero.x - previous.hero.x, current.hero.y - previous.hero.y, current.hero.z - previous.hero.z);
            assert.ok(distance <= 2.65 * elapsed + .015, `cart action jumps at ${current.endingTime}: ${distance} / ${elapsed}`);
          }
          motionSamples.push({ time: current.endingTime, hero: current.hero }); previous = current;
        }
        samples.push({ motionSamples }); await seek(page, duration - .6);
      }
      await shot(page, `action-${correct.toLowerCase()}-${choice.toLowerCase()}`); samples.push({ seed, correct, choice, middle, last });
      await finish(page, duration);
      assert.equal(await page.locator('.ending-stamp-c').count(), choice === correct ? 1 : 0);
      assert.equal(await page.locator('.ending-explanation').innerText(), instance.endings[choice].explanation);
      assert.equal(await page.locator('.ending-line blockquote').first().innerText(), instance.endings[choice].boss);
      if (choice === correct) { await page.locator('.ending-review summary').click(); assert.equal(await page.locator('.ending-review article').count(), instance.evidenceChain.length); await shot(page, `ending-${correct.toLowerCase()}`); }
      await action(page, 'retry'); assert.equal((await snap(page)).caseSeed, seed); assert.deepEqual((await snap(page)).found, []);
      assert.equal(JSON.stringify(await page.evaluate(() => window.__game.instance())), original);
      const reset = await page.evaluate(() => window.__game.visuals()); assert.equal(reset.document.choice, null); assert.equal(reset.document.clipAttached, false); assert.equal(reset.document.cartMoved, 0);
    }
    await action(page, 'decision'); await page.locator(`[data-action=choose][data-detail=${correct}]`).click(); await finish(page, instance.cinematicSeconds[correct]);
    await action(page, 'newcase'); assert.equal((await snap(page)).phase, 'INTRO'); assert.notEqual((await snap(page)).caseSeed, seed);
    const next = await page.evaluate(() => window.__game.instance()); assert.equal(await page.locator('.boss-message').innerText(), next.copy.introBoss);
    pass(`document intention ${correct}: seven reachable records, three actions, nine-way result consistency, fixed camera, retry and fresh request`);
  }
  await page.close();
  for (const [width, height] of [[320, 568], [360, 800], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const instance = await open(page, representatives.C), points = await paths(page);
    await inspect(page, instance.clues.find(clue => clue.id === 'C03'), points.C03); await shot(page, `record-${width}`);
    const close = await page.locator('[data-action=close]').boundingBox(); assert.ok(close.y >= 0 && close.y + close.height <= height + 1);
    await page.locator('[data-action=close]').tap(); await page.locator('[data-action=decision]').tap();
    assert.equal(await page.locator('.choice-button').count(), 3); await page.locator('[data-action=choose][data-detail=C]').scrollIntoViewIfNeeded(); await shot(page, `choices-${width}`);
    await page.locator('[data-action=choose][data-detail=C]').tap(); await seek(page, 12.6); await shot(page, `tower-${width}`); await finish(page, instance.cinematicSeconds.C);
    for (const name of ['newcase', 'retry', 'title']) { const box = await page.locator(`[data-action=${name}]`).boundingBox(); assert.ok(box.y >= 0 && box.y + box.height <= height + 1); }
    await shot(page, `ending-${width}`); await page.locator('[data-action=retry]').tap(); assert.equal((await snap(page)).phase, 'EXPLORE');
    // Choosing with no evidence remains possible, including after exploration times out.
    await page.evaluate(() => window.__game.advance(121)); assert.equal((await snap(page)).timedOut, true); assert.equal(await page.locator('.choice-button').count(), 3);
    await page.locator('[data-action=choose][data-detail=A]').tap(); assert.equal((await snap(page)).phase, 'CINEMATIC');
    await context.close(); pass(`document mobile records, three choices, paper tower, footer, early choice and timeout ${width}x${height}`);
  }
  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }), pageReduced = await reduced.newPage();
  pageReduced.on('pageerror', error => errors.push(error.message)); await open(pageReduced, representatives.C);
  await action(pageReduced, 'decision'); await pageReduced.locator('[data-action=choose][data-detail=C]').click(); await seek(pageReduced, 12.6);
  assert.equal(await pageReduced.evaluate(() => window.__game.visuals().document.reducedMotion), true); await shot(pageReduced, 'tower-reduced-motion'); await reduced.close();
  pass('document reduced-motion action remains readable');
  assert.deepEqual(errors, []); pass('document runtime without uncaught exceptions');
} finally {
  await fs.writeFile('artifacts/document-results.json', JSON.stringify({ base, browser: await browser.version(), representatives, results, errors, samples }, null, 2));
  await browser.close();
}
