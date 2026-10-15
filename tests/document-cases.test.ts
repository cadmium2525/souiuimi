import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocumentCase, solveDocumentFacts, validateDocumentCase } from '../src/data/documentCases.ts';
import { createCase, solveCase, validateCase } from '../src/data/cases.ts';
import { DOCUMENT_ACTIONS, documentCondition, STAGE05 } from '../src/data/stage05.ts';
import type { Choice, DocumentCaseFacts } from '../src/game/types.ts';

const choices: Choice[] = ['A', 'B', 'C'];

test('document cases normalize finite seeds, remain deterministic, and freeze each generated instance without freezing its template', () => {
  const template = JSON.stringify(STAGE05);
  assert.deepEqual(createDocumentCase(52), createDocumentCase(52));
  assert.deepEqual(createDocumentCase(-1), createDocumentCase(4294967295));
  for (const seed of [NaN, Infinity, -Infinity]) assert.throws(() => createDocumentCase(seed), RangeError);
  const instance = createCase('stage05', 52);
  assert.deepEqual(instance, createDocumentCase(52));
  assert.equal(JSON.stringify(STAGE05), template);
  for (const value of [STAGE05, STAGE05.start, STAGE05.clues, STAGE05.copy, STAGE05.choices, STAGE05.cinematicSeconds]) assert.equal(Object.isFrozen(value), false);
  for (const value of [instance, instance.facts, instance.clues, instance.clues[0], instance.start, instance.copy, instance.documentPlan!, instance.documentPlan!.signage]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { instance.clues[0].body = 'changed'; }, TypeError);
  assert.throws(() => { instance.documentPlan!.packetId = 'different'; }, TypeError);
});

test('3,000 document cases have a unique evidence-derived A B or C answer and no ID, row, quantity or prop-presence shortcut', () => {
  const answerCounts = new Map<Choice, number>();
  const packetAnswers = new Map<string, Set<Choice>>();
  const receiptAnswers = new Map<string, Set<Choice>>();
  const destinationAnswers = new Map<string, Set<Choice>>();
  const currentRowAnswers = new Map<number, Set<Choice>>();
  const intakeRowAnswers = new Map<number, Set<Choice>>();
  const pageAnswers = new Map<number, Set<Choice>>();
  const setAnswers = new Map<number, Set<Choice>>();
  const roles = new Set<string>();
  const dates = new Set<string>();
  const uniqueFacts = new Set<string>();
  const record = <T>(map: Map<T, Set<Choice>>, key: T, answer: Choice) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(answer);
  };
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createDocumentCase(seed);
    assert.deepEqual(validateDocumentCase(instance), [], `document seed ${seed}`);
    assert.deepEqual(validateCase(instance), [], `common validator seed ${seed}`);
    assert.equal(instance.facts.kind, 'document');
    const facts = instance.facts as DocumentCaseFacts;
    const target = facts.assignments.find(row => row.date === facts.today && row.packet === facts.packetId)!;
    const intake = facts.intakes.find(row => row.receipt === target.receipt)!;
    const previous = facts.assignments.find(row => row.date !== facts.today)!;
    const independentlyExpected: Choice = intake.content === 'key-points' ? 'A' : intake.content === 'full-copy' ? 'B' : 'C';
    assert.equal(instance.correctChoice, independentlyExpected);
    assert.equal(solveDocumentFacts(facts), independentlyExpected);
    assert.equal(solveCase(instance), independentlyExpected);
    assert.equal(intake.delivery, independentlyExpected === 'A' ? 'single-page' : independentlyExpected === 'B' ? 'per-person' : 'single-load');
    assert.equal(intake.condition, documentCondition(independentlyExpected, facts.pageCount, facts.setCount));
    assert.equal(facts.assignments.length, 4);
    assert.equal(facts.intakes.length, 3);
    assert.deepEqual(new Set(facts.intakes.map(row => row.content)), new Set(['key-points', 'full-copy', 'all-originals']));
    assert.equal(previous.packet, facts.packetId);
    assert.notEqual(previous.receipt, target.receipt);
    assert.notEqual(previous.destination, target.destination);
    assert.notEqual(previous.date, facts.today);
    assert.equal(instance.clues.length, 7);
    assert.equal(instance.seconds, 120);
    assert.deepEqual(instance.cinematicSeconds, { A: 10, B: 12, C: 14 });
    assert.deepEqual(instance.start, { x: 0, z: 3 });
    assert.deepEqual(instance.evidenceChain, ['C01', 'C02', 'C03']);
    assert.deepEqual(instance.choiceIds ?? choices, choices);
    assert.equal(instance.copy.introThought, '');
    assert.ok(instance.copy.introBoss.includes(facts.packetId));
    assert.ok(instance.clues[0].body.includes(facts.today));
    for (const row of facts.assignments) assert.ok(instance.clues[1].body.includes(`${row.date}／${row.packet} → 行先${row.destination}／受付${row.receipt}`));
    for (const row of facts.intakes) assert.ok(instance.clues[2].body.includes(`受付${row.receipt}／行先${row.destination}\n${row.condition}`));
    assert.ok(instance.clues[3].body.includes(`全${facts.pageCount}ページ`));
    assert.ok(instance.clues[3].body.includes(`${facts.setCount}人分`));
    assert.ok(instance.clues[5].body.includes(previous.date));
    assert.ok(instance.clues[5].body.includes(previous.receipt));
    assert.equal(instance.clues[6].body, STAGE05.clues[6].body, 'all tools exist on every run');
    const plan = instance.documentPlan!;
    assert.equal(plan.packetId, facts.packetId);
    assert.equal(plan.pageCount, facts.pageCount);
    assert.equal(plan.setCount, facts.setCount);
    assert.equal(plan.intendedChoice, independentlyExpected);
    assert.deepEqual(Object.keys(plan.signage).sort(), ['request', 'assignments', 'intakes', 'source', 'counter', 'oldMemo', 'equipment'].sort());
    assert.ok(plan.signage.request.includes(facts.packetId));
    assert.ok(plan.signage.source.includes(`${facts.pageCount}ページ`));
    assert.ok(plan.signage.source.includes(`${facts.setCount}人`));
    for (const choice of choices) {
      const ending = instance.endings[choice];
      assert.equal(instance.choices[choice].label, DOCUMENT_ACTIONS[choice]);
      assert.ok(instance.copy[`cinematic${choice}`].includes(facts.packetId));
      assert.ok(ending.subtitle.includes(facts.packetId));
      assert.ok(ending.boss.includes(facts.packetId));
      assert.ok(ending.boss.includes(target.destination));
      assert.ok(ending.boss.includes(target.receipt));
      assert.ok(ending.explanation.includes(`${facts.packetId} → 行先${target.destination}／受付${target.receipt}`));
      assert.ok(ending.explanation.includes(intake.condition));
      if (choice !== independentlyExpected) assert.ok(ending.explanation.endsWith(`実行したのは「${DOCUMENT_ACTIONS[choice]}」だった。`));
      if (independentlyExpected === 'C') assert.ok(ending.explanation.includes('束の大きさや留め方を推理する必要はなく'));
    }
    for (const clue of instance.clues) {
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /まさか|予感|正解|思う|必要そう|今回の意図/);
    }
    answerCounts.set(independentlyExpected, (answerCounts.get(independentlyExpected) ?? 0) + 1);
    record(packetAnswers, facts.packetId, independentlyExpected);
    record(receiptAnswers, target.receipt, independentlyExpected);
    record(destinationAnswers, target.destination, independentlyExpected);
    record(currentRowAnswers, facts.assignments.indexOf(target), independentlyExpected);
    record(intakeRowAnswers, facts.intakes.indexOf(intake), independentlyExpected);
    record(pageAnswers, facts.pageCount, independentlyExpected);
    record(setAnswers, facts.setCount, independentlyExpected);
    roles.add(facts.assignments.filter(row => row.date === facts.today).sort((a, b) => a.packet.localeCompare(b.packet)).map(row => solveDocumentFacts({ ...facts, packetId: row.packet })).join(''));
    dates.add(facts.today);
    uniqueFacts.add(JSON.stringify(facts));
  }
  assert.equal(uniqueFacts.size, 3000);
  assert.equal(dates.size, 26);
  assert.equal(roles.size, 6);
  for (const choice of choices) assert.ok((answerCounts.get(choice) ?? 0) > 850);
  for (const map of [packetAnswers, receiptAnswers, destinationAnswers, currentRowAnswers, intakeRowAnswers, pageAnswers, setAnswers]) {
    for (const outcomes of map.values()) assert.deepEqual(outcomes, new Set(choices), 'IDs, row order and quantities must not identify an answer');
  }
});

test('document solvers follow relations after renaming or reordering and reject missing, duplicate or contradictory active facts', () => {
  const instance = createDocumentCase(17);
  const facts = instance.facts as DocumentCaseFacts;
  const target = facts.assignments.find(row => row.date === facts.today && row.packet === facts.packetId)!;
  const intake = facts.intakes.find(row => row.receipt === target.receipt)!;
  assert.equal(solveDocumentFacts({ ...facts, assignments: [...facts.assignments].reverse(), intakes: [...facts.intakes].reverse() }), instance.correctChoice);
  const renamed: DocumentCaseFacts = {
    ...facts, today: `new-${facts.today}`, packetId: `new-${facts.packetId}`,
    assignments: facts.assignments.map(row => ({ ...row, date: `new-${row.date}`, packet: `new-${row.packet}`, destination: `new-${row.destination}`, receipt: `new-${row.receipt}` })),
    intakes: facts.intakes.map(row => ({ ...row, destination: `new-${row.destination}`, receipt: `new-${row.receipt}` })),
  };
  // Dates keep their actual meaning; every opaque ID can change without changing the answer.
  renamed.today = facts.today;
  renamed.assignments = renamed.assignments.map((row, index) => ({ ...row, date: facts.assignments[index].date }));
  assert.equal(solveDocumentFacts(renamed), instance.correctChoice);
  assert.equal(solveDocumentFacts({ ...facts, assignments: [] }), null);
  assert.equal(solveDocumentFacts({ ...facts, assignments: [...facts.assignments, target] }), null);
  assert.equal(solveDocumentFacts({ ...facts, intakes: [] }), null);
  assert.equal(solveDocumentFacts({ ...facts, intakes: [...facts.intakes, intake] }), null);
  assert.equal(solveDocumentFacts({ ...facts, intakes: facts.intakes.map(row => row === intake ? { ...row, destination: 'different' } : row) }), null);
  assert.equal(solveDocumentFacts({ ...facts, intakes: facts.intakes.map(row => row === intake ? { ...row, delivery: row.delivery === 'single-page' ? 'per-person' : 'single-page' } : row) }), null);
  assert.equal(solveDocumentFacts({ ...facts, setCount: 0 }), null);
  assert.equal(solveDocumentFacts({ ...facts, pageCount: 1.5 }), null);
  assert.equal(solveDocumentFacts({ ...facts, today: '日付不明' }), null);
  const previous = facts.assignments.find(row => row.date !== facts.today)!;
  assert.notEqual(solveDocumentFacts({ ...facts, today: previous.date }), instance.correctChoice, 'reused packet IDs must be matched by date');
  const wrongDeclaredPlan = structuredClone(instance);
  wrongDeclaredPlan.documentPlan!.intendedChoice = choices.find(choice => choice !== instance.correctChoice)!;
  assert.equal(solveCase(wrongDeclaredPlan), instance.correctChoice, 'the solver never reads the declared cinematic intention');
});

test('document validation detects contradictory content, plan, records, dialogue, proof and action quantities', () => {
  const instance = createDocumentCase(28);
  const badPlan = structuredClone(instance);
  badPlan.documentPlan!.setCount++;
  assert.ok(validateDocumentCase(badPlan).some(error => error.includes('plan differs')));
  const badCondition = structuredClone(instance);
  if (badCondition.facts.kind !== 'document') throw new Error('wrong facts');
  badCondition.facts.intakes[0].condition = '好きな形で持ってきてください。';
  assert.ok(validateDocumentCase(badCondition).some(error => error.includes('condition text')));
  const badIntake = structuredClone(instance);
  if (badIntake.facts.kind !== 'document') throw new Error('wrong facts');
  badIntake.facts.intakes[0] = { ...badIntake.facts.intakes[1] };
  assert.ok(validateDocumentCase(badIntake).some(error => error.includes('intake purposes')));
  for (let index = 0; index < 7; index++) {
    const badText = structuredClone(instance);
    badText.clues[index].body = '記録なし';
    assert.ok(validateDocumentCase(badText).some(error => error.includes(`C0${index + 1} text`)));
  }
  const badProof = structuredClone(instance);
  badProof.endings.A.explanation = '資料番号の末尾が大きいのでAです。';
  assert.ok(validateDocumentCase(badProof).some(error => error.includes('ending A proof')));
  const badDialogue = structuredClone(instance);
  badDialogue.endings.C.boss = 'なんでもいいよ。';
  assert.ok(validateDocumentCase(badDialogue).some(error => error.includes('ending C dialogue')));
  const badAction = structuredClone(instance);
  badAction.choices.B.description = '2人分を用意する。';
  assert.ok(validateDocumentCase(badAction).some(error => error.includes('choice page or set count')));
  const badSignage = structuredClone(instance);
  badSignage.documentPlan!.signage.source = '別の資料';
  assert.ok(validateDocumentCase(badSignage).some(error => error.includes('signage differs')));
  const badThought = structuredClone(instance);
  badThought.clues[0].body += '\n嫌な予感がする。';
  assert.ok(validateDocumentCase(badThought).some(error => error.includes('observations only')));
});
