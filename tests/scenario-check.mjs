import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const base = process.env.GAME_URL || 'http://127.0.0.1:4173/';
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}?qa=1&fixture=original`);
  await page.waitForFunction(() => window.__game);
  await page.locator('[data-action=start]').click(); await page.locator('[data-action=explore]').click();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => document.querySelector('#world').width), 540);
  await page.locator('[data-action=menu]').tap(); await page.locator('[data-action=quality]').tap();
  assert.equal(await page.evaluate(() => document.querySelector('#world').width), 360);
  await page.locator('[data-action=sound]').tap();
  assert.equal(await page.evaluate(() => window.__game.snapshot().sound), true);
  await page.locator('[data-action=sound]').tap();
  assert.equal(await page.evaluate(() => window.__game.snapshot().sound), false);
  await page.locator('[data-action=close]').tap();
  console.log('PASS DPR cap 1.5 and low quality 1.0');
  console.log('PASS primary touch toggles exactly once including consecutive sound taps');
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  await page.screenshot({path:'artifacts/reduced-motion.png',animations:'disabled'});
  console.log('PASS reduced-motion context displays an operable scene');

  for (const [id,x,z] of [['C01',-3.5,-0.4],['C02',0.6,-0.6]]) {
    await page.evaluate(({x,z})=>window.__game.teleport(x,z),{x,z});
    await page.waitForFunction(id=>window.__game.snapshot().nearest===id,id);
    assert.equal(await page.evaluate(()=>window.__game.snapshot().nearest),id);
    await page.locator('[data-action=inspect]').click();
    await page.locator('[data-action=close]').click();
  }
  assert.deepEqual(await page.evaluate(()=>window.__game.snapshot().found),['C01','C02']);
  await page.locator('[data-action=decision]').click();
  await page.locator('[data-action=choose][data-detail=B]').click();
  await page.evaluate(()=>window.__game.cinematic(window.__game.snapshot().cinematicDuration - 0.2));
  await page.waitForFunction(()=>window.__game.snapshot().phase==='ENDING');
  await page.locator('[data-action=retry]').click();
  assert.deepEqual(await page.evaluate(()=>window.__game.snapshot().found),[]);
  console.log('PASS C01+C02 only -> B -> retry');

  await page.evaluate(()=>window.__game.teleport(0.6,-0.6));
  await page.waitForFunction(()=>window.__game.snapshot().nearest==='C02');
  const rect=await page.locator('#joystick').boundingBox();
  const x=rect.x+rect.width/2; const y=rect.y+rect.height/2;
  const inspect=await page.locator('[data-action=inspect]').boundingBox();
  const ix=inspect.x+inspect.width/2; const iy=inspect.y+inspect.height/2;
  const cdp=await context.newCDPSession(page);
  await page.evaluate(()=>{window.eventLog=[];for(const type of ['pointerdown','pointerup','pointercancel','click'])document.addEventListener(type,e=>window.eventLog.push({type,id:e.pointerId,target:e.target.closest?.('button')?.dataset.action??e.target.id,x:e.clientX,y:e.clientY}));});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+25,y,id:1}]});
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+25,y,id:1},{x:ix,y:iy,id:2}]});
  // Chrome releases the explicitly identified finger; the stick remains held.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:ix,y:iy,id:2}]});
  const touchEvidence=await page.evaluate(()=>({state:window.__game.snapshot(),events:window.eventLog}));
  await page.waitForFunction(()=>window.__game.snapshot().phase==='INSPECT');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('[data-action=close]').click();
  const before=await page.evaluate(()=>window.__game.snapshot()); await page.waitForTimeout(300);
  const after=await page.evaluate(()=>window.__game.snapshot());
  assert.equal(after.x,before.x); assert.equal(after.z,before.z);
  console.log('PASS held joystick + real second finger inspection tap -> no stuck movement');
  await page.locator('[data-action=decision]').click();
  await page.locator('[data-action=choose][data-detail=C]').click();
  await page.evaluate(()=>window.__game.cinematic(window.__game.snapshot().cinematicDuration - 0.2));
  await page.waitForFunction(()=>window.__game.snapshot().phase==='ENDING');
  await page.locator('[data-action=title]').click();
  assert.equal(await page.evaluate(()=>window.__game.snapshot().phase),'TITLE');
  console.log('PASS ending title button');
  await fs.writeFile('artifacts/scenario-results.json',JSON.stringify({browser:await browser.version(),checks:6,status:'passed',touchEvidence},null,2));
} finally {await browser.close();}
