import assert from 'node:assert/strict';
import test from 'node:test';
import { amountYen, createAmountCase, solveAmountFacts, validateAmountCase, WEAK_DEFINITION } from '../src/data/amountCases.ts';
import { caseText, createCase, solveCase, validateCase } from '../src/data/cases.ts';
import { STAGE04 } from '../src/data/stage04.ts';
import type { AmountCaseFacts, Choice } from '../src/game/types.ts';

const choices: Choice[] = ['A', 'B'];
const forbidden = /\b[A-Z]{1,3}\d{2,}\b|依頼番号|担当表|担当者|担当記録|資金区分|対応表|時計ID/;

test('amount cases normalize seeds, are deterministic, and freeze generated cases without freezing their template', () => {
  const before = JSON.stringify(STAGE04);
  assert.deepEqual(createAmountCase(44), createAmountCase(44));
  assert.deepEqual(createAmountCase(-1), createAmountCase(4294967295));
  for (const seed of [NaN, Infinity, -Infinity]) assert.throws(() => createAmountCase(seed), RangeError);
  const instance = createCase('stage04', 44);
  assert.deepEqual(instance, createAmountCase(44));
  assert.equal(JSON.stringify(STAGE04), before);
  for (const item of [STAGE04, STAGE04.choiceIds!, STAGE04.start, STAGE04.clues, STAGE04.copy, STAGE04.cinematicSeconds]) assert.equal(Object.isFrozen(item), false);
  for (const item of [instance, instance.choiceIds!, instance.facts, (instance.facts as AmountCaseFacts).history, (instance.facts as AmountCaseFacts).history[0], instance.clues[0], instance.amountPlan!, instance.amountPlan!.signage]) assert.ok(Object.isFrozen(item));
  assert.throws(() => { instance.choiceIds!.push('C'); }, TypeError);
  assert.throws(() => { instance.clues[0].body = 'changed'; }, TypeError);
  assert.throws(() => { instance.amountPlan!.requiredYen = 10000; }, TypeError);
  assert.doesNotMatch(caseText(STAGE04), forbidden, 'original fixture is natural prose too');
});

test('3,000 amount cases combine a past request and approved receipt without repeated hints', () => {
  const answerCounts = new Map<Choice, number>();
  const purposeAnswers = new Map<string, Set<Choice>>();
  const occasionAnswers = new Map<string, Set<Choice>>();
  const lowerAnswers = new Map<number, Set<Choice>>();
  const upperAnswers = new Map<number, Set<Choice>>();
  const uniqueFacts = new Set<string>(), dates = new Set<string>();
  const record = <T>(map: Map<T, Set<Choice>>, key: T, answer: Choice) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(answer);
  };
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createAmountCase(seed);
    assert.deepEqual(validateAmountCase(instance), [], `amount seed ${seed}`);
    assert.deepEqual(validateCase(instance), [], `common validator amount seed ${seed}`);
    assert.equal(instance.facts.kind, 'amount');
    const facts = instance.facts as AmountCaseFacts, plan = instance.amountPlan!;
    assert.equal(solveAmountFacts(facts), instance.correctChoice);
    assert.equal(solveCase(instance), instance.correctChoice);
    assert.ok(choices.includes(instance.correctChoice));
    answerCounts.set(instance.correctChoice, (answerCounts.get(instance.correctChoice) ?? 0) + 1);
    record(purposeAnswers, facts.purpose, instance.correctChoice);
    for (const row of facts.history) record(occasionAnswers, row.occasion, instance.correctChoice);
    record(lowerAnswers, facts.lowerYen, instance.correctChoice);
    record(upperAnswers, facts.upperYen, instance.correctChoice);
    uniqueFacts.add(JSON.stringify(facts)); dates.add(facts.today);
    assert.equal(facts.speakerName, '部長');
    assert.equal(Object.hasOwn(facts, 'requests'), false);
    assert.equal(Object.hasOwn(facts, 'requestId'), false);
    assert.deepEqual(instance.choiceIds, choices);
    assert.deepEqual(instance.evidenceChain, ['C02', 'C03']);
    assert.equal(instance.clues.length, 7); assert.equal(instance.seconds, 120);
    assert.deepEqual(instance.start, { x: 0, z: 3 });
    assert.equal(instance.cinematicSeconds.A, 10); assert.equal(instance.cinematicSeconds.B, 10);
    assert.equal(instance.copy.introThought, '');
    assert.equal(instance.copy.introBoss, `今日の${facts.purpose}、1万円弱を封筒に入れて持ってきて。`);
    assert.equal(facts.baseYen, 10000);
    assert.ok(facts.lowerYen >= 9300 && facts.lowerYen <= 9900);
    assert.ok(facts.upperYen >= 10100 && facts.upperYen <= 10700);
    assert.equal(facts.requiredYen, instance.correctChoice === 'A' ? facts.lowerYen : facts.upperYen);
    assert.equal(plan.requestId, facts.purpose, '3D API carries a readable purpose, never a request code');
    for (const key of ['requiredYen', 'baseYen', 'lowerYen', 'upperYen'] as const) assert.equal(plan[key], facts[key]);
    assert.ok(plan.signage.request.includes(facts.purpose));
    assert.ok(plan.signage.envelopes.includes(amountYen(facts.lowerYen)));
    assert.ok(plan.signage.envelopes.includes(amountYen(facts.upperYen)));
    assert.deepEqual(Object.keys(plan.signage).sort(), ['request', 'assignments', 'history', 'envelopes', 'counter', 'oldMemo', 'dictionary'].sort());
    assert.equal(facts.history.length, 1);
    const row = facts.history[0], request = instance.clues[1], receipt = instance.clues[2];
    assert.notEqual(row.baseYen, 10000, 'the past request does not reveal the current amount');
    assert.equal(row.actualYen < row.baseYen, instance.correctChoice === 'A');
    assert.equal(request.title, `${row.occasion}のチャット`);
    assert.equal(request.body, `${row.occasion}のチャット\n部長「${amountYen(row.baseYen)}弱を持ってきて」`);
    assert.equal(receipt.title, '立替金の受取控え');
    assert.ok(receipt.body.includes(row.occasion));
    assert.ok(receipt.body.includes(`受取額：${amountYen(row.actualYen)}`));
    assert.ok(receipt.body.includes('部長「この金額でお願いします」'));
    assert.ok(!request.body.includes(amountYen(row.actualYen)), 'request alone does not reveal the approved amount');
    assert.doesNotMatch(receipt.body, /弱|持ってきて/, 'receipt contributes the actual amount, without repeating the request');
    assert.ok(instance.clues[0].body.includes(facts.purpose));
    assert.ok(instance.clues[0].body.includes(facts.today));
    assert.ok(instance.clues[6].body.includes('「弱」は、基準額より少し少ない'));
    for (const choice of choices) {
      const delivered = choice === 'A' ? facts.lowerYen : facts.upperYen, ending = instance.endings[choice];
      assert.ok(instance.choices[choice].label.includes(amountYen(delivered)));
      assert.ok(instance.choices[choice].description.includes(amountYen(delivered)));
      assert.ok(instance.copy[`cinematic${choice}`].includes(amountYen(delivered)));
      assert.ok(instance.copy[`cinematic${choice}`].includes(facts.purpose));
      assert.ok(ending.subtitle.includes(amountYen(delivered)));
      assert.ok(ending.boss.includes(facts.purpose));
      assert.ok(ending.boss.includes(amountYen(facts.requiredYen)));
      assert.ok(ending.explanation.startsWith(WEAK_DEFINITION));
      assert.ok(ending.explanation.includes(amountYen(facts.requiredYen)));
      assert.ok(ending.explanation.length <= 120, 'explanation remains brief on a phone');
      assert.equal(ending.explanation.split('。').filter(Boolean).length, 2);
      assert.ok(!ending.explanation.includes(row.occasion), 'full evidence remains in the optional review');
    }
    if (instance.correctChoice === 'B') {
      assert.ok(instance.endings.B.boss.includes('少し超えるつもりで「弱」と言ってた'));
      assert.ok(instance.endings.A.boss.includes('君の日本語の解釈は合っている'));
    }
    assert.doesNotMatch(caseText(instance), forbidden);
    assert.doesNotMatch(Object.values(plan.signage).join('\n'), forbidden);
    for (const clue of instance.clues) {
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /まさか|予感|正解|思う|必要そう|この人は|今回の意図/);
    }
    assert.equal(instance.choices.C.label, '');
  }
  assert.ok(uniqueFacts.size > 2900, 'separate seeds still produce varied requests'); assert.equal(dates.size, 26);
  for (const choice of choices) assert.ok((answerCounts.get(choice) ?? 0) > 1000);
  for (const map of [purposeAnswers, occasionAnswers, lowerAnswers, upperAnswers]) {
    for (const outcomes of map.values()) assert.deepEqual(outcomes, new Set(choices), 'purpose, occasion and candidate amounts must not determine the answer');
  }
});

test('amount solver requires one valid request/receipt event and ignores declared requiredYen', () => {
  const instance = createAmountCase(73), facts = instance.facts as AmountCaseFacts;
  const [first] = facts.history;
  assert.equal(solveAmountFacts({ ...facts, history: [] }), null);
  assert.equal(solveAmountFacts({ ...facts, history: [first] }), instance.correctChoice);
  assert.equal(solveAmountFacts({ ...facts, history: [...facts.history, first] }), null);
  const opposite = { ...first, actualYen: first.baseYen - (first.actualYen - first.baseYen) };
  assert.notEqual(solveAmountFacts({ ...facts, history: [opposite] }), instance.correctChoice);
  for (const changed of [
    { ...first, actualYen: first.baseYen }, { ...first, occasion: '' },
    { ...first, baseYen: 0 }, { ...first, actualYen: 1.5 },
  ]) assert.equal(solveAmountFacts({ ...facts, history: [changed] }), null);
  assert.equal(solveAmountFacts({ ...facts, speakerName: '知らない人' }), null);
  assert.equal(solveAmountFacts({ ...facts, requiredYen: -5 }), instance.correctChoice, 'the boss’s actual past usage determines the intended side');
});

test('amount validation detects prose, definition, dialogue, amount, action and proof corruption', () => {
  const instance = createAmountCase(13);
  const badPlan = structuredClone(instance); badPlan.amountPlan!.requiredYen += 100;
  assert.ok(validateAmountCase(badPlan).some(error => error.includes('plan differs')));
  const badPurpose = structuredClone(instance); badPurpose.amountPlan!.requestId = 'R17';
  assert.ok(validateAmountCase(badPurpose).some(error => error.includes('plan differs')));
  const badAmount = structuredClone(instance);
  if (badAmount.facts.kind !== 'amount') throw new Error('wrong facts');
  badAmount.facts.requiredYen = 10000;
  assert.ok(validateAmountCase(badAmount).some(error => error.includes('required amount')));
  for (const [index, text] of [[0, '頼みはありません'], [1, '部長との会話なし'], [2, '記録なし'], [3, '一万円'], [4, '別の窓口'], [5, '経理からの連絡なし'], [6, '「弱」は少し多いこと']] as const) {
    const badText = structuredClone(instance); badText.clues[index].body = text;
    assert.ok(validateAmountCase(badText).some(error => error.includes(`C0${index + 1} text`)));
  }
  const badProof = structuredClone(instance); badProof.endings.A.explanation = '一万円を超えるのも「弱」の正しい意味です。';
  assert.ok(validateAmountCase(badProof).some(error => error.includes('ending A proof')));
  const badDialogue = structuredClone(instance); badDialogue.endings.B.boss = '金額はどれでもいいよ。';
  assert.ok(validateAmountCase(badDialogue).some(error => error.includes('ending B dialogue')));
  const badActions = structuredClone(instance); badActions.choiceIds!.push('C');
  assert.ok(validateAmountCase(badActions).some(error => error.includes('exactly A and B')));
  const badChoice = structuredClone(instance); badChoice.choices.B.label = '適当な金額';
  assert.ok(validateAmountCase(badChoice).some(error => error.includes('choice B amount')));
  const badSignage = structuredClone(instance); badSignage.amountPlan!.signage.envelopes = 'A 1,000円／B 2,000円';
  assert.ok(validateAmountCase(badSignage).some(error => error.includes('signage differs')));
  const badThought = structuredClone(instance); badThought.clues[0].body += '\n嫌な予感がする。';
  assert.ok(validateAmountCase(badThought).some(error => error.includes('observations only')));
  const badCode = structuredClone(instance); badCode.clues[1].body += '\n依頼番号R17';
  assert.ok(validateAmountCase(badCode).some(error => error.includes('administrative code')));
});
