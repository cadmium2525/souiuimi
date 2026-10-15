import { getStage } from './stages.ts';
import { createMoneyCase, solveMoneyFacts, validateMoneyCase } from './moneyCases.ts';
import { createAmountCase, solveAmountFacts, validateAmountCase } from './amountCases.ts';
import { createDocumentCase, solveDocumentFacts, validateDocumentCase } from './documentCases.ts';
import type {
  CaseInstance, Choice, Ending, OfficeCaseFacts, StageDefinition, StageId,
  StationCaseFacts, StationCasePlan,
} from '../game/types.ts';

const CHOICES: Choice[] = ['A', 'B', 'C'];
const OFFICE_CONDITIONS: Record<Choice, string> = {
  A: '引渡し時：室内の机・椅子・備品を継続使用。机と床の汚れを除去。',
  B: '引渡し時：建物は現地で継続使用。室内の家具・備品は旧利用者へ返却。',
  C: '引渡し時：室内配置を維持したユニット全体を収納し、移設先へ納品。',
};
const OFFICE_ACTIONS: Record<Choice, string> = {
  A: '机と床を掃除する', B: '家具と備品を運び出す', C: 'オフィスを建物ごと収納する',
};

/** A seeded, deterministic generator. It creates facts, then solves their relation. */
class Random {
  private value: number;
  constructor(seed: number) { this.value = seed >>> 0; }
  next(): number {
    this.value = (this.value + 0x6d2b79f5) >>> 0;
    let n = this.value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  pick<T>(values: readonly T[]): T { return values[this.int(0, values.length - 1)]; }
  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

function identifiers(random: Random, prefix: string, count: number): string[] {
  const values = new Set<string>();
  while (values.size < count) values.add(`${prefix}${random.int(10, 99)}`);
  return [...values];
}

export function formatCaseTime(minutes: number): string {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function offsetText(offset: number): string {
  return offset === 0 ? '標準時と一致' : `標準時より${Math.abs(offset)}分${offset > 0 ? '進み' : '遅れ'}`;
}

function cloneStage(stage: StageDefinition): StageDefinition {
  return {
    ...stage, start: { ...stage.start }, clues: stage.clues.map(clue => ({ ...clue })),
    endings: Object.fromEntries(CHOICES.map(choice => [choice, { ...stage.endings[choice] }])) as Record<Choice, Ending>,
    copy: { ...stage.copy },
    choices: Object.fromEntries(CHOICES.map(choice => [choice, { ...stage.choices[choice] }])) as StageDefinition['choices'],
    cinematicSeconds: { ...stage.cinematicSeconds },
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Current room → today's assignment → contract. No prop or NPC identifies the answer. */
export function solveOfficeFacts(facts: OfficeCaseFacts): Choice | null {
  const assignments = facts.assignments.filter(row => row.date === facts.today && row.unit === facts.currentUnit);
  if (assignments.length !== 1) return null;
  const contracts = facts.contracts.filter(contract => contract.id === assignments[0].contract);
  if (contracts.length !== 1 || !CHOICES.includes(contracts[0].requirement)) return null;
  return contracts[0].requirement;
}

/** Both agenda and choices are converted to the same standard-time coordinate. */
export function solveStationFacts(facts: StationCaseFacts, plan: StationCasePlan): Choice | null {
  const meeting = facts.meetingEndReference - plan.referenceOffset + facts.bossWalkMinutes;
  const matches = CHOICES.filter(choice => plan.displayedChoices[choice] - plan.plazaOffset === meeting);
  return matches.length === 1 ? matches[0] : null;
}

export function solveCase(instance: CaseInstance): Choice | null {
  if (instance.facts.kind === 'document') return solveDocumentFacts(instance.facts);
  if (instance.facts.kind === 'amount') return solveAmountFacts(instance.facts);
  if (instance.facts.kind === 'money') return solveMoneyFacts(instance.facts);
  return instance.facts.kind === 'office'
    ? solveOfficeFacts(instance.facts)
    : instance.stationPlan ? solveStationFacts(instance.facts, instance.stationPlan) : null;
}

function officeCase(seed: number, random: Random): CaseInstance {
  const stage = cloneStage(getStage('stage01'));
  const day = random.int(2, 28);
  const today = `10月${day}日`;
  const units = identifiers(random, 'U', 3);
  const contractIds = identifiers(random, 'K', 3);
  const requirements = random.shuffle(CHOICES);
  const contracts = random.shuffle(contractIds.map((id, i) => ({
    id, requirement: requirements[i], condition: OFFICE_CONDITIONS[requirements[i]],
  })));
  const assignments = random.shuffle(units.map((unit, i) => ({ date: today, unit, contract: contractIds[i] })));
  const currentUnit = random.pick(units);
  const movingContract = contracts.find(contract => contract.requirement === 'C')!;
  const movingUnit = assignments.find(row => row.contract === movingContract.id)!.unit;
  const facts: OfficeCaseFacts = {
    kind: 'office', today, currentUnit, assignments, contracts,
    crane: { date: today, unit: movingUnit }, container: { date: today, unit: movingUnit },
    note: { date: `10月${day - 1}日`, unit: random.pick(units), boxes: random.int(2, 8) },
  };
  const correctChoice = solveOfficeFacts(facts)!;
  const assignment = assignments.find(row => row.unit === currentUnit)!;
  const contract = contracts.find(row => row.id === assignment.contract)!;
  const proof = `現在の部屋は${currentUnit}。${today}の対応表では${currentUnit} → ${assignment.contract}。\n${assignment.contract}の条件：${contract.condition}\nこの部屋で必要だったのは「${OFFICE_ACTIONS[correctChoice]}」。`;
  const bodies: Record<string, string> = {
    C01: `室内の管理札：${currentUnit}\n本日：${today}\n机には紙くずとコーヒーの染み。床にも紙が落ちている。`,
    C02: `本日の来客・契約確認予定（${today}）\n${assignments.map(row => `${row.unit}：15:00／契約 ${row.contract}`).join('\n')}`,
    C03: `移動式オフィス収納ユニット\n使用予約：${facts.container.date}／${facts.container.unit}\n容量：組立済みユニット1室`,
    C04: `引渡し条件一覧\n${contracts.map(row => `${row.id}：${row.condition}`).join('\n')}`,
    C05: `クレーン車 作業票\n作業日：${facts.crane.date}\n対象：${facts.crane.unit}\n作業：建物ユニットの吊り上げ`,
    C06: '当社のオフィスは移動式ユニット。\n室内清掃、空室引渡し、ユニット移設の各契約を取り扱う。',
    C07: `備品点検記録\n${facts.note.date}／${facts.note.unit}\n書類箱：${facts.note.boxes}箱。点検済み。`,
  };
  stage.clues = stage.clues.map(clue => ({ ...clue, body: bodies[clue.id] }));
  const success: Record<Choice, Ending> = {
    A: { title: '掃除して、準備完了。', subtitle: '室内の継続利用、準備完了', boss: `${currentUnit}、きれいになったね！ 机もそのまま使えて助かる。`, player: 'これでお客さんを迎えられます！', explanation: proof },
    B: { title: '中身だけ、片付けて正解。', subtitle: '空室での引渡し、準備完了', boss: `${currentUnit}、ちゃんと空室だね。建物は残して、これで引き渡せる！`, player: '外側まで運ばなくてよかった……。', explanation: proof },
    C: { title: 'そういう意味だったの！？', subtitle: 'ユニット全体の収納、完了', boss: `${currentUnit}、建物も中身も片付いてる！ これで移設できるね。`, player: '……本当にこれでよかったの！？', explanation: proof },
  };
  const wrongBoss: Record<Choice, Record<Choice, string>> = {
    A: { A: '', B: '机と備品は今日も使うんだけど！ どこへ運んじゃったの！？', C: '今日のお客さんはこの部屋を使うのに！ 部屋はどこ！？' },
    B: { A: '建物は残すけど、中は空室で引き渡す契約だよ！', B: '', C: '返すのは家具と備品だけ！ 建物は現地で使うんだって！' },
    C: { A: '掃除だけじゃなく、ユニット全体を移設する契約だよ！', B: '室内配置ごと移設するんだよ！ 中身だけ別便にしないで！', C: '' },
  };
  for (const choice of CHOICES) {
    stage.endings[choice] = choice === correctChoice ? success[choice] : {
      title: choice === 'A' ? 'ピカピカだけど、条件が違う。' : choice === 'B' ? '中身を運んだ。その契約は？' : '建物ごと、その契約は？',
      subtitle: `実行：${OFFICE_ACTIONS[choice]}`,
      boss: `${currentUnit}の${assignment.contract}を確認して！ ${wrongBoss[correctChoice][choice]}`,
      player: '設備があるだけで、うちの部屋の仕事とは限らないのか……。',
      explanation: `${proof}\n実行したのは「${OFFICE_ACTIONS[choice]}」だった。`,
    };
  }
  stage.copy = {
    ...stage.copy, introThought: '', correctChoice,
    successLabel: correctChoice === 'C' ? 'まさかの大正解' : '条件どおり',
    worldLocation: `株式会社よしなに / ${currentUnit}`,
    worldClock: '14:55', worldLabel: `同じオフィスでも、\n今日の契約は？`,
    decisionNote: '集めた手がかりをもとに、上司の真意を決めよう。',
    caseInstruction: '本日の対象と、契約の条件を調べよう。',
  };
  return { ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C01', 'C02', 'C04'], officeUnit: currentUnit, facts };
}

function stationCase(seed: number, random: Random): CaseInstance {
  const stage = cloneStage(getStage('stage02'));
  const day = random.int(2, 28);
  const today = `10月${day}日`;
  const referenceClock = `R${random.int(10, 99)}`;
  const plazaClock = `P${random.int(10, 99)}`;
  const spokenHour = random.int(9, 13);
  const interpretation = random.pick(['ten-before-hour', 'before-ten-past'] as const);
  const referenceMeeting = spokenHour * 60 + (interpretation === 'ten-before-hour' ? -10 : 5);
  const referenceOffset = random.pick([-20, -15, -10, -5, 0, 5, 10, 15, 20]);
  const plazaOffset = random.pick([-20, -15, -10, -5, 0, 5, 10, 15, 20]);
  const meetingMinutes = referenceMeeting - referenceOffset;
  const bossWalkMinutes = random.int(3, 7);
  const meetingEndReference = referenceMeeting - bossWalkMinutes;
  const walkMinutes = 2;
  const travelMinutes = random.int(8, 18);
  // Transport availability must not identify the intended gathering time.
  const departureMinutes = meetingMinutes + random.pick([4, 9, 14, 19, 24]);
  const deliveryOpen = departureMinutes + travelMinutes;
  const deliveryClose = deliveryOpen + 2;
  // The rank is independent of clock offsets and the speaker's interpretation.
  const rank = random.int(0, 2);
  const gaps = random.shuffle([5, 10, 15, 20]).slice(0, 2).sort((a, b) => a - b);
  const selectedMinutes = rank === 0
    ? [meetingMinutes, meetingMinutes + gaps[0], meetingMinutes + gaps[1]]
    : rank === 1
      ? [meetingMinutes - gaps[0], meetingMinutes, meetingMinutes + gaps[1]]
      : [meetingMinutes - gaps[1], meetingMinutes - gaps[0], meetingMinutes];
  const arrivalMinutes = Object.fromEntries(CHOICES.map((choice, i) => [choice, selectedMinutes[i]])) as Record<Choice, number>;
  const displayedChoices = Object.fromEntries(CHOICES.map(choice => [choice, arrivalMinutes[choice] + plazaOffset])) as Record<Choice, number>;
  const outcomes = Object.fromEntries(CHOICES.map(choice => [choice,
    arrivalMinutes[choice] === meetingMinutes ? 'meet' : arrivalMinutes[choice] < meetingMinutes ? 'early'
      : arrivalMinutes[choice] + walkMinutes <= departureMinutes ? 'late-board' : 'late',
  ])) as StationCasePlan['outcomes'];
  const weatherMinutes = random.int(8 * 12, 15 * 12) * 5;
  const plan: StationCasePlan = {
    plazaOffset, referenceOffset, startMinutes: selectedMinutes[0] - 3,
    meetingMinutes, departureMinutes, arrivalMinutes, outcomes, displayedChoices,
    walkMinutes, travelMinutes, deliveryOpen, deliveryClose,
    signage: {
      eventPoster: `会場時計 ${referenceClock}\n${offsetText(referenceOffset)}\n${today}／本日有効`,
      timetable: `シャトル（標準時）\n${formatCaseTime(departureMinutes)}発 → ${formatCaseTime(deliveryOpen)}着\n次便 ${formatCaseTime(departureMinutes + 15)}発`,
      deliveryLabel: `会場へ納品／標準時\n${formatCaseTime(deliveryOpen)}〜${formatCaseTime(deliveryClose)}`,
      referenceClock: `本日の会議終了\n時計${referenceClock} ${formatCaseTime(meetingEndReference)}\n駅前へ徒歩${bossWalkMinutes}分`,
      plazaClock: `広場時計 ${plazaClock}`,
      weather: `${today}／駅前予報\n標準時${formatCaseTime(weatherMinutes)}から雨`,
      walkway: `シャトル乗り場\n徒歩${walkMinutes}分`,
    },
  };
  const facts: StationCaseFacts = {
    kind: 'station', today, referenceClock, plazaClock, spokenHour, interpretation,
    meetingEndReference, bossWalkMinutes, oldMemoDate: `10月${day - 1}日`, weatherMinutes,
  };
  const correctChoice = solveStationFacts(facts, plan)!;
  const targetDisplay = formatCaseTime(meetingMinutes + plazaOffset);
  const proof = `本日の部長の会議終了は時計${referenceClock}で${formatCaseTime(meetingEndReference)}。駅前へ徒歩${bossWalkMinutes}分なので、合流は同じ時計で${formatCaseTime(referenceMeeting)}。\n時計${referenceClock}は${offsetText(referenceOffset)}。合流の標準時は${formatCaseTime(meetingMinutes)}。広場時計${plazaClock}は${offsetText(plazaOffset)}なので、表示は${targetDisplay}。\n今回は「${interpretation === 'ten-before-hour' ? `${spokenHour}時の10分前` : `${spokenHour}時10分の少し前`}」という意図だった。`;
  const bodies: Record<string, string> = {
    C01: `会場時計 校正票（${today}）\n時計ID：${referenceClock}\n${offsetText(referenceOffset)}。本日有効。`,
    C02: `同僚の過去メモ（${facts.oldMemoDate}）\n前日の別イベント：開始${formatCaseTime(spokenHour * 60 + 60)}／会場到着${formatCaseTime(spokenHour * 60 + 55)}\n記録者：同僚。時刻：標準時。`,
    C03: `シャトル時刻表（標準時）\n${formatCaseTime(departureMinutes)}発 → ${formatCaseTime(deliveryOpen)}会場着\n次便 ${formatCaseTime(departureMinutes + 15)}発 → ${formatCaseTime(deliveryOpen + 15)}着`,
    C04: `部長の本日行程（${today}）\n会議終了：会場時計${referenceClock}で${formatCaseTime(meetingEndReference)}\n会議室から駅前へ徒歩${bossWalkMinutes}分。会議後そのまま合流。`,
    C05: `駅前の天気予報（${today}）\n標準時${formatCaseTime(weatherMinutes)}から雨。`,
    C06: `広場時計 点検記録（${today}）\n時計ID：${plazaClock}\n${offsetText(plazaOffset)}。本日有効。\n資料箱の受取：会場で標準時${formatCaseTime(deliveryOpen)}〜${formatCaseTime(deliveryClose)}`,
    C07: `シャトル乗り場まで徒歩${walkMinutes}分。\n運行時刻表・資料の受取時間は標準時を使用。`,
  };
  const titles: Record<string, string> = { C01: '会場時計の校正票', C02: '同僚の過去メモ', C03: 'シャトル時刻表', C04: '部長の本日行程', C05: '天気予報', C06: '広場時計の点検記録', C07: '乗り場案内' };
  stage.clues = stage.clues.map(clue => ({ ...clue, title: titles[clue.id], body: bodies[clue.id] }));
  for (const choice of CHOICES) {
    const time = formatCaseTime(displayedChoices[choice]);
    stage.choices[choice] = { label: `${plazaClock}が${time}のとき`, description: '広場の時計の表示で集合する。' };
    const outcome = outcomes[choice];
    stage.endings[choice] = outcome === 'meet' ? {
      title: '時計は違っても、時間どおり。', subtitle: '合流して、資料も納品',
      boss: `時計${plazaClock}で${targetDisplay}。ぴったりだね！ 標準時${formatCaseTime(departureMinutes)}の便に乗ろう。`,
      player: '時計の基準と行程を、合わせて読めました！', explanation: proof,
    } : outcome === 'early' ? {
      title: '早すぎた。まだ合流前。', subtitle: `広場時計${plazaClock}で${time}に到着`,
      boss: `合流はこの時計で${targetDisplay}だったんだ。そんなに早く待っていたの？`,
      player: '今回は、ただ早ければ正解というわけじゃなかった……。',
      explanation: `${proof}\n選んだ表示${time}は標準時${formatCaseTime(arrivalMinutes[choice])}。予定より${meetingMinutes - arrivalMinutes[choice]}分早い到着で、部長との合流まで待ちぼうけ。`,
    } : outcome === 'late-board' ? {
      title: '乗れたけれど、待たせてしまった。', subtitle: 'シャトルには間に合ったが、集合には遅刻',
      boss: `合流はこの時計で${targetDisplay}だったよ。便には間に合ったけど、待っていたんだ。`,
      player: '乗れる時刻と、約束の時刻は別だった……。',
      explanation: `${proof}\n選んだ表示${time}は標準時${formatCaseTime(arrivalMinutes[choice])}。集合に${arrivalMinutes[choice] - meetingMinutes}分遅れたが、徒歩${walkMinutes}分で標準時${formatCaseTime(departureMinutes)}の便には間に合った。`,
    } : {
      title: '遅れた。シャトルは出発済み。', subtitle: `広場時計${plazaClock}で${time}に到着`,
      boss: `合流はこの時計で${targetDisplay}だったよ。標準時${formatCaseTime(departureMinutes)}のシャトルは出ちゃった……。`,
      player: '数字だけ見て、基準の時計と行程を取り違えた……。',
      explanation: `${proof}\n選んだ表示${time}は標準時${formatCaseTime(arrivalMinutes[choice])}。出発後に到着した。次便の会場着${formatCaseTime(deliveryOpen + 15)}は資料の受取期限${formatCaseTime(deliveryClose)}を過ぎる。`,
    };
    stage.copy[`cinematic${choice}`] = `広場時計${plazaClock}が${time}を示すときに駅前へ。`;
  }
  stage.copy = {
    ...stage.copy, introBoss: `駅前で、${spokenHour}時10分前集合ね。時刻は会場の時計${referenceClock}で。会場に届ける資料もよろしく！`,
    introThought: '', correctChoice, successLabel: '時間どおり',
    decisionHeading: `広場時計${plazaClock}では何時？`,
    decisionNote: `指示の時刻は会場時計${referenceClock}。選択肢は広場時計${plazaClock}の表示。`,
    introInstruction: '制限時間2:00。駅前広場を調べ、広場の時計の表示で集合時刻を決めよう。',
    caseInstruction: '指示と選択肢は別の時計。行程と時計の記録を合わせて調べよう。',
    worldClock: formatCaseTime(plan.startMinutes + plazaOffset),
    worldLocation: `よしなに駅前広場 / 時計${plazaClock}`,
    worldLabel: '同じ指示でも、\n今日の行程と時計は？',
    clockLabel: `広場時計 ${plazaClock}`,
    stageTitle: `${spokenHour}時10分前集合`,
  };
  stage.title = stage.copy.stageTitle;
  return { ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C04', 'C01', 'C06'], stationPlan: plan, facts };
}

/** Validation is pure and reports every violated invariant rather than repairing facts. */
export function validateCase(instance: CaseInstance): string[] {
  const errors: string[] = [];
  const bodyHas = (id: string, parts: string[]) => {
    const body = instance.clues.find(clue => clue.id === id)?.body ?? '';
    if (parts.some(part => !body.includes(part))) errors.push(`${id} text contradicts facts`);
  };
  if (solveCase(instance) !== instance.correctChoice) errors.push('facts do not produce the declared unique answer');
  if (instance.copy.correctChoice !== instance.correctChoice) errors.push('copy answer differs from facts');
  const available = instance.choiceIds ?? CHOICES;
  if (available.length < 2 || new Set(available).size !== available.length || available.some(choice => !CHOICES.includes(choice)) || !available.includes(instance.correctChoice)) errors.push('available choices do not contain a unique playable answer');
  if (instance.clues.length !== 7 || new Set(instance.clues.map(clue => clue.id)).size !== 7) errors.push('seven distinct clues required');
  if (instance.evidenceChain.some(id => !instance.clues.some(clue => clue.id === id))) errors.push('evidence chain references absent clue');
  if (instance.clues.some(clue => !clue.body || Object.hasOwn(clue, 'thought'))) errors.push('clues must contain facts only');
  if (instance.facts.kind === 'office') {
    const facts = instance.facts;
    if (instance.id !== 'stage01' || instance.officeUnit !== facts.currentUnit) errors.push('office identity mismatch');
    if (facts.assignments.length !== 3 || new Set(facts.assignments.map(row => row.unit)).size !== 3) errors.push('three distinct units required');
    if (facts.contracts.length !== 3 || new Set(facts.contracts.map(row => row.id)).size !== 3) errors.push('three distinct contracts required');
    if (new Set(facts.contracts.map(row => row.requirement)).size !== 3) errors.push('all three contract conditions required');
    if (new Set(facts.assignments.map(row => row.contract)).size !== 3 || facts.assignments.some(row => row.date !== facts.today || !facts.contracts.some(contract => contract.id === row.contract))) errors.push('assignment relation inconsistent');
    const moving = facts.assignments.find(row => facts.contracts.some(contract => contract.id === row.contract && contract.requirement === 'C'));
    if (!moving || facts.crane.unit !== moving.unit || facts.container.unit !== moving.unit || facts.crane.date !== facts.today || facts.container.date !== facts.today) errors.push('equipment reservation contradicts contract');
    if (facts.note.date === facts.today || !facts.assignments.some(row => row.unit === facts.note.unit)) errors.push('historical note must be dated and refer to a real unit');
    for (const contract of facts.contracts) if (contract.condition !== OFFICE_CONDITIONS[contract.requirement]) errors.push('condition text differs from requirement');
    bodyHas('C01', [facts.currentUnit, facts.today, 'コーヒーの染み']);
    bodyHas('C02', [facts.today, ...facts.assignments.map(row => `${row.unit}：15:00／契約 ${row.contract}`)]);
    bodyHas('C03', [facts.container.date, facts.container.unit, '組立済みユニット']);
    bodyHas('C04', facts.contracts.map(row => `${row.id}：${row.condition}`));
    bodyHas('C05', [facts.crane.date, facts.crane.unit, '吊り上げ']);
    bodyHas('C07', [facts.note.date, facts.note.unit, `${facts.note.boxes}箱`]);
    const target = facts.assignments.find(row => row.date === facts.today && row.unit === facts.currentUnit);
    const contract = facts.contracts.find(row => row.id === target?.contract);
    if (target && contract) {
      for (const choice of CHOICES) {
        const ending = instance.endings[choice];
        if (!ending.boss.includes(facts.currentUnit) || !ending.explanation.includes(`${facts.currentUnit} → ${target.contract}`) || !ending.explanation.includes(contract.condition)) errors.push('office ending differs from case evidence');
      }
    }
  } else if (instance.facts.kind === 'money') {
    errors.push(...validateMoneyCase(instance));
  } else if (instance.facts.kind === 'amount') {
    errors.push(...validateAmountCase(instance));
  } else if (instance.facts.kind === 'document') {
    errors.push(...validateDocumentCase(instance));
  } else {
    const facts = instance.facts;
    const plan = instance.stationPlan;
    if (instance.id !== 'stage02' || !plan) errors.push('station plan missing');
    else {
      const referenceMeeting = facts.spokenHour * 60 + (facts.interpretation === 'ten-before-hour' ? -10 : 5);
      if (facts.meetingEndReference + facts.bossWalkMinutes !== referenceMeeting || referenceMeeting - plan.referenceOffset !== plan.meetingMinutes) errors.push('spoken instruction and agenda disagree');
      if (![4, 9, 14, 19, 24].includes(plan.departureMinutes - plan.meetingMinutes) || plan.walkMinutes !== 2) errors.push('departure or walkway mismatch');
      if (plan.deliveryOpen !== plan.departureMinutes + plan.travelMinutes || plan.deliveryClose !== plan.deliveryOpen + 2) errors.push('delivery window contradicts bus');
      if (plan.startMinutes !== Math.min(...Object.values(plan.arrivalMinutes)) - 3) errors.push('start is not before all choices');
      if (!(plan.displayedChoices.A < plan.displayedChoices.B && plan.displayedChoices.B < plan.displayedChoices.C)) errors.push('choices must be distinct and sorted');
      if (CHOICES.filter(choice => plan.outcomes[choice] === 'meet').length !== 1) errors.push('exactly one meeting choice required');
      for (const choice of CHOICES) {
        const arrival = plan.displayedChoices[choice] - plan.plazaOffset;
        const outcome = arrival === plan.meetingMinutes ? 'meet' : arrival < plan.meetingMinutes ? 'early'
          : arrival + plan.walkMinutes <= plan.departureMinutes ? 'late-board' : 'late';
        if (plan.arrivalMinutes[choice] !== arrival || plan.outcomes[choice] !== outcome) errors.push('arrival conversion or outcome mismatch');
        if (outcome === 'late' && arrival + plan.walkMinutes <= plan.departureMinutes) errors.push('late candidate must miss the bus');
        if (!instance.choices[choice].label.includes(formatCaseTime(plan.displayedChoices[choice]))) errors.push('choice label does not match displayed time');
      }
      if (!instance.copy.introBoss.includes(facts.referenceClock) || !instance.copy.decisionHeading.includes(facts.plazaClock)) errors.push('clock references must be explicit before choosing');
      bodyHas('C01', [facts.today, facts.referenceClock, offsetText(plan.referenceOffset)]);
      bodyHas('C02', [facts.oldMemoDate, '同僚', '別イベント']);
      bodyHas('C03', [formatCaseTime(plan.departureMinutes), formatCaseTime(plan.deliveryOpen), '標準時']);
      bodyHas('C04', [facts.today, facts.referenceClock, formatCaseTime(facts.meetingEndReference), `徒歩${facts.bossWalkMinutes}分`]);
      bodyHas('C05', [facts.today, formatCaseTime(facts.weatherMinutes), '標準時']);
      bodyHas('C06', [facts.today, facts.plazaClock, offsetText(plan.plazaOffset), formatCaseTime(plan.deliveryOpen), formatCaseTime(plan.deliveryClose)]);
      bodyHas('C07', [`徒歩${plan.walkMinutes}分`, '標準時']);
      for (const choice of CHOICES) {
        const ending = instance.endings[choice];
        if (!ending.explanation.includes(facts.referenceClock) || !ending.explanation.includes(facts.plazaClock) || !ending.explanation.includes(formatCaseTime(plan.meetingMinutes)) || !ending.boss.includes(formatCaseTime(plan.meetingMinutes + plan.plazaOffset))) errors.push('station ending differs from clock evidence');
      }
    }
  }
  return errors;
}

export function createCase(stageId: StageId, seed: number): CaseInstance {
  if (!Number.isFinite(seed)) throw new RangeError('Case seed must be a finite number');
  if (stageId !== 'stage01' && stageId !== 'stage02' && stageId !== 'stage03' && stageId !== 'stage04' && stageId !== 'stage05') throw new RangeError('Unknown stage');
  const caseSeed = seed >>> 0;
  const random = new Random(caseSeed);
  const result = stageId === 'stage01' ? officeCase(caseSeed, random) : stageId === 'stage02' ? stationCase(caseSeed, random) : stageId === 'stage03' ? createMoneyCase(caseSeed) : stageId === 'stage04' ? createAmountCase(caseSeed) : createDocumentCase(caseSeed);
  const errors = validateCase(result);
  if (errors.length) throw new Error(`Invalid generated case: ${errors.join('; ')}`);
  return deepFreeze(result);
}
