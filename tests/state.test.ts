import assert from 'node:assert/strict';
import test from 'node:test';
import { GameState } from '../src/game/state.ts';
import { CLUES, ENDINGS } from '../src/data/stage01.ts';
import { getStage, STAGE_LIST } from '../src/data/stages.ts';
import type { Choice, StageId } from '../src/game/types.ts';

function exploring(): GameState {
  const state = new GameState({ fixed: true });
  assert.equal(state.start(), true);
  assert.equal(state.explore(), true);
  return state;
}

test('the introduction must be completed before exploration can advance', () => {
  const state = new GameState({ fixed: true });
  assert.equal(state.sound, false);
  assert.equal(state.remaining, 120);
  assert.equal(state.explore(), false);
  assert.equal(state.inspect('C01'), false);
  assert.equal(state.choose('C'), false);
  state.tick(120);
  assert.equal(state.phase, 'TITLE');
  assert.equal(state.start(), true);
  assert.equal(state.start(), false);
  assert.equal(state.explore(), true);
  assert.equal(state.explore(), false);
});

test('inspection pauses exploration, validates IDs and counts repeat clues once', () => {
  const state = exploring();
  assert.equal(state.inspect('not-a-clue'), false);
  state.tick(12);
  assert.equal(state.inspect('C01'), true);
  assert.equal(state.inspect('C02'), false);
  state.tick(60);
  assert.equal(state.remaining, 108);
  assert.equal(state.inspected, 'C01');
  assert.deepEqual(state.found, ['C01']);
  assert.equal(state.close(), true);
  assert.equal(state.close(), false);
  assert.equal(state.inspected, null);
  state.inspect('C01');
  assert.deepEqual(state.found, ['C01']);
});

test('all seven clues can be discovered in an arbitrary order', () => {
  const state = exploring();
  for (const clue of [...CLUES].reverse()) {
    assert.equal(state.inspect(clue.id), true);
    state.close();
  }
  assert.equal(state.found.length, 7);
  assert.equal(new Set(state.found).size, 7);
});

test('clue records preserve the evidence without supplying the protagonist interpretation', () => {
  for (const clue of CLUES) assert.equal(Object.hasOwn(clue, 'thought'), false);
  assert.equal(CLUES.find((clue) => clue.id === 'C01')?.body, '机の上には紙くずとコーヒーの染みがある。');
  assert.equal(CLUES.find((clue) => clue.id === 'C03')?.body, 'コンテナには『移動式オフィス収納ユニット』と書かれている。');
  assert.equal(CLUES.find((clue) => clue.id === 'C07')?.body, '『中身だけじゃなく、箱まで頼む！』');
});

test('menu, journal and hidden tabs pause time and resume without charging paused time', () => {
  const state = exploring();
  state.tick(5);
  state.tick(120, false);
  assert.equal(state.remaining, 115);
  assert.equal(state.openMenu(), true);
  assert.equal(state.openMenu(), false);
  state.tick(90);
  assert.equal(state.remaining, 115);
  state.close();
  assert.equal(state.openJournal(), true);
  assert.equal(state.openJournal(), false);
  state.tick(90);
  assert.equal(state.remaining, 115);
  state.close();
  state.tick(2);
  assert.equal(state.remaining, 113);
});

test('early decisions can return to exploration; evidence book returns to its origin', () => {
  const state = exploring();
  state.tick(40);
  assert.equal(state.decide(), true);
  assert.equal(state.decide(), false);
  state.tick(60);
  assert.equal(state.remaining, 80);
  assert.equal(state.openJournal(), true);
  assert.equal(state.back(), false);
  assert.equal(state.choose('A'), false);
  state.close();
  assert.equal(state.phase, 'DECISION');
  assert.equal(state.back(), true);
  assert.equal(state.phase, 'EXPLORE');
});

test('timeout clamps at zero and requires a decision, including after opening the journal', () => {
  const state = exploring();
  state.setNearest('C01');
  assert.equal(state.tick(119), true);
  assert.equal(state.phase, 'EXPLORE');
  assert.equal(state.remaining, 1);
  assert.equal(state.tick(1), true);
  assert.equal(state.remaining, 0);
  assert.equal(state.timedOut, true);
  assert.equal(state.nearest, null);
  assert.equal(state.phase, 'DECISION');
  assert.equal(state.back(), false);
  assert.equal(state.openJournal(), true);
  state.close();
  assert.equal(state.phase, 'DECISION');
  assert.equal(state.back(), false);
  assert.equal(state.choose('C'), true);
});

test('a long exploration tick cannot leave negative time or bypass the decision', () => {
  const state = exploring();
  assert.equal(state.tick(125), true);
  assert.equal(state.remaining, 0);
  assert.equal(state.phase, 'DECISION');
  assert.equal(state.tick(1), false);
  assert.equal(state.back(), false);
});

for (const choice of ['A', 'B', 'C'] as Choice[]) {
  test(`choice ${choice} works with zero evidence and commits only one ending`, () => {
    const state = exploring();
    state.decide();
    assert.equal(state.choose(choice), true);
    assert.equal(state.choice, choice);
    assert.equal(state.phase, 'CINEMATIC');
    assert.equal(state.choose(choice === 'A' ? 'B' : 'A'), false);
    assert.equal(state.retry(), false);
    assert.equal(state.back(), false);
    assert.equal(state.finishEnding(), true);
    assert.equal(state.finishEnding(), false);
    assert.equal(state.phase, 'ENDING');
    assert.equal(state.choice, choice);
    assert.ok(ENDINGS[choice].boss);
  });
}

test('retry clears the entire session and preserves user sound/quality settings', () => {
  const state = exploring();
  state.toggleSound();
  state.toggleQuality();
  state.setNearest('C07');
  state.inspect('C07');
  state.close();
  state.tick(120);
  state.choose('B');
  state.finishEnding();
  assert.equal(state.retry(), true);
  assert.equal(state.retry(), false);
  assert.deepEqual(state.snapshot(), {
    stageId: 'stage01', caseSeed: null, phase: 'EXPLORE', remaining: 120, found: [], nearest: null,
    inspected: null, choice: null, sound: true, lowQuality: true, timedOut: false,
  });
});

test('title reset works from menu and ending without bypassing the introduction', () => {
  const state = exploring();
  assert.equal(state.title(), false);
  state.inspect('C02');
  state.close();
  state.openMenu();
  assert.equal(state.title(), true);
  assert.equal(state.title(), false);
  assert.equal(state.phase, 'TITLE');
  assert.deepEqual(state.found, []);
  assert.equal(state.explore(), false);
  state.start();
  state.explore();
  state.decide();
  state.choose('A');
  state.finishEnding();
  assert.equal(state.title(), true);
  assert.equal(state.choice, null);
});

test('invalid elapsed time and invalid nearest targets cannot corrupt state', () => {
  const state = exploring();
  for (const dt of [NaN, Infinity, -Infinity, -1, 0]) assert.equal(state.tick(dt), false);
  assert.equal(state.remaining, 120);
  assert.equal(state.setNearest('missing'), false);
  assert.equal(state.nearest, null);
  assert.equal(state.setNearest('C03'), true);
  assert.equal(state.setNearest('C03'), false);
  state.openMenu();
  assert.equal(state.setNearest('C01'), false);
  assert.equal(state.setNearest(null), true);
});

test('snapshots and found getters cannot mutate the live session', () => {
  const state = exploring();
  state.inspect('C01');
  const view = state.snapshot();
  view.found.push('C06');
  view.phase = 'ENDING';
  view.remaining = 0;
  state.found.push('C02');
  assert.deepEqual(state.found, ['C01']);
  assert.equal(state.phase, 'INSPECT');
  assert.equal(state.remaining, 120);
});

test('the title stage selector is guarded and supplies isolated stage data', () => {
  const state = new GameState({ fixed: true });
  assert.equal(state.stageId, 'stage01');
  state.toggleSound();
  state.toggleQuality();
  assert.equal(state.selectStage('unknown' as StageId), false);
  assert.equal(state.selectStage('stage02'), true);
  assert.equal(state.stage, getStage('stage02'));
  assert.equal(state.remaining, 120);
  assert.equal(state.sound, true);
  assert.equal(state.lowQuality, true);
  assert.equal(state.stage.clues.length, 7);
  assert.equal(state.stage.clues[0].title, 'イベントポスター');
  assert.equal(state.stage.choices.A.label, '09:50に集合する');
  assert.equal(state.stage.copy.correctChoice, 'A');
  assert.equal(state.start(), true);
  assert.equal(state.selectStage('stage01'), false);
  state.explore();
  state.inspect('C01');
  assert.deepEqual(state.found, ['C01']);
  assert.equal(state.stage.clues.find((clue) => clue.id === state.inspected)?.body, '開始10:10／受付開始10:00');
});

test('next work starts stage two introduction and clears all stage one evidence', () => {
  const state = exploring();
  state.toggleSound();
  state.toggleQuality();
  assert.equal(state.next(), false);
  state.inspect('C07');
  state.close();
  state.tick(120);
  state.choose('C');
  assert.equal(state.next(), false);
  state.finishEnding();
  assert.equal(state.next(), true);
  assert.deepEqual(state.snapshot(), {
    stageId: 'stage02', caseSeed: null, phase: 'INTRO', remaining: 120, found: [], nearest: null,
    inspected: null, choice: null, sound: true, lowQuality: true, timedOut: false,
  });
  assert.equal(state.next(), false);
  assert.equal(state.inspect('C07'), false);
  state.explore();
  state.inspect('C06');
  state.close();
  state.decide();
  state.choose('A');
  state.finishEnding();
  assert.equal(state.next(), false);
  assert.equal(state.retry(), true);
  assert.equal(state.stageId, 'stage02');
  assert.deepEqual(state.found, []);
});

test('returning to title and replaying preserves the current stage without session leakage', () => {
  const state = new GameState({ fixed: true });
  state.selectStage('stage02');
  state.start();
  state.explore();
  state.inspect('C03');
  state.close();
  state.openMenu();
  state.title();
  assert.equal(state.stageId, 'stage02');
  assert.deepEqual(state.found, []);
  assert.equal(state.selectStage('stage01'), true);
  state.start();
  state.explore();
  assert.deepEqual(state.found, []);
  assert.equal(state.stage.clues[2].title, '巨大コンテナ');
  assert.equal(state.stage.copy.correctChoice, 'C');
});

test('all stages expose seven factual clues and complete their available endings', () => {
  for (const stage of STAGE_LIST) {
    assert.equal(stage.seconds, 120);
    assert.equal(stage.clues.length, 7);
    assert.equal(new Set(stage.clues.map((clue) => clue.id)).size, 7);
    for (const clue of stage.clues) {
      assert.equal(Object.hasOwn(clue, 'thought'), false);
      assert.ok(clue.body.length > 0);
    }
    for (const choice of stage.choiceIds ?? ['A', 'B', 'C'] as Choice[]) {
      const state = new GameState({ fixed: true });
      state.selectStage(stage.id);
      state.start();
      state.explore();
      for (const clue of [...stage.clues].reverse()) { state.inspect(clue.id); state.close(); }
      assert.equal(state.found.length, 7);
      state.decide();
      assert.equal(state.choose(choice), true);
      assert.equal(state.finishEnding(), true);
      assert.ok(state.stage.endings[choice].boss);
      assert.ok(state.stage.choices[choice].label);
      assert.ok(state.stage.cinematicSeconds[choice] > 0);
    }
  }
});

function finishGenerated(state: GameState): void {
  if (state.phase === 'INTRO') assert.equal(state.explore(), true);
  assert.equal(state.decide(), true);
  assert.equal(state.choose(state.case?.correctChoice ?? 'A'), true);
  assert.equal(state.finishEnding(), true);
}

test('the two-choice amount case rejects the hidden third answer in normal and fixture play', () => {
  for (const fixed of [false, true]) {
    const state = new GameState({ fixed, seedSource: () => 17 });
    state.selectStage('stage04'); state.start(); state.explore(); state.decide();
    assert.deepEqual(state.stage.choiceIds, ['A', 'B']);
    assert.equal(state.choose('C'), false);
    assert.equal(state.phase, 'DECISION');
    assert.equal(state.choice, null);
    assert.equal(state.choose('B'), true);
    state.finishEnding(); state.retry();
    assert.equal(state.stageId, 'stage04');
    assert.deepEqual(state.stage.choiceIds, ['A', 'B']);
  }
});

test('normal start generates once and shares the frozen case with the UI', () => {
  let calls = 0;
  const state = new GameState({ seedSource: () => { calls++; return 41; } });
  assert.equal(state.case, null);
  assert.equal(state.caseSeed, null);
  assert.equal(state.start(), true);
  assert.equal(calls, 1);
  assert.equal(state.caseSeed, 41);
  assert.equal(state.snapshot().caseSeed, 41);
  assert.equal(state.stage, state.case);
  assert.ok(Object.isFrozen(state.case));
  assert.equal(state.start(), false);
  assert.equal(calls, 1);
  assert.equal(state.stage.copy.correctChoice, state.case!.correctChoice);
});

test('retry keeps the identical case object, seed and all evidence facts while resetting play', () => {
  let calls = 0;
  const state = new GameState({ seedSource: () => { calls++; return 73; } });
  state.start(); state.explore();
  state.toggleSound(); state.toggleQuality();
  const instance = state.case!;
  const before = JSON.stringify(instance);
  state.inspect('C04'); state.close(); state.tick(120);
  state.choose(instance.correctChoice); state.finishEnding();
  assert.equal(state.retry(), true);
  assert.equal(state.case, instance);
  assert.equal(JSON.stringify(state.case), before);
  assert.equal(state.caseSeed, 73);
  assert.equal(calls, 1);
  assert.deepEqual(state.found, []);
  assert.equal(state.remaining, 120);
  assert.equal(state.choice, null);
  assert.equal(state.timedOut, false);
  assert.equal(state.sound, true);
  assert.equal(state.lowQuality, true);
  assert.throws(() => { instance.copy.correctChoice = 'A'; }, TypeError);
});

test('new case is guarded, generates a different seed and can explicitly choose a stage', () => {
  let calls = 0;
  const state = new GameState({ seedSource: () => { calls++; return 0; } });
  assert.equal(state.newCase('unknown' as StageId), false);
  assert.equal(calls, 0);
  assert.equal(state.newCase('stage02'), true);
  assert.equal(state.stageId, 'stage02');
  assert.equal(state.phase, 'INTRO');
  const first = state.case!;
  assert.equal(state.newCase(), false);
  assert.equal(calls, 1);
  state.explore();
  assert.equal(state.newCase(), false);
  state.decide(); state.choose(first.correctChoice);
  assert.equal(state.newCase(), false);
  state.finishEnding();
  assert.equal(state.newCase('stage01'), true);
  assert.equal(state.stageId, 'stage01');
  assert.notEqual(state.caseSeed, first.caseSeed);
  assert.notEqual(state.case, first);
  assert.equal(calls, 2);
  assert.deepEqual(state.found, []);
});

test('title and stage selection discard a case; replay and next create fresh cases', () => {
  let seed = 100;
  const state = new GameState({ seedSource: () => seed++ });
  state.start(); state.explore();
  const first = state.case!;
  state.openMenu();
  assert.equal(state.title(), true);
  assert.equal(state.case, null);
  assert.equal(state.caseSeed, null);
  assert.equal(state.stage, getStage('stage01'));
  state.selectStage('stage02');
  assert.equal(state.case, null);
  state.start();
  assert.equal(state.stageId, 'stage02');
  assert.notEqual(state.caseSeed, first.caseSeed);
  finishGenerated(state); state.title(); state.selectStage('stage01'); state.start();
  const beforeNext = state.case!;
  finishGenerated(state);
  assert.equal(state.next(), true);
  assert.equal(state.stageId, 'stage02');
  assert.equal(state.phase, 'INTRO');
  assert.notEqual(state.caseSeed, beforeNext.caseSeed);
  assert.equal(state.next(), false);
});

test('new case selects every registered stage without enforcing an answer cycle or repeating seeds', () => {
  const state = new GameState({ seedSource: () => 0 });
  const seeds = new Set<number>();
  const stages = new Set<StageId>();
  const answers: Choice[] = [];
  for (let i = 0; i < 40; i++) {
    assert.equal(state.newCase(), true);
    const instance = state.case!;
    seeds.add(instance.caseSeed); stages.add(instance.id); answers.push(instance.correctChoice);
    finishGenerated(state);
  }
  assert.equal(seeds.size, 40);
  assert.equal(stages.size, STAGE_LIST.length);
  assert.equal(new Set(answers).size, 3);
  assert.ok(answers.some((choice, i) => i > 0 && choice === answers[i - 1]), 'answers must not forcibly cycle A → B → C');
});

test('fixed fixture mode preserves the authored stage with no generated case or seed consumption', () => {
  let calls = 0;
  const state = new GameState({ fixed: true, seedSource: () => { calls++; return 1; } });
  state.start();
  assert.equal(state.case, null);
  assert.equal(state.caseSeed, null);
  assert.equal(state.stage, getStage('stage01'));
  finishGenerated(state);
  state.retry();
  assert.equal(state.stage, getStage('stage01'));
  state.decide(); state.choose('C'); state.finishEnding(); state.next();
  assert.equal(state.stage, getStage('stage02'));
  assert.equal(state.case, null);
  assert.equal(calls, 0);
});

