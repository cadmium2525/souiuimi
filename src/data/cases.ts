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

/** A job's purpose and the future use of its furniture determine what 'tidy' means. */
export function solveOfficeFacts(facts: OfficeCaseFacts): Choice | null {
  if (facts.nextUse === 'meeting' && facts.furniture === 'continue' && facts.site === 'stays') return 'A';
  if (facts.nextUse === 'empty-space' && facts.furniture === 'return-loan' && facts.site === 'stays') return 'B';
  if (facts.nextUse === 'next-site' && facts.furniture === 'preserve-layout' && facts.site === 'cleared') return 'C';
  return null;
}
const READING_OFFSETS: Record<StationCaseFacts['interpretation'], number> = { 'ten-before-hour': -10, 'five-before-ten-past': 5, 'one-before-ten-past': 9 };
/** Infer this speaker's habitual meaning, without clock IDs or clock conversion. */
export function solveStationFacts(facts: StationCaseFacts, plan: StationCasePlan): Choice | null {
  if (!Number.isInteger(facts.spokenHour) || facts.spokenHour < 0 || facts.spokenHour > 23 || facts.previousMeetings.length !== 1 || plan.referenceOffset !== 0 || plan.plazaOffset !== 0) return null;
  const readings = Object.keys(READING_OFFSETS) as StationCaseFacts['interpretation'][];
  const possible = readings.filter(reading => facts.previousMeetings.every(row => Number.isInteger(row.spokenHour) && row.spokenHour >= 0 && row.spokenHour <= 23 && row.arrivedMinutes === row.spokenHour * 60 + READING_OFFSETS[reading]));
  if (possible.length !== 1) return null;
  const meeting = facts.spokenHour * 60 + READING_OFFSETS[possible[0]];
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
  const count = facts.visitorCount;
  const schedules = {
    meeting: `明日、この部屋で${facts.occasion}。\n来訪予定：${count}人\n先方から「今ある机を囲んでお話しできれば」と連絡あり。`,
    'empty-space': `明日は、この部屋で${facts.occasion}。\n担当者から「床から壁まで、何もない状態で全体を見たい」と連絡あり。`,
    'next-site': `明日から、仕事場所は${facts.occasion}。\n先方から「今のオフィスと同じ席順で、すぐ仕事を再開したい」と連絡あり。`,
  };
  const building = facts.site === 'cleared' ? '土地の管理人からの連絡\n明朝、この場所を工事車両の出入口にします。仮設の建物がある場所も、通路として使います。' : '建物の管理人からの連絡\nこの建物は明日以降も、今の場所で使います。入口の鍵は受付に預けてください。';
  const notes = {
    continue: '明日の来客用のペンと資料、机に置いておいて。椅子も人数分あるよね？',
    'return-loan': '借りていた机と椅子、今日でレンタル期間が終わるよ。回収の人は夕方に来るって。',
    'preserve-layout': '明日は、いつもの机の並びで続きをやりたいね。机の上の配置も、今のまま残しておいて。',
  };
  return {
    C01: '机の上には紙くずとコーヒーの染みがある。床にも紙が落ちている。',
    C02: `${facts.today}の予定表\n${schedules[facts.nextUse]}`,
    C03: 'コンテナには「移動式オフィス収納ユニット」と書かれている。',
    C04: building,
    C05: '大型クレーン車。車体には「建物ごと運びます」の文字。',
    C06: '会社紹介\n当社のオフィスは移動式。建物を組み立てたまま、別の場所へ運ぶことができます。',
    C07: `上司の付箋\n「${notes[facts.furniture]}」`,
  };
}
function officeCase(seed: number, random: Random): CaseInstance {
  const stage = cloneStage(getStage('stage01'));
  const nextUse = random.pick<OfficeCaseFacts['nextUse']>(['meeting', 'empty-space', 'next-site']);
  const furniture: OfficeCaseFacts['furniture'] = nextUse === 'meeting' ? 'continue' : nextUse === 'empty-space' ? 'return-loan' : 'preserve-layout';
  const occasion = nextUse === 'meeting' ? random.pick(['新商品の商談', 'お客さんとの打ち合わせ', '採用説明会']) : nextUse === 'empty-space' ? random.pick(['撮影の下見', '内装の点検', '床の張り替え']) : random.pick(['海辺の工事現場', '山側の新拠点', '駅裏の現場']);
  const facts: OfficeCaseFacts = { kind: 'office', today: `10月${random.int(2, 28)}日`, roomName: 'よしなに仮設オフィス', occasion, nextUse, furniture, site: nextUse === 'next-site' ? 'cleared' : 'stays', visitorCount: random.int(3, 12) };
  const correctChoice = solveOfficeFacts(facts)!;
  const bodies = officeDocuments(facts);
  const titles: Record<string, string> = { C02: '明日の予定表', C04: '管理人からの連絡' };
  stage.clues = stage.clues.map(clue => ({ ...clue, title: titles[clue.id] ?? clue.title, body: bodies[clue.id as keyof typeof bodies] }));
  const proof = correctChoice === 'A'
    ? '明日も同じ机と椅子で来客を迎える予定だった。今回の「片付ける」は、掃除して部屋を整えること。'
    : correctChoice === 'B' ? '明日は空の室内が必要で、借りた家具も今日返す予定だった。今回の「片付ける」は、建物を残して中身を運び出すこと。'
      : '土地を明け渡し、次の現場でも今の机の配置を使う予定だった。今回の「片付ける」は、オフィスを建物ごと移すこと。';
  const success: Record<Choice, Ending> = {
    A: { title: '掃除して、準備完了。', subtitle: '明日の来客を迎える準備ができた', boss: 'きれいになったね！ これなら、ここで机を囲んで話せるよ。', player: '資料とペンも、机に置いておきました！', explanation: proof },
    B: { title: '中身だけ、片付けて正解。', subtitle: '建物を残し、室内は空っぽに', boss: 'ちゃんと空っぽだね。これで明日の作業ができるし、借りた家具も返せる！', player: '建物は今の場所で使うんですね。', explanation: proof },
    C: { title: 'そういう意味だったの！？', subtitle: 'いつもの配置ごと、次の仕事場所へ', boss: 'そうそう、このオフィスごと運びたかったんだ。明日も、いつもの席で仕事ができる！', player: '……「片付ける」の規模が違いました！', explanation: proof },
  };
  const wrong: Record<Choice, Record<Choice, string>> = {
    A: { A: '', B: '明日の来客と、この机を囲んで話すんだけど！ 机と椅子はどこ！？', C: 'お客さんは明日、この場所に来るんだよ。部屋までなくなってる！' },
    B: { A: 'きれいになったけど、明日は何もない室内が必要なんだ。借りた机と椅子も、今日返す約束だよ。', B: '', C: '建物はここで使うんだよ！ 返すのは借りた家具だけだったのに！' },
    C: { A: 'ここは明朝、通路になるんだ。建物ごと次の仕事場所へ移さないと……！', B: '机の配置も残して、部屋ごと運びたかったんだよ。いつもの席がばらばらだ！', C: '' },
  };
  for (const choice of CHOICES) stage.endings[choice] = choice === correctChoice ? success[choice] : { title: choice === 'A' ? 'ピカピカ。でも、今日の仕事は？' : choice === 'B' ? '机も椅子も、どこへ？' : '片付いたのは、部屋ごと。', subtitle: `実行：${OFFICE_ACTIONS[choice]}`, boss: wrong[correctChoice][choice], player: '「片付ける」って、そっちの意味でしたか……。', explanation: proof };
  stage.copy = { ...stage.copy, introBoss: 'オフィス、適当に片付けといて。今日中によろしく！', introThought: '', correctChoice, successLabel: correctChoice === 'C' ? 'まさかの大正解' : '意図どおり', worldLocation: facts.roomName, worldClock: '14:55', worldLabel: 'いつもの部屋。\nさて、どう片付ける？', decisionNote: '集めた手がかりをもとに、上司の真意を決めよう。', caseInstruction: 'この部屋を、明日はどう使うのだろう。' };
  return { ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C02', 'C04', 'C07'], officeUnit: facts.roomName, facts };
}

function stationDocuments(facts: StationCaseFacts, plan: StationCasePlan) {
  const previous = facts.previousMeetings[0];
  return {
    C01: `本日のイベント\n開場 ${formatCaseTime(plan.deliveryOpen + 5)}\n開始 ${formatCaseTime(plan.deliveryOpen + 15)}\n場所：よしなに展示会場`,
    C02: `前回のチャット履歴\n${previous.occasion}\n部長「${previous.spokenHour}時10分前に集合ね」`,
    C03: `駅前シャトル\n${formatCaseTime(plan.departureMinutes)}発 → ${formatCaseTime(plan.deliveryOpen)}会場着\n次便は15分後。`,
    C04: `部長の手帳\n${previous.occasion}\n集合予定：${formatCaseTime(previous.arrivedMinutes)}　駅前広場`,
    C05: `駅前の天気予報\n${formatCaseTime(facts.weatherMinutes)}ごろから雨。\n雨具をお忘れなく。`,
    C06: `展示会用の資料箱\n受取場所：展示会場\n受取時間：${formatCaseTime(plan.deliveryOpen)}〜${formatCaseTime(plan.deliveryClose)}`,
    C07: 'シャトル乗り場まで徒歩2分。\n駅前と会場の時計は、同じ時刻に合わせてあります。',
  };
}
function stationCase(seed: number, random: Random): CaseInstance {
  const stage = cloneStage(getStage('stage02'));
  const spokenHour = random.int(9, 13);
  const interpretation = random.pick<StationCaseFacts['interpretation']>(['ten-before-hour', 'five-before-ten-past', 'one-before-ten-past']);
  const offset = READING_OFFSETS[interpretation];
  const previousHour = random.pick([9, 11, 14, 15].filter(hour => hour !== spokenHour));
  const facts: StationCaseFacts = { kind: 'station', today: `10月${random.int(2, 28)}日`, spokenHour, interpretation, previousMeetings: [{ occasion: random.pick(['先週の説明会', '前回の打ち合わせ', '先月の展示会']), spokenHour: previousHour, arrivedMinutes: previousHour * 60 + offset }], weatherMinutes: random.int(8 * 12, 15 * 12) * 5 };
  const arrivals: Record<Choice, number> = { A: spokenHour * 60 - 10, B: spokenHour * 60 + 5, C: spokenHour * 60 + 9 };
  const meetingMinutes = spokenHour * 60 + offset;
  const departureMinutes = meetingMinutes + random.pick([4, 9, 14, 19]);
  const travelMinutes = random.int(8, 18);
  const plan: StationCasePlan = { plazaOffset: 0, referenceOffset: 0, startMinutes: arrivals.A - 3, meetingMinutes, departureMinutes, arrivalMinutes: arrivals, displayedChoices: { ...arrivals }, outcomes: Object.fromEntries(CHOICES.map(c => [c, arrivals[c] === meetingMinutes ? 'meet' : arrivals[c] < meetingMinutes ? 'early' : arrivals[c] + 2 <= departureMinutes ? 'late-board' : 'late'])) as StationCasePlan['outcomes'], walkMinutes: 2, travelMinutes, deliveryOpen: departureMinutes + travelMinutes, deliveryClose: departureMinutes + travelMinutes + 2 };
  const bodies = stationDocuments(facts, plan);
  plan.signage = { eventPoster: `本日の展示会\n${formatCaseTime(plan.deliveryOpen + 15)} 開始`, timetable: `${formatCaseTime(departureMinutes)} 発\n${formatCaseTime(plan.deliveryOpen)} 会場着`, deliveryLabel: `展示会の資料\n${formatCaseTime(plan.deliveryOpen)}〜${formatCaseTime(plan.deliveryClose)}受取`, referenceClock: '部長の手帳\n前回の待ち合わせ', plazaClock: '駅前の時計', weather: `天気予報\n${formatCaseTime(facts.weatherMinutes)}ごろから雨`, walkway: 'シャトル乗り場\n徒歩2分' };
  const correctChoice = solveStationFacts(facts, plan)!;
  const reading = interpretation === 'ten-before-hour' ? `${spokenHour}時の10分前` : `${spokenHour}時10分の${interpretation === 'five-before-ten-past' ? '5分前' : 'すぐ前、1分前'}`;
  const proof = `前回のチャットと手帳の集合予定が、部長の区切り方を示していた。今回も「${reading}」、${formatCaseTime(meetingMinutes)}のつもりだった。`;
  const descriptions: Record<Choice, string> = { A: `${spokenHour}時の、10分前と受け取る。`, B: `${spokenHour}時10分の、5分前と受け取る。`, C: `${spokenHour}時10分の、すぐ前と受け取る。` };
  for (const choice of CHOICES) {
    const time = formatCaseTime(arrivals[choice]);
    const outcome = plan.outcomes[choice];
    stage.choices[choice] = { label: `${time}に集合する`, description: descriptions[choice] };
    stage.endings[choice] = outcome === 'meet' ? { title: 'あの「前」は、この時間。', subtitle: `${time}、駅前で合流`, boss: `${time}、ぴったり！ 前の待ち合わせと同じつもりで言ってたよ。シャトルに乗ろう。`, player: 'いつもの言い方、今回は読み取れました！', explanation: proof }
      : outcome === 'early' ? { title: 'まだ、待ち合わせの前。', subtitle: `${time}、駅前で待ちぼうけ`, boss: `${formatCaseTime(meetingMinutes)}のつもりだったよ。もう駅前にいるの？ ちょっと待ってて！`, player: 'あの「前」を、早いほうに受け取ってしまった……。', explanation: proof }
      : outcome === 'late-board' ? { title: '乗れたけど、待たせちゃった。', subtitle: `${time}、部長を待たせて合流`, boss: `${formatCaseTime(meetingMinutes)}に待ってたよ。まだ便には間に合うけど、今日は遅かったね。`, player: '「前」の幅を取り違えました。お待たせしました！', explanation: proof }
      : { title: '駅前に、ひとり。', subtitle: `${time}、シャトルは発車済み`, boss: `集合は${formatCaseTime(meetingMinutes)}のつもりだったんだ。${formatCaseTime(departureMinutes)}の便は出ちゃった……。`, player: '同じ「前」でも、思っていた時間が違いました……。', explanation: proof };
    stage.copy[`cinematic${choice}`] = `${time}に駅前へ。資料箱を持ち、部長との待ち合わせに向かう。`;
    stage.copy[`choice${choice}`] = stage.choices[choice].label;
  }
  const titles: Record<string, string> = { C02: '前回のチャット', C04: '部長の手帳' };
  stage.clues = stage.clues.map(clue => ({ ...clue, title: titles[clue.id] ?? clue.title, body: bodies[clue.id as keyof typeof bodies] }));
  stage.copy = { ...stage.copy, introBoss: `駅前で、${spokenHour}時10分前集合ね。いつもと同じ感じで。資料箱もよろしく！`, introThought: '', correctChoice, successLabel: '時間どおり', decisionHeading: '何時に集合する？', decisionNote: 'これまでのやりとりや、その場の状況から、今回の「前」を考えよう。', introInstruction: '制限時間2:00。駅前広場を調べて、集合時刻を決めよう。', caseInstruction: 'この人の「前」は、どういうつもりだろう。', worldClock: formatCaseTime(plan.startMinutes), worldLocation: 'よしなに駅前広場', worldLabel: '駅前で待ち合わせ。\nあの「前」は、何時？', clockLabel: '駅前の時計', stageTitle: `${spokenHour}時10分前集合` };
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
    if (!facts.roomName || !facts.occasion || !Number.isInteger(facts.visitorCount) || facts.visitorCount < 3 || facts.visitorCount > 12) errors.push('office context invalid');
    const bodies = officeDocuments(facts);
    for (const clue of instance.clues) if (clue.body !== bodies[clue.id as keyof typeof bodies]) errors.push(`${clue.id} text contradicts office context`);
    if (instance.endings[instance.correctChoice].explanation.includes('契約番号')) errors.push('office ending uses an administrative lookup');
  } else if (instance.facts.kind === 'station') {
    const facts = instance.facts, plan = instance.stationPlan;
    if (instance.id !== 'stage02' || !plan) errors.push('station plan missing');
    else {
      if (facts.previousMeetings.some(row => row.arrivedMinutes !== row.spokenHour * 60 + READING_OFFSETS[facts.interpretation])) errors.push('speaker history contradicts intended reading');
      if (plan.referenceOffset !== 0 || plan.plazaOffset !== 0) errors.push('station clocks must agree');
      if (plan.meetingMinutes !== facts.spokenHour * 60 + READING_OFFSETS[facts.interpretation]) errors.push('meeting differs from speaker history');
      if (plan.walkMinutes !== 2 || ![4, 9, 14, 19].includes(plan.departureMinutes - plan.meetingMinutes)) errors.push('transport timing differs');
      if (plan.deliveryOpen !== plan.departureMinutes + plan.travelMinutes || plan.deliveryClose !== plan.deliveryOpen + 2) errors.push('delivery time differs');
      if (facts.previousMeetings.length !== 1) errors.push('one previous meeting required');
      else {
        const bodies = stationDocuments(facts, plan);
        for (const clue of instance.clues) if (clue.body !== bodies[clue.id as keyof typeof bodies]) errors.push(`${clue.id} text contradicts station context`);
      }
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
