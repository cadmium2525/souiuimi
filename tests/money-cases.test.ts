import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyCase, formatMoney, moneyClueBodies, MONEY_PURPOSES, solveMoneyFacts, validateMoneyCase } from '../src/data/moneyCases.ts';
import { STAGE03 } from '../src/data/stage03.ts';
import { createCase, solveCase, validateCase } from '../src/data/cases.ts';
import { GameState } from '../src/game/state.ts';
import type { Choice, MoneyCaseFacts } from '../src/game/types.ts';

const choices: Choice[] = ['A', 'B', 'C'];
const sources: MoneyCaseFacts['errands'][number]['source'][] = ['company-advance', 'boss-private', 'group-fund'];
const forbiddenCodes = /\b[A-Z]{1,3}\d{2,}\b|封筒番号|資金区分|台帳|募金箱D|保存記録|→/;
const visibleText = (instance: ReturnType<typeof createMoneyCase>) => [
  ...instance.clues.flatMap(clue => [clue.title, clue.category, clue.body]),
  ...Object.values(instance.endings).flatMap(ending => Object.values(ending)),
  ...Object.values(instance.moneyPlan!.signage),
];

function controlledContexts() {
  const base: MoneyCaseFacts = {
    kind: 'money', today: '10月15日', envelopeName: '買い出し代', occasion: '昼のお茶',
    paidYen: 5000, purchaseYen: 3200,
    errands: [{ purpose: MONEY_PURPOSES[0], source: 'group-fund' }, { purpose: MONEY_PURPOSES[1], source: 'boss-private' }],
  };
  return sources.flatMap(first => sources.filter(second => second !== first).flatMap(second => MONEY_PURPOSES.map(occasion => {
    const facts: MoneyCaseFacts = { ...base, occasion, errands: [
      { purpose: MONEY_PURPOSES[0], source: first }, { purpose: MONEY_PURPOSES[1], source: second },
    ] };
    return { facts, answer: solveMoneyFacts(facts)!, bodies: moneyClueBodies(facts) };
  })));
}

function answersByObservation(contexts: ReturnType<typeof controlledContexts>, ids: string[]) {
  const observations = new Map<string, Set<Choice>>();
  for (const context of contexts) {
    const observation = JSON.stringify(ids.map(id => {
      const clue = STAGE03.clues.find(clue => clue.id === id)!;
      return [clue.title, clue.category, context.bodies[id]];
    }));
    if (!observations.has(observation)) observations.set(observation, new Set());
    observations.get(observation)!.add(context.answer);
  }
  return observations;
}

test('each complete money clue remains compatible with multiple answers; the current errand and prior conversation together resolve it', () => {
  const contexts = controlledContexts();
  assert.equal(contexts.length, 12);
  for (const clue of STAGE03.clues) {
    const projections = answersByObservation(contexts, [clue.id]);
    for (const answers of projections.values()) {
      assert.ok(answers.size >= 2, `${clue.id} alone reveals ${[...answers]}`);
      if (clue.id !== 'C03') assert.equal(answers.size, 3, `${clue.id} must retain all three interpretations`);
    }
  }
  for (const answers of answersByObservation(contexts, ['C01', 'C03', 'C04']).values()) assert.equal(answers.size, 1);
  for (const context of contexts) {
    assert.doesNotMatch(context.bodies.C03, /余り|お礼|精算|返却|募金/);
    assert.doesNotMatch(context.bodies.C04, /昼のお茶|夕方のお菓子/);
  }
  const fixtureFacts = contexts.find(context => context.facts.occasion === '昼のお茶' && context.facts.errands[0].source === 'group-fund' && context.facts.errands[1].source === 'boss-private')!.facts;
  assert.deepEqual(Object.fromEntries(STAGE03.clues.map(clue => [clue.id, clue.body])), moneyClueBodies(fixtureFacts));
});

test('money context is deterministic, normalized and immutable through the common factory', () => {
  const before = JSON.stringify(STAGE03);
  assert.deepEqual(createMoneyCase(19), createMoneyCase(19));
  assert.deepEqual(createMoneyCase(-1), createMoneyCase(4294967295));
  for (const seed of [NaN, Infinity, -Infinity]) assert.throws(() => createMoneyCase(seed), RangeError);
  assert.equal(JSON.stringify(STAGE03), before);
  const instance = createCase('stage03', 19);
  assert.deepEqual(instance, createMoneyCase(19));
  assert.ok(Object.isFrozen(instance));
  assert.ok(Object.isFrozen(instance.facts));
  assert.ok(Object.isFrozen(instance.clues[0]));
  assert.ok(Object.isFrozen(instance.moneyPlan!.signage));
  assert.throws(() => { instance.clues[0].body = 'changed'; }, TypeError);
  assert.throws(() => { instance.moneyPlan!.changeYen = 1; }, TypeError);
  for (const clue of STAGE03.clues) assert.doesNotMatch(clue.body, forbiddenCodes);
  for (const ending of Object.values(STAGE03.endings)) assert.doesNotMatch(JSON.stringify(ending), forbiddenCodes);
});

test('3,000 errands cover all twelve contextual combinations in a credible company break room', () => {
  const answers = new Map<Choice, number>();
  const contexts = new Map<string, number>();
  const cosmeticAnswers = new Map<string, Set<Choice>>();
  const dates = new Set<string>();
  const amounts = new Set<string>();
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createMoneyCase(seed);
    assert.deepEqual(validateMoneyCase(instance), [], `money seed ${seed}`);
    assert.deepEqual(validateCase(instance), [], `common validator money seed ${seed}`);
    const facts = instance.facts as MoneyCaseFacts;
    const plan = instance.moneyPlan!;
    assert.equal(solveMoneyFacts(facts), instance.correctChoice);
    assert.equal(solveCase(instance), instance.correctChoice);
    answers.set(instance.correctChoice, (answers.get(instance.correctChoice) ?? 0) + 1);
    const key = `${facts.errands.map(errand => errand.source).join(',')}:${facts.occasion}`;
    contexts.set(key, (contexts.get(key) ?? 0) + 1);
    for (const key of [`envelope:${facts.envelopeName}`, `purpose:${facts.occasion}`, `paid:${facts.paidYen}`, `change:${plan.changeYen}`]) {
      if (!cosmeticAnswers.has(key)) cosmeticAnswers.set(key, new Set());
      cosmeticAnswers.get(key)!.add(instance.correctChoice);
    }
    dates.add(facts.today); amounts.add(`${facts.paidYen}-${facts.purchaseYen}`);
    assert.equal(plan.changeYen, facts.paidYen - facts.purchaseYen);
    assert.ok(plan.changeYen > 0 && plan.changeYen < facts.paidYen);
    assert.equal(plan.paidYen, facts.paidYen);
    assert.equal(plan.purchaseYen, facts.purchaseYen);
    assert.equal(plan.envelopeId, facts.envelopeName);
    assert.equal(instance.seconds, 120);
    assert.deepEqual(instance.evidenceChain, ['C01', 'C03', 'C04']);
    assert.deepEqual(instance.cinematicSeconds, { A: 10, B: 10, C: 10 });
    assert.equal(instance.copy.introBoss, '買い出しありがとう。お釣りはいいよ。');
    assert.equal(instance.copy.introThought, '');
    assert.ok(instance.copy.worldLocation.includes('社内休憩室'));
    for (const text of [instance.copy.introBoss, instance.copy.introInstruction, instance.copy.worldLabel, ...Object.values(plan.signage)]) {
      assert.doesNotMatch(text, /昼のお茶|夕方のお菓子/, 'the current errand must be discovered rather than given before inspecting');
    }
    assert.ok(instance.clues[0].body.includes(facts.occasion));
    assert.ok(instance.clues[1].body.includes(`釣銭：${formatMoney(plan.changeYen)}`));
    assert.ok(instance.clues[2].body.includes(MONEY_PURPOSES[0]) && instance.clues[2].body.includes(MONEY_PURPOSES[1]));
    assert.ok(instance.clues[5].body.includes(facts.errands.find(errand => errand.purpose !== facts.occasion)!.purpose));
    assert.ok(instance.clues[6].body.includes(formatMoney(plan.changeYen)));
    assert.equal(instance.choices.C.label, '社内の募金箱へ入れる');
    for (const choice of choices) {
      const ending = instance.endings[choice];
      assert.ok(ending.explanation.length <= 66, ending.explanation);
      assert.equal(ending.explanation.match(/。/g)?.length, 2);
      assert.equal(ending.explanation, instance.endings[instance.correctChoice].explanation);
      assert.ok(ending.boss.includes(formatMoney(plan.changeYen)));
      assert.ok(instance.copy[`cinematic${choice}`].includes(formatMoney(plan.changeYen)));
      assert.doesNotMatch(instance.copy[`cinematic${choice}`], /店の募金箱|売店の募金箱/);
    }
    for (const text of visibleText(instance)) assert.doesNotMatch(text, forbiddenCodes);
    for (const clue of instance.clues) {
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /まさか|予感|必要そう|正解|思う|そういう意味/);
    }
  }
  assert.equal(contexts.size, 12);
  for (const count of contexts.values()) assert.ok(count > 150);
  assert.equal(dates.size, 27);
  assert.ok(amounts.size > 50);
  for (const choice of choices) assert.ok((answers.get(choice) ?? 0) > 500);
  for (const outcomes of cosmeticAnswers.values()) assert.equal(outcomes.size, 3, 'names, purchase contents and amounts cannot reveal an answer');
});

test('money solvers reject unidentifiable funds; validation catches changed speech and amounts', () => {
  const instance = createMoneyCase(12);
  const facts = instance.facts as MoneyCaseFacts;
  assert.equal(solveMoneyFacts({ ...facts, occasion: '別の買い物' }), null);
  assert.equal(solveMoneyFacts({ ...facts, errands: [] }), null);
  assert.equal(solveMoneyFacts({ ...facts, errands: [facts.errands[0], facts.errands[0]] }), null);
  assert.equal(solveMoneyFacts({ ...facts, errands: facts.errands.map(errand => ({ ...errand, source: 'company-advance' as const })) }), null);
  const badAmount = structuredClone(instance);
  badAmount.moneyPlan!.changeYen += 1;
  assert.ok(validateMoneyCase(badAmount).some(error => error.includes('amount')));
  for (let i = 0; i < 7; i++) {
    const changed = structuredClone(instance);
    changed.clues[i].body = '別の話';
    assert.ok(validateMoneyCase(changed).some(error => error.includes(`${changed.clues[i].id} text`)));
  }
  const badContext = structuredClone(instance);
  if (badContext.facts.kind !== 'money') throw new Error('wrong facts');
  badContext.facts.errands[1].source = badContext.facts.errands[0].source;
  assert.equal(solveMoneyFacts(badContext.facts), null);
  assert.ok(validateMoneyCase(badContext).some(error => error.includes('unique answer')));
  const badProof = structuredClone(instance);
  badProof.endings.A.explanation = '今回はこれが正解です。';
  assert.ok(validateMoneyCase(badProof).some(error => error.includes('ending A proof')));
  const badSign = structuredClone(instance);
  badSign.moneyPlan!.signage.envelope = '封筒 E17';
  assert.ok(validateMoneyCase(badSign).some(error => error.includes('signage')));
});

test('retry keeps the same conversation and a new request generates a new immutable context', () => {
  let nextSeed = 7;
  const state = new GameState({ seedSource: () => nextSeed++ });
  assert.ok(state.selectStage('stage03')); assert.ok(state.start()); assert.ok(state.explore());
  const original = state.case;
  assert.ok(original && original.facts.kind === 'money');
  assert.ok(state.inspect('C03')); assert.ok(state.close()); assert.ok(state.decide());
  assert.ok(state.choose(original.correctChoice));
  assert.ok(state.finishEnding());
  assert.equal(state.phase, 'ENDING');
  assert.ok(state.retry());
  assert.equal(state.case, original); assert.deepEqual(state.found, []); assert.equal(state.remaining, 120);
  assert.ok(state.decide()); assert.ok(state.choose(original.correctChoice)); assert.ok(state.finishEnding());
  assert.ok(state.newCase('stage03')); assert.notEqual(state.caseSeed, original.caseSeed);
  assert.ok(Object.isFrozen(state.case)); assert.equal(state.phase, 'INTRO');
});
