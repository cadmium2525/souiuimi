import { getStage, STAGES, STAGE_LIST } from '../data/stages.ts';
import { createCase } from '../data/cases.ts';
import type { CaseInstance, Choice, Phase, Snapshot, StageDefinition, StageId } from './types.ts';

interface StateOptions { seedSource?: () => number; fixed?: boolean; singleCase?: boolean; }

function randomSeed(): number {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return (Math.floor(Math.random() * 4294967296) ^ Date.now()) >>> 0;
}

/** Owns progression; the renderer and UI can only receive copies of state. */
export class GameState {
  private data: Snapshot = {
    stageId: 'stage01', caseSeed: null, phase: 'TITLE', remaining: getStage('stage01').seconds, found: [], nearest: null,
    inspected: null, choice: null, sound: false, music: true, lowQuality: false, timedOut: false, mode: 'run', run: null,
  };
  private journalOrigin: 'EXPLORE' | 'DECISION' = 'EXPLORE';
  private instance: CaseInstance | null = null;
  private readonly usedSeeds = new Set<number>();
  private readonly seedSource: () => number;
  private readonly fixed: boolean;
  private readonly defaultMode: 'run' | 'single';
  private runOrder: StageId[] = [];

  constructor(options: StateOptions = {}) {
    this.seedSource = options.seedSource ?? randomSeed;
    this.fixed = options.fixed ?? false;
    this.defaultMode = options.singleCase || this.fixed ? 'single' : 'run';
    this.data.mode = this.defaultMode;
  }

  get stageId(): StageId { return this.data.stageId; }
  get stage(): StageDefinition { return this.instance ?? getStage(this.stageId); }
  get case(): CaseInstance | null { return this.instance; }
  get caseSeed(): number | null { return this.data.caseSeed; }
  get phase(): Phase { return this.data.phase; }
  get remaining(): number { return this.data.remaining; }
  get found(): string[] { return [...this.data.found]; }
  get nearest(): string | null { return this.data.nearest; }
  get inspected(): string | null { return this.data.inspected; }
  get choice(): Choice | null { return this.data.choice; }
  get sound(): boolean { return this.data.sound; }
  get music(): boolean { return this.data.music; }
  get lowQuality(): boolean { return this.data.lowQuality; }
  get timedOut(): boolean { return this.data.timedOut; }

  snapshot(): Snapshot {
    return { ...this.data, found: [...this.data.found], run: this.data.run ? {
      ...this.data.run, completed: this.data.run.completed.map((result) => ({ ...result })),
    } : null };
  }

  start(): boolean {
    if (this.phase !== 'TITLE' && this.phase !== 'RESULTS') return false;
    if (this.data.mode === 'run') {
      this.runOrder = this.shuffleStages();
      this.data.run = { completed: [], total: this.runOrder.length, current: 1 };
      this.begin(this.runOrder[0]);
    } else this.begin(this.stageId);
    return true;
  }
  explore(): boolean { return this.transition('INTRO', 'EXPLORE'); }

  selectStage(id: StageId): boolean {
    if (this.phase !== 'TITLE' || !Object.hasOwn(STAGES, id)) return false;
    this.instance = null;
    this.data.mode = 'single';
    this.data.run = null;
    this.runOrder = [];
    this.reset('TITLE', id);
    return true;
  }

  next(): boolean {
    if (this.data.mode !== 'single' || this.phase !== 'ENDING' || this.stageId !== 'stage01') return false;
    this.begin('stage02');
    return true;
  }

  newCase(stageId?: StageId): boolean {
    if (this.data.mode === 'run') {
      if (stageId !== undefined || this.phase !== 'ENDING' || !this.data.run) return false;
      if (this.data.run.completed.length === this.data.run.total) {
        this.data.phase = 'RESULTS';
        return true;
      }
      this.data.run.current = this.data.run.completed.length + 1;
      this.begin(this.runOrder[this.data.run.completed.length]);
      return true;
    }
    if (this.phase !== 'TITLE' && this.phase !== 'ENDING') return false;
    if (stageId !== undefined && !Object.hasOwn(STAGES, stageId)) return false;
    this.begin(stageId);
    return true;
  }

  inspect(id: string): boolean {
    if (this.phase !== 'EXPLORE' || !this.stage.clues.some((clue) => clue.id === id)) return false;
    this.data.phase = 'INSPECT';
    this.data.inspected = id;
    if (!this.data.found.includes(id)) this.data.found.push(id);
    return true;
  }

  close(): boolean {
    if (this.phase === 'JOURNAL') {
      this.data.phase = this.journalOrigin;
      return true;
    }
    if (this.phase !== 'INSPECT' && this.phase !== 'MENU') return false;
    this.data.phase = 'EXPLORE';
    this.data.inspected = null;
    return true;
  }

  openMenu(): boolean { return this.transition('EXPLORE', 'MENU'); }

  openJournal(): boolean {
    if (this.phase !== 'EXPLORE' && this.phase !== 'DECISION') return false;
    this.journalOrigin = this.phase;
    this.data.phase = 'JOURNAL';
    return true;
  }

  decide(): boolean {
    if (this.phase !== 'EXPLORE') return false;
    this.data.phase = 'DECISION';
    this.data.nearest = null;
    return true;
  }

  back(): boolean {
    if (this.phase !== 'DECISION' || this.data.timedOut) return false;
    this.data.phase = 'EXPLORE';
    return true;
  }

  choose(choice: Choice): boolean {
    if (this.phase !== 'DECISION' || !(this.stage.choiceIds ?? ['A', 'B', 'C']).includes(choice)) return false;
    this.data.choice = choice;
    this.data.phase = 'CINEMATIC';
    return true;
  }

  finishEnding(): boolean {
    if (this.phase !== 'CINEMATIC' || this.data.choice === null) return false;
    if (this.data.run) {
      const correctChoice = this.instance?.correctChoice ?? this.stage.copy.correctChoice as Choice;
      this.data.run.completed.push({
        stageId: this.stageId, caseSeed: this.caseSeed, choice: this.data.choice,
        choiceLabel: this.stage.choices[this.data.choice].label, correctChoice,
        correct: this.data.choice === correctChoice, found: this.data.found.length,
        elapsed: Math.max(0, this.stage.seconds - this.remaining), timedOut: this.timedOut,
      });
    }
    this.data.phase = 'ENDING';
    return true;
  }

  retry(): boolean {
    if (this.data.mode !== 'single' || this.phase !== 'ENDING') return false;
    this.reset('EXPLORE');
    return true;
  }

  title(): boolean {
    if (this.phase !== 'MENU' && this.phase !== 'ENDING' && this.phase !== 'RESULTS') return false;
    this.instance = null;
    this.data.mode = this.defaultMode;
    this.data.run = null;
    this.runOrder = [];
    this.reset('TITLE');
    return true;
  }

  /** dt is elapsed visible exploration time in seconds, not milliseconds. */
  tick(dt: number, visible = true): boolean {
    if (this.phase !== 'EXPLORE' || !visible || !Number.isFinite(dt) || dt <= 0) return false;
    this.data.remaining = Math.max(0, this.data.remaining - dt);
    if (this.data.remaining === 0) {
      this.data.timedOut = true;
      this.decide();
    }
    return true;
  }

  setNearest(id: string | null): boolean {
    if (id !== null && (this.phase !== 'EXPLORE' || !this.stage.clues.some((clue) => clue.id === id))) return false;
    if (this.data.nearest === id) return false;
    this.data.nearest = id;
    return true;
  }

  toggleSound(): boolean { this.data.sound = !this.data.sound; return true; }
  toggleMusic(): boolean { this.data.music = !this.data.music; return true; }
  toggleQuality(): boolean { this.data.lowQuality = !this.data.lowQuality; return true; }

  private transition(from: Phase, to: Phase): boolean {
    if (this.phase !== from) return false;
    this.data.phase = to;
    return true;
  }

  private reset(phase: 'TITLE' | 'INTRO' | 'EXPLORE', stageId: StageId = this.stageId): void {
    this.data = {
      stageId, caseSeed: this.instance?.caseSeed ?? null,
      phase, remaining: (this.instance ?? getStage(stageId)).seconds, found: [], nearest: null,
      inspected: null, choice: null, sound: this.data.sound, music: this.data.music,
      lowQuality: this.data.lowQuality, timedOut: false, mode: this.data.mode, run: this.data.run,
    };
    this.journalOrigin = 'EXPLORE';
  }

  private freshSeed(): number {
    const supplied = this.seedSource();
    let seed = Number.isFinite(supplied) ? supplied >>> 0 : randomSeed();
    // Constant or repeating test sources cannot hang; answer order is never cycled.
    while (this.usedSeeds.has(seed)) seed = (seed + 0x9e3779b9) >>> 0;
    this.usedSeeds.add(seed);
    return seed;
  }

  /** A separate seed drives Fisher–Yates; stage order consumes no case generator randomness. */
  private shuffleStages(): StageId[] {
    let state = this.freshSeed();
    const next = (): number => {
      state = (state + 0x9e3779b9) >>> 0;
      let value = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
      value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
      return (value ^ (value >>> 15)) >>> 0;
    };
    const order = STAGE_LIST.map((stage) => stage.id);
    for (let i = order.length - 1; i > 0; i--) {
      const range = i + 1;
      const limit = 4294967296 - (4294967296 % range);
      let draw = next();
      while (draw >= limit) draw = next();
      const selected = draw % range;
      [order[i], order[selected]] = [order[selected], order[i]];
    }
    return order;
  }

  private begin(stageId?: StageId): void {
    const seed = this.fixed && stageId ? 0 : this.freshSeed();
    // Mix the seed instead of tying the selected stage to an answer or clock offset.
    let mixed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
    mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
    const selected = stageId ?? STAGE_LIST[((mixed ^ (mixed >>> 16)) >>> 0) % STAGE_LIST.length].id;
    this.instance = this.fixed ? null : createCase(selected, seed);
    this.reset('INTRO', selected);
  }
}
