import assert from 'node:assert/strict';
import test from 'node:test';
import { createCase, formatCaseTime, solveCase, solveOfficeFacts, solveStationFacts, validateCase } from '../src/data/cases.ts';
import { getStage } from '../src/data/stages.ts';
import type { Choice, OfficeCaseFacts, StageId } from '../src/game/types.ts';

const choices: Choice[] = ['A', 'B', 'C'];
const actions: Record<Choice, string> = { A: '机と床を掃除する', B: '家具と備品を運び出す', C: 'オフィスを建物ごと収納する' };

test('a seed reproduces exactly the same frozen case without freezing or modifying the base script', () => {
  for (const stageId of ['stage01', 'stage02', 'stage03', 'stage04', 'stage05'] as StageId[]) {
    const base = getStage(stageId);
    const before = JSON.stringify(base);
    const first = createCase(stageId, 19);
    const second = createCase(stageId, 19);
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.equal(JSON.stringify(base), before);
    assert.equal(Object.isFrozen(base), false);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.clues));
    assert.ok(Object.isFrozen(first.clues[0]));
    assert.ok(Object.isFrozen(first.facts));
    assert.ok(Object.isFrozen(first.copy));
    assert.ok(Object.isFrozen(first.endings.C));
    assert.throws(() => { first.copy.correctChoice = 'Z'; }, TypeError);
    assert.throws(() => { first.clues[0].body = 'changed'; }, TypeError);
    assert.throws(() => { first.evidenceChain.push('missing'); }, TypeError);
    if (first.stationPlan) assert.ok(Object.isFrozen(first.stationPlan.displayedChoices));
  }
});

test('factory validates inputs and normalizes the finite seed to uint32', () => {
  assert.throws(() => createCase('bad' as StageId, 1), RangeError);
  for (const seed of [NaN, Infinity, -Infinity]) assert.throws(() => createCase('stage01', seed), RangeError);
  assert.deepEqual(createCase('stage01', -1), createCase('stage01', 4294967295));
});

test('3,000 office seeds have unique solvable contracts, consistent text and all room/contract permutations', () => {
  const answers = new Map<Choice, number>();
  const permutations = new Set<string>();
  const roomAnswers = new Map<string, Set<Choice>>();
  const contractAnswers = new Map<string, Set<Choice>>();
  const equipmentAnswers = new Set<Choice>();
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createCase('stage01', seed);
    assert.deepEqual(validateCase(instance), [], `office seed ${seed}`);
    assert.equal(solveCase(instance), instance.correctChoice);
    const facts = instance.facts as OfficeCaseFacts;
    const assignment = facts.assignments.find(row => row.unit === facts.currentUnit)!;
    const condition = facts.contracts.find(row => row.id === assignment.contract)!;
    answers.set(instance.correctChoice, (answers.get(instance.correctChoice) ?? 0) + 1);
    permutations.add([...facts.assignments].sort((a, b) => a.unit.localeCompare(b.unit)).map(row => facts.contracts.find(contract => contract.id === row.contract)!.requirement).join(''));
    if (!roomAnswers.has(facts.currentUnit)) roomAnswers.set(facts.currentUnit, new Set());
    roomAnswers.get(facts.currentUnit)!.add(instance.correctChoice);
    if (!contractAnswers.has(assignment.contract)) contractAnswers.set(assignment.contract, new Set());
    contractAnswers.get(assignment.contract)!.add(instance.correctChoice);
    equipmentAnswers.add(instance.correctChoice);
    assert.equal(instance.officeUnit, facts.currentUnit);
    assert.ok(instance.clues[0].body.includes(facts.currentUnit));
    assert.ok(instance.clues[0].body.includes(facts.today));
    assert.ok(instance.clues[0].body.includes('コーヒーの染み'));
    assert.ok(instance.clues[1].body.includes(`${facts.currentUnit}：15:00／契約 ${assignment.contract}`));
    assert.ok(instance.clues[3].body.includes(`${condition.id}：${condition.condition}`));
    assert.ok(instance.clues[2].body.includes(facts.container.unit));
    assert.ok(instance.clues[4].body.includes(facts.crane.unit));
    assert.ok(instance.clues[6].body.includes(facts.note.date));
    assert.notEqual(facts.note.date, facts.today);
    // The same assignment list, conditions and equipment can belong to any current-room answer.
    assert.deepEqual(new Set(facts.assignments.map(row => solveOfficeFacts({ ...facts, currentUnit: row.unit }))), new Set(choices));
    for (const choice of choices) {
      const ending = instance.endings[choice];
      assert.ok(ending.explanation.includes(`${facts.currentUnit} → ${assignment.contract}`));
      assert.ok(ending.explanation.includes(condition.condition));
      assert.ok(ending.explanation.includes(actions[instance.correctChoice]));
      assert.ok(ending.boss.includes(facts.currentUnit));
      if (choice !== instance.correctChoice) assert.ok(ending.explanation.includes(`実行したのは「${actions[choice]}」`));
    }
    for (const clue of instance.clues) {
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /まさか|予感|必要そう|正解|思う|そういう意味/);
    }
  }
  assert.equal(permutations.size, 6);
  for (const choice of choices) assert.ok((answers.get(choice) ?? 0) > 500);
  for (const outcomes of roomAnswers.values()) assert.equal(outcomes.size, 3, 'unit number must not encode the answer');
  for (const outcomes of contractAnswers.values()) assert.equal(outcomes.size, 3, 'contract number must not encode the answer');
  assert.equal(equipmentAnswers.size, 3);
});

test('3,000 station seeds cover both interpretations × all three answer ranks and use consistent clocks', () => {
  const systems = new Set<string>();
  const offsetAnswers = new Map<string, Set<Choice>>();
  const answers = new Map<Choice, number>();
  const departureGaps = new Set<number>();
  const weatherGaps = new Set<number>();
  const arrivalOutcomes = new Set<string>();
  let timetableShortcutFailures = 0;
  let weatherShortcutFailures = 0;
  for (let seed = 0; seed < 3000; seed++) {
    const instance = createCase('stage02', seed);
    assert.deepEqual(validateCase(instance), [], `station seed ${seed}`);
    assert.equal(instance.facts.kind, 'station');
    if (instance.facts.kind !== 'station') throw new Error('wrong facts');
    const facts = instance.facts;
    const plan = instance.stationPlan!;
    departureGaps.add(plan.departureMinutes - plan.meetingMinutes);
    weatherGaps.add(facts.weatherMinutes - plan.meetingMinutes);
    Object.values(plan.outcomes).forEach(outcome => arrivalOutcomes.add(outcome));
    const lastBefore = (minutes: number) => choices.filter(choice => plan.arrivalMinutes[choice] < minutes).at(-1);
    if (lastBefore(plan.departureMinutes) !== instance.correctChoice) timetableShortcutFailures++;
    if (lastBefore(facts.weatherMinutes) !== instance.correctChoice) weatherShortcutFailures++;
    assert.equal(solveStationFacts(facts, plan), instance.correctChoice);
    assert.equal(solveCase(instance), instance.correctChoice);
    systems.add(`${facts.interpretation}/${instance.correctChoice}`);
    answers.set(instance.correctChoice, (answers.get(instance.correctChoice) ?? 0) + 1);
    for (const key of [`plaza:${plan.plazaOffset}`, `reference:${plan.referenceOffset}`, `interpretation:${facts.interpretation}`]) {
      if (!offsetAnswers.has(key)) offsetAnswers.set(key, new Set());
      offsetAnswers.get(key)!.add(instance.correctChoice);
    }
    const expectedReference = facts.spokenHour * 60 + (facts.interpretation === 'ten-before-hour' ? -10 : 5);
    assert.equal(facts.meetingEndReference + facts.bossWalkMinutes, expectedReference);
    assert.equal(expectedReference - plan.referenceOffset, plan.meetingMinutes);
    assert.equal(plan.deliveryOpen, plan.departureMinutes + plan.travelMinutes);
    assert.equal(plan.startMinutes, Math.min(...Object.values(plan.arrivalMinutes)) - 3);
    assert.ok(plan.meetingMinutes + plan.walkMinutes < plan.departureMinutes);
    assert.ok(plan.deliveryOpen + 15 > plan.deliveryClose);
    assert.equal(Object.values(plan.outcomes).filter(value => value === 'meet').length, 1);
    assert.ok(instance.copy.introBoss.includes(`${facts.spokenHour}時10分前`));
    assert.ok(instance.copy.introBoss.includes(facts.referenceClock));
    assert.ok(instance.copy.decisionHeading.includes(facts.plazaClock));
    assert.ok(instance.copy.decisionNote.includes('選択肢は広場時計'));
    assert.ok(instance.clues[0].body.includes(facts.referenceClock));
    assert.ok(instance.clues[3].body.includes(formatCaseTime(facts.meetingEndReference)));
    assert.ok(instance.clues[5].body.includes(facts.plazaClock));
    assert.ok(instance.clues[4].body.includes(formatCaseTime(facts.weatherMinutes)));
    assert.ok(plan.signage!.weather.includes(formatCaseTime(facts.weatherMinutes)));
    assert.ok(instance.clues[1].body.includes(facts.oldMemoDate));
    assert.notEqual(facts.oldMemoDate, facts.today);
    for (const choice of choices) {
      const arrival = plan.displayedChoices[choice] - plan.plazaOffset;
      assert.equal(plan.arrivalMinutes[choice], arrival);
      assert.ok(instance.choices[choice].label.includes(formatCaseTime(plan.displayedChoices[choice])));
      assert.equal(instance.choices[choice].description, '広場の時計の表示で集合する。');
      assert.ok(instance.endings[choice].explanation.includes(formatCaseTime(expectedReference)));
      assert.ok(instance.endings[choice].explanation.includes(formatCaseTime(plan.meetingMinutes)));
      assert.ok(instance.endings[choice].explanation.includes(formatCaseTime(plan.meetingMinutes + plan.plazaOffset)));
      if (choice === instance.correctChoice) assert.equal(arrival, plan.meetingMinutes);
      else assert.ok(Math.abs(arrival - plan.meetingMinutes) >= 5 && Math.abs(arrival - plan.meetingMinutes) <= 20);
      if (plan.outcomes[choice] === 'late') {
        assert.ok(arrival > plan.departureMinutes);
        assert.ok(instance.endings[choice].explanation.includes('出発後に到着'));
      }
      if (plan.outcomes[choice] === 'early') assert.ok(instance.endings[choice].explanation.includes('待ちぼうけ'));
      if (plan.outcomes[choice] === 'late-board') {
        assert.ok(arrival > plan.meetingMinutes && arrival + plan.walkMinutes <= plan.departureMinutes);
        assert.notEqual(choice, instance.correctChoice, 'catching a bus is not the promised gathering time');
        assert.ok(instance.endings[choice].explanation.includes('便には間に合った'));
      }
    }
    for (const clue of instance.clues) {
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.doesNotMatch(clue.body, /正解|まさか|予感|必要そう/);
    }
  }
  assert.equal(systems.size, 6);
  assert.equal(departureGaps.size, 5, 'bus departure must not be a fixed offset from the answer');
  assert.ok(weatherGaps.size > 50, 'forecast must not be a fixed offset from the answer');
  assert.deepEqual(arrivalOutcomes, new Set(['meet', 'early', 'late', 'late-board']));
  assert.ok(timetableShortcutFailures > 500, 'latest candidate before departure must not always identify the gathering');
  assert.ok(weatherShortcutFailures > 1000, 'latest candidate before rain must not always identify the gathering');
  for (const outcomes of offsetAnswers.values()) assert.equal(outcomes.size, 3, 'clock shift / interpretation must not encode a choice');
  for (const choice of choices) assert.ok((answers.get(choice) ?? 0) > 500);
});

test('solvers reject missing/duplicate relations and validators identify contradictory worlds', () => {
  const office = createCase('stage01', 1);
  const officeFacts = office.facts as OfficeCaseFacts;
  const current = officeFacts.assignments.find(row => row.unit === officeFacts.currentUnit)!;
  assert.equal(solveOfficeFacts({ ...officeFacts, assignments: [] }), null);
  assert.equal(solveOfficeFacts({ ...officeFacts, assignments: [...officeFacts.assignments, current] }), null);
  assert.equal(solveOfficeFacts({ ...officeFacts, contracts: [] }), null);
  const badOffice = structuredClone(office);
  if (badOffice.facts.kind !== 'office') throw new Error('wrong facts');
  badOffice.facts.crane.unit = 'not-a-room';
  assert.ok(validateCase(badOffice).some(error => error.includes('equipment')));
  const wrongOfficeText = structuredClone(office);
  wrongOfficeText.clues[0].body = '現在の部屋：存在しない部屋';
  assert.ok(validateCase(wrongOfficeText).some(error => error.includes('C01 text')));
  const station = createCase('stage02', 2);
  if (station.facts.kind !== 'station') throw new Error('wrong facts');
  const plan = station.stationPlan!;
  assert.equal(solveStationFacts(station.facts, { ...plan, displayedChoices: { A: plan.meetingMinutes + plan.plazaOffset, B: plan.meetingMinutes + plan.plazaOffset, C: plan.meetingMinutes + plan.plazaOffset } }), null);
  const badStation = structuredClone(station);
  badStation.stationPlan!.deliveryClose = badStation.stationPlan!.deliveryOpen - 1;
  badStation.copy.correctChoice = 'wrong';
  const errors = validateCase(badStation);
  assert.ok(errors.some(error => error.includes('delivery')));
  assert.ok(errors.some(error => error.includes('copy answer')));
  const wrongStationText = structuredClone(station);
  wrongStationText.clues[5].body = '広場の時計は、標準時より99分進む。';
  assert.ok(validateCase(wrongStationText).some(error => error.includes('C06 text')));
});
