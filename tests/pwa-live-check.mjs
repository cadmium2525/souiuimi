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
const pngSize = data => {
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};
const screenshot = (page, name) => page.screenshot({ path: `artifacts/pwa-live-${name}.png`, animations: 'disabled' });
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

await fs.mkdir('artifacts', { recursive: true });
try {
  context = await chromium.launchPersistentContext(realProfile, {
    channel: 'chrome', headless: true, viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, serviceWorkers: 'allow',
    args: ['--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  context.setDefaultTimeout(30000);
  const page = context.pages()[0] || await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.url()}`); });
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

  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 60000 });
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
      for (const selector of ['.company-mark', '.game-title', '.stage-picker', '.start-button']) {
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
  pass(observations.installOfferVisible ? 'real install offer stays clear of logo, title, case picker and start at 390/320/800px' : 'title captured at 390/320/800px; this Chrome session did not expose an install offer');

  await page.setViewportSize({ width: 390, height: 844 });
  await context.setOffline(true);
  await page.reload(); await phase(page, 'title');
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  assert.equal(await page.locator('.stage-pick').count(), 5);
  await page.locator('[data-action="stage"][data-detail="stage05"]').click();
  await action(page, 'start'); await phase(page, 'intro');
  await page.waitForFunction(() => [...document.querySelectorAll('.boss-portrait')].length > 0 && [...document.querySelectorAll('.boss-portrait')].every(img => img.complete && img.naturalWidth > 0));
  await screenshot(page, 'offline-boss');
  await action(page, 'explore'); await phase(page, 'explore');
  assert.equal(await page.locator('#ui').getAttribute('data-stage'), 'stage05');
  assert.ok(await page.locator('#world').evaluate(canvas => canvas.width > 0 && canvas.height > 0));
  await action(page, 'decision'); await phase(page, 'decision');
  assert.equal(await page.locator('.choice-button').count(), 3);
  await screenshot(page, 'offline-choices');
  await page.locator('[data-action="choose"][data-detail="C"]').click();
  await phase(page, 'cinematic');
  await page.waitForTimeout(4500); await screenshot(page, 'offline-bundle');
  await page.locator('#ui[data-phase="ending"]').waitFor({ timeout: 25000 });
  assert.ok((await page.locator('.ending-explanation').innerText()).length > 0);
  await screenshot(page, 'offline-ending');
  await context.setOffline(false); await page.waitForFunction(() => navigator.onLine);
  assert.equal((await page.request.get(manifestUrl)).status(), 200);
  assert.deepEqual(errors, []); assert.deepEqual(responseErrors, []);
  pass('published installation reopens offline, plays Case 5 with boss and three choices through its ending, and reconnects');
} finally {
  observations.browser = context ? await context.browser()?.version() : undefined;
  await fs.writeFile('artifacts/pwa-live-results.json', JSON.stringify({ base, results, errors, responseErrors, observations }, null, 2));
  await context?.close();
  // Only the unique profile created above is eligible for recursive cleanup.
  safeProfile();
  await fs.rm(realProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}
