import { DOCUMENT_ACTIONS, documentRecords, STAGE05 } from './stage05.ts';
import type { CaseInstance, Choice, DocumentCaseFacts, Ending, StageDefinition } from '../game/types.ts';

const ALL: Choice[] = ['A', 'B', 'C'];
const PAGE_COUNTS = [120, 160, 200, 240, 280, 320];
const TOPICS = ['研修資料', '説明資料', '商品資料', '調査資料', '事業資料', '活動資料'];
const CONTEXT: Record<Choice, Pick<DocumentCaseFacts, 'use' | 'audience' | 'originals'>> = {
  A: { use: 'short-talk', audience: 'speaker', originals: 'stay' },
  B: { use: 'individual-reading', audience: 'attendees', originals: 'stay' },
  C: { use: 'archive-transfer', audience: 'storage-staff', originals: 'transfer' },
};

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

/** The purpose, recipient and treatment of the originals must tell the same story. */
export function solveDocumentFacts(facts: DocumentCaseFacts): Choice | null {
  if (!/^10月([1-9]|[12]\d|3[01])日$/.test(facts.today) || !facts.topic?.trim()
      || !Number.isInteger(facts.setCount) || facts.setCount <= 0
      || !Number.isInteger(facts.pageCount) || facts.pageCount <= 1) return null;
  const matches = ALL.filter(choice => {
    const context = CONTEXT[choice];
    return facts.use === context.use && facts.audience === context.audience && facts.originals === context.originals;
  });
  return matches.length === 1 ? matches[0] : null;
}

function proofFor(facts: DocumentCaseFacts, answer: Choice): string {
  const proofs: Record<Choice, string> = {
    A: `午後の説明は3分。参加者${facts.setCount}人は全文を持っていて、説明担当者の手元メモがまだない。原本は準備室に残す。今回の「まとめる」は、短い時間で伝えられるように内容を整理すること。全文の複製や原本の搬出では、説明の準備にならない。`,
    B: `午後は${facts.setCount}人がそれぞれページを見比べる読み合わせ。スクリーンはなく、手元で読む紙もまだ配られていない。原本は準備室に残す。今回の「まとめる」は、全${facts.pageCount}ページを人数分の資料セットにそろえること。1枚の要約や一つの原本の束では、各自が別々のページを読めない。`,
    C: '午後は原本の保管場所を移す予定で、保管室の担当者が現物を引き取る。資料準備室には原本を残さない。今回の「まとめる」は、原本を集めて運べるようにすること。要約や配布用の複製では、原本を移せない。巨大な一束は、その作業を誇張した演出。',
  };
  return proofs[answer];
}

/** The topic and quantities vary independently of what this afternoon's job is for. */
export function createDocumentCase(inputSeed: number): CaseInstance {
  if (!Number.isFinite(inputSeed)) throw new RangeError('case seed must be finite');
  const seed = inputSeed >>> 0;
  const random = new Random(seed);
  const context = CONTEXT[random.pick(ALL)];
  const facts: DocumentCaseFacts = {
    kind: 'document', today: `10月${random.int(3, 28)}日`, topic: random.pick(TOPICS),
    pageCount: random.pick(PAGE_COUNTS), setCount: random.int(4, 9), ...context,
  };
  const correctChoice = solveDocumentFacts(facts)!;
  const { topic, setCount, pageCount } = facts;
  const proof = proofFor(facts, correctChoice);
  const bodies = documentRecords(facts);
  const subtitles: Record<Choice, string> = {
    A: `${topic}の要点を1枚に整理`, B: `${topic}を${setCount}人分の配布セットに整理`, C: `${topic}の原本全量を一束にして搬出`,
  };
  const success: Record<Choice, Ending> = {
    A: { title: '要点1枚、準備完了。', subtitle: subtitles.A, boss: `${topic}の話す順番が1枚にまとまっているね。これなら3分で説明できる！`, player: '原本は戻してあります。説明用はこちらです！', explanation: proof },
    B: { title: '一人ひとりに、一そろい。', subtitle: subtitles.B, boss: `${topic}、全${pageCount}ページが${setCount}人分そろっているね。これでみんなが手元で読める！`, player: '順番も部数も確認済みです！', explanation: proof },
    C: { title: 'その一束、まるごと受領。', subtitle: subtitles.C, boss: `${topic}の原本、全部そろっているね。これで保管室へ移せる！ ……クリップまで特大だ。`, player: '全部まとめて、一括搬出です！', explanation: proof },
  };
  const wrongBoss: Record<Choice, Record<Choice, string>> = {
    A: {
      A: '', B: `全ページを${setCount}セット作ったの？ みんな全文は持っているよ。説明を3分に収める準備をしてほしかったんだ。`,
      C: '……これ、どうやって読むの？ 原本はここに残して、3分で説明できるように内容を整理してほしかったんだ。',
    },
    B: {
      A: `要約はあるけど、${setCount}人でページを見比べるには全文が必要なんだ。`, B: '',
      C: `……これ、みんなでどうやって読むの？ ${setCount}人がそれぞれ手元で読むんだよ。`,
    },
    C: {
      A: '要約はよくできているけど、今日は原本を保管室へ移す日なんだ。元の資料も持ってきて。',
      B: '配布するんじゃなくて、原本を保管室へ移すんだ。複製が増えてる！', C: '',
    },
  };
  const wrongTitles: Record<Choice, string> = {
    A: '1枚にした。使う相手は？', B: `きれいな${setCount}部。使う目的は？`, C: '巨大な一束、どうやって読むの？',
  };
  const wrongPlayer: Record<Choice, string> = {
    A: '内容を短くするほうの「まとめる」じゃなかった……。',
    B: '配る準備だけ、完璧にできてしまった……。', C: 'まとまっては、いるんですが……。',
  };
  const endings = Object.fromEntries(ALL.map(choice => [choice, choice === correctChoice ? success[choice] : {
    title: wrongTitles[choice], subtitle: subtitles[choice], boss: `${topic}は、${wrongBoss[correctChoice][choice]}`,
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
        assignments: '午後の予定\n14:00', intakes: '当日の案内',
        source: `${topic}\n原本 ${pageCount}ページ`, counter: '受取相手の伝言',
        oldMemo: '原本の保管メモ', equipment: '共用備品\n複写機・トレー\nクリップ・台車',
      },
    },
  };
}

/** Every displayed record must agree with the same, ordinary job context. */
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
      || plan.signage.assignments !== '午後の予定\n14:00' || plan.signage.intakes !== '当日の案内'
      || plan.signage.counter !== '受取相手の伝言' || plan.signage.oldMemo !== '原本の保管メモ')) errors.push('document signage differs from facts');
  if (solved) {
    const proof = proofFor(facts, solved);
    for (const choice of ALL) {
      if (!instance.endings[choice].explanation.startsWith(proof)) errors.push(`document ending ${choice} proof contradicts context`);
      if (!instance.endings[choice].boss.includes(facts.topic)) errors.push(`document ending ${choice} dialogue contradicts facts`);
      if (!instance.endings[choice].subtitle.includes(facts.topic) || !instance.copy[`cinematic${choice}`].includes(facts.topic)) errors.push(`document action ${choice} differs from topic`);
      if (instance.choices[choice].label !== DOCUMENT_ACTIONS[choice]) errors.push(`document choice ${choice} label differs from action`);
      if (choice !== solved && !instance.endings[choice].explanation.endsWith(`実行したのは「${DOCUMENT_ACTIONS[choice]}」だった。`)) errors.push(`document ending ${choice} differs from performed action`);
    }
  }
  if (!instance.choices.B.description.includes(`${facts.pageCount}ページ`) || !instance.choices.B.description.includes(`${facts.setCount}人分`)
      || !instance.copy.cinematicB.includes(`${facts.setCount}人分`) || !instance.copy.cinematicC.includes(`${facts.pageCount}ページ`)) errors.push('document choice page or set count differs from facts');
  if (instance.clues.some(clue => Object.hasOwn(clue, 'thought') || /正解|予感|思う|必要そう|今回の意図/.test(clue.body))) errors.push('document clues must contain observations only');
  if (/[PDR]\d{2}|資料番号|受付番号|行先番号/.test(JSON.stringify({ clues: instance.clues, copy: instance.copy, endings: instance.endings, signage: plan?.signage }))) errors.push('document presentation must not contain lookup codes');
  return errors;
}
