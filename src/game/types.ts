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
export interface OfficeCaseFacts {
  kind: 'office'; today: string; roomName: string; visitorCount: number;
  proposals: Array<{ person: '田中' | '佐藤'; use: 'meeting' | 'empty-space' | 'next-site'; occasion: string }>;
  acceptedPerson: '田中' | '佐藤';
}
export interface StationCaseFacts {
  kind: 'station'; today: string; spokenHour: number;
  interpretation: 'ten-before-hour' | 'five-before-ten-past' | 'one-before-ten-past';
  bossDepartureMinutes: number; bossTravelMinutes: number;
  weatherMinutes: number;
}
export interface MoneyCasePlan {
  changeYen: number; paidYen: number; purchaseYen: number; envelopeId: string;
  signage: Record<string, string>;
}
export interface MoneyCaseFacts {
  kind: 'money'; today: string; envelopeName: string; occasion: string; paidYen: number; purchaseYen: number;
  errands: Array<{ purpose: string; source: 'company-advance' | 'boss-private' | 'group-fund' }>;
}
export interface AmountCasePlan {
  baseYen: number; lowerYen: number; upperYen: number; requiredYen: number; requestId: string;
  signage: Record<string, string>;
}
export interface AmountCaseFacts {
  kind: 'amount'; today: string; purpose: string; speakerName: string; baseYen: number;
  lowerYen: number; upperYen: number; requiredYen: number;
  /** One past event, shown as a request and a separate approved receipt. */
  history: Array<{ occasion: string; baseYen: number; actualYen: number; term: 'weak' | 'strong' }>;
}
export interface DocumentCasePlan {
  packetId: string; setCount: number; pageCount: number; intendedChoice: Choice;
  signage: Record<string, string>;
}
export interface DocumentCaseFacts {
  kind: 'document'; today: string; topic: string; setCount: number; pageCount: number;
  meeting: 'upcoming' | 'finished'; distribution: 'sent' | 'pending';
  record: 'master-annotations' | 'separate-minutes';
}
export interface CaseInstance extends StageDefinition {
  caseSeed: number; correctChoice: Choice; evidenceChain: string[];
  officeUnit?: string; stationPlan?: StationCasePlan; moneyPlan?: MoneyCasePlan; amountPlan?: AmountCasePlan; documentPlan?: DocumentCasePlan;
  facts: OfficeCaseFacts | StationCaseFacts | MoneyCaseFacts | AmountCaseFacts | DocumentCaseFacts;
}
