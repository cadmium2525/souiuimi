import { COPY as COMMON_COPY } from './stage01.ts';
import type { Choice, Clue, DocumentCaseFacts, Ending, StageDefinition } from '../game/types.ts';

export const DOCUMENT_ACTIONS: Record<Choice, string> = {
  A: '要点を1枚にまとめる', B: '人数分の配布セットにする', C: '原本を全部まとめて、巨大な一束にする',
};

export const DOCUMENT_EQUIPMENT = '資料準備室の共用備品\n複写機・ページトレー・クリップ・大型クリップ・搬出台車\n使用後は所定の位置へ戻してください。';

/** Each record describes one ordinary fact; none names the requested output. */
export function documentRecords(facts: DocumentCaseFacts): Record<string, string> {
  return {
    C01: `${facts.today}　上司からのチャット\n「この${facts.topic}、まとめといて。午後渡せるようにね。」`,
    C02: `${facts.today}　検討会の予定\n${facts.topic}\n${facts.meeting === 'upcoming' ? '15:00〜16:00　各担当からの説明と意見交換' : '10:00〜11:00　各担当からの説明と意見交換\n11:00　終了'}`,
    C03: `${facts.topic}の送付記録\n参加者：${facts.setCount}人\n${facts.distribution === 'sent' ? '全ページの資料を各自へ送付済み。受領の返事も全員分そろっている。' : '全ページの資料は、まだ参加者へ送っていない。'}`,
    C04: `${facts.topic}\n原本：全${facts.pageCount}ページ\nページ番号：1〜${facts.pageCount}\n複製可。原本への追記は担当者のみ。`,
    C05: '部長の受取メモ\n「午後、私の机で受け取ります。会の前なら説明に使い、会の後なら検討の経緯を確認します。」',
    C06: `${facts.topic}　担当者の確認メモ\n${facts.record === 'master-annotations' ? '各担当の指摘や確認印は、原本の各ページに書き込んである。別の記録やデータには移していない。' : '各担当の指摘や確認結果は、別紙の議事メモに記録してある。原本の各ページには書き込みがない。'}`,
    C07: DOCUMENT_EQUIPMENT,
  };
}

export const DOCUMENT_FIXTURE_FACTS: DocumentCaseFacts = {
  kind: 'document', today: '10月15日', topic: '研修資料', setCount: 6, pageCount: 240,
  meeting: 'finished', distribution: 'sent', record: 'master-annotations',
};
const BODIES = documentRecords(DOCUMENT_FIXTURE_FACTS);
const CLUES: Clue[] = [
  { id: 'C01', symbol: '01', title: '上司のチャット', category: '作業台 / 伝言', body: BODIES.C01, x: -1, z: 0.1, radius: 1.6 },
  { id: 'C02', symbol: '02', title: '検討会の予定', category: '掲示板 / 予定', body: BODIES.C02, x: -4.8, z: -2, radius: 1.6 },
  { id: 'C03', symbol: '03', title: '資料の送付記録', category: '書庫 / 記録', body: BODIES.C03, x: -4.9, z: 1.6, radius: 1.6 },
  { id: 'C04', symbol: '04', title: '机に置かれた資料', category: '資料台 / 現物', body: BODIES.C04, x: 1, z: -0.4, radius: 1.6 },
  { id: 'C05', symbol: '05', title: '部長の受取メモ', category: '受取窓口 / 伝言', body: BODIES.C05, x: 4.5, z: -1.9, radius: 1.6 },
  { id: 'C06', symbol: '06', title: '担当者の確認メモ', category: '保管棚 / メモ', body: BODIES.C06, x: 3.4, z: 1.6, radius: 1.6 },
  { id: 'C07', symbol: '07', title: '共用備品の一覧', category: 'デスク / 備品', body: BODIES.C07, x: 0.1, z: -2.8, radius: 1.6 },
];

const PROOF = '検討会は終わり、指摘の記録は原本にだけ残っていた。原本を一緒に渡し、経緯をたどれるようにする。';
const ENDINGS: Record<Choice, Ending> = {
  A: { title: '要点の外に、残った記録。', subtitle: '研修資料の要点を1枚に整理', boss: '要約だけでは、各ページの確認印が追えないんだ。書き込みのある原本も持ってきて。', player: '検討の記録ごと渡す、ということでしたか。', explanation: PROOF },
  B: { title: '増えた複製、残った原本。', subtitle: '研修資料を6人分の配布セットに整理', boss: '会はもう終わっているよ。各ページに残った確認の記録を見たかったんだ。', player: '配る準備だけ、完璧にできてしまった……。', explanation: PROOF },
  C: { title: 'その一束、まるごと受領。', subtitle: '研修資料の原本全量を一括で搬出', boss: '研修資料、これで確認した経緯をたどれるね。……クリップまで特大だ。', player: '記録ごと、全部まとめてお持ちしました！', explanation: PROOF },
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
  worldLabel: '同じ資料でも、\nまとめ方は？', reviewHeading: '会の時刻と、資料の状態',
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
