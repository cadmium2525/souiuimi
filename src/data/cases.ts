import { getStage } from './stages.ts';
import { createMoneyCase, solveMoneyFacts, validateMoneyCase } from './moneyCases.ts';
import { createAmountCase, solveAmountFacts, validateAmountCase } from './amountCases.ts';
import { createDocumentCase, solveDocumentFacts, validateDocumentCase } from './documentCases.ts';
import type { CaseInstance, Choice, Ending, OfficeCaseFacts, StageDefinition, StageId, StationCaseFacts, StationCasePlan } from '../game/types.ts';

const CHOICES: Choice[] = ['A', 'B', 'C'];
const OFFICE_ACTIONS: Record<Choice, string> = { A: '机と床を掃除する', B: '家具と備品を運び出す', C: 'オフィスを建物ごと収納する' };
class Random {
  private value: number;
  constructor(seed: number) { this.value = seed >>> 0; }
  next(): number { this.value = (this.value + 0x6d2b79f5) >>> 0; let n = this.value; n = Math.imul(n ^ (n >>> 15), n | 1); n ^= n + Math.imul(n ^ (n >>> 7), n | 61); return ((n ^ (n >>> 14)) >>> 0) / 4294967296; }
  int(min: number, max: number) { return min + Math.floor(this.next() * (max - min + 1)); }
  pick<T>(items: readonly T[]): T { return items[this.int(0, items.length - 1)]; }
}
export function formatCaseTime(minutes: number): string { const value = ((minutes % 1440) + 1440) % 1440; return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function cloneStage(stage: StageDefinition): StageDefinition {
  return { ...stage, start: { ...stage.start }, clues: stage.clues.map(clue => ({ ...clue })), endings: Object.fromEntries(CHOICES.map(c => [c, { ...stage.endings[c] }])) as Record<Choice, Ending>, copy: { ...stage.copy }, choices: Object.fromEntries(CHOICES.map(c => [c, { ...stage.choices[c] }])) as StageDefinition['choices'], cinematicSeconds: { ...stage.cinematicSeconds } };
}
function deepFreeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); Object.freeze(value); } return value; }

const OFFICE_USES = ['meeting', 'empty-space', 'next-site'] as const;
const OFFICE_PEOPLE = ['田中', '佐藤'] as const;
const OFFICE_OCCASIONS = { meeting: '明日の打ち合わせ', 'empty-space': '明日の床点検', 'next-site': '海辺の現場での仕事' } as const;
/** Read the proposed uses together with which conversation the boss accepted. */
export function solveOfficeFacts(facts: OfficeCaseFacts): Choice | null {
  if (facts.proposals.length !== 2 || new Set(facts.proposals.map(row => row.person)).size !== 2
      || new Set(facts.proposals.map(row => row.use)).size !== 2
      || facts.proposals.some(row => !OFFICE_PEOPLE.includes(row.person) || !OFFICE_USES.includes(row.use) || row.occasion !== OFFICE_OCCASIONS[row.use])) return null;
  const accepted = facts.proposals.find(row => row.person === facts.acceptedPerson);
  return accepted ? ({ meeting: 'A', 'empty-space': 'B', 'next-site': 'C' } as const)[accepted.use] : null;
}
const READING_OFFSETS: Record<StationCaseFacts['interpretation'], number> = { 'ten-before-hour': -10, 'five-before-ten-past': 5, 'one-before-ten-past': 9 };
/** Each bus departure and journey duration occurs with two different intentions. */
export const STATION_CONTEXTS = [
  { departureBeforeHour: 35, bossTravelMinutes: 25 }, { departureBeforeHour: 35, bossTravelMinutes: 40 },
  { departureBeforeHour: 31, bossTravelMinutes: 40 }, { departureBeforeHour: 31, bossTravelMinutes: 21 },
  { departureBeforeHour: 16, bossTravelMinutes: 21 }, { departureBeforeHour: 16, bossTravelMinutes: 25 },
] as const;
/** Read today's message together with the bus route, using the same clock. */
export function solveStationFacts(facts: StationCaseFacts, plan: StationCasePlan): Choice | null {
  if (!Number.isInteger(facts.spokenHour) || facts.spokenHour < 0 || facts.spokenHour > 23 || plan.referenceOffset !== 0 || plan.plazaOffset !== 0
      || !Number.isInteger(facts.bossDepartureMinutes) || facts.bossDepartureMinutes < 0 || !Number.isInteger(facts.bossTravelMinutes) || facts.bossTravelMinutes <= 0) return null;
  const meeting = facts.bossDepartureMinutes + facts.bossTravelMinutes;
  if (!Object.values(READING_OFFSETS).includes(meeting - facts.spokenHour * 60)) return null;
  const matches = CHOICES.filter(choice => plan.displayedChoices[choice] === meeting);
  return matches.length === 1 ? matches[0] : null;
}
export function solveCase(instance: CaseInstance): Choice | null {
  const facts = instance.facts;
  if (facts.kind === 'office') return solveOfficeFacts(facts);
  if (facts.kind === 'station') return instance.stationPlan ? solveStationFacts(facts, instance.stationPlan) : null;
  if (facts.kind === 'money') return solveMoneyFacts(facts);
  if (facts.kind === 'amount') return solveAmountFacts(facts);
  return solveDocumentFacts(facts);
}

function officeDocuments(facts: OfficeCaseFacts) {
  const requests = {
    meeting: `明日、この部屋で打ち合わせを。今ある机を囲んで、${facts.visitorCount}人で話せれば助かります`,
    'empty-space': '明日、この建物の床を点検したいです。机の下も含めて、床の端から端まで見せてください',
    'next-site': '海辺の現場には、まだ部屋がなくて。今の机の配置を崩さず、明日朝から仕事を再開したいです',
  };
  return {
    C01: '机の上には紙くずとコーヒーの染みがある。床にも紙が落ちている。',
    C02: `明日の利用について届いた相談\n${facts.proposals.map(row => `${row.person}さん「${requests[row.use]}」`).join('\n')}`,
    C03: 'コンテナには「移動式オフィス収納ユニット」と書かれている。',
    C04: `部長からの連絡\n「${facts.acceptedPerson}さんに、明日の件を引き受けると返事しました。もう一方には今回は見送ると連絡済みです。片付け、今日中によろしく」`,
    C05: '大型クレーン車。車体には「建物ごと運びます」の文字。',
    C06: '会社紹介\n当社のオフィスは移動式。建物を組み立てたまま、別の場所へ運ぶことができます。',
    C07: '上司の付箋\n「机の上の備品は会社のものだから、捨てないでね。紙くずだけはゴミ箱へ！」',
  };
}
function officeCase(seed: number, random: Random): CaseInstance {
  const stage = cloneStage(getStage('stage01'));
  const firstUse = random.pick(OFFICE_USES);
  const secondUse = random.pick(OFFICE_USES.filter(use => use !== firstUse));
  const proposals: OfficeCaseFacts['proposals'] = [
    { person: '田中', use: firstUse, occasion: OFFICE_OCCASIONS[firstUse] },
    { person: '佐藤', use: secondUse, occasion: OFFICE_OCCASIONS[secondUse] },
  ];
  const facts: OfficeCaseFacts = { kind: 'office', today: `10月${random.int(2, 28)}日`, roomName: 'よしなに仮設オフィス', proposals, acceptedPerson: random.pick(OFFICE_PEOPLE), visitorCount: random.int(3, 12) };
  const correctChoice = solveOfficeFacts(facts)!;
  const bodies = officeDocuments(facts);
  const titles: Record<string, string> = { C02: '明日の利用相談', C04: '部長からの返信' };
  stage.clues = stage.clues.map(clue => ({ ...clue, title: titles[clue.id] ?? clue.title, body: bodies[clue.id as keyof typeof bodies] }));
  const proof = correctChoice === 'A'
    ? '明日は、この部屋で机を囲む打ち合わせが決まった。今回の「片付ける」は、掃除して部屋を整えること。'
    : correctChoice === 'B' ? '明日は、机の下も含めた床全体の点検が決まった。今回の「片付ける」は、家具と備品を外へ運び出すこと。'
      : '部屋のない次の現場で、同じ席から仕事を再開する。今回の「片付ける」は、移動式オフィスを建物ごと運ぶこと。';
  const success: Record<Choice, Ending> = {
    A: { title: '掃除して、準備完了。', subtitle: '明日の来客を迎える準備ができた', boss: 'きれいになったね！ これなら、ここで机を囲んで話せるよ。', player: '机も床も、準備できました！', explanation: proof },
    B: { title: '中身だけ、片付けて正解。', subtitle: '建物を残し、室内は空っぽに', boss: 'ちゃんと空っぽだね。これで机の下まで、床全体を点検してもらえる！', player: '建物は今の場所で使うんですね。', explanation: proof },
    C: { title: 'そういう意味だったの！？', subtitle: 'いつもの配置ごと、次の仕事場所へ', boss: 'そうそう、このオフィスごと運びたかったんだ。明日も、いつもの席で仕事ができる！', player: '……「片付ける」の規模が違いました！', explanation: proof },
  };
  const wrong: Record<Choice, Record<Choice, string>> = {
    A: { A: '', B: '明日の来客と、この机を囲んで話すんだけど！ 机と椅子はどこ！？', C: 'お客さんは明日、この場所に来るんだよ。部屋までなくなってる！' },
    B: { A: 'きれいになったけど、机があると、その下の床を点検できないんだ。中の家具を外へ出してほしかったよ。', B: '', C: '明日はこの建物の床を点検するんだよ。建物ごとなくなったら点検できない！' },
    C: { A: '明日は海辺の現場で仕事をするんだ。あっちには部屋がまだなくて……！', B: '机の配置も残して、部屋ごと運びたかったんだよ。いつもの席がばらばらだ！', C: '' },
  };
  for (const choice of CHOICES) stage.endings[choice] = choice === correctChoice ? success[choice] : { title: choice === 'A' ? 'ピカピカ。でも、今日の仕事は？' : choice === 'B' ? '机も椅子も、どこへ？' : '片付いたのは、部屋ごと。', subtitle: `実行：${OFFICE_ACTIONS[choice]}`, boss: wrong[correctChoice][choice], player: '「片付ける」って、そっちの意味でしたか……。', explanation: proof };
  stage.copy = { ...stage.copy, introBoss: 'オフィス、適当に片付けといて。今日中によろしく！', introThought: '', correctChoice, successLabel: correctChoice === 'C' ? 'まさかの大正解' : '意図どおり', worldLocation: facts.roomName, worldClock: '14:55', worldLabel: 'いつもの部屋。\nさて、どう片付ける？', decisionNote: '集めた手がかりをもとに、上司の真意を決めよう。', caseInstruction: 'この部屋を、明日はどう使うのだろう。' };
  return { ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C02', 'C04', 'C06'], officeUnit: facts.roomName, facts };
}

export function stationDocuments(facts: StationCaseFacts, plan: StationCasePlan) {
  return {
    C01: `本日のイベント\n開場 ${formatCaseTime(plan.deliveryOpen + 5)}\n開始 ${formatCaseTime(plan.deliveryOpen + 15)}\n場所：よしなに展示会場`,
    C02: `自分のスマホ・部長からのメッセージ\n「このあと、公民館前を${formatCaseTime(facts.bossDepartureMinutes)}に発車する路線バスで駅前へ向かうよ」`,
    C03: `駅前シャトル\n${formatCaseTime(plan.departureMinutes)}発 → ${formatCaseTime(plan.deliveryOpen)}会場着\n次便は15分後。`,
    C04: `駅周辺の路線案内\n公民館前 → 駅前広場\n所要${facts.bossTravelMinutes}分\n本日の運行経路と所要時間です。`,
    C05: `駅前の天気予報\n${formatCaseTime(facts.weatherMinutes)}ごろから雨。\n雨具をお忘れなく。`,
    C06: `展示会用の資料箱\n受取場所：展示会場\n受取時間：${formatCaseTime(plan.deliveryOpen)}〜${formatCaseTime(plan.deliveryClose)}`,
    C07: 'シャトル乗り場まで徒歩2分。\n駅前と会場の時計は、同じ時刻に合わせてあります。',
  };
}
function stationCase(seed: number, random: Random): CaseInstance {
  const stage = cloneStage(getStage('stage02'));
  const spokenHour = random.int(9, 13);
  const context = random.pick(STATION_CONTEXTS);
  const offset = context.bossTravelMinutes - context.departureBeforeHour;
  const interpretation = (Object.keys(READING_OFFSETS) as StationCaseFacts['interpretation'][]).find(key => READING_OFFSETS[key] === offset)!;
  const facts: StationCaseFacts = { kind: 'station', today: `10月${random.int(2, 28)}日`, spokenHour, interpretation, bossDepartureMinutes: spokenHour * 60 - context.departureBeforeHour, bossTravelMinutes: context.bossTravelMinutes, weatherMinutes: random.int(8 * 12, 15 * 12) * 5 };
  const arrivals: Record<Choice, number> = { A: spokenHour * 60 - 10, B: spokenHour * 60 + 5, C: spokenHour * 60 + 9 };
  const meetingMinutes = spokenHour * 60 + offset;
  const departureMinutes = spokenHour * 60 + random.pick([7, 11, 15, 19].filter(minutes => minutes >= offset + 2));
  const travelMinutes = random.int(8, 18);
  const plan: StationCasePlan = { plazaOffset: 0, referenceOffset: 0, startMinutes: arrivals.A - 3, meetingMinutes, departureMinutes, arrivalMinutes: arrivals, displayedChoices: { ...arrivals }, outcomes: Object.fromEntries(CHOICES.map(c => [c, arrivals[c] === meetingMinutes ? 'meet' : arrivals[c] < meetingMinutes ? 'early' : arrivals[c] + 2 <= departureMinutes ? 'late-board' : 'late'])) as StationCasePlan['outcomes'], walkMinutes: 2, travelMinutes, deliveryOpen: departureMinutes + travelMinutes, deliveryClose: departureMinutes + travelMinutes + 2 };
  const bodies = stationDocuments(facts, plan);
  plan.signage = { eventPoster: `本日の展示会\n${formatCaseTime(plan.deliveryOpen + 15)} 開始`, timetable: `${formatCaseTime(departureMinutes)} 発\n${formatCaseTime(plan.deliveryOpen)} 会場着`, deliveryLabel: `展示会の資料\n${formatCaseTime(plan.deliveryOpen)}〜${formatCaseTime(plan.deliveryClose)}受取`, referenceClock: `駅周辺の路線案内\n公民館前から${facts.bossTravelMinutes}分`, plazaClock: '駅前の時計', weather: `天気予報\n${formatCaseTime(facts.weatherMinutes)}ごろから雨`, walkway: 'シャトル乗り場\n徒歩2分' };
  const correctChoice = solveStationFacts(facts, plan)!;
  const reading = interpretation === 'ten-before-hour' ? `${spokenHour}時の10分前` : `${spokenHour}時10分の${interpretation === 'five-before-ten-past' ? '5分前' : 'すぐ前、1分前'}`;
  const proof = `${formatCaseTime(facts.bossDepartureMinutes)}発の路線バスは、所要${facts.bossTravelMinutes}分で駅前へ。今回の「前」は${formatCaseTime(meetingMinutes)}のつもりだった。`;
  const descriptions: Record<Choice, string> = { A: `${spokenHour}時の、10分前と受け取る。`, B: `${spokenHour}時10分の、5分前と受け取る。`, C: `${spokenHour}時10分の、すぐ前と受け取る。` };
  for (const choice of CHOICES) {
    const time = formatCaseTime(arrivals[choice]);
    const outcome = plan.outcomes[choice];
    stage.choices[choice] = { label: `${time}に集合する`, description: descriptions[choice] };
    stage.endings[choice] = outcome === 'meet' ? { title: 'あの「前」は、この時間。', subtitle: `${time}、駅前で合流`, boss: `${time}、ぴったり！ 公民館からのバスで、ちょうど着いたよ。シャトルに乗り換えよう。`, player: '乗る便と道順、確かめてきました！', explanation: proof }
      : outcome === 'early' ? { title: 'まだ、待ち合わせの前。', subtitle: `${time}、駅前で待ちぼうけ`, boss: `${formatCaseTime(meetingMinutes)}のつもりだったよ。もう駅前にいるの？ ちょっと待ってて！`, player: 'あの「前」を、早いほうに受け取ってしまった……。', explanation: proof }
      : outcome === 'late-board' ? { title: '乗れたけど、待たせちゃった。', subtitle: `${time}、部長を待たせて合流`, boss: `${formatCaseTime(meetingMinutes)}に待ってたよ。まだ便には間に合うけど、今日は遅かったね。`, player: '「前」の幅を取り違えました。お待たせしました！', explanation: proof }
      : { title: '駅前に、ひとり。', subtitle: `${time}、シャトルは発車済み`, boss: `集合は${formatCaseTime(meetingMinutes)}のつもりだったんだ。${formatCaseTime(departureMinutes)}の便は出ちゃった……。`, player: '同じ「前」でも、思っていた時間が違いました……。', explanation: proof };
    stage.copy[`cinematic${choice}`] = `${time}に駅前へ。資料箱を持ち、部長との待ち合わせに向かう。`;
    stage.copy[`choice${choice}`] = stage.choices[choice].label;
  }
  const titles: Record<string, string> = { C02: 'スマホのメッセージ', C04: '駅周辺の路線案内' };
  stage.clues = stage.clues.map(clue => ({ ...clue, title: titles[clue.id] ?? clue.title, category: clue.id === 'C02' ? '自分の持ち物 / スマホ' : clue.id === 'C04' ? '案内板 / 地図' : clue.category, body: bodies[clue.id as keyof typeof bodies] }));
  stage.copy = { ...stage.copy, introBoss: `駅前で、${spokenHour}時10分前集合ね。資料箱もよろしく！`, introThought: '', correctChoice, successLabel: '時間どおり', decisionHeading: '何時に集合する？', decisionNote: '今日の予定と周りの状況から、今回の「前」を考えよう。', introInstruction: '制限時間2:00。駅前広場を調べて、集合時刻を決めよう。', caseInstruction: '部長の予定と、駅前の様子を確かめよう。', worldClock: formatCaseTime(plan.startMinutes), worldLocation: 'よしなに駅前広場', worldLabel: '駅前で待ち合わせ。\nあの「前」は、何時？', clockLabel: '駅前の時計', stageTitle: `${spokenHour}時10分前集合` };
  stage.title = stage.copy.stageTitle;
  return { ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C02', 'C04'], stationPlan: plan, facts };
}

/** Only player-facing prose is checked; internal clue/seed names remain implementation details. */
export function caseText(instance: StageDefinition): string {
  return [instance.title, ...Object.values(instance.copy), ...instance.clues.flatMap(c => [c.title, c.category, c.body]), ...CHOICES.flatMap(c => [instance.choices[c].label, instance.choices[c].description, ...Object.values(instance.endings[c])])].join('\n');
}
export function validateCase(instance: CaseInstance): string[] {
  const errors: string[] = [];
  if (solveCase(instance) !== instance.correctChoice) errors.push('facts do not produce the declared unique answer');
  if (instance.copy.correctChoice !== instance.correctChoice) errors.push('copy answer differs from facts');
  const available = instance.choiceIds ?? CHOICES;
  if (available.length < 2 || new Set(available).size !== available.length || available.some(c => !CHOICES.includes(c)) || !available.includes(instance.correctChoice)) errors.push('available choices invalid');
  if (instance.clues.length !== 7 || new Set(instance.clues.map(c => c.id)).size !== 7) errors.push('seven distinct clues required');
  if (instance.evidenceChain.some(id => !instance.clues.some(c => c.id === id))) errors.push('evidence references absent clue');
  if (instance.clues.some(c => !c.body || Object.hasOwn(c, 'thought'))) errors.push('clues must contain facts only');
  if (/\b[A-Z]{1,3}\d{2,}\b|時計ID|基準時計|標準時より|資金区分|対応表/.test(caseText(instance))) errors.push('player-facing code lookup or clock conversion returned');
  if (instance.facts.kind === 'office') {
    const facts = instance.facts;
    if (instance.id !== 'stage01' || instance.officeUnit !== facts.roomName) errors.push('office identity differs from its setting');
    if (!facts.roomName || !/^10月([1-9]|[12]\d|3[01])日$/.test(facts.today) || !Number.isInteger(facts.visitorCount) || facts.visitorCount < 3 || facts.visitorCount > 12) errors.push('office context invalid');
    const bodies = officeDocuments(facts);
    for (const clue of instance.clues) if (clue.body !== bodies[clue.id as keyof typeof bodies]) errors.push(`${clue.id} text contradicts office context`);
    if (instance.endings[instance.correctChoice].explanation.includes('契約番号')) errors.push('office ending uses an administrative lookup');
  } else if (instance.facts.kind === 'station') {
    const facts = instance.facts, plan = instance.stationPlan;
    if (instance.id !== 'stage02' || !plan) errors.push('station plan missing');
    else {
      if (plan.referenceOffset !== 0 || plan.plazaOffset !== 0) errors.push('station clocks must agree');
      if (plan.meetingMinutes !== facts.bossDepartureMinutes + facts.bossTravelMinutes || plan.meetingMinutes !== facts.spokenHour * 60 + READING_OFFSETS[facts.interpretation]) errors.push('meeting differs from schedule and route');
      if (!STATION_CONTEXTS.some(row => row.departureBeforeHour === facts.spokenHour * 60 - facts.bossDepartureMinutes && row.bossTravelMinutes === facts.bossTravelMinutes)) errors.push('station work context invalid');
      if (plan.walkMinutes !== 2 || ![7, 11, 15, 19].includes(plan.departureMinutes - facts.spokenHour * 60) || plan.meetingMinutes + 2 > plan.departureMinutes) errors.push('transport timing differs');
      if (plan.deliveryOpen !== plan.departureMinutes + plan.travelMinutes || plan.deliveryClose !== plan.deliveryOpen + 2) errors.push('delivery time differs');
      const bodies = stationDocuments(facts, plan);
      for (const clue of instance.clues) if (clue.body !== bodies[clue.id as keyof typeof bodies]) errors.push(`${clue.id} text contradicts station context`);
      for (const choice of CHOICES) {
        const arrival = facts.spokenHour * 60 + ({ A: -10, B: 5, C: 9 }[choice]);
        if (plan.arrivalMinutes[choice] !== arrival || plan.displayedChoices[choice] !== arrival) errors.push('choices must express the three natural readings');
        const outcome = arrival === plan.meetingMinutes ? 'meet' : arrival < plan.meetingMinutes ? 'early' : arrival + 2 <= plan.departureMinutes ? 'late-board' : 'late';
        if (plan.outcomes[choice] !== outcome) errors.push('station outcome differs from arrival');
        if (!instance.choices[choice].label.includes(formatCaseTime(arrival))) errors.push('choice text differs from time');
      }
    }
  } else if (instance.facts.kind === 'money') errors.push(...validateMoneyCase(instance));
  else if (instance.facts.kind === 'amount') errors.push(...validateAmountCase(instance));
  else errors.push(...validateDocumentCase(instance));
  return errors;
}
export function createCase(stageId: StageId, seed: number): CaseInstance {
  if (!Number.isFinite(seed)) throw new RangeError('Case seed must be a finite number');
  if (!['stage01', 'stage02', 'stage03', 'stage04', 'stage05'].includes(stageId)) throw new RangeError('Unknown stage');
  const caseSeed = seed >>> 0, random = new Random(caseSeed);
  const result = stageId === 'stage01' ? officeCase(caseSeed, random) : stageId === 'stage02' ? stationCase(caseSeed, random) : stageId === 'stage03' ? createMoneyCase(caseSeed) : stageId === 'stage04' ? createAmountCase(caseSeed) : createDocumentCase(caseSeed);
  const errors = validateCase(result);
  if (errors.length) throw new Error(`Invalid generated case: ${errors.join('; ')}`);
  return deepFreeze(result);
}
