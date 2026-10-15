import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocumentCase, solveDocumentFacts, validateDocumentCase } from '../src/data/documentCases.ts';
import { createCase, solveCase, validateCase } from '../src/data/cases.ts';
import { DOCUMENT_ACTIONS, DOCUMENT_EQUIPMENT, DOCUMENT_FIXTURE_FACTS, documentRecords, STAGE05 } from '../src/data/stage05.ts';
import type { Choice, DocumentCaseFacts } from '../src/game/types.ts';

const choices: Choice[] = ['A', 'B', 'C'];
const opaqueCodes = /[PDR]\d{2}|資料番号|受付番号|行先番号|受付条件|搬出表/;
const contexts: Record<Choice, Pick<DocumentCaseFacts, 'use' | 'audience' | 'originals'>> = {
  A: { use: 'short-talk', audience: 'speaker', originals: 'stay' },
  B: { use: 'individual-reading', audience: 'attendees', originals: 'stay' },
  C: { use: 'archive-transfer', audience: 'storage-staff', originals: 'transfer' },
};

test('document cases normalize finite seeds, remain deterministic, and freeze generated instances without freezing the template', () => {
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

test('3,000 document cases use a coherent job purpose, recipient and original handling with no opaque lookup codes', () => {
  const answerCounts = new Map<Choice, number>();
  const topics = new Map<string, Set<Choice>>();
  const pages = new Map<number, Set<Choice>>();
  const people = new Map<number, Set<Choice>>();
  const dates = new Map<string, Set<Choice>>();
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
    const independentlyExpected: Choice = facts.use === 'short-talk' ? 'A' : facts.use === 'individual-reading' ? 'B' : 'C';
    assert.equal(instance.correctChoice, independentlyExpected);
    assert.equal(solveDocumentFacts(facts), independentlyExpected);
    assert.equal(solveCase(instance), independentlyExpected);
    assert.deepEqual({ use: facts.use, audience: facts.audience, originals: facts.originals }, contexts[independentlyExpected]);
    assert.deepEqual(Object.keys(facts).sort(), ['kind', 'today', 'topic', 'pageCount', 'setCount', 'use', 'audience', 'originals'].sort());
    assert.equal(instance.clues.length, 7);
    assert.equal(instance.seconds, 120);
    assert.deepEqual(instance.cinematicSeconds, { A: 10, B: 12, C: 14 });
    assert.deepEqual(instance.start, { x: 0, z: 3 });
    assert.deepEqual(instance.evidenceChain, ['C02', 'C03', 'C06']);
    assert.deepEqual(instance.choiceIds ?? choices, choices);
    assert.equal(instance.copy.introThought, '');
    assert.equal(instance.copy.introBoss, `この${facts.topic}、まとめといて。午後渡せるようにね。`);
    assert.ok(instance.clues[0].body.includes(facts.today));
    const bodies = documentRecords(facts);
    for (const clue of instance.clues) {
      assert.equal(clue.body, bodies[clue.id]);
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /まさか|予感|正解|思う|必要そう|今回の意図|→|受付/);
    }
    assert.ok(instance.clues[3].body.includes(`全${facts.pageCount}ページ`));
    assert.equal(instance.clues[6].body, DOCUMENT_EQUIPMENT, 'all tools are present regardless of the intended meaning');
    if (independentlyExpected === 'A') {
      assert.ok(instance.clues[1].body.includes('説明は3分'));
      assert.ok(instance.clues[2].body.includes('配布済み'));
      assert.ok(instance.clues[2].body.includes('手元メモ'));
    } else if (independentlyExpected === 'B') {
      assert.ok(instance.clues[1].body.includes('各自の手元'));
      assert.ok(instance.clues[2].body.includes('スクリーンがない'));
      assert.ok(instance.clues[2].body.includes(`${facts.setCount}人`));
    } else {
      assert.ok(instance.clues[1].body.includes('保管場所を移転'));
      assert.ok(instance.clues[2].body.includes('原本を引き取る'));
      assert.ok(instance.clues[5].body.includes('現物を残さない'));
    }
    const plan = instance.documentPlan!;
    assert.equal(plan.packetId, facts.topic, 'the world labels the material by its name');
    assert.equal(plan.pageCount, facts.pageCount);
    assert.equal(plan.setCount, facts.setCount);
    assert.equal(plan.intendedChoice, independentlyExpected);
    assert.deepEqual(Object.keys(plan.signage).sort(), ['request', 'assignments', 'intakes', 'source', 'counter', 'oldMemo', 'equipment'].sort());
    assert.ok(plan.signage.request.includes(facts.topic));
    assert.ok(plan.signage.source.includes(`${facts.pageCount}ページ`));
    for (const choice of choices) {
      const ending = instance.endings[choice];
      assert.equal(instance.choices[choice].label, DOCUMENT_ACTIONS[choice]);
      assert.ok(instance.copy[`cinematic${choice}`].includes(facts.topic));
      assert.ok(ending.subtitle.includes(facts.topic));
      assert.ok(ending.boss.includes(facts.topic));
      assert.ok(ending.explanation.includes('今回の「まとめる」は'));
      if (choice !== independentlyExpected) assert.ok(ending.explanation.endsWith(`実行したのは「${DOCUMENT_ACTIONS[choice]}」だった。`));
      if (independentlyExpected === 'C') assert.ok(ending.explanation.includes('巨大な一束は、その作業を誇張した演出'));
    }
    assert.doesNotMatch(JSON.stringify({ clues: instance.clues, copy: instance.copy, endings: instance.endings, choices: instance.choices, signage: plan.signage }), opaqueCodes);
    answerCounts.set(independentlyExpected, (answerCounts.get(independentlyExpected) ?? 0) + 1);
    record(topics, facts.topic, independentlyExpected);
    record(pages, facts.pageCount, independentlyExpected);
    record(people, facts.setCount, independentlyExpected);
    record(dates, facts.today, independentlyExpected);
    uniqueFacts.add(JSON.stringify(facts));
  }
  assert.ok(uniqueFacts.size > 2000);
  assert.equal(dates.size, 26);
  for (const choice of choices) assert.ok((answerCounts.get(choice) ?? 0) > 850);
  for (const map of [topics, pages, people, dates]) {
    for (const outcomes of map.values()) assert.deepEqual(outcomes, new Set(choices), 'names, dates and quantities do not reveal an answer');
  }
});

test('document solvers follow job context and reject conflicting purposes, recipients and original handling', () => {
  const instance = createDocumentCase(17);
  const facts = instance.facts as DocumentCaseFacts;
  assert.equal(solveDocumentFacts({ ...facts, topic: '会議資料', today: '10月30日', pageCount: 50, setCount: 20 }), instance.correctChoice);
  for (const choice of choices) {
    const changed: DocumentCaseFacts = { ...facts, ...contexts[choice] };
    assert.equal(solveDocumentFacts(changed), choice);
    for (const other of choices.filter(value => value !== choice)) {
      assert.equal(solveDocumentFacts({ ...changed, use: contexts[other].use }), null);
      assert.equal(solveDocumentFacts({ ...changed, audience: contexts[other].audience }), null);
    }
    assert.equal(solveDocumentFacts({ ...changed, originals: changed.originals === 'stay' ? 'transfer' : 'stay' }), null);
  }
  for (const setCount of [0, -1, 1.5, NaN]) assert.equal(solveDocumentFacts({ ...facts, setCount }), null);
  for (const pageCount of [1, 0, 1.5, Infinity]) assert.equal(solveDocumentFacts({ ...facts, pageCount }), null);
  for (const today of ['日付不明', '10月32日', '10月0日']) assert.equal(solveDocumentFacts({ ...facts, today }), null);
  assert.equal(solveDocumentFacts({ ...facts, topic: ' ' }), null);
  const wrongDeclaredPlan = structuredClone(instance);
  wrongDeclaredPlan.documentPlan!.intendedChoice = choices.find(choice => choice !== instance.correctChoice)!;
  assert.equal(solveCase(wrongDeclaredPlan), instance.correctChoice, 'the solver does not read the declared cinematic intention');
});

test('document validation detects changed context, records, dialogue, proof, signage and action quantities', () => {
  const instance = createDocumentCase(28);
  const badPlan = structuredClone(instance);
  badPlan.documentPlan!.setCount++;
  assert.ok(validateDocumentCase(badPlan).some(error => error.includes('plan differs')));
  const badContext = structuredClone(instance);
  if (badContext.facts.kind !== 'document') throw new Error('wrong facts');
  badContext.facts.audience = badContext.facts.audience === 'speaker' ? 'attendees' : 'speaker';
  assert.ok(validateDocumentCase(badContext).some(error => error.includes('unique answer')));
  assert.ok(validateDocumentCase(badContext).some(error => error.includes('C03 text')));
  for (let index = 0; index < 7; index++) {
    const badText = structuredClone(instance);
    badText.clues[index].body = '記録なし';
    assert.ok(validateDocumentCase(badText).some(error => error.includes(`C0${index + 1} text`)));
  }
  const badProof = structuredClone(instance);
  badProof.endings.A.explanation = '資料の名前からAです。';
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
  const badCode = structuredClone(instance);
  badCode.copy.introBoss += '受付R99。';
  assert.ok(validateDocumentCase(badCode).some(error => error.includes('lookup codes')));
});

test('the fixed document scene also presents one job without codes or unrelated dated records', () => {
  assert.equal(solveDocumentFacts(DOCUMENT_FIXTURE_FACTS), 'C');
  assert.equal(STAGE05.copy.correctChoice, 'C');
  const bodies = documentRecords(DOCUMENT_FIXTURE_FACTS);
  for (const clue of STAGE05.clues) {
    assert.equal(clue.body, bodies[clue.id]);
    assert.doesNotMatch(clue.body, opaqueCodes);
  }
  assert.doesNotMatch(JSON.stringify(STAGE05), opaqueCodes);
  assert.doesNotMatch(STAGE05.copy.introBoss, /明日/);
});
