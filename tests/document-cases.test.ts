import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocumentCase, documentProof, DOCUMENT_CONTEXTS, solveDocumentFacts, validateDocumentCase } from '../src/data/documentCases.ts';
import { createCase, solveCase, validateCase } from '../src/data/cases.ts';
import { DOCUMENT_ACTIONS, DOCUMENT_EQUIPMENT, DOCUMENT_FIXTURE_FACTS, documentRecords, STAGE05 } from '../src/data/stage05.ts';
import type { Choice, DocumentCaseFacts } from '../src/game/types.ts';

const choices: Choice[] = ['A', 'B', 'C'];
const opaqueCodes = /[PDR]\d{2}|資料番号|受付番号|行先番号|受付条件|搬出表/;
const base: DocumentCaseFacts = { kind: 'document', today: '10月15日', topic: '研修資料', pageCount: 240, setCount: 6, ...DOCUMENT_CONTEXTS[0] };
const expected = (facts: DocumentCaseFacts): Choice => facts.meeting === 'upcoming'
  ? facts.distribution === 'sent' ? 'A' : 'B'
  : facts.record === 'master-annotations' ? 'C' : 'A';
const add = <T>(map: Map<T, Set<Choice>>, key: T, answer: Choice) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(answer);
};

test('document cases normalize seeds, remain deterministic and freeze generated instances without freezing templates', () => {
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

test('no single full document clue, title or world sign identifies an answer across the eight coherent situations', () => {
  assert.equal(DOCUMENT_CONTEXTS.length, 8);
  const clueProjections = new Map<string, Map<string, Set<Choice>>>();
  const jointProjections = new Map<string, Set<Choice>>();
  const answers = new Set<Choice>();
  for (const context of DOCUMENT_CONTEXTS) {
    const facts = { ...base, ...context };
    const answer = solveDocumentFacts(facts)!;
    answers.add(answer);
    const records = documentRecords(facts);
    for (const clue of STAGE05.clues) {
      if (!clueProjections.has(clue.id)) clueProjections.set(clue.id, new Map());
      add(clueProjections.get(clue.id)!, JSON.stringify({ title: clue.title, category: clue.category, body: records[clue.id] }), answer);
    }
    add(jointProjections, JSON.stringify([records.C02, records.C03, records.C06]), answer);
    const decisivePair = facts.meeting === 'upcoming' ? [records.C02, records.C03] : [records.C02, records.C06];
    const compatibleAnswers = new Set(DOCUMENT_CONTEXTS.filter(other => {
      const candidate = documentRecords({ ...base, ...other });
      return facts.meeting === 'upcoming'
        ? candidate.C02 === decisivePair[0] && candidate.C03 === decisivePair[1]
        : candidate.C02 === decisivePair[0] && candidate.C06 === decisivePair[1];
    }).map(other => expected({ ...base, ...other })));
    assert.deepEqual(compatibleAnswers, new Set([answer]), 'timing and a second factual record determine the answer');
  }
  assert.deepEqual(answers, new Set(choices));
  for (const [id, observedValues] of clueProjections) {
    for (const compatible of observedValues.values()) assert.ok(compatible.size >= 2, `${id} must not reveal one answer on its own`);
  }
  for (const compatible of jointProjections.values()) assert.equal(compatible.size, 1, 'the complete observations are consistent');
  // A written-on original also occurs before a meeting, where participants need copies.
  const annotatedBefore = { ...base, meeting: 'upcoming' as const, distribution: 'pending' as const, record: 'master-annotations' as const };
  assert.equal(solveDocumentFacts(annotatedBefore), 'B');
  assert.equal(solveDocumentFacts({ ...annotatedBefore, meeting: 'finished' }), 'C');
  // A participant who already has the full text can still imply either a summary or the original records.
  assert.equal(solveDocumentFacts({ ...base, meeting: 'upcoming', distribution: 'sent', record: 'master-annotations' }), 'A');
  assert.equal(solveDocumentFacts({ ...base, meeting: 'finished', distribution: 'sent', record: 'master-annotations' }), 'C');
});

test('3,000 document cases combine timing with distribution or record location and preserve all three action animations', () => {
  const answerCounts = new Map<Choice, number>();
  const topics = new Map<string, Set<Choice>>();
  const pages = new Map<number, Set<Choice>>();
  const people = new Map<number, Set<Choice>>();
  const dates = new Map<string, Set<Choice>>();
  const contexts = new Set<string>();
  const uniqueFacts = new Set<string>();
  const signs = new Map<string, Set<Choice>>();
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createDocumentCase(seed);
    assert.deepEqual(validateDocumentCase(instance), [], `document seed ${seed}`);
    assert.deepEqual(validateCase(instance), [], `common validator seed ${seed}`);
    assert.equal(instance.facts.kind, 'document');
    const facts = instance.facts as DocumentCaseFacts;
    const answer = expected(facts);
    assert.equal(instance.correctChoice, answer);
    assert.equal(solveDocumentFacts(facts), answer);
    assert.equal(solveCase(instance), answer);
    assert.deepEqual(Object.keys(facts).sort(), ['kind', 'today', 'topic', 'pageCount', 'setCount', 'meeting', 'distribution', 'record'].sort());
    assert.equal(instance.clues.length, 7);
    assert.equal(instance.seconds, 120);
    assert.deepEqual(instance.cinematicSeconds, { A: 10, B: 12, C: 14 });
    assert.deepEqual(instance.start, { x: 0, z: 3 });
    assert.deepEqual(instance.evidenceChain, ['C02', 'C03', 'C06']);
    assert.deepEqual(instance.choiceIds ?? choices, choices);
    assert.equal(instance.copy.introThought, '');
    assert.equal(instance.copy.introBoss, `この${facts.topic}、まとめといて。午後渡せるようにね。`);
    const bodies = documentRecords(facts);
    for (const clue of instance.clues) {
      assert.equal(clue.body, bodies[clue.id]);
      assert.equal(clue.title, STAGE05.clues.find(source => source.id === clue.id)!.title);
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /まさか|予感|正解|思う|必要そう|今回の意図|→|受付/);
    }
    assert.ok(instance.clues[3].body.includes(`全${facts.pageCount}ページ`));
    assert.equal(instance.clues[6].body, DOCUMENT_EQUIPMENT);
    const plan = instance.documentPlan!;
    assert.equal(plan.packetId, facts.topic);
    assert.equal(plan.pageCount, facts.pageCount);
    assert.equal(plan.setCount, facts.setCount);
    assert.equal(plan.intendedChoice, answer);
    assert.deepEqual(Object.keys(plan.signage).sort(), ['request', 'assignments', 'intakes', 'source', 'counter', 'oldMemo', 'equipment'].sort());
    assert.equal(plan.signage.assignments, '検討会の予定');
    assert.equal(plan.signage.intakes, '資料の送付記録');
    assert.equal(plan.signage.oldMemo, '担当者の確認メモ');
    // All context-dependent facts stay inside inspection, not on a scene label.
    add(signs, JSON.stringify(plan.signage), answer);
    for (const choice of choices) {
      const ending = instance.endings[choice];
      assert.equal(instance.choices[choice].label, DOCUMENT_ACTIONS[choice]);
      assert.ok(instance.copy[`cinematic${choice}`].includes(facts.topic));
      assert.ok(ending.subtitle.includes(facts.topic));
      assert.ok(ending.boss.includes(facts.topic));
      assert.ok(ending.explanation.length <= 66);
      assert.equal(ending.explanation.match(/。/g)?.length, 2);
      assert.equal(ending.explanation, documentProof(facts));
    }
    assert.doesNotMatch(JSON.stringify({ clues: instance.clues, copy: instance.copy, endings: instance.endings, choices: instance.choices, signage: plan.signage }), opaqueCodes);
    answerCounts.set(answer, (answerCounts.get(answer) ?? 0) + 1);
    add(topics, facts.topic, answer);
    add(pages, facts.pageCount, answer);
    add(people, facts.setCount, answer);
    add(dates, facts.today, answer);
    contexts.add(JSON.stringify({ meeting: facts.meeting, distribution: facts.distribution, record: facts.record }));
    uniqueFacts.add(JSON.stringify(facts));
  }
  assert.equal(contexts.size, 8);
  assert.ok(uniqueFacts.size > 2500);
  assert.equal(dates.size, 26);
  assert.ok((answerCounts.get('A') ?? 0) > 1300);
  for (const answer of ['B', 'C'] as Choice[]) assert.ok((answerCounts.get(answer) ?? 0) > 600);
  for (const map of [topics, pages, people, dates]) {
    for (const outcomes of map.values()) assert.deepEqual(outcomes, new Set(choices), 'names, dates and quantities do not reveal an answer');
  }
  // Fix nuisance fields to compare a full visible label for all authored contexts.
  const fixedLabels = new Map<string, Set<Choice>>();
  for (const context of DOCUMENT_CONTEXTS) {
    const facts = { ...base, ...context };
    add(fixedLabels, `${facts.today}\n${facts.topic}\n上司のチャット|検討会の予定|資料の送付記録|原本 ${facts.pageCount}ページ|担当者の確認メモ`, expected(facts));
  }
  for (const compatible of fixedLabels.values()) assert.deepEqual(compatible, new Set(choices));
});

test('document solvers use the relevant pair of observations and reject invalid factual domains', () => {
  for (const context of DOCUMENT_CONTEXTS) {
    const facts = { ...base, ...context };
    assert.equal(solveDocumentFacts(facts), expected(facts));
    assert.equal(solveDocumentFacts({ ...facts, topic: '会議資料', today: '10月30日', pageCount: 50, setCount: 20 }), expected(facts));
    if (facts.meeting === 'upcoming') {
      assert.equal(solveDocumentFacts({ ...facts, record: facts.record === 'master-annotations' ? 'separate-minutes' : 'master-annotations' }), expected(facts));
    } else {
      assert.equal(solveDocumentFacts({ ...facts, distribution: facts.distribution === 'sent' ? 'pending' : 'sent' }), expected(facts));
    }
  }
  for (const setCount of [0, -1, 1.5, NaN]) assert.equal(solveDocumentFacts({ ...base, setCount }), null);
  for (const pageCount of [1, 0, 1.5, Infinity]) assert.equal(solveDocumentFacts({ ...base, pageCount }), null);
  for (const today of ['日付不明', '10月32日', '10月0日']) assert.equal(solveDocumentFacts({ ...base, today }), null);
  for (const field of ['meeting', 'distribution', 'record']) assert.equal(solveDocumentFacts({ ...base, [field]: 'unknown' }), null);
  assert.equal(solveDocumentFacts({ ...base, topic: ' ' }), null);
  const instance = createDocumentCase(17);
  const wrongDeclaredPlan = structuredClone(instance);
  wrongDeclaredPlan.documentPlan!.intendedChoice = choices.find(choice => choice !== instance.correctChoice)!;
  assert.equal(solveCase(wrongDeclaredPlan), instance.correctChoice, 'the solver does not read the declared cinematic intention');
});

test('document validation detects altered evidence, dialogue, proof, signage and quantities', () => {
  const instance = createDocumentCase(28);
  const badPlan = structuredClone(instance);
  badPlan.documentPlan!.setCount++;
  assert.ok(validateDocumentCase(badPlan).some(error => error.includes('plan differs')));
  const badContext = structuredClone(instance);
  if (badContext.facts.kind !== 'document') throw new Error('wrong facts');
  badContext.facts.meeting = badContext.facts.meeting === 'upcoming' ? 'finished' : 'upcoming';
  assert.ok(validateDocumentCase(badContext).some(error => error.includes('C02 text')));
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
  badSignage.documentPlan!.signage.assignments = '原本を全量移転';
  assert.ok(validateDocumentCase(badSignage).some(error => error.includes('signage differs')));
  const badThought = structuredClone(instance);
  badThought.clues[0].body += '\n嫌な予感がする。';
  assert.ok(validateDocumentCase(badThought).some(error => error.includes('observations only')));
  const badCode = structuredClone(instance);
  badCode.copy.introBoss += '受付R99。';
  assert.ok(validateDocumentCase(badCode).some(error => error.includes('lookup codes')));
});

test('the fixed document scene follows the same combined-evidence rule without codes', () => {
  assert.equal(solveDocumentFacts(DOCUMENT_FIXTURE_FACTS), 'C');
  assert.equal(STAGE05.copy.correctChoice, 'C');
  const bodies = documentRecords(DOCUMENT_FIXTURE_FACTS);
  for (const clue of STAGE05.clues) {
    assert.equal(clue.body, bodies[clue.id]);
    assert.doesNotMatch(clue.body, opaqueCodes);
  }
  assert.equal(STAGE05.endings.C.explanation, documentProof(DOCUMENT_FIXTURE_FACTS));
  assert.doesNotMatch(JSON.stringify(STAGE05), opaqueCodes);
  assert.doesNotMatch(STAGE05.copy.introBoss, /明日/);
});
