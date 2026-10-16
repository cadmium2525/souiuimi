import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// A fresh persistent profile uses ordinary Chrome rather than an incognito
// BrowserContext. This checks actual install eligibility without installing.
const requested = new URL(process.env.PWA_LIVE_URL || 'https://cadmium2525.github.io/souiuimi/');
assert.equal(requested.protocol, 'https:', 'live PWA requires HTTPS');
requested.search = ''; requested.hash = '';
const base = requested.href;
const audioFile = 'audio/bossa-antigua.mp3';
const audioBytes = 9069455;
const results = [], errors = [], responseErrors = [], observations = {};
const pass = name => { results.push(name); console.log(`PASS ${name}`); };
const profilePrefix = 'souiuimi-pwa-live-';
const tempRoot = await fs.realpath(os.tmpdir());
const profile = await fs.mkdtemp(path.join(tempRoot, profilePrefix));
const realProfile = await fs.realpath(profile);
const safeProfile = () => {
  assert.ok(path.isAbsolute(realProfile));
  assert.equal(path.dirname(realProfile), tempRoot);
  assert.ok(path.basename(realProfile).startsWith(profilePrefix));
  assert.notEqual(realProfile, tempRoot);
};
safeProfile();
let context;
const phase = (page, expected) => page.locator(`#ui[data-phase="${expected}"]`).waitFor();
const action = (page, name) => page.locator(`[data-action="${name}"]`).first().click();
// Await the asynchronous browser predicate ourselves: this Playwright build's
// waitForFunction stops polling as soon as it receives a truthy Promise object.
const pollUntil = async (page, predicate, arg = null, { timeout = 30000 } = {}) => {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await page.evaluate(predicate, arg);
    if (value) return value;
    await page.waitForTimeout(100);
  } while (Date.now() < deadline);
  throw new Error(`Browser condition did not become true within ${timeout}ms: ${String(predicate)}`);
};
const pngSize = data => {
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};
const screenshot = (page, name) => page.screenshot({ path: `artifacts/pwa-live-${name}.png`, animations: 'disabled' });
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const checkOfflineCredits = async page => {
  const [credits] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('.title-music .music-credit').tap(),
  ]);
  credits.on('pageerror', error => errors.push(error.message));
  credits.on('response', response => { if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.url()}`); });
  try {
    await credits.waitForLoadState('domcontentloaded');
    assert.equal(credits.url(), `${base}music-credits.html`);
    assert.equal(await credits.locator('h1').innerText(), 'BGMクレジット');
    const body = await credits.locator('body').innerText();
    for (const credit of ['Bossa Antigua', 'Kevin MacLeod', 'CC BY 4.0']) assert.ok(body.includes(credit), `offline music credit: ${credit}`);
    assert.equal(await credits.locator('#world').count(), 0, 'credit navigation must open the credit HTML rather than the game shell');
    assert.equal(await credits.evaluate(() => navigator.onLine), false);
    await phase(page, 'title');
    await screenshot(credits, 'offline-music-credits');
    return { url: credits.url(), heading: 'BGMクレジット', offline: true, track: 'Bossa Antigua', author: 'Kevin MacLeod', license: 'CC BY 4.0', parentPhase: 'title' };
  } finally {
    await credits.close();
    await page.bringToFront();
  }
};
const captureAudio = () => {
  const NativeAudio = window.Audio;
  window.__testAudio = [];
  window.Audio = function (...args) { const audio = new NativeAudio(...args); window.__testAudio.push(audio); return audio; };
  window.Audio.prototype = NativeAudio.prototype;
  Object.setPrototypeOf(window.Audio, NativeAudio);
};
const audioState = page => page.evaluate(() => window.__testAudio.map(audio => ({ src: audio.src, currentTime: audio.currentTime, paused: audio.paused, error: audio.error?.code ?? null })));
const checkAudioRanges = async page => {
  const checked = await page.evaluate(async ({ base, audioFile, audioBytes }) => {
    const url = new URL(audioFile, base).href;
    const cached = await caches.match(url);
    if (!cached) throw new Error('complete recording is absent from the cache');
    const original = new Uint8Array(await cached.arrayBuffer());
    const ranges = [];
    for (const [name, header, start, end] of [['first', 'bytes=0-127', 0, 127], ['suffix', 'bytes=-64', audioBytes - 64, audioBytes - 1], ['open', `bytes=${audioBytes - 64}-`, audioBytes - 64, audioBytes - 1]]) {
      const response = await fetch(url, { headers: { Range: header } });
      const bytes = new Uint8Array(await response.arrayBuffer());
      ranges.push({ name, status: response.status, range: response.headers.get('Content-Range'), length: response.headers.get('Content-Length'), acceptRanges: response.headers.get('Accept-Ranges'), bodyLength: bytes.length, matches: bytes.length === end - start + 1 && bytes.every((value, index) => value === original[start + index]) });
    }
    const unsatisfiable = await fetch(`${url}?pwa-range=unsatisfiable`, { headers: { Range: `bytes=${audioBytes}-` } });
    return { cachedBytes: original.length, ranges, unsatisfiable: { status: unsatisfiable.status, range: unsatisfiable.headers.get('Content-Range'), bodyLength: (await unsatisfiable.arrayBuffer()).byteLength } };
  }, { base, audioFile, audioBytes });
  assert.equal(checked.cachedBytes, audioBytes);
  for (const [index, { start, end }] of [{ start: 0, end: 127 }, { start: audioBytes - 64, end: audioBytes - 1 }, { start: audioBytes - 64, end: audioBytes - 1 }].entries()) {
    const range = checked.ranges[index];
    assert.equal(range.status, 206); assert.equal(range.range, `bytes ${start}-${end}/${audioBytes}`);
    assert.equal(range.length, String(end - start + 1)); assert.equal(range.bodyLength, end - start + 1);
    assert.equal(range.acceptRanges, 'bytes'); assert.equal(range.matches, true);
  }
  assert.deepEqual(checked.unsatisfiable, { status: 416, range: `bytes */${audioBytes}`, bodyLength: 0 });
  return checked;
};

await fs.mkdir('artifacts', { recursive: true });
try {
  context = await chromium.launchPersistentContext(realProfile, {
    channel: 'chrome', headless: true, viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, serviceWorkers: 'allow',
    args: ['--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  context.setDefaultTimeout(30000);
  await context.addInitScript(captureAudio);
  const page = context.pages()[0] || await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    const expectedRangeError = response.status() === 416 && new URL(response.url()).searchParams.get('pwa-range') === 'unsatisfiable';
    if (response.status() >= 400 && !expectedRangeError) responseErrors.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200); assert.equal(page.url(), base);
  await phase(page, 'title');
  assert.equal(await page.evaluate(() => isSecureContext), true);
  assert.equal(await page.evaluate(() => typeof window.__game), 'undefined');
  const manifestUrl = await page.locator('link[rel="manifest"]').evaluate(link => link.href);
  const manifestResponse = await page.request.get(manifestUrl);
  assert.equal(manifestResponse.status(), 200);
  assert.match(manifestResponse.headers()['content-type'], /application\/manifest\+json/);
  const manifest = await manifestResponse.json(); observations.manifest = manifest;
  assert.equal(new URL(manifest.scope, manifestUrl).href, base);
  assert.equal(new URL(manifest.start_url, manifestUrl).pathname, requested.pathname);
  assert.equal(new URL(manifest.id, manifestUrl).pathname, requested.pathname);
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.lang, 'ja');
  for (const [size, purpose] of [[192, 'any'], [512, 'any'], [512, 'maskable']]) {
    const icon = manifest.icons.find(entry => entry.sizes.split(/\s+/).includes(`${size}x${size}`) && (entry.purpose || 'any').split(/\s+/).includes(purpose));
    assert.ok(icon, `${size}px ${purpose} icon`);
    const iconResponse = await page.request.get(new URL(icon.src, manifestUrl).href);
    assert.equal(iconResponse.status(), 200); assert.match(iconResponse.headers()['content-type'], /image\/png/);
    assert.deepEqual(pngSize(await iconResponse.body()), [size, size]);
  }
  for (const [selector, size] of [['link[rel="apple-touch-icon"]', 180], ['link[rel="icon"][type="image/png"]', 32]]) {
    const iconUrl = await page.locator(selector).first().evaluate(link => link.href);
    const iconResponse = await page.request.get(iconUrl); assert.equal(iconResponse.status(), 200);
    assert.deepEqual(pngSize(await iconResponse.body()), [size, size]);
  }
  pass('published HTTPS page, manifest identity and all generated install/Apple/favicon images');

  await pollUntil(page, async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 60000 });
  if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) { await page.reload(); await phase(page, 'title'); }
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  observations.worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { scope: registration.scope, active: registration.active.scriptURL, controller: navigator.serviceWorker.controller.scriptURL, caches: await caches.keys() };
  });
  assert.equal(observations.worker.scope, base);
  assert.equal(observations.worker.active, `${base}sw.js`);
  assert.equal(observations.worker.controller, `${base}sw.js`);
  assert.ok(observations.worker.caches.some(name => name.startsWith('souiu-imi-precache-')));
  const cdp = await context.newCDPSession(page);
  observations.appManifest = await cdp.send('Page.getAppManifest');
  assert.deepEqual(observations.appManifest.errors, []);
  observations.installability = await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(observations.installability.installabilityErrors, [], 'ordinary Chrome must have no installability errors');
  await cdp.detach();
  pass('live service worker controls the correct scope and ordinary Chrome reports zero installability errors');

  // A browser decides when to expose beforeinstallprompt. Do not manufacture an
  // event or click the install action: screenshot the real offer if it appears.
  await page.mouse.click(3, 3);
  observations.installOfferVisible = await page.locator('#pwa-install-button').waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false);
  observations.layouts = [];
  for (const [width, height] of [[390, 844], [320, 568], [800, 450]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    await screenshot(page, `title-${width}`);
    const install = page.locator('#pwa-install-button');
    const visible = await install.isVisible();
    const entry = { width, height, installVisible: visible, checked: [] };
    if (visible) {
      const bounds = await install.boundingBox(); entry.button = bounds;
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
      assert.ok(bounds.height >= 44, 'install action is a usable touch target');
      for (const selector of ['.company-mark', '.game-title', '.run-invitation', '.start-button', '.title-music']) {
        const element = page.locator(selector);
        if (await element.isVisible()) {
          const other = await element.boundingBox(), area = overlap(bounds, other);
          entry.checked.push({ selector, bounds: other, overlap: area });
          assert.ok(area < 1, `install action overlaps ${selector} at ${width}x${height}`);
        }
      }
    }
    observations.layouts.push(entry);
  }
  pass(observations.installOfferVisible ? 'real install offer stays clear of logo, title, five-case invitation, BGM and start at 390/320/800px' : 'title captured at 390/320/800px; this Chrome session did not expose an install offer');

  await page.setViewportSize({ width: 390, height: 844 });
  await context.setOffline(true);
  await page.reload(); await phase(page, 'title');
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  assert.equal(await page.locator('.stage-pick').count(), 0);
  assert.equal(await page.locator('[data-action="start"]').count(), 1);
  observations.offlineCredits = await checkOfflineCredits(page);
  observations.audioRanges = await checkAudioRanges(page);
  await action(page, 'start');
  const played = [];
  for (let index = 0; index < 5; index++) {
    await phase(page, 'intro');
    await page.waitForFunction(() => [...document.querySelectorAll('.boss-portrait')].length > 0 && [...document.querySelectorAll('.boss-portrait')].every(img => img.complete && img.naturalWidth > 0));
    if (index === 0) await screenshot(page, 'offline-boss');
    await action(page, 'explore'); await phase(page, 'explore');
    const id = await page.locator('#ui').getAttribute('data-stage');
    assert.ok(!played.includes(id), 'a completed case never repeats within a run');
    played.push(id);
    assert.equal(await page.evaluate(() => typeof window.__game), 'undefined');
    assert.ok(await page.locator('#world').evaluate(canvas => canvas.width > 0 && canvas.height > 0));
    assert.match(await page.locator('[data-run-progress]').innerText(), new RegExp(`${index + 1}/5`));
    if (index === 0) {
      await page.waitForFunction(() => window.__testAudio.some(audio => !audio.paused && audio.currentTime > 0.2 && !audio.error));
      observations.offlineAudioStart = await audioState(page);
    }
    await action(page, 'decision'); await phase(page, 'decision');
    assert.equal(await page.locator('.choice-button').count(), id === 'stage04' ? 2 : 3);
    if (id === 'stage05') await screenshot(page, 'offline-choices');
    const choice = id === 'stage04' ? 'A' : 'C';
    await page.locator(`[data-action="choose"][data-detail="${choice}"]`).click();
    await phase(page, 'cinematic');
    if (id === 'stage05') { await page.waitForTimeout(4500); await screenshot(page, 'offline-bundle'); }
    await page.locator('#ui[data-phase="ending"]').waitFor({ timeout: 30000 });
    assert.ok((await page.locator('.ending-explanation').innerText()).length > 0);
    assert.equal(await page.locator('[data-action="retry"]').count(), 0);
    if (id === 'stage05') await screenshot(page, 'offline-ending');
    await action(page, 'newcase');
    await phase(page, index < 4 ? 'intro' : 'results');
    console.log(`Completed offline case ${index + 1}/5: ${id}`);
  }
  observations.offlineOrder = played;
  assert.deepEqual([...played].sort(), ['stage01', 'stage02', 'stage03', 'stage04', 'stage05']);
  assert.equal(await page.locator('.result-row').count(), 5);
  observations.offlineAudioEnd = await audioState(page);
  assert.equal(observations.offlineAudioEnd.length, 1);
  assert.ok(observations.offlineAudioEnd[0].currentTime > observations.offlineAudioStart[0].currentTime + 1);
  assert.equal(observations.offlineAudioEnd[0].paused, false); assert.equal(observations.offlineAudioEnd[0].error, null);
  await screenshot(page, 'offline-five-case-results');
  await context.setOffline(false); await page.waitForFunction(() => navigator.onLine);
  assert.equal((await page.request.get(manifestUrl)).status(), 200);
  assert.deepEqual(errors, []); assert.deepEqual(responseErrors, []);
  pass('published offline credit-link tap opens the credited HTML; installation completes five unique cases through results, plays cached acoustic BGM with working byte ranges, and reconnects');
} finally {
  observations.browser = context ? await context.browser()?.version() : undefined;
  await fs.writeFile('artifacts/pwa-live-results.json', JSON.stringify({ base, results, errors, responseErrors, observations }, null, 2));
  await context?.close();
  // Only the unique profile created above is eligible for recursive cleanup.
  safeProfile();
  await fs.rm(realProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}
