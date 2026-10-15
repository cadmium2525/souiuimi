import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createCase } from '../src/data/cases.ts';

const base = process.env.GAME_URL || 'http://127.0.0.1:4173/';
const letters = ['A','B','C'];
const dispositions = { A:'company', B:'personal', C:'donation' };
const representatives = {};
for(let seed=1;seed<=2000&&Object.keys(representatives).length<3;seed++){
  const instance=createCase('stage03',seed);
  representatives[instance.correctChoice] ??= seed;
}
assert.equal(Object.keys(representatives).length,3);
const results=[],errors=[],samples=[];
const pass=name=>{results.push(name);console.log(`PASS ${name}`);};
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const snap=page=>page.evaluate(()=>window.__game.snapshot());
const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const seek=async(page,t)=>{await page.evaluate(t=>window.__game.cinematic(t),t);await frame(page);};
const finish=async page=>{await seek(page,9.9);await page.waitForFunction(()=>window.__game.snapshot().phase==='ENDING');};
const action=(page,name)=>page.locator(`[data-action=${name}]`).first().click();
const choose=(page,choice)=>page.locator(`[data-action=choose][data-detail=${choice}]`).click();
const shot=async(page,name)=>{await page.waitForTimeout(300);await page.screenshot({path:`artifacts/money-${name}.png`,animations:'disabled'});};
async function open(page,seed){
  const url=new URL(base);url.searchParams.set('qa','1');url.searchParams.set('stage','stage03');url.searchParams.set('seed',String(seed));
  await page.goto(url.href);await page.waitForFunction(()=>window.__game?.snapshot().phase==='TITLE');
  assert.equal((await snap(page)).stageId,'stage03');
  assert.equal(await page.locator('.stage-pick').count(),5);
  await action(page,'start');
  const instance=await page.evaluate(()=>window.__game.instance());
  assert.equal(instance.facts.kind,'money');assert.equal(instance.caseSeed,seed);
  assert.equal(await page.locator('.boss-message').innerText(),instance.copy.introBoss);
  await action(page,'explore');return instance;
}
async function paths(page){return page.evaluate(()=>{
  const colliders=window.__game.colliders(),stage=window.__game.stage();
  const valid=(x,z)=>((x>=-5.7&&x<=5.7&&z>=-4.2&&z<=4.2)||(x>=5.7&&x<=8.7&&z>=-.2&&z<=4.2))&&!colliders.some(c=>x>c.minX-.27&&x<c.maxX+.27&&z>c.minZ-.27&&z<c.maxZ+.27);
  const queue=[[Math.round(stage.start.x/.2),Math.round(stage.start.z/.2)]],seen=new Set([queue[0].join(',')]),found={};
  for(let i=0;i<queue.length;i++){
    const [gx,gz]=queue[i],x=gx*.2,z=gz*.2;
    for(const clue of stage.clues){const d=Math.hypot(clue.x-x,clue.z-z);if(d<clue.radius-.1&&(!found[clue.id]||d<found[clue.id].d))found[clue.id]={x,z,d};}
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=gx+dx,nz=gz+dz,key=`${nx},${nz}`;if(!seen.has(key)&&valid(nx*.2,nz*.2)){seen.add(key);queue.push([nx,nz]);}}
  }
  return found;
});}
async function inspect(page,clue,point){
  await page.evaluate(p=>window.__game.teleport(p.x,p.z),point);
  await page.waitForFunction(id=>window.__game.snapshot().nearest===id,clue.id);
  await action(page,'inspect');assert.equal(await page.locator('.evidence-document p').innerText(),clue.body);
  assert.equal(await page.locator('.player-thought').count(),0);
}
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
  for(const correct of letters){
    const seed=representatives[correct],instance=await open(page,seed),original=JSON.stringify(instance);
    const points=await paths(page);assert.equal(Object.keys(points).length,7,'all records must be reachable from the spawn');
    const before=await snap(page);await page.keyboard.down('KeyA');await page.waitForTimeout(220);await page.keyboard.up('KeyA');
    assert.ok(Math.hypot((await snap(page)).x-before.x,(await snap(page)).z-before.z)>.05);
    await shot(page,`explore-${correct.toLowerCase()}`);
    assert.equal(await page.locator('.empty-note').count(),0);
    for(const clue of instance.clues){
      await inspect(page,clue,points[clue.id]);
      if(clue.id==='C04')await shot(page,`rules-${correct.toLowerCase()}`);
      if(clue.id==='C05')await shot(page,`fund-${correct.toLowerCase()}`);
      await action(page,'close');
    }
    assert.equal((await snap(page)).found.length,7);
    assert.equal(JSON.stringify(await page.evaluate(()=>window.__game.instance())),original);
    // Every answer is exercised against every generated correct interpretation.
    for(const choice of [correct,...letters.filter(c=>c!==correct)]){
      await action(page,'decision');
      for(const option of letters)assert.equal(await page.locator(`[data-action=choose][data-detail=${option}] strong`).innerText(),instance.choices[option].label);
      await choose(page,choice);await seek(page,2.7);
      const middle=await page.evaluate(()=>window.__game.visuals());
      assert.equal(middle.clueMarkers,0);assert.ok(middle.drawCalls<180);
      assert.equal(middle.camera.fixed,true);assert.deepEqual(middle.money.signage,instance.moneyPlan.signage);
      if(choice===correct)await shot(page,`action-${choice.toLowerCase()}-middle`);
      await seek(page,9.4);
      const last=await page.evaluate(()=>window.__game.visuals());
      assert.equal(last.money.disposition,dispositions[choice]);assert.equal(last.money.changeYen,instance.moneyPlan.changeYen);
      assert.equal(last.money.paidYen,instance.moneyPlan.paidYen);assert.equal(last.money.purchaseYen,instance.moneyPlan.purchaseYen);
      assert.equal(last.money.envelopeId,instance.moneyPlan.envelopeId);
      assert.ok(last.money.maximumWalkingSpeed<=2.6);assert.deepEqual(last.camera,middle.camera);
      if(choice==='A'){assert.equal(last.money.envelopeOnTable,false);assert.equal(last.money.receiptOnTable,false);}
      if(choice==='B')assert.equal(last.money.coffeeInHand,true);
      if(choice==='C')assert.equal(last.money.coinCount,6);
      if(choice===correct)await shot(page,`action-${choice.toLowerCase()}-complete`);
      samples.push({seed,correct,choice,middle,last});
      await finish(page);
      assert.equal(await page.locator('.ending-stamp-c').count(),choice===correct?1:0);
      assert.equal(await page.locator('.ending-explanation').innerText(),instance.endings[choice].explanation);
      assert.equal(await page.locator('.ending-line blockquote').first().innerText(),instance.endings[choice].boss);
      if(choice===correct){await page.locator('.ending-review summary').click();assert.equal(await page.locator('.ending-review article').count(),3);await shot(page,`ending-${correct.toLowerCase()}`);}
      await action(page,'retry');assert.equal((await snap(page)).phase,'EXPLORE');assert.equal((await snap(page)).caseSeed,seed);
      assert.deepEqual((await snap(page)).found,[]);assert.equal(JSON.stringify(await page.evaluate(()=>window.__game.instance())),original);
      const reset=await page.evaluate(()=>window.__game.visuals().money);
      assert.equal(reset.disposition,'unassigned');assert.equal(reset.coinCount,0);assert.equal(reset.coffeeInHand,false);
      assert.equal(reset.envelopeOnTable,true);assert.equal(reset.receiptOnTable,true);assert.equal(reset.tableCoins,6);
    }
    await action(page,'decision');await choose(page,correct);await finish(page);await action(page,'newcase');
    const next=await page.evaluate(()=>window.__game.instance());assert.notEqual(next.caseSeed,seed);assert.deepEqual((await snap(page)).found,[]);
    assert.equal(await page.locator('.boss-message').innerText(),next.copy.introBoss);
    pass(`money correct ${correct}: all seven records, all three actions, matching results, retry and new request`);
  }
  await page.close();
  for(const[width,height]of[[320,568],[360,800],[390,844]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    const instance=await open(p,representatives[letters[[320,360,390].indexOf(width)]]);
    const points=await paths(p);
    for(const id of ['C03','C04','C05']){
      await inspect(p,instance.clues.find(c=>c.id===id),points[id]);
      await shot(p,id==='C04'?`record-${width}`:`record-${id.toLowerCase()}-${width}`);
      const close=await p.locator('[data-action=close]').boundingBox();assert.ok(close.y>=0&&close.y+close.height<=height+1);
      await p.locator('[data-action=close]').tap();
    }
    await p.locator('[data-action=decision]').tap();
    const footer=await p.locator('.panel-footer').boundingBox();
    for(const choice of letters){const box=await p.locator(`[data-action=choose][data-detail=${choice}]`).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=footer.y+1,`${width}: all choices must fit`);}
    await shot(p,`choices-${width}`);await p.locator(`[data-action=choose][data-detail=${instance.correctChoice}]`).tap();await finish(p);
    for(const name of ['newcase','retry','title']){const box=await p.locator(`[data-action=${name}]`).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height+1);}
    await shot(p,`ending-${width}`);await p.locator('[data-action=retry]').tap();assert.equal((await snap(p)).phase,'EXPLORE');
    await context.close();pass(`money touch layout and result footer ${width}x${height}`);
  }
  assert.deepEqual(errors,[]);pass('money case browser runtime without uncaught exceptions');
}finally{
  await fs.writeFile('artifacts/money-results.json',JSON.stringify({base,browser:await browser.version(),representatives,results,errors,samples},null,2));
  await browser.close();
}
