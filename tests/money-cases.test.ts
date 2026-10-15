import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyCase, formatMoney, solveMoneyFacts, validateMoneyCase } from '../src/data/moneyCases.ts';
import { STAGE03 } from '../src/data/stage03.ts';
import { createCase, solveCase, validateCase } from '../src/data/cases.ts';
import { GameState } from '../src/game/state.ts';
import type { Choice, MoneyCaseFacts } from '../src/game/types.ts';

const choices: Choice[] = ['A', 'B', 'C'];
const forbiddenCodes = /\b[A-Z]{1,3}\d{2,}\b|封筒番号|資金区分|台帳|募金箱D|保存記録|→/;
const visibleText = (instance: ReturnType<typeof createMoneyCase>) => [
  ...instance.clues.flatMap(clue => [clue.title, clue.category, clue.body]),
  ...Object.values(instance.endings).flatMap(ending => Object.values(ending)),
  ...Object.values(instance.moneyPlan!.signage),
];

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

test('3,000 errands vary the intended meaning through ownership and prior conversation, without lookup codes', () => {
  const answers = new Map<Choice, number>();
  const envelopeAnswers = new Map<string, Set<Choice>>();
  const occasionAnswers = new Map<string, Set<Choice>>();
  const paidAnswers = new Map<number, Set<Choice>>();
  const changeAnswers = new Map<number, Set<Choice>>();
  const dates = new Set<string>();
  const amounts = new Set<string>();
  const record = <T>(map: Map<T, Set<Choice>>, key: T, answer: Choice) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(answer);
  };
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createMoneyCase(seed);
    assert.deepEqual(validateMoneyCase(instance), [], `money seed ${seed}`);
    assert.deepEqual(validateCase(instance), [], `common validator money seed ${seed}`);
    const facts = instance.facts as MoneyCaseFacts;
    const plan = instance.moneyPlan!;
    assert.equal(solveMoneyFacts(facts), instance.correctChoice);
    assert.equal(solveCase(instance), instance.correctChoice);
    answers.set(instance.correctChoice, (answers.get(instance.correctChoice) ?? 0) + 1);
    record(envelopeAnswers, facts.envelopeName, instance.correctChoice);
    record(occasionAnswers, facts.occasion, instance.correctChoice);
    record(paidAnswers, facts.paidYen, instance.correctChoice);
    record(changeAnswers, plan.changeYen, instance.correctChoice);
    dates.add(facts.today); amounts.add(`${facts.paidYen}-${facts.purchaseYen}`);
    assert.equal(plan.changeYen, facts.paidYen - facts.purchaseYen);
    assert.ok(plan.changeYen > 0 && plan.changeYen < facts.paidYen);
    assert.equal(plan.paidYen, facts.paidYen);
    assert.equal(plan.purchaseYen, facts.purchaseYen);
    assert.equal(plan.envelopeId, facts.envelopeName);
    assert.equal(instance.seconds, 120);
    assert.deepEqual(instance.evidenceChain, ['C03', 'C04', 'C07']);
    assert.deepEqual(instance.cinematicSeconds, { A: 10, B: 10, C: 10 });
    assert.equal(instance.copy.introBoss, '買い出しありがとう。お釣りはいいよ。');
    assert.equal(instance.copy.introThought, '');
    assert.ok(instance.clues[0].body.includes(facts.envelopeName));
    assert.ok(instance.clues[0].body.includes(facts.today));
    assert.ok(instance.clues[0].body.includes(facts.occasion));
    assert.ok(instance.clues[1].body.includes(`釣銭：${formatMoney(plan.changeYen)}`));
    assert.ok(instance.clues[2].body.includes(facts.occasion));
    assert.ok(instance.clues[5].body.includes(facts.occasion));
    assert.ok(instance.clues[6].body.includes(formatMoney(plan.changeYen)));
    assert.ok(plan.signage.envelope.includes(facts.envelopeName));
    assert.ok(plan.signage.receipt.includes(formatMoney(plan.changeYen)));
    for (const choice of choices) {
      const ending = instance.endings[choice];
      assert.ok(ending.explanation.includes(`${formatMoney(facts.paidYen)} − ${formatMoney(facts.purchaseYen)} = ${formatMoney(plan.changeYen)}`));
      assert.ok(ending.boss.includes(formatMoney(plan.changeYen)));
      assert.ok(instance.copy[`cinematic${choice}`].includes(formatMoney(plan.changeYen)));
    }
    const before = instance.clues[2].body;
    const agreement = instance.clues[3].body;
    if (instance.correctChoice === 'A') {
      assert.equal(facts.source, 'company-advance'); assert.equal(facts.arrangement, 'settle-company');
      assert.ok(before.includes('会社の仮払い'));
      assert.ok(agreement.includes('私を待たなくて大丈夫'));
      assert.ok(agreement.includes('経理の精算トレー'));
    } else if (instance.correctChoice === 'B') {
      assert.equal(facts.source, 'boss-private'); assert.equal(facts.arrangement, 'personal-thanks');
      assert.ok(before.includes('私の財布'));
      assert.ok(agreement.includes('君へのお礼'));
    } else {
      assert.equal(facts.source, 'group-fund'); assert.equal(facts.arrangement, 'agreed-donation');
      assert.ok(before.includes('みんなから集めたお金'));
      assert.ok(agreement.includes('参加者全員「賛成です」'));
    }
    for (const text of visibleText(instance)) assert.doesNotMatch(text, forbiddenCodes);
    for (const clue of instance.clues) {
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /まさか|予感|必要そう|正解|思う|そういう意味/);
    }
  }
  assert.equal(dates.size, 27);
  assert.ok(amounts.size > 50);
  for (const choice of choices) assert.ok((answers.get(choice) ?? 0) > 500);
  for (const map of [envelopeAnswers, occasionAnswers, paidAnswers, changeAnswers]) {
    for (const outcomes of map.values()) assert.equal(outcomes.size, 3, 'envelope names, purchase purposes and amounts cannot reveal the intended meaning');
  }
});

test('money solvers reject conflicting ownership and agreement; validation catches changed speech and amounts', () => {
  const instance = createMoneyCase(12);
  const facts = instance.facts as MoneyCaseFacts;
  const sources: MoneyCaseFacts['source'][] = ['company-advance', 'boss-private', 'group-fund'];
  const agreements: MoneyCaseFacts['arrangement'][] = ['settle-company', 'personal-thanks', 'agreed-donation'];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    assert.equal(solveMoneyFacts({ ...facts, source: sources[i], arrangement: agreements[j] }), i === j ? choices[i] : null);
  }
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
  badContext.facts.arrangement = badContext.facts.arrangement === 'settle-company' ? 'personal-thanks' : 'settle-company';
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
