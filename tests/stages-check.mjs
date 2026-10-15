import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const results = []; const errors = []; const samples = [];
const pass = name => { results.push(name); console.log(`PASS ${name}`); };
const snap = page => page.evaluate(() => window.__game.snapshot());
const click = (page, action) => page.locator(`[data-action="${action}"]`).first().click();
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const seek = async (page, time) => { await page.evaluate(time => window.__game.cinematic(time), time); await frame(page); };
const shot = async (page, name, settle = true) => {
  // Let the newly mounted overlay finish its entrance before saving evidence.
  if (settle) await page.waitForTimeout(240);
  return page.screenshot({ path: `artifacts/${name}.png`, animations: 'disabled' });
};
const finish = async page => { await seek(page, (await snap(page)).cinematicDuration - 0.1); await page.waitForFunction(() => window.__game.snapshot().phase === 'ENDING'); };
const portrait = async page => {
  assert.ok(await page.locator('.boss-portrait').count());
  await page.waitForFunction(() => [...document.querySelectorAll('.boss-portrait')].every(img => img.complete && img.naturalWidth > 0));
};
const visualAt = async (page, time, label) => {
  await seek(page, time);
  const visual = await page.evaluate(() => window.__game.visuals());
  samples.push({ label, requestedTime: time, visual });
  return visual;
};
const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const assertParcelSupport = (visual, label) => {
  const pose = visual.parcelPose;
  assert.equal(visual.carrying, true, `${label}: the parcel stays with the visible avatar`);
  assert.equal(pose.supporting, true, `${label}: both hands support the box`);
  assert.ok(pose.leftHandToBox.x * pose.rightHandToBox.x < 0, `${label}: hands hold opposite sides`);
  for (const hand of [pose.leftHandToBox, pose.rightHandToBox]) {
    assert.ok(Math.abs(hand.x) >= 0.15 && Math.abs(hand.x) <= 0.4, `${label}: each palm reaches a side of the parcel`);
    assert.ok(hand.y >= -0.2 && hand.y <= 0.03, `${label}: hands support the lower part rather than float above it`);
    assert.ok(hand.z >= 0.05 && hand.z <= 0.35, `${label}: hands hold the rear side of the parcel`);
  }
  assert.ok(Math.abs(pose.leftHandToBox.y - pose.rightHandToBox.y) < 0.08, `${label}: both palms share the support height`);
  assert.ok(Math.abs(pose.leftHandToBox.z - pose.rightHandToBox.z) < 0.08, `${label}: the second hand is not waving away from the box`);
};
const captureParcelView = async (page, visual, angle, name) => {
  const box = visual.parcelPose.box; const hero = visual.hero;
  const reach = Math.hypot(box.x - hero.x, box.z - hero.z);
  assert.ok(reach > 0.15, 'the parcel is held in front of the body');
  const forward = { x: (box.x - hero.x) / reach, z: (box.z - hero.z) / reach };
  const direction = angle === 'front' ? forward : { x: -forward.z, z: forward.x };
  const position = [box.x + direction.x * 3.0, box.y + 1.25, box.z + direction.z * 3.0];
  await page.evaluate(({ position, target }) => window.__game.captureView(position, target, 38), { position, target: [box.x, box.y + 0.15, box.z] });
  try { await frame(page); await shot(page, name, false); }
  finally { await page.evaluate(() => window.__game.clearCaptureView()); await frame(page); }
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?qa=1&fixture=original`); await page.waitForFunction(() => window.__game);
  await click(page, 'start'); await portrait(page); await shot(page, 'boss-intro-desktop');
  await click(page, 'explore'); await click(page, 'decision'); await page.locator('[data-action=choose][data-detail=A]').click();
  assert.equal((await snap(page)).cinematicDuration, 10);
  await seek(page, 2.8);
  let visual = await page.evaluate(() => window.__game.visuals());
  assert.equal(visual.cleaning.mopVisible, true); assert.ok(visual.cleaning.progress > 0 && visual.cleaning.progress < 1);
  await shot(page, 'office-clean-mop');
  await seek(page, 7);
  visual = await page.evaluate(() => window.__game.visuals());
  assert.equal(visual.cleaning.clothVisible, true); await shot(page, 'office-clean-desk');
  await finish(page); await portrait(page); await click(page, 'retry');
  visual = await page.evaluate(() => window.__game.visuals());
  assert.equal(visual.cleaning.progress, 0); assert.equal(visual.cleaning.mopVisible, false);
  pass('A avatar mops then wipes the desk and resets');
  await click(page, 'decision'); await page.locator('[data-action=choose][data-detail=B]').click();
  assert.equal((await snap(page)).cinematicDuration, 16);
  const opening = await visualAt(page, 0.1, 'office B last trips opening');
  const before = opening.transport;
  assert.ok(before.delivered > 0 && before.delivered < before.total, 'B opens after most loads have already left');
  assert.ok(before.remainingAtStart >= 1 && before.remainingAtStart <= 2, 'only one or two final loads remain');
  assert.equal(before.total - before.delivered, before.remainingAtStart);
  assert.equal(before.visibleLoads, before.remainingAtStart);
  await shot(page, 'office-transport-final-trips-start', false);
  const first = await visualAt(page, 1.2, 'office B carrying final chair');
  assert.ok(first.transport.carrying);
  assert.equal(first.transport.delivered, before.delivered, 'the chair is still in transit');
  await shot(page, 'office-carry-chair', false);
  const strideEnd = await visualAt(page, 1.8, 'office B carrying stride');
  const strideDistance = Math.hypot(strideEnd.hero.x - first.hero.x, strideEnd.hero.z - first.hero.z);
  assert.ok(strideDistance > 0.05 && strideDistance / 0.6 < 3.3, 'carrying moves at a plausible walking speed');
  const midway = await visualAt(page, 6.2, 'office B returning for the last load');
  assert.ok(midway.transport.delivered > before.delivered && midway.transport.delivered < midway.transport.total);
  assert.equal(midway.transport.carrying, null, 'the avatar returns without the delivered chair');
  const last = await visualAt(page, 10.8, 'office B carrying last load');
  assert.ok(last.transport.carrying);
  assert.equal(last.transport.delivered, last.transport.total - 1);
  await shot(page, 'office-carry-last-load', false);
  await shot(page, 'office-carry-trolley', false);
  const late = await visualAt(page, 14, 'office B empty room');
  assert.equal(late.transport.delivered, late.transport.total);
  assert.equal(late.transport.visibleLoads, 0);
  assert.equal(late.transport.carrying, null);
  await shot(page, 'office-transport-empty-room', false);
  for (const sample of [first, strideEnd, midway, last, late]) {
    assert.ok(distance3(opening.camera, sample.camera) < 0.05, 'B holds its camera instead of swinging between loads');
    assert.ok(sample.transport.speed >= 0 && sample.transport.speed <= 2.7, 'instantaneous haul speed remains near ordinary walking');
    assert.ok(sample.transport.maxSpeed <= 2.7, 'no fast forwarding between final trips');
  }
  await finish(page); const finished = await page.evaluate(() => window.__game.visuals().transport);
  assert.equal(finished.delivered, finished.total); await portrait(page);
  pass('B opens on its final trips, holds a steady camera and hauls at walking speed');
  await click(page, 'retry');
  const restarted = await page.evaluate(() => window.__game.visuals().transport);
  assert.equal(restarted.delivered, 0);
  assert.equal(restarted.carrying, null);
  assert.equal(restarted.remainingAtStart, 0);
  assert.equal(restarted.speed, 0);
  assert.equal(restarted.maxSpeed, 0);
  pass('B retry restores the complete office without transport progress');
  await click(page, 'decision'); await page.locator('[data-action=choose][data-detail=B]').click();
  await finish(page);
  await click(page, 'next');
  assert.equal((await snap(page)).stageId, 'stage02'); assert.equal((await snap(page)).phase, 'INTRO');
  assert.deepEqual((await snap(page)).found, []); assert.equal((await snap(page)).choice, null); await portrait(page);
  await shot(page, 'station-intro-desktop'); await click(page, 'explore');
  assert.equal((await snap(page)).x, 0); assert.equal((await snap(page)).z, 3);
  await shot(page, 'station-explore-desktop');
  assert.equal(await page.evaluate(() => window.__game.visuals().stationClock), '09:47');
  pass('next case loads a fresh station scene and factual introduction');

  const reachable = await page.evaluate(() => {
    const colliders = window.__game.colliders(); const clues = window.__game.stage().clues;
    const valid = (x,z) => ((x>=-5.7&&x<=5.7&&z>=-4.2&&z<=4.2)||(x>=5.7&&x<=8.7&&z>=-.2&&z<=4.2)) && !colliders.some(c=>x>c.minX-.27&&x<c.maxX+.27&&z>c.minZ-.27&&z<c.maxZ+.27);
    const queue=[[0,15]], seen=new Set(['0,15']), found={};
    for(let head=0;head<queue.length;head++){
      const [gx,gz]=queue[head], x=gx*.2,z=gz*.2;
      for(const c of clues){const d=Math.hypot(x-c.x,z-c.z);if(d<c.radius-.1&&(!found[c.id]||d<found[c.id].d))found[c.id]={x,z,d};}
      for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=gx+dx,nz=gz+dz,key=`${nx},${nz}`;if(!seen.has(key)&&valid(nx*.2,nz*.2)){seen.add(key);queue.push([nx,nz]);}}
    }
    return found;
  });
  assert.equal(Object.keys(reachable).length, 7);
  for(const id of Object.keys(reachable)){
    await page.evaluate(p=>window.__game.teleport(p.x,p.z),reachable[id]);
    await page.waitForFunction(id=>window.__game.snapshot().nearest===id,id);
    await page.keyboard.press('KeyE'); assert.equal((await snap(page)).phase,'INSPECT');
    assert.equal(await page.locator('.inspect-panel .player-thought').count(),0);
    if(id==='C03'){assert.equal(await page.locator('.evidence-document p').innerText(),'09:55発→10:08会場着／次便10:15発→10:28着');await shot(page,'station-timetable');}
    await page.keyboard.press('Escape');
  }
  assert.equal((await snap(page)).found.length,7); pass('all seven station clues are reachable and contain observations only');
  await click(page,'decision'); await shot(page,'station-decision-desktop');
  for(const choice of ['A','B','C']){
    if(choice!=='A'){await click(page,'retry');await click(page,'decision');}
    await page.locator(`[data-action=choose][data-detail=${choice}]`).click();
    const initial = await visualAt(page, 0.1, `station ${choice} boss and shuttle opening`);
    assert.equal(initial.boss.boarded, choice !== 'A', 'the boss waits for A but has already boarded for late arrivals');
    assert.equal(initial.boss.visible, choice === 'A', 'the boss is present at the timely meeting place');
    assert.equal(initial.bus.boarded, false, 'the protagonist has not boarded at the opening');
    if (choice !== 'A') await shot(page, `station-boss-first-departure-${choice.toLowerCase()}`, false);
    const carrying = await visualAt(page, 2.0, `station ${choice} parcel support on route`);
    assertParcelSupport(carrying, `station ${choice} en route`);
    await captureParcelView(page, carrying, 'front', `station-parcel-front-${choice.toLowerCase()}`);
    const meeting = await visualAt(page, 3.3, `station ${choice} meeting or late approach`);
    assertParcelSupport(meeting, `station ${choice} approach`);
    await captureParcelView(page, meeting, 'side', `station-parcel-side-${choice.toLowerCase()}`);
    if (choice === 'A') {
      assert.equal(meeting.boss.visible, true);
      assert.equal(meeting.boss.boarded, false);
      assert.ok(Math.hypot(meeting.boss.x - meeting.parcelPose.box.x, meeting.boss.z - meeting.parcelPose.box.z) < 3.5, 'A meets the boss before boarding');
      await shot(page, 'station-boss-meeting', false);
      await visualAt(page, 4.6, 'station A joint boarding');
      await shot(page, 'station-boss-boarding', false);
      const boarded = await visualAt(page, 5.2, 'station A both passengers aboard');
      assert.equal(boarded.bus.boarded, true, 'the protagonist boards the shuttle');
      assert.equal(boarded.boss.boarded, true, 'the boss boards with the protagonist');
      assert.equal(boarded.boss.visible, false, 'the platform boss has moved onto the bus');
      await shot(page, 'station-boss-boarded', false);
    } else {
      assert.equal(meeting.boss.boarded, true);
      const lateSupport = await visualAt(page, 7.0, `station ${choice} parcel support after departure`);
      assertParcelSupport(lateSupport, `station ${choice} after missing the shuttle`);
      await shot(page, `station-cinematic-${choice.toLowerCase()}`, false);
    }
    const departed = await visualAt(page, 7.9, `station ${choice} shuttle gone`);
    assert.equal(departed.bus.visible, false, 'the shuttle leaves the shot completely');
    assert.ok(initial.bus.z - departed.bus.z > 20, 'the shuttle actually travels away before it disappears');
    assert.equal(departed.boss.boarded, true, 'the boss leaves on the departing shuttle');
    assert.equal(departed.bus.boarded, choice === 'A');
    await shot(page, `station-bus-gone-${choice.toLowerCase()}`, false);
    if (choice === 'A') await shot(page, 'station-cinematic-a', false);
    await finish(page); const visual=await page.evaluate(()=>window.__game.visuals());
    assert.equal(visual.stationClock,{A:'09:50',B:'10:05',C:'10:10'}[choice]);
    assert.equal(visual.bus.boarded,choice==='A');await portrait(page);await shot(page,`station-ending-${choice.toLowerCase()}`);
    assert.ok(!(await page.locator('.ending-panel').innerText()).includes('普通の意味'));
    if (choice === 'A') assert.equal(await page.locator('.player-line blockquote').innerText(), 'よかった、シャトルに間に合いました！');
    if (choice === 'C') assert.ok((await page.locator('.ending-explanation').innerText()).includes('この上司が意図した'));
    pass(`station ${choice} supports the parcel, stages the boss and sends the shuttle out of view`);
  }
  await click(page,'title'); await page.locator('[data-action=stage][data-detail=stage01]').click();
  assert.equal((await snap(page)).stageId,'stage01');await click(page,'start');await click(page,'explore');
  assert.equal((await snap(page)).z,-.25);assert.deepEqual((await snap(page)).found,[]);
  assert.equal(await page.evaluate(()=>window.__game.visuals().transport.delivered),0);
  pass('switching back restores office objects without station evidence');
  await context.close();

  for(const [width,height]of[[320,568],[360,800],[390,844]]){
    const mobile=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
    const p=await mobile.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(`${base}?qa=1&fixture=original`);await p.waitForFunction(()=>window.__game);
    await p.locator('[data-action=stage][data-detail=stage02]').tap();await frame(p);await shot(p,`two-cases-title-${width}`);
    await p.locator('[data-action=start]').tap();await portrait(p);await shot(p,`boss-intro-${width}`);
    const footer=await p.locator('[data-action=explore]').boundingBox();assert.ok(footer.y>=0&&footer.y+footer.height<=height+1);
    await p.locator('[data-action=explore]').tap();await shot(p,`station-explore-${width}`);
    await p.locator('[data-action=decision]').tap();await shot(p,`station-decision-${width}`);
    const decisionFooter = await p.locator('.decision-panel .panel-footer').boundingBox();
    for(const button of await p.locator('[data-action=choose]').all()){const b=await button.boundingBox();assert.ok(b.height>=44&&b.y+b.height<=decisionFooter.y+1, 'all choices remain visible above the fixed footer');}
    await p.locator('[data-action=choose][data-detail=A]').tap();
    const mobileDeparture = await visualAt(p, 7.9, `station A shuttle gone ${width}x${height}`);
    assert.equal(mobileDeparture.bus.visible, false, 'the bus also leaves the wider portrait view');
    assert.equal(mobileDeparture.bus.boarded, true);
    assert.equal(mobileDeparture.boss.boarded, true);
    await shot(p, `station-bus-gone-${width}`, false);
    await finish(p);
    assert.equal(await p.evaluate(() => window.__game.visuals().bus.visible), false);
    assert.equal(await p.evaluate(() => window.__game.visuals().boss.boarded), true);
    await portrait(p);await shot(p,`station-ending-${width}`);
    await p.locator('[data-action=retry]').tap();assert.equal((await snap(p)).remaining>119,true);
    await mobile.close();pass(`mobile second case ${width}×${height}`);
  }
  assert.deepEqual(errors,[]); pass('two-stage runtime without uncaught browser exceptions');
} catch(error){results.push({failed:error.stack});console.error(error);process.exitCode=1;}
finally{await fs.writeFile('artifacts/stages-results.json',JSON.stringify({browser:await browser.version(),base,results,errors,samples},null,2));await browser.close();}
