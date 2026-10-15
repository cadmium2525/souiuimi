import assert from 'node:assert/strict';
import test from 'node:test';
import { amountYen, createAmountCase, solveAmountFacts, validateAmountCase, WEAK_DEFINITION } from '../src/data/amountCases.ts';
import { createCase, solveCase, validateCase } from '../src/data/cases.ts';
import { STAGE04 } from '../src/data/stage04.ts';
import type { AmountCaseFacts, Choice } from '../src/game/types.ts';

const choices: Choice[] = ['A', 'B'];

test('amount cases normalize seeds, are deterministic, and freeze generated cases without freezing their template', () => {
  const before = JSON.stringify(STAGE04);
  assert.deepEqual(createAmountCase(44), createAmountCase(44));
  assert.deepEqual(createAmountCase(-1), createAmountCase(4294967295));
  for (const seed of [NaN, Infinity, -Infinity]) assert.throws(() => createAmountCase(seed), RangeError);
  const instance = createCase('stage04', 44);
  assert.deepEqual(instance, createAmountCase(44));
  assert.equal(JSON.stringify(STAGE04), before);
  for (const item of [STAGE04, STAGE04.choiceIds!, STAGE04.start, STAGE04.clues, STAGE04.copy, STAGE04.cinematicSeconds]) assert.equal(Object.isFrozen(item), false);
  for (const item of [instance, instance.choiceIds!, instance.facts, instance.clues[0], instance.amountPlan!, instance.amountPlan!.signage]) assert.ok(Object.isFrozen(item));
  assert.throws(() => { instance.choiceIds!.push('C'); }, TypeError);
  assert.throws(() => { instance.clues[0].body = 'changed'; }, TypeError);
  assert.throws(() => { instance.amountPlan!.requiredYen = 10000; }, TypeError);
});

test('3,000 amount cases use either intention with consistent language facts and no ID, row or candidate-amount answer shortcut', () => {
  const answerCounts = new Map<Choice, number>();
  const requestAnswers = new Map<string, Set<Choice>>();
  const speakerAnswers = new Map<string, Set<Choice>>();
  const currentRowAnswers = new Map<number, Set<Choice>>();
  const historyRowAnswers = new Map<number, Set<Choice>>();
  const lowerAnswers = new Map<number, Set<Choice>>();
  const upperAnswers = new Map<number, Set<Choice>>();
  const roles = new Set<string>();
  const uniqueFacts = new Set<string>();
  const dates = new Set<string>();
  const record = <T>(map: Map<T, Set<Choice>>, key: T, answer: Choice) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(answer);
  };
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createAmountCase(seed);
    assert.deepEqual(validateAmountCase(instance), [], `amount seed ${seed}`);
    assert.deepEqual(validateCase(instance), [], `common validator amount seed ${seed}`);
    assert.equal(instance.facts.kind, 'amount');
    const facts = instance.facts as AmountCaseFacts;
    const plan = instance.amountPlan!;
    const target = facts.requests.find(row => row.date === facts.today && row.id === facts.requestId)!;
    const previous = facts.requests.find(row => row.date !== facts.today)!;
    const history = facts.history.filter(row => row.speaker === target.speaker);
    assert.equal(solveAmountFacts(facts), instance.correctChoice);
    assert.equal(solveCase(instance), instance.correctChoice);
    assert.ok(choices.includes(instance.correctChoice));
    answerCounts.set(instance.correctChoice, (answerCounts.get(instance.correctChoice) ?? 0) + 1);
    record(requestAnswers, facts.requestId, instance.correctChoice);
    record(speakerAnswers, target.speaker, instance.correctChoice);
    record(currentRowAnswers, facts.requests.indexOf(target), instance.correctChoice);
    for (const row of history) record(historyRowAnswers, facts.history.indexOf(row), instance.correctChoice);
    record(lowerAnswers, facts.lowerYen, instance.correctChoice);
    record(upperAnswers, facts.upperYen, instance.correctChoice);
    roles.add([...facts.requests].filter(row => row.date === facts.today).sort((a, b) => a.id.localeCompare(b.id)).map(row => solveAmountFacts({ ...facts, requestId: row.id })).join(''));
    uniqueFacts.add(JSON.stringify(facts));
    dates.add(facts.today);
    assert.deepEqual(instance.choiceIds, choices);
    assert.deepEqual(instance.evidenceChain, ['C01', 'C02', 'C03']);
    assert.equal(instance.clues.length, 7);
    assert.equal(instance.seconds, 120);
    assert.deepEqual(instance.start, { x: 0, z: 3 });
    assert.equal(instance.cinematicSeconds.A, 10);
    assert.equal(instance.cinematicSeconds.B, 10);
    assert.equal(instance.copy.introThought, '');
    assert.ok(instance.copy.introBoss.includes(facts.requestId));
    assert.equal(facts.baseYen, 10000);
    assert.ok(facts.lowerYen >= 9300 && facts.lowerYen <= 9900);
    assert.ok(facts.upperYen >= 10100 && facts.upperYen <= 10700);
    assert.equal(facts.requiredYen, instance.correctChoice === 'A' ? facts.lowerYen : facts.upperYen);
    assert.equal(plan.requestId, facts.requestId);
    assert.equal(plan.requiredYen, facts.requiredYen);
    assert.equal(plan.baseYen, facts.baseYen);
    assert.equal(plan.lowerYen, facts.lowerYen);
    assert.equal(plan.upperYen, facts.upperYen);
    assert.ok(plan.signage.request.includes(facts.requestId));
    assert.ok(plan.signage.envelopes.includes(amountYen(facts.lowerYen)));
    assert.ok(plan.signage.envelopes.includes(amountYen(facts.upperYen)));
    assert.deepEqual(Object.keys(plan.signage).sort(), ['request', 'assignments', 'history', 'envelopes', 'counter', 'oldMemo', 'dictionary'].sort());
    assert.notEqual(previous.speaker, target.speaker);
    assert.equal(previous.id, facts.requestId);
    assert.notEqual(previous.date, facts.today);
    assert.equal(history.length, 2);
    assert.equal(new Set(history.map(row => row.date)).size, 2);
    for (const row of history) {
      assert.notEqual(row.baseYen, 10000, 'past records do not state the current amount');
      assert.equal(row.actualYen < row.baseYen, instance.correctChoice === 'A');
    }
    assert.ok(instance.clues[0].body.includes(facts.requestId));
    assert.ok(instance.clues[0].body.includes(facts.today));
    assert.ok(instance.clues[6].body.includes('「弱」は、基準額より少し少ない'));
    for (const row of facts.requests) assert.ok(instance.clues[1].body.includes(`${row.date}／${row.id} → 担当${row.speaker}`));
    for (const row of facts.history) assert.ok(instance.clues[2].body.includes(`${row.date}／担当${row.speaker}\n発言「${amountYen(row.baseYen)}弱」／支払実額${amountYen(row.actualYen)}`));
    for (const choice of choices) {
      const delivered = choice === 'A' ? facts.lowerYen : facts.upperYen;
      const ending = instance.endings[choice];
      assert.ok(instance.choices[choice].label.includes(amountYen(delivered)));
      assert.ok(instance.choices[choice].description.includes(amountYen(delivered)));
      assert.ok(instance.copy[`cinematic${choice}`].includes(amountYen(delivered)));
      assert.ok(instance.copy[`cinematic${choice}`].includes(facts.requestId));
      assert.ok(ending.subtitle.includes(amountYen(delivered)));
      assert.ok(ending.boss.includes(facts.requestId));
      assert.ok(ending.boss.includes(amountYen(facts.requiredYen)));
      assert.ok(ending.explanation.startsWith(WEAK_DEFINITION));
      assert.ok(ending.explanation.includes(`${facts.requestId} → 担当${target.speaker}`));
      assert.ok(ending.explanation.includes(amountYen(facts.requiredYen)));
      for (const row of history) assert.ok(ending.explanation.includes(`「${amountYen(row.baseYen)}弱」が${amountYen(row.actualYen)}`));
      if (choice !== instance.correctChoice) assert.ok(ending.explanation.includes(amountYen(Math.abs(facts.lowerYen - facts.upperYen))));
      if (instance.correctChoice === 'B') assert.ok(ending.explanation.includes('言葉本来の意味が変わったわけではない'));
    }
    if (instance.correctChoice === 'B') {
      assert.ok(instance.endings.B.boss.includes('少し超えるつもりで「弱」と言ってた'));
      assert.ok(instance.endings.A.boss.includes('君の日本語の解釈は合っている'));
    }
    for (const clue of instance.clues) {
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /まさか|予感|正解|思う|必要そう|この人は|今回の意図/);
    }
    assert.equal(instance.choices.C.label, '');
  }
  assert.equal(uniqueFacts.size, 3000);
  assert.equal(dates.size, 26);
  assert.equal(roles.size, 6);
  for (const choice of choices) assert.ok((answerCounts.get(choice) ?? 0) > 1000);
  for (const map of [requestAnswers, speakerAnswers, currentRowAnswers, historyRowAnswers, lowerAnswers, upperAnswers]) {
    for (const outcomes of map.values()) assert.deepEqual(outcomes, new Set(choices), 'identifiers, row order and candidate values must not determine the answer');
  }
});

test('amount solvers reject incomplete, duplicated, contradictory or same-day history and do not trust declared requiredYen', () => {
  const instance = createAmountCase(73);
  const facts = instance.facts as AmountCaseFacts;
  const target = facts.requests.find(row => row.date === facts.today && row.id === facts.requestId)!;
  const history = facts.history.filter(row => row.speaker === target.speaker);
  assert.equal(solveAmountFacts({ ...facts, requests: [] }), null);
  assert.equal(solveAmountFacts({ ...facts, requests: [...facts.requests, target] }), null);
  assert.equal(solveAmountFacts({ ...facts, history: facts.history.filter(row => row !== history[0]) }), null);
  assert.equal(solveAmountFacts({ ...facts, history: [...facts.history, history[0]] }), null);
  const contradict = { ...history[0], actualYen: history[0].baseYen - (history[0].actualYen - history[0].baseYen) };
  assert.equal(solveAmountFacts({ ...facts, history: facts.history.map(row => row === history[0] ? contradict : row) }), null);
  for (const changed of [
    { ...history[0], actualYen: history[0].baseYen },
    { ...history[0], date: facts.today },
    { ...history[0], date: '10月31日' },
    { ...history[0], date: '保存日不明' },
    { ...history[0], date: history[1].date },
    { ...history[0], baseYen: 0 },
    { ...history[0], actualYen: 1.5 },
  ]) assert.equal(solveAmountFacts({ ...facts, history: facts.history.map(row => row === history[0] ? changed : row) }), null);
  assert.equal(solveAmountFacts({ ...facts, requiredYen: -5 }), instance.correctChoice, 'solver infers from dated relations rather than an answer field');
});

test('amount validation detects records, definition, dialogue, amount, action and proof corruption', () => {
  const instance = createAmountCase(13);
  const badPlan = structuredClone(instance);
  badPlan.amountPlan!.requiredYen += 100;
  assert.ok(validateAmountCase(badPlan).some(error => error.includes('plan differs')));
  const badAmount = structuredClone(instance);
  if (badAmount.facts.kind !== 'amount') throw new Error('wrong facts');
  badAmount.facts.requiredYen = 10000;
  assert.ok(validateAmountCase(badAmount).some(error => error.includes('required amount')));
  for (const [index, text] of [[0, '依頼はありません'], [1, '担当者なし'], [2, '記録なし'], [3, '一万円'], [4, '別の窓口'], [5, '本日の受付'], [6, '「弱」は少し多いこと']] as const) {
    const badText = structuredClone(instance);
    badText.clues[index].body = text;
    assert.ok(validateAmountCase(badText).some(error => error.includes(`C0${index + 1} text`)));
  }
  const badProof = structuredClone(instance);
  badProof.endings.A.explanation = '一万円を超えるのも「弱」の正しい意味です。';
  assert.ok(validateAmountCase(badProof).some(error => error.includes('ending A proof')));
  const badDialogue = structuredClone(instance);
  badDialogue.endings.B.boss = '金額はどれでもいいよ。';
  assert.ok(validateAmountCase(badDialogue).some(error => error.includes('ending B dialogue')));
  const badActions = structuredClone(instance);
  badActions.choiceIds!.push('C');
  assert.ok(validateAmountCase(badActions).some(error => error.includes('exactly A and B')));
  const badChoice = structuredClone(instance);
  badChoice.choices.B.label = '適当な金額';
  assert.ok(validateAmountCase(badChoice).some(error => error.includes('choice B amount')));
  const badSignage = structuredClone(instance);
  badSignage.amountPlan!.signage.envelopes = 'A 1,000円／B 2,000円';
  assert.ok(validateAmountCase(badSignage).some(error => error.includes('signage differs')));
  const badThought = structuredClone(instance);
  badThought.clues[0].body += '\n嫌な予感がする。';
  assert.ok(validateAmountCase(badThought).some(error => error.includes('observations only')));
});
