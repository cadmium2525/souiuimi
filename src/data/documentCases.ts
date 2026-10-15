import { DOCUMENT_ACTIONS, documentRecords, STAGE05 } from './stage05.ts';
import type { CaseInstance, Choice, DocumentCaseFacts, Ending, StageDefinition } from '../game/types.ts';

const ALL: Choice[] = ['A', 'B', 'C'];
const PAGE_COUNTS = [120, 160, 200, 240, 280, 320];
const TOPICS = ['研修資料', '説明資料', '商品資料', '調査資料', '事業資料', '活動資料'];
type DocumentContext = Pick<DocumentCaseFacts, 'meeting' | 'distribution' | 'record'>;

/** All combinations occur: no one status is an answer key. */
export const DOCUMENT_CONTEXTS: readonly DocumentContext[] = [
  { meeting: 'upcoming', distribution: 'sent', record: 'master-annotations' },
  { meeting: 'upcoming', distribution: 'pending', record: 'master-annotations' },
  { meeting: 'upcoming', distribution: 'sent', record: 'separate-minutes' },
  { meeting: 'upcoming', distribution: 'pending', record: 'separate-minutes' },
  { meeting: 'finished', distribution: 'sent', record: 'master-annotations' },
  { meeting: 'finished', distribution: 'pending', record: 'master-annotations' },
  { meeting: 'finished', distribution: 'sent', record: 'separate-minutes' },
  { meeting: 'finished', distribution: 'pending', record: 'separate-minutes' },
];

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
}

/** Use the meeting's timing together with distribution or the record's location. */
export function solveDocumentFacts(facts: DocumentCaseFacts): Choice | null {
  if (!/^10月([1-9]|[12]\d|3[01])日$/.test(facts.today) || !facts.topic?.trim()
      || !Number.isInteger(facts.setCount) || facts.setCount <= 0
      || !Number.isInteger(facts.pageCount) || facts.pageCount <= 1
      || !['upcoming', 'finished'].includes(facts.meeting)
      || !['sent', 'pending'].includes(facts.distribution)
      || !['master-annotations', 'separate-minutes'].includes(facts.record)) return null;
  if (facts.meeting === 'upcoming') return facts.distribution === 'pending' ? 'B' : 'A';
  return facts.record === 'master-annotations' ? 'C' : 'A';
}

export function documentProof(facts: DocumentCaseFacts): string {
  if (facts.meeting === 'upcoming') {
    return facts.distribution === 'pending'
      ? '検討会はこれからで、参加者には全文が届いていなかった。各自が読める資料セットを用意する。'
      : '検討会はこれからで、参加者は全文を持っていた。部長が話すための要点を1枚にまとめる。';
  }
  return facts.record === 'master-annotations'
    ? '検討会は終わり、指摘の記録は原本にだけ残っていた。原本を一緒に渡し、経緯をたどれるようにする。'
    : '検討会は終わり、指摘の記録は別紙の議事メモにあった。検討の要点を1枚にまとめて渡す。';
}

/** Names and quantities vary independently of all eight work contexts. */
export function createDocumentCase(inputSeed: number): CaseInstance {
  if (!Number.isFinite(inputSeed)) throw new RangeError('case seed must be finite');
  const seed = inputSeed >>> 0;
  const random = new Random(seed);
  const context = random.pick(DOCUMENT_CONTEXTS);
  const facts: DocumentCaseFacts = {
    kind: 'document', today: `10月${random.int(3, 28)}日`, topic: random.pick(TOPICS),
    pageCount: random.pick(PAGE_COUNTS), setCount: random.int(4, 9), ...context,
  };
  const correctChoice = solveDocumentFacts(facts)!;
  const { topic, setCount, pageCount } = facts;
  const proof = documentProof(facts);
  const bodies = documentRecords(facts);
  const subtitles: Record<Choice, string> = {
    A: `${topic}の要点を1枚に整理`, B: `${topic}を${setCount}人分の配布セットに整理`, C: `${topic}の原本全量を一束にして搬出`,
  };
  const success: Record<Choice, Ending> = {
    A: { title: '要点1枚、準備完了。', subtitle: subtitles.A, boss: `${topic}の要点が1枚になっているね。${facts.meeting === 'upcoming' ? 'これなら話す順番も迷わない！' : '検討した内容がすぐわかる！'}`, player: '原本は棚へ戻してあります。こちらが要点です！', explanation: proof },
    B: { title: '一人ひとりに、一そろい。', subtitle: subtitles.B, boss: `${topic}、全${pageCount}ページが${setCount}人分そろったね。会で各自に渡そう！`, player: '順番も部数も確認済みです！', explanation: proof },
    C: { title: 'その一束、まるごと受領。', subtitle: subtitles.C, boss: `${topic}、これで各ページの指摘や確認印をたどれるね。……クリップまで特大だ。`, player: '記録ごと、全部まとめてお持ちしました！', explanation: proof },
  };
  const wrongBoss: Record<Choice, string> = {
    A: facts.meeting === 'upcoming'
      ? '参加者は全文を持っているよ。私が会で説明する要点を整理してほしかったんだ。'
      : '会はもう終わったよ。別紙の議事メモから、検討した要点を整理してほしかったんだ。',
    B: 'まだ参加者に全文が届いていないんだ。これからの会で、各自が読めるようにしてほしかったんだ。',
    C: '会はもう終わっているよ。各ページに残った指摘や確認印を見たかったんだ。',
  };
  const wrongTitles: Record<Choice, string> = {
    A: '要点の外に、残ったもの。', B: `きれいな${setCount}部。使う目的は？`, C: '巨大な一束、どうやって読むの？',
  };
  const wrongPlayer: Record<Choice, string> = {
    A: '内容を短くするほうの「まとめる」じゃなかった……。',
    B: '配る準備だけ、完璧にできてしまった……。', C: 'まとまっては、いるんですが……。',
  };
  const endings = Object.fromEntries(ALL.map(choice => [choice, choice === correctChoice ? success[choice] : {
    title: wrongTitles[choice], subtitle: subtitles[choice], boss: `${topic}は、${wrongBoss[correctChoice]}`,
    player: wrongPlayer[choice], explanation: proof,
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
      ...STAGE05.copy, correctChoice, successLabel: correctChoice === 'C' ? 'まさかの一括受領' : '午後の準備、完了',
      introBoss: `この${topic}、まとめといて。午後渡せるようにね。`, worldLocation: 'よしなに資料準備室',
      cinematicA: `${topic}の要点を、A4の1枚に整理する。`,
      cinematicB: `${topic}の全${pageCount}ページを順にそろえ、${setCount}人分の配布セットを作る。`,
      cinematicC: `${topic}の原本全${pageCount}ページを束ね、巨大クリップで留めて台車で運ぶ。`,
    },
  };
  return {
    ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C02', 'C03', 'C06'], facts,
    documentPlan: {
      packetId: topic, setCount, pageCount, intendedChoice: correctChoice,
      signage: {
        request: `${facts.today}\n${topic}\n上司のチャット`,
        assignments: '検討会の予定', intakes: '資料の送付記録',
        source: `${topic}\n原本 ${pageCount}ページ`, counter: '部長の受取メモ',
        oldMemo: '担当者の確認メモ', equipment: '共用備品\n複写機・トレー\nクリップ・台車',
      },
    },
  };
}

/** Every displayed observation must agree with the same job context. */
export function validateDocumentCase(instance: CaseInstance): string[] {
  if (instance.facts.kind !== 'document') return ['not a document case'];
  const errors: string[] = [];
  const facts = instance.facts;
  const plan = instance.documentPlan;
  const solved = solveDocumentFacts(facts);
  if (!solved || solved !== instance.correctChoice) errors.push('document facts do not produce the declared unique answer');
  if (instance.id !== 'stage05' || instance.copy.correctChoice !== instance.correctChoice) errors.push('document identity or copy answer differs');
  if (instance.seconds !== 120 || instance.clues.length !== 7 || instance.cinematicSeconds.A !== 10 || instance.cinematicSeconds.B !== 12 || instance.cinematicSeconds.C !== 14) errors.push('document duration or clue count differs');
  if ((instance.choiceIds ?? ALL).join('') !== 'ABC') errors.push('document case requires exactly A B C');
  if (instance.copy.introThought !== '' || instance.copy.introBoss !== `この${facts.topic}、まとめといて。午後渡せるようにね。`) errors.push('document introduction differs from context');
  if (!TOPICS.includes(facts.topic) || !PAGE_COUNTS.includes(facts.pageCount) || !Number.isInteger(facts.setCount) || facts.setCount < 4 || facts.setCount > 9) errors.push('document topic, page or participant count invalid');
  if (!plan || plan.packetId !== facts.topic || plan.pageCount !== facts.pageCount || plan.setCount !== facts.setCount || plan.intendedChoice !== solved) errors.push('document plan differs from facts');
  const bodies = documentRecords(facts);
  for (const [id, body] of Object.entries(bodies)) {
    if (instance.clues.find(clue => clue.id === id)?.body !== body) errors.push(`${id} text contradicts document facts`);
  }
  if (instance.evidenceChain.join() !== 'C02,C03,C06') errors.push('document evidence differs from job context');
  if (plan && (!plan.signage.request?.includes(facts.topic) || !plan.signage.request?.includes(facts.today)
      || plan.signage.source !== `${facts.topic}\n原本 ${facts.pageCount}ページ`
      || plan.signage.assignments !== '検討会の予定' || plan.signage.intakes !== '資料の送付記録'
      || plan.signage.counter !== '部長の受取メモ' || plan.signage.oldMemo !== '担当者の確認メモ')) errors.push('document signage differs from facts');
  if (solved) {
    const proof = documentProof(facts);
    for (const choice of ALL) {
      if (instance.endings[choice].explanation !== proof) errors.push(`document ending ${choice} proof contradicts context`);
      if (!instance.endings[choice].boss.includes(facts.topic)) errors.push(`document ending ${choice} dialogue contradicts facts`);
      if (!instance.endings[choice].subtitle.includes(facts.topic) || !instance.copy[`cinematic${choice}`].includes(facts.topic)) errors.push(`document action ${choice} differs from topic`);
      if (instance.choices[choice].label !== DOCUMENT_ACTIONS[choice]) errors.push(`document choice ${choice} label differs from action`);
    }
  }
  if (!instance.choices.B.description.includes(`${facts.pageCount}ページ`) || !instance.choices.B.description.includes(`${facts.setCount}人分`)
      || !instance.copy.cinematicB.includes(`${facts.setCount}人分`) || !instance.copy.cinematicC.includes(`${facts.pageCount}ページ`)) errors.push('document choice page or set count differs from facts');
  if (instance.clues.some(clue => Object.hasOwn(clue, 'thought') || /正解|予感|思う|必要そう|今回の意図/.test(clue.body))) errors.push('document clues must contain observations only');
  if (/[PDR]\d{2}|資料番号|受付番号|行先番号/.test(JSON.stringify({ clues: instance.clues, copy: instance.copy, endings: instance.endings, signage: plan?.signage }))) errors.push('document presentation must not contain lookup codes');
  return errors;
}
