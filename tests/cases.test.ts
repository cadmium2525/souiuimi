import assert from 'node:assert/strict';
import test from 'node:test';
import { caseText, createCase, formatCaseTime, solveCase, solveOfficeFacts, solveStationFacts, STATION_CONTEXTS, stationDocuments, validateCase } from '../src/data/cases.ts';
import { getStage } from '../src/data/stages.ts';
import type { Choice, OfficeCaseFacts, StageId } from '../src/game/types.ts';

const choices: Choice[] = ['A', 'B', 'C'];
const stageIds: StageId[] = ['stage01', 'stage02', 'stage03', 'stage04', 'stage05'];
const forbidden = /\b[A-Z]{1,3}\d{2,}\b|時計ID|基準時計|標準時より|資金区分|対応表/;

test('a seed reproduces a frozen case without changing or freezing the base script', () => {
  for (const stageId of stageIds) {
    const base = getStage(stageId), before = JSON.stringify(base);
    const first = createCase(stageId, 19), second = createCase(stageId, 19);
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.equal(JSON.stringify(base), before);
    assert.equal(Object.isFrozen(base), false);
    for (const value of [first, first.clues, first.clues[0], first.facts, first.copy, first.endings.C]) assert.ok(Object.isFrozen(value));
    assert.throws(() => { first.copy.correctChoice = 'Z'; }, TypeError);
    assert.throws(() => { first.clues[0].body = 'changed'; }, TypeError);
    assert.throws(() => { first.evidenceChain.push('missing'); }, TypeError);
  }
});

test('factory rejects invalid inputs and normalizes finite seeds to uint32', () => {
  assert.throws(() => createCase('bad' as StageId, 1), RangeError);
  for (const seed of [NaN, Infinity, -Infinity]) assert.throws(() => createCase('stage01', seed), RangeError);
  assert.deepEqual(createCase('stage01', -1), createCase('stage01', 4294967295));
});

test('3,000 office jobs combine two plausible requests with the boss’s accepted conversation', () => {
  const answers = new Map<Choice, number>(), settings = new Set<string>();
  const counts = new Map<number, Set<Choice>>();
  const cards = new Map<string, { id: string; answers: Set<Choice> }>();
  const combined = new Map<string, Set<Choice>>();
  const acceptedPeople = new Map<string, Set<Choice>>();
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createCase('stage01', seed);
    assert.deepEqual(validateCase(instance), [], `office seed ${seed}`);
    assert.equal(solveCase(instance), instance.correctChoice);
    const facts = instance.facts as OfficeCaseFacts;
    answers.set(instance.correctChoice, (answers.get(instance.correctChoice) ?? 0) + 1);
    facts.proposals.forEach(row => settings.add(row.use));
    if (!counts.has(facts.visitorCount)) counts.set(facts.visitorCount, new Set());
    counts.get(facts.visitorCount)!.add(instance.correctChoice);
    assert.equal(instance.officeUnit, facts.roomName);
    assert.match(instance.clues[0].body, /コーヒーの染み/);
    assert.equal(instance.clues[2].body, 'コンテナには「移動式オフィス収納ユニット」と書かれている。');
    assert.match(instance.clues[4].body, /建物ごと運びます/);
    assert.equal(facts.proposals.length, 2);
    assert.equal(new Set(facts.proposals.map(row => row.use)).size, 2);
    assert.equal(new Set(facts.proposals.map(row => row.person)).size, 2);
    const accepted = facts.proposals.find(row => row.person === facts.acceptedPerson)!;
    assert.equal(instance.correctChoice, { meeting: 'A', 'empty-space': 'B', 'next-site': 'C' }[accepted.use]);
    assert.ok(instance.clues[1].body.includes('田中さん「'));
    assert.ok(instance.clues[1].body.includes('佐藤さん「'));
    assert.doesNotMatch(instance.clues[1].body, /引き受ける|見送り|決まり|確定/);
    assert.ok(instance.clues[3].body.includes(`${facts.acceptedPerson}さんに、明日の件を引き受ける`));
    assert.doesNotMatch(instance.clues[3].body, /机|床|移動|移設|現場|家具|打ち合わせ/);
    if (!acceptedPeople.has(facts.acceptedPerson)) acceptedPeople.set(facts.acceptedPerson, new Set());
    acceptedPeople.get(facts.acceptedPerson)!.add(instance.correctChoice);
    for (const clue of instance.clues) {
      const key = `${clue.id}\n${clue.title}\n${clue.category}\n${clue.body}`;
      if (!cards.has(key)) cards.set(key, { id: clue.id, answers: new Set() });
      cards.get(key)!.answers.add(instance.correctChoice);
    }
    const pair = `${instance.clues[1].body}\n---\n${instance.clues[3].body}`;
    if (!combined.has(pair)) combined.set(pair, new Set());
    combined.get(pair)!.add(instance.correctChoice);
    assert.deepEqual(instance.evidenceChain, ['C02', 'C04', 'C06']);
    for (const ending of Object.values(instance.endings)) {
      assert.ok(ending.explanation.length <= 66);
      assert.equal(ending.explanation.match(/。/g)?.length, 2);
      assert.doesNotMatch(ending.explanation, /実行したのは/);
    }
    assert.doesNotMatch(caseText(instance), forbidden);
    for (const clue of instance.clues) {
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /まさか|予感|必要そう|正解|そういう意味/);
    }
  }
  assert.equal(settings.size, 3);
  for (const choice of choices) assert.ok((answers.get(choice) ?? 0) > 850);
  for (const answersForCount of counts.values()) assert.equal(answersForCount.size, 3, 'visitor count does not reveal the answer');
  for (const outcomes of acceptedPeople.values()) assert.deepEqual(outcomes, new Set(choices), 'a person’s name must not reveal the kind of work');
  for (const [text, observation] of cards) assert.equal(observation.answers.size, observation.id === 'C02' ? 2 : 3, `one complete card must leave multiple plausible answers: ${text}`);
  for (const outcomes of combined.values()) assert.equal(outcomes.size, 1, 'the accepted conversation and its intended use identify one action');
});

test('3,000 station jobs require both the boss’s bus departure and the journey duration', () => {
  const answers = new Map<Choice, number>(), outcomes = new Set<string>(), gaps = new Set<number>();
  const hours = new Map<number, Set<Choice>>();
  const cards = new Map<string, Set<Choice>>(), pairs = new Map<string, Set<Choice>>();
  let transportShortcutFailures = 0;
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createCase('stage02', seed);
    assert.deepEqual(validateCase(instance), [], `station seed ${seed}`);
    if (instance.facts.kind !== 'station') throw new Error('wrong facts');
    const facts = instance.facts, plan = instance.stationPlan!;
    assert.equal(solveStationFacts(facts, plan), instance.correctChoice);
    assert.equal(solveCase(instance), instance.correctChoice);
    answers.set(instance.correctChoice, (answers.get(instance.correctChoice) ?? 0) + 1);
    if (!hours.has(facts.spokenHour)) hours.set(facts.spokenHour, new Set());
    hours.get(facts.spokenHour)!.add(instance.correctChoice);
    assert.equal(plan.plazaOffset, 0);
    assert.equal(plan.referenceOffset, 0);
    assert.deepEqual(plan.displayedChoices, plan.arrivalMinutes);
    assert.deepEqual(choices.map(c => plan.arrivalMinutes[c] - facts.spokenHour * 60), [-10, 5, 9]);
    const chat = instance.clues.find(clue => clue.id === 'C02')!.body;
    const route = instance.clues.find(clue => clue.id === 'C04')!.body;
    assert.ok(chat.includes(formatCaseTime(facts.bossDepartureMinutes)));
    assert.doesNotMatch(chat, /所要\d+分|集合予定/);
    assert.ok(route.includes(`所要${facts.bossTravelMinutes}分`));
    assert.doesNotMatch(route, /\d{2}:\d{2}|時10分前|集合予定/);
    assert.equal(facts.bossDepartureMinutes + facts.bossTravelMinutes, plan.meetingMinutes);
    for (const clue of instance.clues) {
      const key = `${clue.id}\n${clue.title}\n${clue.category}\n${clue.body}`;
      if (!cards.has(key)) cards.set(key, new Set());
      cards.get(key)!.add(instance.correctChoice);
    }
    const pair = `${facts.spokenHour}/${chat}/${route}`;
    if (!pairs.has(pair)) pairs.set(pair, new Set());
    pairs.get(pair)!.add(instance.correctChoice);
    assert.equal(plan.deliveryOpen, plan.departureMinutes + plan.travelMinutes);
    assert.equal(plan.deliveryClose, plan.deliveryOpen + 2);
    assert.equal(plan.startMinutes, plan.arrivalMinutes.A - 3);
    assert.equal(Object.values(plan.outcomes).filter(value => value === 'meet').length, 1);
    gaps.add(plan.departureMinutes - plan.meetingMinutes);
    Object.values(plan.outcomes).forEach(outcome => outcomes.add(outcome));
    if (choices.filter(c => plan.arrivalMinutes[c] + plan.walkMinutes <= plan.departureMinutes).at(-1) !== instance.correctChoice) transportShortcutFailures++;
    assert.ok(instance.copy.introBoss.includes(`${facts.spokenHour}時10分前`));
    assert.doesNotMatch(caseText(instance), forbidden);
    for (const choice of choices) {
      assert.ok(instance.choices[choice].label.includes(formatCaseTime(plan.arrivalMinutes[choice])));
      assert.ok(instance.endings[choice].explanation.includes(formatCaseTime(plan.meetingMinutes)));
      assert.ok(instance.endings[choice].explanation.length <= 120);
      assert.equal(instance.endings[choice].explanation.match(/。/g)?.length, 2);
      assert.doesNotMatch(instance.endings[choice].explanation, /選んだ|時計のずれ/);
      const outcome = plan.outcomes[choice], arrival = plan.arrivalMinutes[choice];
      if (outcome === 'meet') assert.equal(arrival, plan.meetingMinutes);
      if (outcome === 'early') assert.ok(arrival < plan.meetingMinutes);
      if (outcome === 'late-board') assert.ok(arrival > plan.meetingMinutes && arrival + plan.walkMinutes <= plan.departureMinutes);
      if (outcome === 'late') assert.ok(arrival + plan.walkMinutes > plan.departureMinutes);
    }
  }
  assert.ok(gaps.size > 4);
  assert.deepEqual(outcomes, new Set(['meet', 'early', 'late-board', 'late']));
  assert.ok(transportShortcutFailures > 500, 'bus timetable alone cannot reliably determine the promised time');
  for (const choice of choices) assert.ok((answers.get(choice) ?? 0) > 850);
  for (const answersForHour of hours.values()) assert.equal(answersForHour.size, 3, 'hour does not reveal the intended reading');
  for (const [text, possible] of cards) if (text.startsWith('C02\n') || text.startsWith('C04\n')) assert.ok(possible.size >= 2, `one station clue must not identify the answer: ${text}`);
  for (const possible of pairs.values()) assert.equal(possible.size, 1, 'schedule and route together determine one gathering time');
});

test('every station clue stays ambiguous across the full schedule, route and bus combinations', () => {
  const base = createCase('stage02', 19);
  if (base.facts.kind !== 'station') throw new Error('wrong facts');
  const cards = new Map<string, Set<Choice>>(), pairs = new Map<string, Set<Choice>>();
  for (const context of STATION_CONTEXTS) for (const departure of [607, 611, 615, 619]) for (let travel = 8; travel <= 18; travel++) {
    const meeting = 600 - context.departureBeforeHour + context.bossTravelMinutes;
    if (meeting + 2 > departure) continue;
    const facts = { ...base.facts, spokenHour: 10, bossDepartureMinutes: 600 - context.departureBeforeHour, bossTravelMinutes: context.bossTravelMinutes, weatherMinutes: 660 };
    const plan = { ...base.stationPlan!, meetingMinutes: meeting, departureMinutes: departure, arrivalMinutes: { A: 590, B: 605, C: 609 }, displayedChoices: { A: 590, B: 605, C: 609 }, travelMinutes: travel, deliveryOpen: departure + travel, deliveryClose: departure + travel + 2 };
    const answer = solveStationFacts(facts, plan)!;
    assert.ok(choices.includes(answer));
    const bodies = stationDocuments(facts, plan);
    for (const [id, body] of Object.entries(bodies)) {
      const key = `${id}/${body}`;
      if (!cards.has(key)) cards.set(key, new Set());
      cards.get(key)!.add(answer);
    }
    const key = `${bodies.C02}/${bodies.C04}`;
    if (!pairs.has(key)) pairs.set(key, new Set());
    pairs.get(key)!.add(answer);
  }
  for (const [body, possible] of cards) assert.ok(possible.size >= 2, `single clue leaked a gathering answer: ${body}`);
  for (const possible of pairs.values()) assert.equal(possible.size, 1);
});

test('solvers reject contradictory context and validators detect altered records', () => {
  const office = createCase('stage01', 1);
  if (office.facts.kind !== 'office') throw new Error('wrong facts');
  assert.equal(solveOfficeFacts({ ...office.facts, proposals: [] }), null);
  const [first, second] = office.facts.proposals;
  assert.equal(solveOfficeFacts({ ...office.facts, proposals: [first, first] }), null);
  assert.equal(solveOfficeFacts({ ...office.facts, proposals: [first, { ...second, use: first.use }] }), null);
  assert.equal(solveOfficeFacts({ ...office.facts, proposals: [first, { ...second, occasion: '別の案件' }] }), null);
  assert.equal(solveOfficeFacts({ ...office.facts, acceptedPerson: '知らない人' as '田中' }), null);
  assert.notEqual(solveOfficeFacts({ ...office.facts, acceptedPerson: office.facts.acceptedPerson === '田中' ? '佐藤' : '田中' }), office.correctChoice, 'identical proposals can lead to another action when the other conversation is accepted');
  const badOffice = structuredClone(office);
  badOffice.clues[0].body = '室内は何もない。';
  assert.ok(validateCase(badOffice).some(error => error.includes('C01 text')));
  const station = createCase('stage02', 2);
  if (station.facts.kind !== 'station') throw new Error('wrong facts');
  const facts = station.facts, plan = station.stationPlan!;
  assert.equal(solveStationFacts({ ...facts, bossTravelMinutes: 0 }, plan), null);
  assert.equal(solveStationFacts({ ...facts, bossDepartureMinutes: facts.bossDepartureMinutes + 1 }, plan), null);
  assert.equal(solveStationFacts(facts, { ...plan, plazaOffset: 5 }), null);
  assert.equal(solveStationFacts(facts, { ...plan, displayedChoices: { A: plan.meetingMinutes, B: plan.meetingMinutes, C: plan.meetingMinutes } }), null);
  const missing = structuredClone(station);
  if (missing.facts.kind !== 'station') throw new Error('wrong facts');
  missing.facts.bossTravelMinutes = 0;
  assert.ok(validateCase(missing).some(error => error.includes('context invalid')));
  const badStation = structuredClone(station);
  badStation.stationPlan!.deliveryClose = badStation.stationPlan!.deliveryOpen - 1;
  badStation.copy.correctChoice = 'wrong';
  assert.ok(validateCase(badStation).some(error => error.includes('delivery')));
  assert.ok(validateCase(badStation).some(error => error.includes('copy answer')));
  const altered = structuredClone(station);
  altered.clues[5].body = '時計ID K39を確認する。';
  assert.ok(validateCase(altered).some(error => error.includes('C06 text')));
  assert.ok(validateCase(altered).some(error => error.includes('code lookup')));
});

test('all five cases show natural records and keep identifiers inside implementation only', () => {
  for (const stageId of stageIds) {
    assert.doesNotMatch(caseText(getStage(stageId)), forbidden);
    for (let seed = 0; seed < 60; seed++) {
      const instance = createCase(stageId, seed);
      assert.doesNotMatch(caseText(instance), forbidden);
      const plan = instance.stationPlan ?? instance.moneyPlan ?? instance.amountPlan ?? instance.documentPlan;
      if (plan?.signage) assert.doesNotMatch(Object.values(plan.signage).join('\n'), forbidden);
    }
  }
});
