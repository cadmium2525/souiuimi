import { COPY as COMMON_COPY } from './stage01.ts';
import type { Choice, Clue, DocumentCaseFacts, Ending, StageDefinition } from '../game/types.ts';

export const DOCUMENT_ACTIONS: Record<Choice, string> = {
  A: '要点を1枚にまとめる', B: '人数分の配布セットにする', C: '原本を全部まとめて、巨大な一束にする',
};

export const DOCUMENT_EQUIPMENT = '資料準備室の共用備品\n複写機・ページトレー・クリップ・大型クリップ・搬出台車\n使用後は所定の位置へ戻してください。';

/** These are ordinary records of this one job, rather than keys into other records. */
export function documentRecords(facts: DocumentCaseFacts): Record<string, string> {
  const schedule: Record<DocumentCaseFacts['use'], string> = {
    'short-talk': '14:00　打ち合わせ\n担当者からの説明は3分。その後、質疑を行う。',
    'individual-reading': '14:00　資料の読み合わせ\n各自の手元で、ページを行き来しながら項目を比較する。',
    'archive-transfer': '14:00　原本の保管場所を移転\n資料準備室から保管室へ。今後の原本閲覧も保管室で行う。',
  };
  const audience: Record<DocumentCaseFacts['audience'], string> = {
    speaker: `参加者${facts.setCount}人には、全ページの資料を先週配布済み。\n説明担当者の手元メモは、まだ用意されていない。`,
    attendees: `参加者は${facts.setCount}人。\n会場にはスクリーンがない。読み合わせに使う紙の資料は、まだ配っていない。`,
    'storage-staff': '保管室の担当者が、午後に原本を引き取る。\n資料の内容を説明する会や、参加者への配布は予定されていない。',
  };
  const recipient: Record<DocumentCaseFacts['audience'], string> = {
    speaker: '説明担当から\n「全文は手元にあります。話が長くなると次の議題に入れないので、時間内に伝えられるようにしておきたいです。」',
    attendees: '会場担当から\n「みなさん別々のページを見比べる予定です。席は一人ずつ離して用意しました。」',
    'storage-staff': '保管室の担当から\n「受け取った現物は、こちらでページ順を確認して保管棚へ入れます。搬入は台車を使えます。」',
  };
  return {
    C01: `${facts.today}　上司からのチャット\n「この${facts.topic}、まとめといて。午後渡せるようにね。」`,
    C02: `${facts.today}　午後の予定\n${facts.topic}\n${schedule[facts.use]}`,
    C03: `${facts.topic}についての案内\n${audience[facts.audience]}`,
    C04: `${facts.topic}\n原本：全${facts.pageCount}ページ\nページ番号：1〜${facts.pageCount}\n複製可。原本への書き込み不可。`,
    C05: recipient[facts.audience],
    C06: facts.originals === 'stay'
      ? `${facts.topic}の保管メモ\n原本は資料準備室に置く。午後の作業が終わったら、この棚へ戻す。`
      : `${facts.topic}の保管メモ\n午後、原本の保管場所を保管室へ移す。資料準備室の棚には現物を残さない。`,
    C07: DOCUMENT_EQUIPMENT,
  };
}

export const DOCUMENT_FIXTURE_FACTS: DocumentCaseFacts = {
  kind: 'document', today: '10月15日', topic: '研修資料', setCount: 6, pageCount: 240,
  use: 'archive-transfer', audience: 'storage-staff', originals: 'transfer',
};
const BODIES = documentRecords(DOCUMENT_FIXTURE_FACTS);
const CLUES: Clue[] = [
  { id: 'C01', symbol: '01', title: '上司のチャット', category: '作業台 / 伝言', body: BODIES.C01, x: -1, z: 0.1, radius: 1.6 },
  { id: 'C02', symbol: '02', title: '午後の予定', category: '掲示板 / 予定', body: BODIES.C02, x: -4.8, z: -2, radius: 1.6 },
  { id: 'C03', symbol: '03', title: '当日の案内', category: '書庫 / 案内', body: BODIES.C03, x: -4.9, z: 1.6, radius: 1.6 },
  { id: 'C04', symbol: '04', title: '机に置かれた資料', category: '資料台 / 現物', body: BODIES.C04, x: 1, z: -0.4, radius: 1.6 },
  { id: 'C05', symbol: '05', title: '受取相手の伝言', category: '受取窓口 / 伝言', body: BODIES.C05, x: 4.5, z: -1.9, radius: 1.6 },
  { id: 'C06', symbol: '06', title: '原本の保管メモ', category: '保管棚 / メモ', body: BODIES.C06, x: 3.4, z: 1.6, radius: 1.6 },
  { id: 'C07', symbol: '07', title: '共用備品の一覧', category: 'デスク / 備品', body: BODIES.C07, x: 0.1, z: -2.8, radius: 1.6 },
];

const PROOF = '午後は原本の保管場所を移す予定で、保管室の担当者が現物を引き取る。資料準備室には原本を残さない。今回の「まとめる」は、原本を集めて運べるようにすること。要約や配布用の複製では、原本を移せない。巨大な一束は、その作業を誇張した演出。';
const ENDINGS: Record<Choice, Ending> = {
  A: { title: '1枚では、原本を運べない。', subtitle: '研修資料の要点を1枚に整理', boss: '要約はよくできているけど、今日は原本を保管室へ移す日なんだ。元の資料も持ってきて。', player: '内容を短くするほうの「まとめる」じゃなかった……。', explanation: `${PROOF}\n実行したのは「${DOCUMENT_ACTIONS.A}」だった。` },
  B: { title: 'きれいな6部。でも、原本は？', subtitle: '研修資料を6人分の配布セットに整理', boss: '配布するんじゃなくて、原本を保管室へ移すんだ。複製が増えてる！', player: '配る準備だけ、完璧にできてしまった……。', explanation: `${PROOF}\n実行したのは「${DOCUMENT_ACTIONS.B}」だった。` },
  C: { title: 'その一束、まるごと受領。', subtitle: '研修資料の原本全量を一括で搬出', boss: '原本、全部そろっているね。これで保管室へ移せる！ ……クリップまで特大だ。', player: '全部まとめて、一括搬出です！', explanation: PROOF },
};

const COPY: Record<string, string> = {
  ...COMMON_COPY,
  stageTitle: '資料、まとめといて', stageNumber: 'STAGE 05',
  introBoss: 'この研修資料、まとめといて。午後渡せるようにね。', introThought: '',
  introInstruction: '制限時間2:00。資料準備室を調べて、今回のまとめ方を決めよう。',
  exploreButton: '資料準備室を調べる', decisionHeading: '資料を、どうまとめる？',
  decisionNote: '集めた手がかりをもとに、今回の資料のまとめ方を決めよう。',
  choiceA: DOCUMENT_ACTIONS.A, choiceB: DOCUMENT_ACTIONS.B, choiceC: DOCUMENT_ACTIONS.C,
  timedOut: '時間です。集めた手がかりから、資料のまとめ方を決めよう。',
  cinematicA: '研修資料の要点を、A4の1枚に整理する。',
  cinematicB: '研修資料をページ順にそろえ、6人分の配布セットを作る。',
  cinematicC: '研修資料の原本全240ページを束ね、巨大クリップで留めて台車で運ぶ。',
  cinematicLabel: '資料を、まとめ中。', worldLocation: 'よしなに資料準備室', worldClock: '13:40',
  worldLabel: '同じ資料でも、\nまとめ方は？', reviewHeading: '資料を使う目的と、相手の話',
  correctChoice: 'C', successLabel: 'まさかの一括受領', fallbackHeading: '資料準備室を表示できませんでした。',
};

export const STAGE05: StageDefinition = {
  id: 'stage05', number: '05', title: COPY.stageTitle, seconds: 120,
  start: { x: 0, z: 3 }, clues: CLUES, endings: ENDINGS, copy: COPY,
  choices: {
    A: { label: DOCUMENT_ACTIONS.A, description: '内容を読み込み、要点をA4の1枚に整理する。' },
    B: { label: DOCUMENT_ACTIONS.B, description: '全ページを順番にそろえ、6人分の複製を用意する。' },
    C: { label: DOCUMENT_ACTIONS.C, description: '原本全量を一束に留め、台車で一括搬出する。' },
  },
  cinematicSeconds: { A: 10, B: 12, C: 14 },
};
