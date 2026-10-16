import { chromium } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const distRoot = path.resolve('dist');
const server = http.createServer(async (req, res) => {
  const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!requestPath.startsWith('/souiu-imi/')) { res.writeHead(404); res.end(); return; }
  const relative = requestPath.slice('/souiu-imi/'.length) || 'index.html';
  const file = path.resolve(distRoot, relative);
  if (!file.startsWith(distRoot + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await fs.readFile(file);
    const contentType = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.md': 'text/plain; charset=utf-8' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(5184, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const failures = []; page.on('pageerror', e => failures.push(e.message));
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  await page.goto('http://127.0.0.1:5184/souiu-imi/?qa=1&stage=stage01');
  await page.waitForFunction(() => window.__game?.snapshot().phase === 'TITLE');
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.boss-portrait')].every(img => img.complete && img.naturalWidth > 0));
  assert.ok(await page.locator('.boss-portrait').count());
  await page.locator('[data-action="explore"]').click();
  assert.equal(await page.evaluate(() => window.__game.snapshot().phase), 'EXPLORE');
  assert.deepEqual(failures, []);
  assert.equal(await page.evaluate(() => document.querySelector('#world').width > 0), true);
  await page.screenshot({ path: 'artifacts/production-subpath.png' });
  console.log('PASS built app at /souiu-imi/ with relative assets and no missing requests');
  await page.locator('[data-action="menu"]').click(); await page.locator('[data-action="title"]').click();
  await page.locator('[data-action="stage"][data-detail="stage02"]').click();
  await page.locator('[data-action="start"]').click(); await page.locator('[data-action="explore"]').click();
  assert.equal(await page.evaluate(() => window.__game.snapshot().stageId), 'stage02');
  assert.deepEqual(failures, []);
  console.log('PASS second stage and boss portrait under repository subpath');
  await page.locator('[data-action="menu"]').click(); await page.locator('[data-action="title"]').click();
  await page.locator('[data-action="stage"][data-detail="stage03"]').click();
  await page.locator('[data-action="start"]').click(); await page.locator('[data-action="explore"]').click();
  assert.equal(await page.evaluate(() => window.__game.snapshot().stageId), 'stage03');
  assert.equal(await page.evaluate(() => window.__game.instance().facts.kind), 'money');
  assert.deepEqual(failures, []);
  await page.screenshot({ path: 'artifacts/money-production-subpath.png' });
  console.log('PASS money case and boss portrait under repository subpath');
  await page.locator('[data-action="menu"]').click(); await page.locator('[data-action="title"]').click();
  await page.locator('[data-action="stage"][data-detail="stage04"]').click();
  await page.locator('[data-action="start"]').click(); await page.locator('[data-action="explore"]').click();
  assert.equal(await page.evaluate(() => window.__game.snapshot().stageId), 'stage04');
  assert.equal(await page.evaluate(() => window.__game.instance().facts.kind), 'amount');
  await page.locator('[data-action="decision"]').click();
  assert.equal(await page.locator('.choice-button').count(), 2);
  assert.deepEqual(failures, []);
  await page.screenshot({ path: 'artifacts/amount-production-subpath.png' });
  console.log('PASS amount case with two choices under repository subpath');
  await page.locator('[data-action="back"]').click();
  await page.locator('[data-action="menu"]').click(); await page.locator('[data-action="title"]').click();
  await page.locator('[data-action="stage"][data-detail="stage05"]').click();
  await page.locator('[data-action="start"]').click(); await page.locator('[data-action="explore"]').click();
  assert.equal(await page.evaluate(() => window.__game.snapshot().stageId), 'stage05');
  assert.equal(await page.evaluate(() => window.__game.instance().facts.kind), 'document');
  await page.locator('[data-action="decision"]').click();
  assert.equal(await page.locator('.choice-button').count(), 3);
  assert.deepEqual(failures, []);
  await page.screenshot({ path: 'artifacts/document-production-subpath.png' });
  console.log('PASS document case with three choices under repository subpath');
  await page.goto('http://127.0.0.1:5184/souiu-imi/?qa=1');
  await page.waitForFunction(() => window.__game?.snapshot().phase === 'TITLE');
  assert.equal(await page.locator('.stage-pick').count(), 0);
  assert.match(await page.locator('[data-action=start]').innerText(), /ゲームスタート/);
  assert.equal(await page.locator('[data-action=music]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-action=start]').click();
  assert.equal(await page.evaluate(() => window.__game.snapshot().mode), 'run');
  assert.equal(await page.evaluate(() => window.__game.snapshot().run.total), 5);
  await page.waitForFunction(() => window.__game.music().readyState >= 2 && !window.__game.music().paused);
  assert.deepEqual(failures, []);
  console.log('PASS normal five-case game and bundled BGM start under repository subpath');
  await page.close();

  const fallback = await browser.newPage();
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type.startsWith('webgl')) return null;
      return original.call(this, type, ...args);
    };
  });
  await fallback.goto('http://127.0.0.1:5184/souiu-imi/');
  await fallback.locator('#reload').waitFor();
  assert.match(await fallback.locator('#ui').innerText(), /WebGL/);
  console.log('PASS explicit WebGL fallback with reload button');
  await fallback.close();
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
