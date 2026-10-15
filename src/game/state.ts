import { getStage, STAGES, STAGE_LIST } from '../data/stages.ts';
import { createCase } from '../data/cases.ts';
import type { CaseInstance, Choice, Phase, Snapshot, StageDefinition, StageId } from './types.ts';

interface StateOptions { seedSource?: () => number; fixed?: boolean; }

function randomSeed(): number {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return (Math.floor(Math.random() * 4294967296) ^ Date.now()) >>> 0;
}

/** Owns progression; the renderer and UI can only receive copies of state. */
export class GameState {
  private data: Snapshot = {
    stageId: 'stage01', caseSeed: null, phase: 'TITLE', remaining: getStage('stage01').seconds, found: [], nearest: null,
    inspected: null, choice: null, sound: false, lowQuality: false, timedOut: false,
  };
  private journalOrigin: 'EXPLORE' | 'DECISION' = 'EXPLORE';
  private instance: CaseInstance | null = null;
  private readonly usedSeeds = new Set<number>();
  private readonly seedSource: () => number;
  private readonly fixed: boolean;

  constructor(options: StateOptions = {}) {
    this.seedSource = options.seedSource ?? randomSeed;
    this.fixed = options.fixed ?? false;
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
  get lowQuality(): boolean { return this.data.lowQuality; }
  get timedOut(): boolean { return this.data.timedOut; }

  snapshot(): Snapshot { return { ...this.data, found: [...this.data.found] }; }

  start(): boolean {
    if (this.phase !== 'TITLE') return false;
    this.begin(this.stageId);
    return true;
  }
  explore(): boolean { return this.transition('INTRO', 'EXPLORE'); }

  selectStage(id: StageId): boolean {
    if (this.phase !== 'TITLE' || !Object.hasOwn(STAGES, id)) return false;
    this.instance = null;
    this.reset('TITLE', id);
    return true;
  }

  next(): boolean {
    if (this.phase !== 'ENDING' || this.stageId !== 'stage01') return false;
    this.begin('stage02');
    return true;
  }

  newCase(stageId?: StageId): boolean {
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

  finishEnding(): boolean { return this.transition('CINEMATIC', 'ENDING'); }

  retry(): boolean {
    if (this.phase !== 'ENDING') return false;
    this.reset('EXPLORE');
    return true;
  }

  title(): boolean {
    if (this.phase !== 'MENU' && this.phase !== 'ENDING') return false;
    this.instance = null;
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
      inspected: null, choice: null, sound: this.data.sound,
      lowQuality: this.data.lowQuality, timedOut: false,
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
