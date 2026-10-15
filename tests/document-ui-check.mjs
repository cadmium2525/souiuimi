import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.GAME_URL || 'http://127.0.0.1:4173/';
const results = [], errors = [], samples = [];
const viewports = [[320, 568], [360, 800], [390, 844], [800, 450], [1440, 900]];
const stages = ['stage01', 'stage02', 'stage03', 'stage04', 'stage05'];
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const pass = name => { results.push(name); console.log(`PASS ${name}`); };
const frame = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const snapshot = p => p.evaluate(() => window.__game.snapshot());
const shot = (p, name) => p.screenshot({ path: `artifacts/document-ui-${name}.png`, animations: 'disabled' });
async function activate(p, selector, touch) {
  const target = p.locator(selector).first(); await target.scrollIntoViewIfNeeded();
  if (touch) await target.tap(); else await target.click();
}
async function clickable(p, selector, width, height) {
  const target = p.locator(selector).first(); await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox(); assert.ok(box, `${selector} has no box`);
  assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `${selector} outside viewport ${JSON.stringify(box)}`);
  assert.ok(box.height >= 43 && box.width >= 43, `${selector} touch target too small`);
  assert.ok(await target.evaluate(el => { const b = el.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!hit && el.contains(hit); }), `${selector} is covered`);
  return box;
}
async function scrollBottom(p) { await p.locator('.panel-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; }); await frame(p); }
try {
  for (const [width, height] of viewports) {
    const touch = width < 1000;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, reducedMotion: 'reduce' });
    const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message));
    const url = new URL(base); url.searchParams.set('qa', '1'); url.searchParams.set('stage', 'stage05'); url.searchParams.set('seed', '0');
    await p.goto(url.href); await p.waitForFunction(() => window.__game?.snapshot().phase === 'TITLE');
    assert.equal(await p.locator('.stage-pick').count(), 5);
    for (const stage of stages) {
      await activate(p, `[data-action=stage][data-detail=${stage}]`, touch); await frame(p);
      assert.equal((await snapshot(p)).stageId, stage);
      const selected = `[data-action=stage][data-detail=${stage}]`;
      assert.equal(await p.locator(selected).getAttribute('aria-pressed'), 'true');
      await clickable(p, selected, width, height); await clickable(p, '[data-action=start]', width, height);
      const geometry = await p.evaluate(() => {
        const rect = sel => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, bottom: b.bottom }; };
        return { copy: rect('.title-copy'), start: rect('.title-start'), picker: rect('.stage-picker'), world: rect('.world-tag') };
      });
      assert.ok(geometry.copy.bottom <= geometry.start.y + 1, `title and start overlap ${width} ${stage}`);
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await shot(p, `home-${width}-${stage}`);
      await activate(p, '[data-action=start]', touch); assert.equal((await snapshot(p)).stageId, stage); assert.equal((await snapshot(p)).phase, 'INTRO');
      await clickable(p, '[data-action=explore]', width, height);
      await activate(p, '[data-action=explore]', touch); await activate(p, '[data-action=menu]', touch); await activate(p, '[data-action=title]', touch); await frame(p);
      samples.push({ width, height, stage, geometry }); pass(`five-case home selection and start ${width}x${height} ${stage}`);
    }
    await activate(p, '[data-action=stage][data-detail=stage05]', touch); await activate(p, '[data-action=start]', touch);
    const instance = await p.evaluate(() => window.__game.instance());
    assert.equal(await p.locator('.boss-message').innerText(), instance.copy.introBoss);
    assert.equal(await p.locator('.boss-portrait').count(), 1); await scrollBottom(p); await shot(p, `intro-${width}`);
    await activate(p, '[data-action=explore]', touch);
    const clue = instance.clues.find(c => c.id === 'C03');
    await p.evaluate(c => window.__game.teleport(c.x, c.z), clue); await p.waitForFunction(id => window.__game.snapshot().nearest === id, clue.id);
    await activate(p, '[data-action=inspect]', touch);
    assert.equal(await p.locator('.evidence-document p').innerText(), clue.body); assert.equal(await p.locator('.player-thought').count(), 0);
    await clickable(p, '[data-action=close]', width, height); await shot(p, `record-${width}`); await scrollBottom(p); await shot(p, `record-bottom-${width}`);
    await activate(p, '[data-action=close]', touch); await activate(p, '[data-action=journal]', touch); await scrollBottom(p); await shot(p, `journal-${width}`);
    assert.equal(await p.locator('.journal-entry').count(), 1); await activate(p, '[data-action=close]', touch);
    await activate(p, '[data-action=decision]', touch); assert.equal(await p.locator('.choice-button').count(), 3);
    for (const choice of ['A', 'B', 'C']) { await clickable(p, `[data-action=choose][data-detail=${choice}]`, width, height); assert.equal(await p.locator(`[data-action=choose][data-detail=${choice}] strong`).innerText(), instance.choices[choice].label); }
    for (const name of ['journal', 'back']) await clickable(p, `[data-action=${name}]`, width, height);
    await p.locator('[data-action=choose][data-detail=C]').scrollIntoViewIfNeeded(); await shot(p, `choices-${width}`);
    await activate(p, '[data-action=choose][data-detail=C]', touch); await p.evaluate(() => window.__game.cinematic(30)); await p.waitForFunction(() => window.__game.snapshot().phase === 'ENDING');
    assert.equal(await p.locator('.ending-explanation').innerText(), instance.endings.C.explanation);
    for (const name of ['newcase', 'retry', 'title']) await clickable(p, `[data-action=${name}]`, width, height);
    await shot(p, `ending-${width}`); await p.locator('.ending-review summary').scrollIntoViewIfNeeded(); await activate(p, '.ending-review summary', touch); await scrollBottom(p);
    assert.equal(await p.locator('.ending-review article').count(), 3); await shot(p, `ending-review-${width}`);
    await activate(p, '[data-action=retry]', touch); assert.equal((await snapshot(p)).phase, 'EXPLORE');
    await context.close(); pass(`document clue, journal, three choices and ending scroll ${width}x${height}`);
  }
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errors.push(e.message));
  const fixture = new URL(base); fixture.searchParams.set('qa', '1'); fixture.searchParams.set('stage', 'stage05'); fixture.searchParams.set('fixture', 'original');
  await p.goto(fixture.href); await p.waitForFunction(() => window.__game?.snapshot().phase === 'TITLE');
  await p.locator('[data-action=start]').click(); await p.locator('[data-action=explore]').click(); await p.locator('[data-action=decision]').click(); await p.locator('[data-action=choose][data-detail=C]').click();
  await p.evaluate(() => window.__game.cinematic(30)); await p.waitForFunction(() => window.__game.snapshot().phase === 'ENDING'); await activate(p, '.ending-review summary', false);
  assert.deepEqual(await p.locator('.ending-review .review-number').allTextContents(), ['01', '02', '03']); await p.close(); pass('original document fixture reviews its own request, routing and conditions');
  assert.deepEqual(errors, []); pass('five-case UI has no uncaught browser exceptions');
} finally {
  await fs.writeFile('artifacts/document-ui-results.json', JSON.stringify({ base, browser: await browser.version(), results, errors, samples }, null, 2));
  await browser.close();
}
