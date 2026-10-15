import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoneyCase, formatMoney, solveMoneyFacts, validateMoneyCase } from '../src/data/moneyCases.ts';
import { STAGE03 } from '../src/data/stage03.ts';
import { createCase, solveCase, validateCase } from '../src/data/cases.ts';
import type { Choice, MoneyCaseFacts } from '../src/game/types.ts';

const choices: Choice[] = ['A', 'B', 'C'];

test('money cases are deterministic, normalize seeds and leave their original script untouched', () => {
  const before = JSON.stringify(STAGE03);
  assert.deepEqual(createMoneyCase(19), createMoneyCase(19));
  assert.deepEqual(createMoneyCase(-1), createMoneyCase(4294967295));
  for (const seed of [NaN, Infinity, -Infinity]) assert.throws(() => createMoneyCase(seed), RangeError);
  assert.equal(JSON.stringify(STAGE03), before);
  assert.equal(Object.isFrozen(STAGE03), false);
  const instance = createCase('stage03', 19);
  assert.deepEqual(instance, createMoneyCase(19));
  assert.ok(Object.isFrozen(instance));
  assert.ok(Object.isFrozen(instance.facts));
  assert.ok(Object.isFrozen(instance.clues[0]));
  assert.ok(Object.isFrozen(instance.moneyPlan!.signage));
  assert.throws(() => { instance.clues[0].body = 'changed'; }, TypeError);
  assert.throws(() => { instance.moneyPlan!.changeYen = 1; }, TypeError);
});

test('3,000 money seeds have one answer with varied envelopes, funds, rows, dates and amounts', () => {
  const answers = new Map<Choice, number>();
  const envelopeAnswers = new Map<string, Set<Choice>>();
  const fundAnswers = new Map<string, Set<Choice>>();
  const rowAnswers = new Map<number, Set<Choice>>();
  const ruleRowAnswers = new Map<number, Set<Choice>>();
  const paidAnswers = new Map<number, Set<Choice>>();
  const changeAnswers = new Map<number, Set<Choice>>();
  const rolePermutations = new Set<string>();
  const dates = new Set<string>();
  const amounts = new Set<string>();
  const actionLabel: Record<Choice, string> = { A: '会社経理へ返却する', B: '自分が受け取る', C: '店の募金箱へ入れる' };
  const recordAnswer = <T>(map: Map<T, Set<Choice>>, key: T, answer: Choice) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(answer);
  };
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createMoneyCase(seed);
    assert.deepEqual(validateMoneyCase(instance), [], `money seed ${seed}`);
    assert.deepEqual(validateCase(instance), [], `common validator money seed ${seed}`);
    assert.equal(instance.facts.kind, 'money');
    const facts = instance.facts as MoneyCaseFacts;
    const plan = instance.moneyPlan!;
    const currentRow = facts.assignments.find(row => row.date === facts.today && row.envelope === facts.envelopeId)!;
    const currentFund = facts.funds.find(row => row.id === currentRow.fund)!;
    const previousRow = facts.assignments.find(row => row.date === facts.oldNote.date && row.envelope === facts.oldNote.envelope)!;
    assert.equal(solveMoneyFacts(facts), instance.correctChoice);
    assert.equal(solveCase(instance), instance.correctChoice);
    answers.set(instance.correctChoice, (answers.get(instance.correctChoice) ?? 0) + 1);
    recordAnswer(envelopeAnswers, facts.envelopeId, instance.correctChoice);
    recordAnswer(fundAnswers, currentFund.id, instance.correctChoice);
    recordAnswer(rowAnswers, facts.assignments.indexOf(currentRow), instance.correctChoice);
    recordAnswer(ruleRowAnswers, facts.funds.indexOf(currentFund), instance.correctChoice);
    recordAnswer(paidAnswers, facts.paidYen, instance.correctChoice);
    recordAnswer(changeAnswers, plan.changeYen, instance.correctChoice);
    rolePermutations.add([...facts.assignments].filter(row => row.date === facts.today).sort((a, b) => a.envelope.localeCompare(b.envelope)).map(row => facts.funds.find(fund => fund.id === row.fund)!.requirement).join(''));
    dates.add(facts.today);
    amounts.add(`${facts.paidYen}-${facts.purchaseYen}`);
    assert.equal(plan.changeYen, facts.paidYen - facts.purchaseYen);
    assert.ok(plan.changeYen > 0 && plan.changeYen < facts.paidYen);
    assert.equal(plan.paidYen, facts.paidYen);
    assert.equal(plan.purchaseYen, facts.purchaseYen);
    assert.equal(plan.envelopeId, facts.envelopeId);
    assert.notEqual(facts.oldNote.date, facts.today);
    assert.notEqual(previousRow.fund, facts.assignments.find(row => row.date === facts.today && row.envelope === previousRow.envelope)!.fund, 'old envelope records deliberately have a different fund');
    assert.equal(instance.seconds, 120);
    assert.deepEqual(instance.evidenceChain, ['C01', 'C03', 'C04']);
    assert.deepEqual(instance.cinematicSeconds, { A: 10, B: 10, C: 10 });
    assert.equal(instance.copy.introBoss, '買い出しありがとう。お釣りはいいよ。');
    assert.equal(instance.copy.introThought, '');
    assert.deepEqual(new Set(facts.assignments.filter(row => row.date === facts.today).map(row => solveMoneyFacts({ ...facts, envelopeId: row.envelope }))), new Set(choices));
    assert.ok(instance.clues[0].body.includes(facts.envelopeId));
    assert.ok(instance.clues[0].body.includes(facts.today));
    assert.ok(instance.clues[1].body.includes(`釣銭：${formatMoney(plan.changeYen)}`));
    for (const row of facts.assignments) assert.ok(instance.clues[2].body.includes(`${row.date}／${row.envelope} → ${row.fund}`));
    for (const fund of facts.funds) {
      assert.ok(instance.clues[3].body.includes(`${fund.id}：${fund.source}`));
      assert.ok(instance.clues[3].body.includes(fund.condition));
    }
    assert.ok(instance.clues[6].body.includes(facts.oldNote.date));
    assert.ok(instance.clues[6].body.includes(previousRow.fund));
    assert.ok(plan.signage.envelope.includes(facts.envelopeId));
    assert.ok(plan.signage.receipt.includes(formatMoney(plan.changeYen)));
    assert.ok(plan.signage.order.includes(formatMoney(facts.purchaseYen)));
    for (const choice of choices) {
      const ending = instance.endings[choice];
      assert.ok(ending.explanation.includes(`${facts.envelopeId} → ${currentFund.id}`));
      assert.ok(ending.explanation.includes(`${formatMoney(facts.paidYen)} − ${formatMoney(facts.purchaseYen)} = ${formatMoney(plan.changeYen)}`));
      assert.ok(ending.explanation.includes(currentFund.condition));
      assert.ok(ending.explanation.includes(actionLabel[instance.correctChoice]));
      assert.ok(ending.boss.includes(facts.envelopeId));
      assert.ok(ending.boss.includes(formatMoney(plan.changeYen)));
      assert.ok(instance.copy[`cinematic${choice}`].includes(formatMoney(plan.changeYen)));
      if (choice !== instance.correctChoice) assert.ok(ending.explanation.includes(`実行したのは「${actionLabel[choice]}」`));
    }
    for (const clue of instance.clues) {
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /まさか|予感|必要そう|正解|思う|そういう意味/);
    }
  }
  assert.equal(rolePermutations.size, 6);
  assert.equal(dates.size, 27);
  assert.ok(amounts.size > 50);
  for (const choice of choices) assert.ok((answers.get(choice) ?? 0) > 500);
  for (const map of [envelopeAnswers, fundAnswers, rowAnswers, ruleRowAnswers, paidAnswers, changeAnswers]) {
    for (const outcomes of map.values()) assert.equal(outcomes.size, 3, 'numbers, amounts and row placement must not encode the answer');
  }
});

test('money solvers reject ambiguous relations and validation catches contradictory records or amounts', () => {
  const instance = createMoneyCase(12);
  const facts = instance.facts as MoneyCaseFacts;
  const row = facts.assignments.find(entry => entry.date === facts.today && entry.envelope === facts.envelopeId)!;
  const fund = facts.funds.find(entry => entry.id === row.fund)!;
  assert.equal(solveMoneyFacts({ ...facts, assignments: [] }), null);
  assert.equal(solveMoneyFacts({ ...facts, assignments: [...facts.assignments, row] }), null);
  assert.equal(solveMoneyFacts({ ...facts, funds: [] }), null);
  assert.equal(solveMoneyFacts({ ...facts, funds: [...facts.funds, fund] }), null);
  const badAmount = structuredClone(instance);
  badAmount.moneyPlan!.changeYen += 1;
  assert.ok(validateMoneyCase(badAmount).some(error => error.includes('amount')));
  const badText = structuredClone(instance);
  badText.clues[2].body = '別の日の台帳';
  assert.ok(validateMoneyCase(badText).some(error => error.includes('C03 text')));
  const badRule = structuredClone(instance);
  if (badRule.facts.kind !== 'money') throw new Error('wrong facts');
  badRule.facts.funds[0].condition = '自由に使う';
  assert.ok(validateMoneyCase(badRule).some(error => error.includes('condition differs')));
  const badProof = structuredClone(instance);
  badProof.endings.A.explanation = '今回はこれが正解です。';
  assert.ok(validateMoneyCase(badProof).some(error => error.includes('ending A proof')));
  const badNote = structuredClone(instance);
  if (badNote.facts.kind !== 'money') throw new Error('wrong facts');
  badNote.facts.oldNote.date = badNote.facts.today;
  assert.ok(validateMoneyCase(badNote).some(error => error.includes('past memo')));
});
