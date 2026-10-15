import { DOCUMENT_ACTIONS, documentCondition, STAGE05 } from './stage05.ts';
import type { CaseInstance, Choice, DocumentCaseFacts, Ending, StageDefinition } from '../game/types.ts';

const ALL: Choice[] = ['A', 'B', 'C'];
const CONTENT: Record<Choice, DocumentCaseFacts['intakes'][number]['content']> = { A: 'key-points', B: 'full-copy', C: 'all-originals' };
const DELIVERY: Record<Choice, DocumentCaseFacts['intakes'][number]['delivery']> = { A: 'single-page', B: 'per-person', C: 'single-load' };
const PAGE_COUNTS = [120, 160, 200, 240, 280, 320];
const COUNTER = '資料の搬出窓口\n資料番号・行先・受付番号を受渡票に記入してください。\n受付ごとの受け渡し条件で照合します。';
const EQUIPMENT = '資料準備室の共用備品\n複写機・ページトレー・クリップ・大型クリップ・搬出台車\n使用後は所定の位置へ戻してください。';

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
  pick<T>(items: readonly T[]): T { return items[this.int(0, items.length - 1)]; }
  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

function ids(random: Random, prefix: string): string[] {
  const result = new Set<string>();
  while (result.size < 3) result.add(`${prefix}${random.int(10, 99)}`);
  return [...result];
}

function octoberDay(date: string): number {
  const match = /^10月([1-9]|[12]\d|3[01])日$/.exec(date);
  return match ? Number(match[1]) : NaN;
}

function intakeChoice(intake: DocumentCaseFacts['intakes'][number]): Choice | null {
  const matches = ALL.filter(choice => intake.content === CONTENT[choice] && intake.delivery === DELIVERY[choice]);
  return matches.length === 1 ? matches[0] : null;
}

/** Match today's packet to both its destination and receipt, then read content and delivery requirements. */
export function solveDocumentFacts(facts: DocumentCaseFacts): Choice | null {
  if (!Number.isFinite(octoberDay(facts.today)) || !Number.isInteger(facts.setCount) || facts.setCount <= 0
      || !Number.isInteger(facts.pageCount) || facts.pageCount <= 1) return null;
  const assignments = facts.assignments.filter(row => row.date === facts.today && row.packet === facts.packetId);
  if (assignments.length !== 1) return null;
  const target = assignments[0];
  const intakes = facts.intakes.filter(row => row.receipt === target.receipt);
  if (intakes.length !== 1 || intakes[0].destination !== target.destination) return null;
  return intakeChoice(intakes[0]);
}

function proofFor(facts: DocumentCaseFacts, answer: Choice): string {
  const target = facts.assignments.find(row => row.date === facts.today && row.packet === facts.packetId)!;
  const intake = facts.intakes.find(row => row.receipt === target.receipt)!;
  const meaning: Record<Choice, string> = {
    A: '内容の要点を1枚に整理すること。全ページの複製や原本の搬出は、説明担当用の1枚にはならない。',
    B: `全${facts.pageCount}ページをページ順にそろえ、参加者${facts.setCount}人それぞれの配布セットを作ること。1枚の要約や原本一括の搬出では、1人1部の資料にならない。`,
    C: '原本全量をまとめて回収すること。巨大な一束は、その作業を誇張した演出。束の大きさや留め方を推理する必要はなく、要約や配布用の複製では原本の回収にならない。',
  };
  return `対象は${facts.today}の資料${facts.packetId}。搬出表では${facts.packetId} → 行先${target.destination}／受付${target.receipt}。\n${target.receipt}の受け渡し条件：${intake.condition}\n今回の「まとめる」は、${meaning[answer]}`;
}

/** Generate every purpose each time; the selected dated relation determines the answer. */
export function createDocumentCase(inputSeed: number): CaseInstance {
  if (!Number.isFinite(inputSeed)) throw new RangeError('case seed must be finite');
  const seed = inputSeed >>> 0;
  const random = new Random(seed);
  const day = random.int(3, 28);
  const today = `10月${day}日`;
  const packets = ids(random, 'P');
  const destinations = ids(random, 'D');
  const receipts = ids(random, 'R');
  const purposes = random.shuffle(ALL);
  const pageCount = random.pick(PAGE_COUNTS);
  const setCount = random.int(4, 9);
  const intakes = random.shuffle(receipts.map((receipt, index) => ({
    receipt, destination: destinations[index], content: CONTENT[purposes[index]], delivery: DELIVERY[purposes[index]],
    condition: documentCondition(purposes[index], pageCount, setCount),
  })));
  const current = packets.map((packet, index) => ({ date: today, packet, destination: destinations[index], receipt: receipts[index] }));
  const target = random.pick(current);
  const previousIntake = random.pick(intakes.filter(row => row.receipt !== target.receipt));
  const assignments = random.shuffle([...current, {
    date: `10月${day - 1}日`, packet: target.packet, destination: previousIntake.destination, receipt: previousIntake.receipt,
  }]);
  const facts: DocumentCaseFacts = { kind: 'document', today, packetId: target.packet, pageCount, setCount, assignments, intakes };
  const correctChoice = solveDocumentFacts(facts)!;
  const proof = proofFor(facts, correctChoice);
  const previous = assignments.find(row => row.date !== today)!;
  const bodies: Record<string, string> = {
    C01: `本日：${today}\n対象資料：${target.packet}\n伝言「明日使う資料、まとめといて」`,
    C02: `資料の搬出記録\n${assignments.map(row => `${row.date}／${row.packet} → 行先${row.destination}／受付${row.receipt}`).join('\n')}`,
    C03: intakes.map(row => `受付${row.receipt}／行先${row.destination}\n${row.condition}`).join('\n'),
    C04: `資料${target.packet}\n原本：全${pageCount}ページ\nページ番号：1〜${pageCount}\n複製可。原本への書き込み不可。\n配布名簿：${setCount}人分`,
    C05: COUNTER,
    C06: `${previous.date}／資料${previous.packet}\n行先${previous.destination}／受付${previous.receipt}\nこの日の引渡しは完了。\n記録者：資料準備室受付`,
    C07: EQUIPMENT,
  };
  const reference = `${target.packet}、行先${target.destination}の受付${target.receipt}`;
  const success: Record<Choice, Ending> = {
    A: { title: '要点1枚、準備完了。', subtitle: `${target.packet}の要点を1枚に整理`, boss: `${reference}で受領。伝えることが1枚にまとまっているね。これで明日の説明ができる！`, player: '原本は保管してあります。説明用はこちらです！', explanation: proof },
    B: { title: '一人ひとりに、一そろい。', subtitle: `${target.packet}を${setCount}人分の配布セットに整理`, boss: `${reference}で受領。全${pageCount}ページ、${setCount}人分そろっているね。明日はこれを配ろう！`, player: '順番も部数も確認済みです！', explanation: proof },
    C: { title: 'その一束、まるごと受領。', subtitle: `${target.packet}の原本全量を一括回収`, boss: `${reference}で受領。原本、全部そろっているね！ ……クリップまで特大だ。`, player: '全部まとめて、一括搬出です！', explanation: proof },
  };
  const wrongBoss: Record<Choice, Record<Choice, string>> = {
    A: {
      A: '', B: `全ページを${setCount}セット作ったの？ 明日の説明担当には、要点1枚が必要なんだ。`,
      C: '……これ、明日どうやって読むの？ 原本はここに残して、説明用に要点を1枚にしてほしかったんだ。',
    },
    B: {
      A: `1枚の要約では、参加者${setCount}人が全${pageCount}ページを読めないよ。1人1部ずつ必要なんだ。`, B: '',
      C: `……これ、明日どうやって読むの？ 原本は保管して、${setCount}人に全ページの複製を配るんだよ。`,
    },
    C: {
      A: '要約はよくできているけど、今日は原本を全部引き取る日なんだ。元の資料も持ってきて。',
      B: '配布するんじゃなくて、原本を一括で回収するんだ。複製が増えてる！', C: '',
    },
  };
  const subtitles: Record<Choice, string> = {
    A: `${target.packet}の要点を1枚に整理`, B: `${target.packet}を${setCount}人分の配布セットに整理`, C: `${target.packet}の原本全量を一束にして搬出`,
  };
  const wrongTitles: Record<Choice, string> = {
    A: '1枚にした。その受付条件は？', B: `きれいな${setCount}部。その受付条件は？`, C: '巨大な一束、どうやって読むの？',
  };
  const wrongPlayer: Record<Choice, string> = {
    A: '内容を短くするほうの「まとめる」じゃなかった……。',
    B: '配る準備だけ、完璧にできてしまった……。',
    C: 'まとまっては、いるんですが……。',
  };
  const endings = Object.fromEntries(ALL.map(choice => [choice, choice === correctChoice ? success[choice] : {
    title: wrongTitles[choice], subtitle: subtitles[choice], boss: `${reference}だよ。${wrongBoss[correctChoice][choice]}`,
    player: wrongPlayer[choice], explanation: `${proof}\n実行したのは「${DOCUMENT_ACTIONS[choice]}」だった。`,
  }])) as Record<Choice, Ending>;
  const choices: StageDefinition['choices'] = {
    A: { label: DOCUMENT_ACTIONS.A, description: '内容を読み込み、要点をA4の1枚に整理する。' },
    B: { label: DOCUMENT_ACTIONS.B, description: `全${pageCount}ページを順番にそろえ、${setCount}人分の複製を用意する。` },
    C: { label: DOCUMENT_ACTIONS.C, description: '原本全量を一束に留め、台車で一括搬出する。' },
  };
  const stage: StageDefinition = {
    ...STAGE05, start: { ...STAGE05.start }, choices,
    clues: STAGE05.clues.map(clue => ({ ...clue, body: bodies[clue.id] })), endings,
    cinematicSeconds: { ...STAGE05.cinematicSeconds },
    copy: {
      ...STAGE05.copy, correctChoice, successLabel: correctChoice === 'C' ? 'まさかの一括受領' : '受渡条件どおり',
      introBoss: `明日使う資料、まとめといて。対象は${target.packet}ね。`,
      worldLocation: `よしなに資料準備室 / ${target.packet}`,
      cinematicA: `資料${target.packet}の要点を、A4の1枚に整理する。`,
      cinematicB: `資料${target.packet}の全${pageCount}ページを順にそろえ、${setCount}人分の配布セットを作る。`,
      cinematicC: `資料${target.packet}の原本全${pageCount}ページを束ね、巨大クリップで留めて台車で運ぶ。`,
    },
  };
  return {
    ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C01', 'C02', 'C03'], facts,
    documentPlan: {
      packetId: target.packet, setCount, pageCount, intendedChoice: correctChoice,
      signage: {
        request: `${today}\n資料 ${target.packet}\n明日使う資料`,
        assignments: '日付別の搬出表\n資料・行先・受付',
        intakes: '受け渡し条件一覧\n受付番号・行先',
        source: `資料 ${target.packet}\n原本 ${pageCount}ページ\n配布名簿 ${setCount}人`,
        counter: '資料の搬出窓口\n受渡票を添付',
        oldMemo: `${previous.date}\n資料 ${previous.packet}\n受付 ${previous.receipt}`,
        equipment: '共用備品\n複写機・トレー\nクリップ・台車',
      },
    },
  };
}

/** Validate both the factual relation and every displayed record; malformed instances are never repaired. */
export function validateDocumentCase(instance: CaseInstance): string[] {
  if (instance.facts.kind !== 'document') return ['not a document case'];
  const errors: string[] = [];
  const facts = instance.facts;
  const plan = instance.documentPlan;
  const bodyHas = (id: string, parts: string[]) => {
    const body = instance.clues.find(clue => clue.id === id)?.body ?? '';
    if (parts.some(part => !body.includes(part))) errors.push(`${id} text contradicts document facts`);
  };
  const solved = solveDocumentFacts(facts);
  if (!solved || solved !== instance.correctChoice) errors.push('document facts do not produce the declared unique answer');
  if (instance.id !== 'stage05' || instance.copy.correctChoice !== instance.correctChoice) errors.push('document identity or copy answer differs');
  if (instance.seconds !== 120 || instance.clues.length !== 7 || instance.cinematicSeconds.A !== 10 || instance.cinematicSeconds.B !== 12 || instance.cinematicSeconds.C !== 14) errors.push('document duration or clue count differs');
  if ((instance.choiceIds ?? ALL).join('') !== 'ABC') errors.push('document case requires exactly A B C');
  if (instance.copy.introThought !== '' || !instance.copy.introBoss.includes(facts.packetId)) errors.push('document introduction differs from packet');
  if (!PAGE_COUNTS.includes(facts.pageCount) || !Number.isInteger(facts.setCount) || facts.setCount < 4 || facts.setCount > 9) errors.push('document page or participant count invalid');
  if (!plan || plan.packetId !== facts.packetId || plan.pageCount !== facts.pageCount || plan.setCount !== facts.setCount || plan.intendedChoice !== solved) errors.push('document plan differs from facts');
  const current = facts.assignments.filter(row => row.date === facts.today);
  if (current.length !== 3 || new Set(current.map(row => row.packet)).size !== 3 || new Set(current.map(row => row.destination)).size !== 3 || new Set(current.map(row => row.receipt)).size !== 3) errors.push('document assignments need three distinct current relations');
  if (facts.intakes.length !== 3 || new Set(facts.intakes.map(row => row.receipt)).size !== 3 || new Set(facts.intakes.map(row => row.destination)).size !== 3
      || new Set(facts.intakes.map(intakeChoice)).size !== 3 || facts.intakes.some(row => !intakeChoice(row))) errors.push('document intake purposes must contain all three consistent requirements');
  for (const row of current) {
    if (facts.intakes.filter(intake => intake.receipt === row.receipt && intake.destination === row.destination).length !== 1) errors.push('document assignment differs from intake destination');
  }
  for (const row of facts.intakes) {
    const choice = intakeChoice(row);
    if (choice && row.condition !== documentCondition(choice, facts.pageCount, facts.setCount)) errors.push('document condition text differs from content or delivery requirements');
  }
  const target = current.find(row => row.packet === facts.packetId);
  const previous = facts.assignments.filter(row => row.date !== facts.today);
  if (facts.assignments.length !== 4 || previous.length !== 1 || previous[0].packet !== facts.packetId || previous[0].receipt === target?.receipt
      || !Number.isFinite(octoberDay(previous[0].date)) || octoberDay(previous[0].date) >= octoberDay(facts.today)
      || !facts.intakes.some(row => row.receipt === previous[0].receipt && row.destination === previous[0].destination)) errors.push('document previous memo must refer to a different past assignment');
  bodyHas('C01', [facts.today, facts.packetId, '明日使う資料、まとめといて']);
  for (const row of facts.assignments) bodyHas('C02', [`${row.date}／${row.packet} → 行先${row.destination}／受付${row.receipt}`]);
  for (const row of facts.intakes) bodyHas('C03', [`受付${row.receipt}／行先${row.destination}\n${row.condition}`]);
  bodyHas('C04', [facts.packetId, `全${facts.pageCount}ページ`, `1〜${facts.pageCount}`, `配布名簿：${facts.setCount}人分`, '原本への書き込み不可']);
  bodyHas('C05', [COUNTER]);
  if (previous.length === 1) bodyHas('C06', [previous[0].date, previous[0].packet, previous[0].destination, previous[0].receipt, 'この日の引渡しは完了']);
  bodyHas('C07', [EQUIPMENT]);
  if (plan && (!plan.signage.request?.includes(facts.packetId) || !plan.signage.request?.includes(facts.today)
      || !plan.signage.source?.includes(`${facts.pageCount}ページ`) || !plan.signage.source?.includes(`${facts.setCount}人`))) errors.push('document signage differs from facts');
  if (solved && target) {
    const proof = proofFor(facts, solved);
    for (const choice of ALL) {
      if (!instance.endings[choice].explanation.startsWith(proof)) errors.push(`document ending ${choice} proof contradicts records`);
      if (![facts.packetId, target.destination, target.receipt].every(part => instance.endings[choice].boss.includes(part))) errors.push(`document ending ${choice} dialogue contradicts facts`);
      if (!instance.endings[choice].subtitle.includes(facts.packetId) || !instance.copy[`cinematic${choice}`].includes(facts.packetId)) errors.push(`document action ${choice} differs from packet`);
      if (instance.choices[choice].label !== DOCUMENT_ACTIONS[choice]) errors.push(`document choice ${choice} label differs from action`);
      if (choice !== solved && !instance.endings[choice].explanation.endsWith(`実行したのは「${DOCUMENT_ACTIONS[choice]}」だった。`)) errors.push(`document ending ${choice} differs from performed action`);
    }
  }
  if (!instance.choices.B.description.includes(`${facts.pageCount}ページ`) || !instance.choices.B.description.includes(`${facts.setCount}人分`)
      || !instance.copy.cinematicB.includes(`${facts.setCount}人分`) || !instance.copy.cinematicC.includes(`${facts.pageCount}ページ`)) errors.push('document choice page or set count differs from facts');
  if (instance.clues.some(clue => Object.hasOwn(clue, 'thought') || /正解|予感|思う|必要そう|今回の意図/.test(clue.body))) errors.push('document clues must contain observations only');
  return errors;
}
