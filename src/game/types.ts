export type Phase = 'TITLE' | 'INTRO' | 'EXPLORE' | 'INSPECT' | 'MENU' | 'JOURNAL' | 'DECISION' | 'CINEMATIC' | 'ENDING';
export type Choice = 'A' | 'B' | 'C';
export type StageId = 'stage01' | 'stage02' | 'stage03' | 'stage04' | 'stage05';
export interface Clue { id: string; title: string; category: string; body: string; x: number; z: number; radius: number; symbol: string; }
export interface Ending { title: string; subtitle: string; boss: string; player: string; explanation: string; }
export interface Snapshot { stageId: StageId; caseSeed: number | null; phase: Phase; remaining: number; found: string[]; nearest: string | null; inspected: string | null; choice: Choice | null; sound: boolean; lowQuality: boolean; timedOut: boolean; }
export interface Collider { minX: number; maxX: number; minZ: number; maxZ: number; }
export type UIAction = 'start' | 'explore' | 'inspect' | 'close' | 'menu' | 'journal' | 'decision' | 'back' | 'choose' | 'retry' | 'title' | 'sound' | 'quality' | 'camera' | 'stage' | 'next' | 'newcase';
export interface StageDefinition { id: StageId; number: string; title: string; seconds: number; start: { x: number; z: number }; clues: Clue[]; endings: Record<Choice, Ending>; copy: Record<string, string>; choiceIds?: Choice[]; choices: Record<Choice, { label: string; description: string }>; cinematicSeconds: Record<Choice, number>; }

/** All times are standard-time minutes; only displayedChoices uses plaza time. */
export interface StationCasePlan {
  plazaOffset: number; referenceOffset: number; startMinutes: number; meetingMinutes: number;
  departureMinutes: number; arrivalMinutes: Record<Choice, number>;
  outcomes: Record<Choice, 'meet' | 'early' | 'late' | 'late-board'>;
  displayedChoices: Record<Choice, number>; walkMinutes: number; travelMinutes: number;
  deliveryOpen: number; deliveryClose: number; signage?: Record<string, string>;
}
export interface OfficeAssignment { date: string; unit: string; contract: string; }
export interface OfficeContract { id: string; requirement: Choice; condition: string; }
export interface OfficeCaseFacts {
  kind: 'office'; today: string; currentUnit: string;
  assignments: OfficeAssignment[]; contracts: OfficeContract[];
  crane: { date: string; unit: string }; container: { date: string; unit: string };
  note: { date: string; unit: string; boxes: number };
}
export interface StationCaseFacts {
  kind: 'station'; today: string; referenceClock: string; plazaClock: string;
  spokenHour: number; interpretation: 'ten-before-hour' | 'before-ten-past';
  meetingEndReference: number; bossWalkMinutes: number; oldMemoDate: string; weatherMinutes: number;
}
export interface MoneyCasePlan {
  changeYen: number; paidYen: number; purchaseYen: number; envelopeId: string;
  signage: Record<string, string>;
}
export interface MoneyCaseFacts {
  kind: 'money'; today: string; envelopeId: string; paidYen: number; purchaseYen: number;
  assignments: Array<{ date: string; envelope: string; fund: string }>;
  funds: Array<{ id: string; source: string; requirement: Choice; condition: string }>;
  oldNote: { date: string; envelope: string };
}
export interface AmountCasePlan {
  baseYen: number; lowerYen: number; upperYen: number; requiredYen: number; requestId: string;
  signage: Record<string, string>;
}
export interface AmountCaseFacts {
  kind: 'amount'; today: string; requestId: string; baseYen: number;
  lowerYen: number; upperYen: number; requiredYen: number;
  requests: Array<{ date: string; id: string; speaker: string }>;
  history: Array<{ date: string; speaker: string; baseYen: number; actualYen: number }>;
}
export interface DocumentCasePlan {
  packetId: string; setCount: number; pageCount: number; intendedChoice: Choice;
  signage: Record<string, string>;
}
export interface DocumentCaseFacts {
  kind: 'document'; today: string; packetId: string; setCount: number; pageCount: number;
  assignments: Array<{ date: string; packet: string; destination: string; receipt: string }>;
  intakes: Array<{
    receipt: string; destination: string; content: 'key-points' | 'full-copy' | 'all-originals';
    delivery: 'single-page' | 'per-person' | 'single-load'; condition: string;
  }>;
}
export interface CaseInstance extends StageDefinition {
  caseSeed: number; correctChoice: Choice; evidenceChain: string[];
  officeUnit?: string; stationPlan?: StationCasePlan; moneyPlan?: MoneyCasePlan; amountPlan?: AmountCasePlan; documentPlan?: DocumentCasePlan;
  facts: OfficeCaseFacts | StationCaseFacts | MoneyCaseFacts | AmountCaseFacts | DocumentCaseFacts;
}
