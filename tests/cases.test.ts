import assert from 'node:assert/strict';
import test from 'node:test';
import { caseText, createCase, formatCaseTime, solveCase, solveOfficeFacts, solveStationFacts, validateCase } from '../src/data/cases.ts';
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

test('3,000 office jobs resolve from future use, furniture and site context', () => {
  const answers = new Map<Choice, number>(), settings = new Set<string>();
  const counts = new Map<number, Set<Choice>>();
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createCase('stage01', seed);
    assert.deepEqual(validateCase(instance), [], `office seed ${seed}`);
    assert.equal(solveCase(instance), instance.correctChoice);
    const facts = instance.facts as OfficeCaseFacts;
    answers.set(instance.correctChoice, (answers.get(instance.correctChoice) ?? 0) + 1);
    settings.add(facts.occasion);
    if (!counts.has(facts.visitorCount)) counts.set(facts.visitorCount, new Set());
    counts.get(facts.visitorCount)!.add(instance.correctChoice);
    assert.equal(instance.officeUnit, facts.roomName);
    assert.match(instance.clues[0].body, /コーヒーの染み/);
    assert.equal(instance.clues[2].body, 'コンテナには「移動式オフィス収納ユニット」と書かれている。');
    assert.match(instance.clues[4].body, /建物ごと運びます/);
    assert.ok(instance.clues[1].body.includes(facts.occasion));
    assert.equal(instance.correctChoice, { meeting: 'A', 'empty-space': 'B', 'next-site': 'C' }[facts.nextUse]);
    assert.doesNotMatch(caseText(instance), forbidden);
    for (const clue of instance.clues) {
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /まさか|予感|必要そう|正解|そういう意味/);
    }
  }
  assert.equal(settings.size, 9);
  for (const choice of choices) assert.ok((answers.get(choice) ?? 0) > 850);
  for (const answersForCount of counts.values()) assert.equal(answersForCount.size, 3, 'visitor count does not reveal the answer');
});

test('3,000 station jobs use the speaker’s past words with synchronized clocks', () => {
  const answers = new Map<Choice, number>(), outcomes = new Set<string>(), gaps = new Set<number>();
  const hours = new Map<number, Set<Choice>>();
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
    for (const record of facts.previousMeetings) assert.equal(record.arrivedMinutes - record.spokenHour * 60, plan.meetingMinutes - facts.spokenHour * 60);
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
      const outcome = plan.outcomes[choice], arrival = plan.arrivalMinutes[choice];
      if (outcome === 'meet') assert.equal(arrival, plan.meetingMinutes);
      if (outcome === 'early') assert.ok(arrival < plan.meetingMinutes);
      if (outcome === 'late-board') assert.ok(arrival > plan.meetingMinutes && arrival + plan.walkMinutes <= plan.departureMinutes);
      if (outcome === 'late') assert.ok(arrival + plan.walkMinutes > plan.departureMinutes);
    }
  }
  assert.equal(gaps.size, 4);
  assert.deepEqual(outcomes, new Set(['meet', 'early', 'late-board', 'late']));
  assert.ok(transportShortcutFailures > 500, 'bus timetable alone cannot reliably determine the promised time');
  for (const choice of choices) assert.ok((answers.get(choice) ?? 0) > 850);
  for (const answersForHour of hours.values()) assert.equal(answersForHour.size, 3, 'hour does not reveal the intended reading');
});

test('solvers reject contradictory context and validators detect altered records', () => {
  const office = createCase('stage01', 1);
  if (office.facts.kind !== 'office') throw new Error('wrong facts');
  assert.equal(solveOfficeFacts({ ...office.facts, nextUse: 'meeting', furniture: 'return-loan', site: 'stays' }), null);
  assert.equal(solveOfficeFacts({ ...office.facts, nextUse: 'next-site', furniture: 'preserve-layout', site: 'stays' }), null);
  const badOffice = structuredClone(office);
  badOffice.clues[0].body = '室内は何もない。';
  assert.ok(validateCase(badOffice).some(error => error.includes('C01 text')));
  const station = createCase('stage02', 2);
  if (station.facts.kind !== 'station') throw new Error('wrong facts');
  const facts = station.facts, plan = station.stationPlan!;
  assert.equal(solveStationFacts({ ...facts, previousMeetings: [] }, plan), null);
  const conflicting = structuredClone(facts);
  conflicting.previousMeetings[1].arrivedMinutes += 1;
  assert.equal(solveStationFacts(conflicting, plan), null);
  assert.equal(solveStationFacts(facts, { ...plan, plazaOffset: 5 }), null);
  assert.equal(solveStationFacts(facts, { ...plan, displayedChoices: { A: plan.meetingMinutes, B: plan.meetingMinutes, C: plan.meetingMinutes } }), null);
  const missing = structuredClone(station);
  if (missing.facts.kind !== 'station') throw new Error('wrong facts');
  missing.facts.previousMeetings = [];
  assert.ok(validateCase(missing).some(error => error.includes('two previous')));
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
