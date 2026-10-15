import type { StageDefinition, StageId } from '../game/types.ts';
import { STAGE01 } from './stage01.ts';
import { STAGE02 } from './stage02.ts';
import { STAGE03 } from './stage03.ts';
import { STAGE04 } from './stage04.ts';
import { STAGE05 } from './stage05.ts';

export const STAGES: Record<StageId, StageDefinition> = { stage01: STAGE01, stage02: STAGE02, stage03: STAGE03, stage04: STAGE04, stage05: STAGE05 };
export const STAGE_LIST: StageDefinition[] = [STAGE01, STAGE02, STAGE03, STAGE04, STAGE05];
export const getStage = (id: StageId): StageDefinition => STAGES[id];
