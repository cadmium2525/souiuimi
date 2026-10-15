import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';

// Serve the production build at the real repository path. No QA API is used:
// the service worker and every transition below are the normal player flow.
const prefix = '/souiuimi/';
const port = Number(process.env.PWA_TEST_PORT || 5185);
const origin = `http://127.0.0.1:${port}`;
const base = `${origin}${prefix}`;
const distRoot = path.resolve('dist');
const results = [], errors = [], responseErrors = [], observations = {};
const files = new Map();
let revision = 1, browser, context;
const pass = name => { results.push(name); console.log(`PASS ${name}`); };
const fileType = file => ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8' }[path.extname(file)] || 'application/octet-stream');
const pngSize = data => {
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};
const file = async relative => {
  if (!files.has(relative)) files.set(relative, await fs.readFile(path.join(distRoot, relative)));
  return files.get(relative);
};
const server = http.createServer(async (req, res) => {
  try {
    const requestPath = decodeURIComponent(new URL(req.url, origin).pathname);
    if (!requestPath.startsWith(prefix)) { res.writeHead(404); res.end(); return; }
    const relative = requestPath.slice(prefix.length) || 'index.html';
    const resolved = path.resolve(distRoot, relative);
    if (!resolved.startsWith(`${distRoot}${path.sep}`)) { res.writeHead(403); res.end(); return; }
    let data = await file(relative);
    if (relative === 'sw.js' && revision > 1) {
      const source = data.toString();
      assert.match(source, /const VERSION\s*=\s*["'][^"']+["']/);
      data = Buffer.from(source.replace(/const VERSION\s*=\s*(["'])([^"']+)\1/, (_, quote, version) => `const VERSION = ${quote}${version}-qa-update-${revision}${quote}`));
    }
    res.writeHead(200, { 'Content-Type': fileType(relative), 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (error) {
    if (error.code !== 'ENOENT') errors.push(`server: ${error.message}`);
    res.writeHead(404); res.end();
  }
});
const phase = async (page, expected) => page.locator(`#ui[data-phase="${expected}"]`).waitFor();
const action = async (page, name) => page.locator(`[data-action="${name}"]`).first().click();
const title = async page => {
  const current = await page.locator('#ui').getAttribute('data-phase');
  if (current === 'decision') await action(page, 'back');
  if (await page.locator('#ui').getAttribute('data-phase') === 'explore') await action(page, 'menu');
  if (await page.locator('#ui').getAttribute('data-phase') !== 'title') await action(page, 'title');
  await phase(page, 'title');
};
const start = async (page, id) => {
  await page.locator(`[data-action="stage"][data-detail="${id}"]`).click();
  assert.equal(await page.locator('#ui').getAttribute('data-stage'), id);
  await action(page, 'start'); await phase(page, 'intro');
  await page.waitForFunction(() => [...document.querySelectorAll('.boss-portrait')].length > 0 && [...document.querySelectorAll('.boss-portrait')].every(img => img.complete && img.naturalWidth > 0));
  await action(page, 'explore'); await phase(page, 'explore');
  assert.equal(await page.locator('#ui').getAttribute('data-stage'), id);
  assert.ok(await page.locator('#world').evaluate(canvas => canvas.width > 0 && canvas.height > 0));
};
const timer = async page => {
  const [minutes, seconds] = (await page.locator('#timer-value').innerText()).split(':').map(Number);
  return minutes * 60 + seconds;
};
const cacheState = page => page.evaluate(async () => Object.fromEntries(await Promise.all((await caches.keys()).map(async name => [name, (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)]))));
const shot = (page, name) => page.screenshot({ path: `artifacts/pwa-${name}.png`, animations: 'disabled' });
const watch = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.url()}`); });
};

await fs.mkdir('artifacts', { recursive: true });
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
try {
  const html = (await file('index.html')).toString();
  assert.match(html, /rel="manifest"/); assert.match(html, /apple-touch-icon/);
  const manifest = JSON.parse((await file('manifest.webmanifest')).toString());
  observations.manifest = manifest;
  assert.ok(manifest.name && manifest.short_name); assert.equal(manifest.lang, 'ja');
  assert.equal(manifest.display, 'standalone');
  assert.equal(new URL(manifest.scope, base).href, base);
  assert.equal(new URL(manifest.start_url, base).pathname, prefix);
  assert.equal(new URL(manifest.id, base).pathname, prefix);
  assert.ok(manifest.theme_color && manifest.background_color);
  for (const [size, purpose] of [[192, 'any'], [512, 'any'], [512, 'maskable']]) {
    const icon = manifest.icons.find(entry => entry.sizes.split(/\s+/).includes(`${size}x${size}`) && (entry.purpose || 'any').split(/\s+/).includes(purpose));
    assert.ok(icon, `${size}px ${purpose} icon`); assert.equal(icon.type, 'image/png');
    const url = new URL(icon.src, base); assert.equal(url.origin, origin); assert.ok(url.pathname.startsWith(prefix));
    assert.deepEqual(pngSize(await file(url.pathname.slice(prefix.length))), [size, size]);
  }
  for (const [name, size] of [['apple-touch-180.png', 180], ['favicon-32.png', 32]]) assert.deepEqual(pngSize(await file(`icons/${name}`)), [size, size]);
  assert.ok((await file('icons/icon-original.png')).byteLength > 10000);
  pass('manifest identity, repository scope, standalone mode and generated PNG icon sizes');

  browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
  const page = await context.newPage(); watch(page);
  await page.goto(base); await phase(page, 'title');
  assert.equal(await page.evaluate(() => typeof window.__game), 'undefined');
  assert.equal(await page.evaluate(() => window.isSecureContext), true);
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === 'activated';
  });
  if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) { await page.reload(); await phase(page, 'title'); }
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  observations.registration = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { scope: registration.scope, script: registration.active.scriptURL, state: registration.active.state, controller: navigator.serviceWorker.controller.scriptURL };
  });
  assert.equal(observations.registration.scope, base);
  assert.equal(observations.registration.script, `${base}sw.js`);
  observations.initialCaches = await cacheState(page);
  const initialCacheNames = Object.keys(observations.initialCaches);
  assert.ok(initialCacheNames.some(name => name.startsWith('souiu-imi-precache-')));
  const cached = Object.values(observations.initialCaches).flat();
  for (const required of ['index.html', 'manifest.webmanifest', 'characters/boss.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png']) assert.ok(cached.includes(`${prefix}${required}`), `precache ${required}`);
  assert.ok(cached.some(name => /\/assets\/.*\.js$/.test(name)));
  assert.ok(cached.some(name => /\/assets\/.*\.css$/.test(name)));
  const manifestResponse = await page.request.get(`${base}manifest.webmanifest`);
  assert.match(manifestResponse.headers()['content-type'], /application\/manifest\+json/);
  const iconResponse = await page.request.get(`${base}icons/icon-192.png`);
  assert.match(iconResponse.headers()['content-type'], /image\/png/);
  await shot(page, 'online-title-mobile');
  pass('normal production visit registers and controls the repository scope with complete app-shell precache');

  const cdp = await context.newCDPSession(page);
  observations.appManifest = await cdp.send('Page.getAppManifest');
  assert.equal(observations.appManifest.errors?.length || 0, 0);
  assert.ok(observations.appManifest.data);
  try {
    observations.installability = await cdp.send('Page.getInstallabilityErrors');
    const fatal = observations.installability.installabilityErrors.filter(error => /manifest-empty|manifest-missing|no-icon-available|no-acceptable-icon|not-from-secure-origin|no-matching-service-worker/i.test(error.errorId));
    assert.deepEqual(fatal, []);
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    observations.installabilityUnavailable = error.message;
  }
  await cdp.detach();
  pass('Chromium reads the manifest without parse errors and reports no essential installability errors');

  await context.setOffline(true);
  await page.reload(); await phase(page, 'title');
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  assert.equal(await page.locator('.stage-pick').count(), 5);
  for (const id of ['stage01', 'stage02', 'stage03', 'stage04', 'stage05']) {
    await start(page, id);
    await action(page, 'decision'); await phase(page, 'decision');
    assert.equal(await page.locator('.choice-button').count(), id === 'stage04' ? 2 : 3);
    if (id === 'stage05') await shot(page, 'offline-case5-choices');
    await title(page);
  }
  pass('offline reload boots all five stages, cached boss portraits and their normal choice counts');

  await page.goto(`${base}?stage=stage05&installed=1`); await phase(page, 'title');
  assert.equal(await page.locator('#ui').getAttribute('data-stage'), 'stage05');
  await start(page, 'stage05');
  const before = await timer(page); await page.waitForTimeout(1700); assert.ok(await timer(page) < before);
  await shot(page, 'offline-case5-explore');
  await action(page, 'decision'); await page.locator('[data-action="choose"][data-detail="C"]').click();
  await phase(page, 'cinematic'); await page.waitForTimeout(4500); await shot(page, 'offline-case5-cinematic');
  await page.locator('#ui[data-phase="ending"]').waitFor({ timeout: 25000 });
  assert.ok((await page.locator('.ending-explanation').innerText()).length > 0);
  await shot(page, 'offline-case5-ending');
  await action(page, 'newcase'); await phase(page, 'intro');
  await action(page, 'explore'); await phase(page, 'explore');
  pass('offline direct navigation, countdown, Case 5 physical-bundle ending and next randomized request');

  await context.setOffline(false);
  await page.waitForFunction(() => navigator.onLine);
  assert.equal((await page.request.get(`${base}manifest.webmanifest`)).status(), 200);
  const other = await context.newPage(); watch(other);
  await other.goto(base); await phase(other, 'title');
  await start(other, 'stage01');
  let otherNavigations = 0;
  other.on('framenavigated', frame => { if (frame === other.mainFrame()) otherNavigations++; });
  await page.bringToFront();
  const activeBeforeUpdate = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
  // A byte change and a new VERSION exercise a real waiting worker without
  // mutating production files or relying on browser-internal cache deletion.
  revision = 2;
  const timerBeforeUpdate = await timer(page);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 30000 });
  assert.equal(await page.locator('#ui').getAttribute('data-phase'), 'explore');
  assert.equal(await page.locator('#pwa-update-button').isVisible(), false);
  await page.waitForTimeout(1700); assert.ok(await timer(page) < timerBeforeUpdate);
  observations.waitingCaches = await cacheState(page);
  assert.ok(Object.keys(observations.waitingCaches).some(name => !initialCacheNames.includes(name)));
  await title(page);
  await page.locator('#pwa-update-button').waitFor({ state: 'visible' });
  await shot(page, 'update-ready-mobile');
  let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  const updateNavigation = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() });
  await page.locator('#pwa-update-button').click();
  await updateNavigation;
  await phase(page, 'title');
  await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration())?.waiting);
  await page.waitForTimeout(1200);
  assert.equal(navigations, 1, 'one user update causes exactly one page reload');
  assert.equal(await page.locator('#pwa-update-button').isVisible(), false);
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL), activeBeforeUpdate);
  assert.equal(otherNavigations, 0, 'an update never reloads the other active game tab');
  assert.equal(await other.locator('#ui').getAttribute('data-phase'), 'explore');
  observations.updatedCaches = await cacheState(page);
  assert.ok(Object.keys(observations.updatedCaches).some(name => !initialCacheNames.includes(name)));
  assert.ok(initialCacheNames.every(name => Object.hasOwn(observations.updatedCaches, name)), 'one prior version remains available');
  await other.close();
  await start(page, 'stage05');
  pass('network recovery and waiting update preserve active games in both tabs; title update reloads only the requesting tab once');

  await title(page);
  revision = 3;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 30000 });
  await page.locator('#pwa-update-button').waitFor({ state: 'visible' });
  const beforeThirdReload = navigations;
  const thirdNavigation = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() });
  await page.locator('#pwa-update-button').click();
  await thirdNavigation;
  await phase(page, 'title');
  await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration())?.waiting);
  await page.waitForFunction(async names => { const keys = await caches.keys(); return names.every(name => !keys.includes(name)); }, initialCacheNames, { timeout: 15000 });
  assert.equal(navigations - beforeThirdReload, 1);
  observations.cleanupCaches = await cacheState(page);
  assert.equal(Object.keys(observations.cleanupCaches).filter(name => name.startsWith('souiu-imi-precache-')).length, 2, 'retain current and one previous cache');
  pass('third version cleans obsolete caches while retaining the active and immediately previous version');

  await context.setOffline(true); await page.reload(); await phase(page, 'title');
  await start(page, 'stage05'); await shot(page, 'updated-offline-mobile');
  await context.setOffline(false);
  await title(page); await page.setViewportSize({ width: 1440, height: 900 }); await shot(page, 'updated-desktop-title');
  assert.deepEqual(errors, []); assert.deepEqual(responseErrors, []);
  pass('updated installation reopens offline and remains playable without uncaught errors or missing assets');
} finally {
  observations.finalCaches = context?.pages()[0] ? await cacheState(context.pages()[0]).catch(error => ({ error: error.message })) : undefined;
  await fs.writeFile('artifacts/pwa-results.json', JSON.stringify({ base, browser: browser ? await browser.version() : null, results, errors, responseErrors, observations }, null, 2));
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
