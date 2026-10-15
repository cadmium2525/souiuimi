import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createCase } from '../src/data/cases.ts';
import { WEAK_DEFINITION } from '../src/data/amountCases.ts';

const base=process.env.GAME_URL||'http://127.0.0.1:4173/';
const letters=['A','B'],representatives={},results=[],errors=[],samples=[];
for(let seed=0;seed<=2000&&Object.keys(representatives).length<2;seed++){const c=createCase('stage04',seed);representatives[c.correctChoice]??=seed;}
assert.equal(Object.keys(representatives).length,2);
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const pass=name=>{results.push(name);console.log(`PASS ${name}`);};
const snap=p=>p.evaluate(()=>window.__game.snapshot());
const frame=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const seek=async(p,t)=>{await p.evaluate(t=>window.__game.cinematic(t),t);await frame(p);};
const finish=async p=>{await seek(p,9.9);await p.waitForFunction(()=>window.__game.snapshot().phase==='ENDING');};
const action=(p,a)=>p.locator(`[data-action=${a}]`).first().click();
const choose=(p,c)=>p.locator(`[data-action=choose][data-detail=${c}]`).click();
const shot=(p,n)=>p.screenshot({path:`artifacts/amount-${n}.png`,animations:'disabled'});
async function open(p,seed){
  const url=new URL(base);url.searchParams.set('qa','1');url.searchParams.set('stage','stage04');url.searchParams.set('seed',String(seed));
  await p.goto(url.href);await p.waitForFunction(()=>window.__game?.snapshot().phase==='TITLE');
  assert.equal((await snap(p)).stageId,'stage04');assert.equal(await p.locator('.stage-pick').count(),5);
  await action(p,'start');const c=await p.evaluate(()=>window.__game.instance());
  assert.deepEqual(c.choiceIds,letters);assert.equal(c.caseSeed,seed);assert.equal(c.facts.kind,'amount');
  assert.equal(await p.locator('.boss-message').innerText(),c.copy.introBoss);await action(p,'explore');return c;
}
const paths=p=>p.evaluate(()=>{
  const colliders=window.__game.colliders(),stage=window.__game.stage();
  const valid=(x,z)=>((x>=-5.7&&x<=5.7&&z>=-4.2&&z<=4.2)||(x>=5.7&&x<=8.7&&z>=-.2&&z<=4.2))&&!colliders.some(c=>x>c.minX-.27&&x<c.maxX+.27&&z>c.minZ-.27&&z<c.maxZ+.27);
  const queue=[[Math.round(stage.start.x/.2),Math.round(stage.start.z/.2)]],seen=new Set([queue[0].join(',')]),found={};
  for(let i=0;i<queue.length;i++){const[gx,gz]=queue[i],x=gx*.2,z=gz*.2;
    for(const c of stage.clues){const d=Math.hypot(x-c.x,z-c.z);if(d<c.radius-.1&&(!found[c.id]||d<found[c.id].d))found[c.id]={x,z,d};}
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=gx+dx,nz=gz+dz,key=`${nx},${nz}`;if(!seen.has(key)&&valid(nx*.2,nz*.2)){seen.add(key);queue.push([nx,nz]);}}
  }return found;
});
async function inspect(p,c,point){await p.evaluate(v=>window.__game.teleport(v.x,v.z),point);await p.waitForFunction(id=>window.__game.snapshot().nearest===id,c.id);await action(p,'inspect');assert.equal(await p.locator('.evidence-document p').innerText(),c.body);assert.equal(await p.locator('.player-thought').count(),0);}
try{
  const p=await browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));
  for(const correct of letters){
    const seed=representatives[correct],c=await open(p,seed),original=JSON.stringify(c),points=await paths(p);
    assert.equal(Object.keys(points).length,7);await shot(p,`explore-${correct.toLowerCase()}`);
    const before=await snap(p);await p.keyboard.down('KeyA');await p.waitForTimeout(230);await p.keyboard.up('KeyA');assert.ok(Math.hypot((await snap(p)).x-before.x,(await snap(p)).z-before.z)>.05);
    for(const clue of c.clues){await inspect(p,clue,points[clue.id]);if(clue.id==='C03')await shot(p,`history-${correct.toLowerCase()}`);await action(p,'close');}
    assert.equal((await snap(p)).found.length,7);assert.equal(JSON.stringify(await p.evaluate(()=>window.__game.instance())),original);
    for(const choice of [correct,...letters.filter(x=>x!==correct)]){
      await action(p,'decision');assert.equal(await p.locator('.choice-button').count(),2);assert.equal(await p.locator('[data-action=choose][data-detail=C]').count(),0);
      await p.evaluate(()=>window.__game.action('choose','C'));assert.equal((await snap(p)).phase,'DECISION');
      for(const option of letters)assert.equal(await p.locator(`[data-action=choose][data-detail=${option}] strong`).innerText(),c.choices[option].label);
      await choose(p,choice);await seek(p,2.6);const middle=await p.evaluate(()=>window.__game.visuals());
      assert.equal(middle.clueMarkers,0);assert.ok(middle.drawCalls<130);assert.deepEqual(middle.amount.signage,c.amountPlan.signage);
      await seek(p,9.4);const last=await p.evaluate(()=>window.__game.visuals()),prepared=choice==='A'?c.amountPlan.lowerYen:c.amountPlan.upperYen,difference=prepared-c.amountPlan.requiredYen;
      const outcome=difference===0?'exact':difference<0?'short':'extra';
      assert.equal(last.amount.preparedYen,prepared);assert.equal(last.amount.requiredYen,c.amountPlan.requiredYen);assert.equal(last.amount.differenceYen,difference);assert.equal(last.amount.outcome,outcome);assert.equal(last.amount.submitted,true);
      assert.ok(last.amount.maximumWalkingSpeed<=2.6);assert.deepEqual(last.camera,middle.camera);
      if(outcome==='exact')assert.equal(last.amount.received,true);
      if(outcome==='short')assert.equal(last.amount.shortfallYen,-difference);
      if(outcome==='extra')assert.equal(last.amount.changeReturned,true);
      await shot(p,`${outcome}-${correct.toLowerCase()}-${choice.toLowerCase()}`);samples.push({seed,correct,choice,middle,last});
      await finish(p);assert.equal(await p.locator('.ending-stamp-c').count(),choice===correct?1:0);
      assert.equal(await p.locator('.ending-explanation').innerText(),c.endings[choice].explanation);assert.ok((await p.locator('.ending-explanation').innerText()).includes(WEAK_DEFINITION));
      assert.equal(await p.locator('.ending-line blockquote').first().innerText(),c.endings[choice].boss);
      if(correct==='B')assert.match(c.endings[choice].boss,/ごめん|取り違え/);
      if(choice===correct){await p.locator('.ending-review summary').click();assert.equal(await p.locator('.ending-review article').count(),3);await shot(p,`ending-${correct.toLowerCase()}`);}
      await action(p,'retry');assert.equal((await snap(p)).caseSeed,seed);assert.deepEqual((await snap(p)).found,[]);assert.equal(JSON.stringify(await p.evaluate(()=>window.__game.instance())),original);assert.equal(await p.evaluate(()=>window.__game.visuals().amount.outcome),'unassigned');
    }
    await action(p,'decision');await choose(p,correct);await finish(p);await action(p,'newcase');assert.equal((await snap(p)).phase,'INTRO');assert.notEqual((await snap(p)).caseSeed,seed);
    const next=await p.evaluate(()=>window.__game.instance());assert.equal(await p.locator('.boss-message').innerText(),next.copy.introBoss);
    pass(`amount correct ${correct}: two choices, seven records, both actions, dictionary distinction, retry and fresh request`);
  }
  await p.close();
  for(const[width,height]of[[320,568],[360,800],[390,844]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    const c=await open(p,representatives[width===360?'A':'B']),points=await paths(p);await inspect(p,c.clues.find(x=>x.id==='C03'),points.C03);await shot(p,`record-${width}`);
    const close=await p.locator('[data-action=close]').boundingBox();assert.ok(close.y>=0&&close.y+close.height<=height+1);
    await p.locator('[data-action=close]').tap();await p.locator('[data-action=decision]').tap();assert.equal(await p.locator('.choice-button').count(),2);
    const footer=await p.locator('.panel-footer').boundingBox();for(const choice of letters){const box=await p.locator(`[data-action=choose][data-detail=${choice}]`).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=footer.y+1);}
    await shot(p,`choices-${width}`);await p.locator(`[data-action=choose][data-detail=${c.correctChoice}]`).tap();await seek(p,7.7);await shot(p,`handover-${width}`);await finish(p);
    for(const name of ['newcase','retry','title']){const box=await p.locator(`[data-action=${name}]`).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height+1);}
    await shot(p,`ending-${width}`);await p.locator('[data-action=retry]').tap();assert.equal((await snap(p)).phase,'EXPLORE');await context.close();pass(`amount touch layout, handover and result footer ${width}x${height}`);
  }
  assert.deepEqual(errors,[]);pass('amount case runtime without uncaught exceptions');
}finally{await fs.writeFile('artifacts/amount-results.json',JSON.stringify({base,browser:await browser.version(),representatives,results,errors,samples},null,2));await browser.close();}
