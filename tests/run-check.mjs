import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.GAME_URL || 'http://127.0.0.1:4176/';
const viewports = [[320, 568], [390, 844], [800, 450], [1440, 900]];
const results = [], errors = [], samples = [];
let failure = null;
await fs.mkdir('artifacts', { recursive: true });
// Keep Chrome's normal gesture policy: no autoplay override is used.
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const pass = name => { results.push(name); console.log(`PASS ${name}`); };
const snap = page => page.evaluate(() => window.__game.snapshot());
const music = page => page.evaluate(() => window.__game.music());
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const clock = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
const shot = (page, name) => page.screenshot({ path: `artifacts/run-${name}.png`, animations: 'disabled' });

function gameUrl() {
  const url = new URL(base);
  url.searchParams.set('qa', '1'); url.searchParams.set('seed', '1');
  url.searchParams.delete('stage'); url.searchParams.delete('fixture');
  return url.href;
}
async function action(page, name, detail) {
  const button = page.locator(`[data-action="${name}"]${detail ? `[data-detail="${detail}"]` : ''}`).first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
}
async function visible(page, selector, width, height, minHeight = 43) {
  const button = page.locator(selector).first(), box = await button.boundingBox();
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1,
    `${selector} outside ${width}×${height}: ${JSON.stringify(box)}`);
  assert.ok(box.height >= minHeight && box.width >= 43, `${selector} has a small touch target`);
  assert.ok(await button.evaluate(el => {
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit && el.contains(hit);
  }), `${selector} is covered`);
  return box;
}
async function heldMusic(page, name) {
  await page.waitForFunction(() => window.__game.music().paused);
  const before = await music(page);
  await page.waitForTimeout(350);
  const after = await music(page);
  assert.equal(after.paused, true);
  assert.ok(Math.abs(after.currentTime - before.currentTime) < .08, `${name} must hold the musical position`);
  samples.push({ name, before, after });
  return after;
}
async function playingMusic(page, afterTime = 0) {
  await page.waitForFunction(time => {
    const audio = window.__game.music();
    return !audio.paused && audio.currentTime > time + .12 && audio.error === null;
  }, afterTime, { timeout: 15000 });
  return music(page);
}
async function inspect(page, clue) {
  await page.evaluate(point => window.__game.teleport(point.x, point.z), clue);
  await page.waitForFunction(id => window.__game.snapshot().nearest === id, clue.id);
  await action(page, 'inspect');
  assert.equal(await page.locator('.evidence-document p').innerText(), clue.body);
  await action(page, 'close');
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(gameUrl());
  await page.waitForFunction(() => window.__game?.snapshot().phase === 'TITLE');
  assert.equal((await snap(page)).mode, 'run');
  assert.equal((await snap(page)).run, null);
  assert.equal(await page.locator('.stage-picker').count(), 0);
  assert.equal(await page.locator('.run-invitation').count(), 0);
  assert.doesNotMatch(await page.locator('.title-start').innerText(), /5つの依頼を|ランダムな順番で/);
  assert.equal(await page.locator('[data-action=start]').innerText(), 'ゲームスタート');
  assert.equal(await page.locator('[data-action=music]').getAttribute('aria-pressed'), 'true');
  await page.waitForTimeout(350);
  const beforeGesture = await music(page);
  assert.equal(beforeGesture.enabled, true); assert.equal(beforeGesture.unlocked, false);
  assert.equal(beforeGesture.paused, true); assert.equal(beforeGesture.currentTime, 0);
  assert.equal(beforeGesture.loop, true); assert.ok(beforeGesture.volume > 0 && beforeGesture.volume < .5);
  samples.push({ name: 'music before the first gesture', music: beforeGesture });
  pass('normal title offers one game start and keeps default-ON music silent before a gesture');

  await action(page, 'start');
  await page.waitForFunction(() => window.__game.snapshot().phase === 'INTRO');
  const firstPlayback = await playingMusic(page);
  assert.equal(firstPlayback.enabled, true); assert.equal(firstPlayback.unlocked, true);
  assert.ok(firstPlayback.duration > 30, 'the bundled recording must decode as real music');
  pass('a real start click begins the bundled recording under Chrome’s normal media policy');

  const expected = [], transitionMusic = [];
  for (let index = 0; index < 5; index++) {
    const intro = await snap(page), instance = await page.evaluate(() => window.__game.instance());
    assert.equal(intro.phase, 'INTRO'); assert.equal(intro.mode, 'run');
    assert.equal(await page.locator('.boss-message').innerText(), instance.copy.introBoss);
    assert.equal(await page.locator('.boss-message strong').count(), 1);
    assert.ok(await page.locator('.boss-message strong').evaluate(el => Number(getComputedStyle(el).fontWeight) > Number(getComputedStyle(el.parentElement).fontWeight)), 'ambiguous instruction must be visually bolder');
    assert.equal(intro.run.current, index + 1); assert.equal(intro.run.total, 5);
    assert.equal(intro.run.completed.length, index);
    assert.equal(await page.locator('.run-progress').innerText(), `依頼 ${index + 1}/5`);
    assert.equal(await page.locator('[data-action=newcase], [data-action=next], [data-action=retry], [data-action=stage]').count(), 0);
    await page.evaluate(() => { window.__game.action('newcase'); window.__game.action('retry'); window.__game.action('next'); });
    assert.equal((await snap(page)).phase, 'INTRO', 'no action may skip a request before its ending');
    assert.equal((await snap(page)).stageId, intro.stageId);
    await visible(page, '[data-action=explore]', 390, 844);
    await action(page, 'explore');
    assert.equal(await page.locator('[data-run-progress]').innerText(), `依頼 ${index + 1}/5`);

    if (index === 0) {
      await action(page, 'menu');
      const beforeCredits = await snap(page);
      await page.locator('.menu-music-credit').scrollIntoViewIfNeeded();
      const [credits] = await Promise.all([page.waitForEvent('popup'), page.locator('.menu-music-credit').tap()]);
      await credits.waitForLoadState('domcontentloaded');
      assert.equal(await credits.locator('h1').innerText(), 'BGMクレジット');
      await credits.close(); await page.bringToFront();
      assert.deepEqual(await snap(page), beforeCredits, 'opening credits must preserve the paused game');
      const soundBefore = (await snap(page)).sound;
      await action(page, 'music');
      assert.equal((await snap(page)).music, false);
      assert.equal((await snap(page)).sound, soundBefore);
      assert.equal(await page.locator('[data-action=music]').getAttribute('aria-pressed'), 'false');
      const stopped = await heldMusic(page, 'BGM OFF');
      await action(page, 'sound');
      assert.equal((await snap(page)).sound, !soundBefore);
      assert.equal((await snap(page)).music, false);
      const independent = await music(page); assert.equal(independent.paused, true);
      assert.ok(Math.abs(independent.currentTime - stopped.currentTime) < .08);
      await action(page, 'music');
      assert.equal(await page.locator('[data-action=music]').getAttribute('aria-pressed'), 'true');
      await playingMusic(page, stopped.currentTime);
      await action(page, 'sound');
      assert.equal((await snap(page)).sound, soundBefore);
      assert.equal((await snap(page)).music, true); assert.equal((await music(page)).paused, false);
      pass('menu BGM OFF pauses in place; BGM ON resumes; sound effects switch independently');

      // This is an explicit event-policy simulation, not a real iOS background test.
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal((await music(page)).suspended, true);
      const hidden = await heldMusic(page, 'simulated hidden document');
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal((await music(page)).suspended, false);
      await playingMusic(page, hidden.currentTime);
      pass('simulated visibilitychange pauses the recording and resumes its held position');

      for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height }); await frame(page);
        await page.locator('[data-action=music]').scrollIntoViewIfNeeded();
        await visible(page, '[data-action=music]', width, height);
        await visible(page, '[data-action=close]', width, height);
        await shot(page, `menu-${width}`);
      }
      await page.setViewportSize({ width: 390, height: 844 }); await frame(page);
      await action(page, 'close');
    }

    const clueCount = index % 3 + 1;
    for (const clue of instance.clues.slice(0, clueCount)) await inspect(page, clue);
    assert.equal((await snap(page)).found.length, clueCount);
    if (index === 4) {
      await page.evaluate(() => window.__game.advance(121));
      assert.equal((await snap(page)).phase, 'DECISION');
      assert.equal((await snap(page)).timedOut, true);
      assert.equal(await page.locator('[data-action=back]').count(), 0);
    } else {
      await page.evaluate(seconds => window.__game.advance(seconds), 8 + index * 4);
      await action(page, 'decision');
    }
    const decision = await snap(page);
    const selected = index % 2 === 0 ? instance.correctChoice : (instance.choiceIds ?? ['A', 'B', 'C']).find(choice => choice !== instance.correctChoice);
    assert.equal(await page.locator(`[data-action=choose][data-detail=${selected}] strong`).innerText(), instance.choices[selected].label);
    await action(page, 'choose', selected);
    assert.equal((await snap(page)).run.completed.length, index, 'a result is recorded after its animation');
    await page.evaluate(seconds => window.__game.cinematic(seconds - .1), instance.cinematicSeconds[selected]);
    await page.waitForFunction(() => window.__game.snapshot().phase === 'ENDING'); await frame(page);
    const ending = await snap(page);
    expected.push({
      stageId: instance.id, caseSeed: instance.caseSeed, choice: selected, choiceLabel: instance.choices[selected].label,
      correctChoice: instance.correctChoice, correct: index % 2 === 0, found: clueCount,
      elapsed: instance.seconds - decision.remaining, timedOut: index === 4,
    });
    assert.deepEqual(ending.run.completed, expected);
    assert.equal(await page.locator('[data-action=retry], [data-action=next], [data-action=stage]').count(), 0);
    await page.evaluate(() => { window.__game.action('retry'); window.__game.action('next'); window.__game.action('choose', 'A'); });
    assert.equal((await snap(page)).phase, 'ENDING');
    assert.deepEqual((await snap(page)).run.completed, expected, 'replaying an ending must not overwrite or duplicate a result');
    assert.equal(await page.locator('[data-action=newcase]').innerText(), index === 4 ? 'リザルトを見る' : '次の依頼へ');
    await visible(page, '[data-action=newcase]', 390, 844);
    if (index === 4) await shot(page, 'last-ending-390');
    const audioBefore = await music(page);
    await action(page, 'newcase');
    await page.waitForFunction(() => ['INTRO', 'RESULTS'].includes(window.__game.snapshot().phase));
    const audioAfter = await music(page);
    assert.ok(audioAfter.currentTime >= audioBefore.currentTime - .08, 'changing cases must not restart the recording');
    assert.equal(audioAfter.paused, false); assert.equal(audioAfter.error, null);
    transitionMusic.push({ stageId: instance.id, before: audioBefore.currentTime, after: audioAfter.currentTime });
  }
  assert.equal(new Set(expected.map(result => result.stageId)).size, 5);
  assert.deepEqual([...expected.map(result => result.stageId)].sort(), ['stage01', 'stage02', 'stage03', 'stage04', 'stage05']);
  assert.equal(new Set(expected.map(result => result.caseSeed)).size, 5);
  const final = await snap(page);
  assert.equal(final.phase, 'RESULTS'); assert.equal(final.run.current, 5);
  assert.deepEqual(final.run.completed, expected);
  assert.equal(await page.locator('.result-row').count(), 5);
  assert.equal(await page.locator('.result-correct').count(), 3);
  assert.equal(await page.locator('.result-score-number').innerText(), '3/5');
  assert.deepEqual(await page.locator('.result-case p').allTextContents(), expected.map(result => `あなたの解釈${result.choiceLabel}`));
  assert.deepEqual(await page.locator('.result-order').allTextContents(), ['01', '02', '03', '04', '05']);
  assert.deepEqual(await page.locator('.result-status').allTextContents(), expected.map(result => result.correct ? '意図が伝わった' : 'すれ違い'));
  assert.equal(await page.locator('.result-timeout').count(), 1);
  assert.equal(await page.locator('.result-stats dd').nth(0).innerText(), `${expected.reduce((sum, result) => sum + result.found, 0)}/35`);
  assert.equal(await page.locator('.result-stats dd').nth(1).innerText(), clock(expected.reduce((sum, result) => sum + result.elapsed, 0)));
  samples.push({ name: 'five-request history', expected, final, transitionMusic });
  pass('a full normal game plays five distinct cases, records three matches/two mismatches, and preserves every selected label/count in order');
  pass('a timeout reaches its ending; requests cannot be skipped or replayed into the current report');
  pass('the same recording continues through all case transitions and the final report without resetting');

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await frame(page);
    await page.locator('.panel-scroll').evaluate(el => { el.scrollTop = 0; }); await frame(page);
    await visible(page, '[data-action=start]', width, height);
    await visible(page, '[data-action=title]', width, height, 30);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot(page, `results-${width}`);
    for (const row of await page.locator('.result-row').all()) {
      await row.scrollIntoViewIfNeeded();
      assert.ok(await row.evaluate(el => {
        const row = el.getBoundingClientRect(), pane = el.closest('.panel-scroll').getBoundingClientRect();
        return row.top >= pane.top - 1 && row.bottom <= pane.bottom + 1 && row.left >= pane.left - 1 && row.right <= pane.right + 1;
      }), `every report row must be fully accessible at ${width}×${height}`);
    }
    await page.locator('.panel-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; }); await frame(page);
    await visible(page, '[data-action=start]', width, height);
    await shot(page, `results-bottom-${width}`);
    pass(`report rows scroll and the primary footer stays visible at ${width}×${height}`);
  }

  await action(page, 'start');
  const restarted = await snap(page);
  assert.equal(restarted.phase, 'INTRO'); assert.equal(restarted.run.current, 1);
  assert.deepEqual(restarted.run.completed, []); assert.equal(restarted.found.length, 0);
  assert.ok(!expected.some(result => result.caseSeed === restarted.caseSeed));
  await action(page, 'explore'); await action(page, 'menu'); await action(page, 'title');
  const quit = await snap(page);
  assert.equal(quit.phase, 'TITLE'); assert.equal(quit.mode, 'run'); assert.equal(quit.run, null);
  assert.equal(quit.choice, null); assert.deepEqual(quit.found, []);
  pass('restart begins a fresh five-request run; quitting returns to a clean normal title');

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height }); await frame(page);
    assert.equal(await page.locator('.stage-picker').count(), 0);
    assert.equal(await page.locator('.run-invitation').count(), 0);
    await visible(page, '[data-action=start]', width, height);
    await visible(page, '[data-action=music]', width, height);
    await visible(page, '.title-music .music-credit', width, height);
    const [credits] = await Promise.all([page.waitForEvent('popup'), width > 1000 ? page.locator('.title-music .music-credit').click() : page.locator('.title-music .music-credit').tap()]);
    await credits.waitForLoadState('domcontentloaded');
    assert.equal(await credits.locator('h1').innerText(), 'BGMクレジット');
    assert.match(await credits.locator('body').innerText(), /Bossa Antigua/);
    assert.equal(await credits.locator('#world').count(), 0);
    assert.equal((await snap(page)).phase, 'TITLE');
    await credits.close(); await page.bringToFront();
    const geometry = await page.evaluate(() => {
      const rect = selector => { const box = document.querySelector(selector).getBoundingClientRect(); return { x: box.x, y: box.y, bottom: box.bottom, right: box.right }; };
      return { copy: rect('.title-copy'), start: rect('.title-start') };
    });
    assert.ok(geometry.copy.bottom <= geometry.start.y + 1, `home title overlaps its start card at ${width}×${height}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot(page, `home-${width}`); samples.push({ name: 'normal title geometry', width, height, geometry });
    pass(`normal home start and BGM control remain readable at ${width}×${height}`);
  }

  await action(page, 'music');
  assert.equal((await snap(page)).music, false);
  assert.equal(await page.evaluate(() => localStorage.getItem('souiu-imi-music')), 'off');
  await heldMusic(page, 'saved BGM OFF before reload');
  await page.reload(); await page.waitForFunction(() => window.__game?.snapshot().phase === 'TITLE');
  assert.equal((await snap(page)).music, false);
  assert.equal(await page.locator('[data-action=music]').getAttribute('aria-pressed'), 'false');
  const reloaded = await music(page);
  assert.equal(reloaded.enabled, false); assert.equal(reloaded.unlocked, false);
  assert.equal(reloaded.paused, true); assert.equal(reloaded.currentTime, 0);
  await action(page, 'music');
  assert.equal((await snap(page)).music, true);
  assert.equal(await page.evaluate(() => localStorage.getItem('souiu-imi-music')), 'on');
  await playingMusic(page);
  pass('saved BGM OFF survives reload, and a title ON click starts music and saves the new preference');

  assert.deepEqual(errors, []); pass('normal game and BGM controls produce no uncaught browser exceptions');
  await context.close();
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await fs.writeFile('artifacts/run-results.json', JSON.stringify({
    base, browser: await browser.version(), results, errors, failure, samples,
    limits: ['Chrome desktop with software WebGL; no real iOS device test.', 'Visibility checks explicitly simulate document.hidden and dispatch visibilitychange.'],
  }, null, 2));
  await browser.close();
}
