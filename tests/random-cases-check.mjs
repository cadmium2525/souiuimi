import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createCase } from '../src/data/cases.ts';

const base = process.env.GAME_URL || 'http://127.0.0.1:4173/';
const letters = ['A', 'B', 'C'];
const representatives = {};
for (const stageId of ['stage01', 'stage02']) {
  representatives[stageId] = {};
  for (let seed = 1; seed <= 2000 && Object.keys(representatives[stageId]).length < 3; seed++) {
    const instance = createCase(stageId, seed);
    representatives[stageId][instance.correctChoice] ??= { seed, instance };
  }
  assert.equal(Object.keys(representatives[stageId]).length, 3, `${stageId} must support all three correct answers`);
}
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const results = []; const errors = []; const samples = [];
const pass = name => { results.push(name); console.log(`PASS ${name}`); };
const snap = page => page.evaluate(() => window.__game.snapshot());
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const seek = async (page, seconds) => { await page.evaluate(t => window.__game.cinematic(t), seconds); await frame(page); };
const finish = async page => { await seek(page, (await snap(page)).cinematicDuration - 0.1); await page.waitForFunction(() => window.__game.snapshot().phase === 'ENDING'); };
const click = (page, action) => page.locator(`[data-action=${action}]`).first().click();
const shot = async (page, name) => { await page.waitForTimeout(240); await page.screenshot({ path: `artifacts/${name}.png`, animations: 'disabled' }); };
const time = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const url = (stageId, seed) => { const u = new URL(base); u.searchParams.set('qa', '1'); u.searchParams.set('stage', stageId); u.searchParams.set('seed', String(seed)); return u.href; };
const open = async (page, stageId, seed) => {
  await page.goto(url(stageId, seed)); await page.waitForFunction(() => window.__game);
  await click(page, 'start'); assert.equal((await snap(page)).phase, 'INTRO');
  assert.equal((await snap(page)).caseSeed, seed);
  const instance = await page.evaluate(() => window.__game.instance());
  assert.equal(instance.correctChoice, createCase(stageId, seed).correctChoice);
  assert.equal(await page.locator('.boss-message').innerText(), instance.copy.introBoss);
  await click(page, 'explore'); return instance;
};
const reachable = page => page.evaluate(() => {
  const colliders = window.__game.colliders(); const stage = window.__game.stage(); const clues = stage.clues;
  const valid = (x,z) => ((x>=-5.7&&x<=5.7&&z>=-4.2&&z<=4.2)||(x>=5.7&&x<=8.7&&z>=-.2&&z<=4.2)) && !colliders.some(c=>x>c.minX-.27&&x<c.maxX+.27&&z>c.minZ-.27&&z<c.maxZ+.27);
  const start=[Math.round(stage.start.x/.2),Math.round(stage.start.z/.2)], queue=[start], seen=new Set([start.join(',')]), found={};
  for(let head=0;head<queue.length;head++){
    const [gx,gz]=queue[head], x=gx*.2,z=gz*.2;
    for(const c of clues){const d=Math.hypot(x-c.x,z-c.z);if(d<c.radius-.1&&(!found[c.id]||d<found[c.id].d))found[c.id]={x,z,d};}
    for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=gx+dx,nz=gz+dz,key=`${nx},${nz}`;if(!seen.has(key)&&valid(nx*.2,nz*.2)){seen.add(key);queue.push([nx,nz]);}}
  }
  return found;
});
const inspect = async (page, position, clue) => {
  await page.evaluate(p=>window.__game.teleport(p.x,p.z),position);
  await page.waitForFunction(id=>window.__game.snapshot().nearest===id,clue.id);
  await click(page,'inspect');
  assert.equal(await page.locator('.evidence-document p').innerText(), clue.body);
  assert.equal(await page.locator('.inspect-panel .player-thought').count(), 0);
  assert.equal((await snap(page)).phase, 'INSPECT');
};
const choose = (page, letter) => page.locator(`[data-action=choose][data-detail=${letter}]`).click();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); page.on('pageerror', e=>errors.push(e.message));
  for (const stageId of ['stage01','stage02']) for (const letter of letters) {
    const {seed} = representatives[stageId][letter];
    const instance = await open(page,stageId,seed);
    const paths=await reachable(page); assert.equal(Object.keys(paths).length,7);
    const original=JSON.stringify(instance);
    for(const clue of instance.clues){
      await inspect(page,paths[clue.id],clue);
      if(instance.evidenceChain.includes(clue.id)) await shot(page,`random-${stageId}-${letter.toLowerCase()}-${clue.id.toLowerCase()}`);
      await click(page,'close');
    }
    assert.equal((await snap(page)).found.length,7);
    assert.equal(JSON.stringify(await page.evaluate(()=>window.__game.instance())),original,'inspection never rerolls the facts');
    await click(page,'decision');
    for(const option of letters) assert.equal(await page.locator(`[data-action=choose][data-detail=${option}] .choice-copy strong`).innerText(),instance.choices[option].label);
    await shot(page,`random-${stageId}-${letter.toLowerCase()}-choices`);
    await choose(page,letter);
    if(stageId==='stage02'){
      await seek(page,2);
      let visual=await page.evaluate(()=>window.__game.visuals());
      assert.equal(visual.outcome,'meet'); assert.equal(visual.parcelPose.supporting,true);
      assert.equal(visual.boss.visible,true);
      await seek(page,5.2); visual=await page.evaluate(()=>window.__game.visuals());
      assert.equal(visual.bus.boarded,true);assert.equal(visual.boss.boarded,true);
      await seek(page,7.9); visual=await page.evaluate(()=>window.__game.visuals());
      assert.equal(visual.bus.visible,false);
      assert.equal(visual.stationClock,time(instance.stationPlan.displayedChoices[letter]));
      samples.push({stageId,seed,letter,visual});
    }else if(letter==='B'){
      await seek(page,0.1);const first=await page.evaluate(()=>window.__game.visuals());
      assert.equal(first.transport.delivered,14);assert.equal(first.transport.remainingAtStart,2);
      await seek(page,10.8);const last=await page.evaluate(()=>window.__game.visuals());
      assert.ok(last.transport.maxSpeed<2.7);assert.deepEqual(last.camera,first.camera);
      await shot(page,'random-office-b-final-load');
    }
    await finish(page);
    assert.equal(await page.locator('.ending-line blockquote').first().innerText(),instance.endings[letter].boss);
    assert.equal(await page.locator('.ending-explanation').innerText(),instance.endings[letter].explanation);
    assert.ok(await page.locator('.ending-stamp-c').count());
    await page.locator('.ending-review summary').click();
    assert.equal(await page.locator('.ending-review article').count(),instance.evidenceChain.length);
    await shot(page,`random-${stageId}-${letter.toLowerCase()}-ending`);
    await click(page,'retry');
    assert.equal((await snap(page)).caseSeed,seed); assert.deepEqual((await snap(page)).found,[]);
    assert.equal(JSON.stringify(await page.evaluate(()=>window.__game.instance())),original,'retry retains the same case and reasoning');
    await click(page,'decision');await choose(page,letter);await finish(page);
    await click(page,'newcase');
    assert.equal((await snap(page)).phase,'INTRO');assert.notEqual((await snap(page)).caseSeed,seed);
    assert.deepEqual((await snap(page)).found,[]);
    const next=await page.evaluate(()=>window.__game.instance());
    assert.equal(await page.locator('.boss-message').innerText(),next.copy.introBoss);
    pass(`${stageId} correct ${letter}: factual cards, matching result, repeatable retry and fresh next request`);
  }
  await context.close();

  // The same generated request demonstrates both kinds of wrong arrival.
  let mixed;
  for(let seed=1;seed<=2000;seed++){
    const instance=createCase('stage02',seed);
    if(Object.values(instance.stationPlan.outcomes).includes('early')&&Object.values(instance.stationPlan.outcomes).includes('late')){mixed={seed,instance};break;}
  }
  assert.ok(mixed);
  const wrongPage=await browser.newPage({viewport:{width:1440,height:900}});wrongPage.on('pageerror',e=>errors.push(e.message));
  const wrongInstance=await open(wrongPage,'stage02',mixed.seed);
  for(const kind of ['early','late']){
    const option=letters.find(letter=>wrongInstance.stationPlan.outcomes[letter]===kind);
    await click(wrongPage,'decision');await choose(wrongPage,option);await seek(wrongPage,6.3);
    const visual=await wrongPage.evaluate(()=>window.__game.visuals());
    assert.equal(visual.outcome,kind);assert.equal(visual.parcelPose.supporting,true);assert.equal(visual.bus.boarded,false);
    if(kind==='early'){
      assert.equal(visual.boss.visible,false);assert.equal(visual.boss.boarded,false);assert.equal(visual.bus.visible,true);assert.equal(visual.bus.z,2.3);
    }else{assert.equal(visual.boss.boarded,true);assert.equal(visual.bus.visible,false);}
    samples.push({stageId:'stage02',seed:mixed.seed,option,visual});await shot(wrongPage,`random-station-${kind}`);
    await finish(wrongPage);assert.equal(await wrongPage.locator('.ending-stamp-c').count(),0);
    assert.equal(await wrongPage.locator('.ending-explanation').innerText(),wrongInstance.endings[option].explanation);
    await click(wrongPage,'retry');
    pass(`station ${kind} uses its actual clock, boss and shuttle outcome`);
  }
  await wrongPage.close();

  // Reaching the bus must not automatically make a late gathering correct.
  let lateBoard;
  for(let seed=1;seed<=2000;seed++){
    const instance=createCase('stage02',seed);
    const option=letters.find(letter=>instance.stationPlan.outcomes[letter]==='late-board');
    if(option){lateBoard={seed,instance,option};break;}
  }
  assert.ok(lateBoard);
  const tardy=await browser.newPage({viewport:{width:390,height:844}});tardy.on('pageerror',e=>errors.push(e.message));
  const tardyInstance=await open(tardy,'stage02',lateBoard.seed);
  await click(tardy,'decision');await choose(tardy,lateBoard.option);await seek(tardy,2);
  let tardyVisual=await tardy.evaluate(()=>window.__game.visuals());
  assert.equal(tardyVisual.outcome,'late-board');assert.equal(tardyVisual.parcelPose.supporting,true);assert.equal(tardyVisual.boss.visible,true);
  await seek(tardy,5.2);tardyVisual=await tardy.evaluate(()=>window.__game.visuals());
  assert.equal(tardyVisual.bus.boarded,true);assert.equal(tardyVisual.boss.boarded,true);
  await seek(tardy,7.9);tardyVisual=await tardy.evaluate(()=>window.__game.visuals());assert.equal(tardyVisual.bus.visible,false);
  samples.push({stageId:'stage02',seed:lateBoard.seed,option:lateBoard.option,visual:tardyVisual});
  await finish(tardy);assert.equal(await tardy.locator('.ending-stamp-c').count(),0);
  assert.equal(await tardy.locator('.ending-explanation').innerText(),tardyInstance.endings[lateBoard.option].explanation);
  await shot(tardy,'random-station-late-board');await tardy.close();
  pass('late gathering can catch the bus while retaining its incorrect interpretation');

  for(const [width,height] of [[320,568],[360,800],[390,844]]){
    const mobile=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
    const p=await mobile.newPage();p.on('pageerror',e=>errors.push(e.message));
    for(const stageId of ['stage01','stage02']){
      const representative=representatives[stageId][letters[[320,360,390].indexOf(width)]];
      const instance=await open(p,stageId,representative.seed);
      const paths=await reachable(p);const clue=instance.clues.find(c=>c.id===(stageId==='stage01'?'C04':'C06'));
      await inspect(p,paths[clue.id],clue);await shot(p,`random-${stageId}-record-${width}`);
      const close=await p.locator('[data-action=close]').boundingBox();assert.ok(close.y>=0&&close.y+close.height<=height+1);
      await click(p,'close');await click(p,'decision');
      const footer=await p.locator('.panel-footer').boundingBox();
      for(const option of letters){const box=await p.locator(`[data-action=choose][data-detail=${option}]`).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=footer.y+1);}
      await choose(p,instance.correctChoice);await finish(p);await shot(p,`random-${stageId}-ending-${width}`);
      for(const action of ['newcase','retry','title']){const box=await p.locator(`[data-action=${action}]`).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height+1);}
      await click(p,'newcase');assert.equal((await snap(p)).phase,'INTRO');assert.notEqual((await snap(p)).caseSeed,representative.seed);
    }
    await mobile.close();pass(`generated records and endings fit mobile ${width}x${height}`);
  }
  assert.deepEqual(errors,[]);pass('random case browser runtime without uncaught exceptions');
}finally{
  await fs.writeFile('artifacts/random-cases-results.json',JSON.stringify({base,browser:await browser.version(),representatives:Object.fromEntries(Object.entries(representatives).map(([stage,items])=>[stage,Object.fromEntries(Object.entries(items).map(([letter,item])=>[letter,item.seed]))])),results,errors,samples},null,2));
  await browser.close();
}
