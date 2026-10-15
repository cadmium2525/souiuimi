import { COPY as COMMON_COPY } from './stage01.ts';
import type { Choice, Clue, Ending, StageDefinition } from '../game/types.ts';

export const DOCUMENT_ACTIONS: Record<Choice, string> = {
  A: '要点を1枚にまとめる', B: '人数分の配布セットにする', C: '原本を全部まとめて、巨大な一束にする',
};

export function documentCondition(choice: Choice, pageCount: number, setCount: number): string {
  if (choice === 'A') return '説明担当用。要点をA4・1枚に整理。全ページの配布は不要。原本は準備室に保管。';
  if (choice === 'B') return `参加者${setCount}人。全${pageCount}ページの複製をページ順で1人1部。原本は準備室に保管。`;
  return `全${pageCount}ページの原本を回収。全量をまとめて一括で引き渡す。要約紙と複製は受領対象外。`;
}

const A_CONDITION = documentCondition('A', 240, 6);
const B_CONDITION = documentCondition('B', 240, 6);
const C_CONDITION = documentCondition('C', 240, 6);
const CLUES: Clue[] = [
  { id: 'C01', symbol: '01', title: '今回の依頼票', category: '作業台 / 依頼', body: '本日：10月15日\n対象資料：P17\n伝言「明日使う資料、まとめといて」', x: -1, z: 0.1, radius: 1.6 },
  { id: 'C02', symbol: '02', title: '日付別の搬出表', category: '掲示板 / 行先', body: '資料の搬出記録\n10月15日／P42 → 行先D42／受付R23\n10月14日／P17 → 行先D42／受付R23\n10月15日／P17 → 行先D73／受付R91\n10月15日／P58 → 行先D58／受付R68', x: -4.8, z: -2, radius: 1.6 },
  { id: 'C03', symbol: '03', title: '受け渡し条件一覧', category: '書庫 / 受付条件', body: `受付R68／行先D58\n${B_CONDITION}\n受付R91／行先D73\n${C_CONDITION}\n受付R23／行先D42\n${A_CONDITION}`, x: -4.9, z: 1.6, radius: 1.6 },
  { id: 'C04', symbol: '04', title: '資料の管理票', category: '資料台 / 管理', body: '資料P17\n原本：全240ページ\nページ番号：1〜240\n複製可。原本への書き込み不可。\n配布名簿：6人分', x: 1, z: -0.4, radius: 1.6 },
  { id: 'C05', symbol: '05', title: '搬出窓口の案内', category: '受取窓口 / 案内', body: '資料の搬出窓口\n資料番号・行先・受付番号を受渡票に記入してください。\n受付ごとの受け渡し条件で照合します。', x: 4.5, z: -1.9, radius: 1.6 },
  { id: 'C06', symbol: '06', title: '前日の受渡控え', category: '保管棚 / 受渡記録', body: '10月14日／資料P17\n行先D42／受付R23\nこの日の引渡しは完了。\n記録者：資料準備室受付', x: 3.4, z: 1.6, radius: 1.6 },
  { id: 'C07', symbol: '07', title: '共用備品の一覧', category: 'デスク / 備品', body: '資料準備室の共用備品\n複写機・ページトレー・クリップ・大型クリップ・搬出台車\n使用後は所定の位置へ戻してください。', x: 0.1, z: -2.8, radius: 1.6 },
];

const PROOF = `対象は10月15日の資料P17。搬出表ではP17 → 行先D73／受付R91。\nR91の受け渡し条件：${C_CONDITION}\n今回の「まとめる」は、原本全量をまとめて回収すること。巨大な一束は、その作業を誇張した演出。要約や配布用の複製では原本の回収にならない。`;
const ENDINGS: Record<Choice, Ending> = {
  A: { title: '1枚では、原本を回収できない。', subtitle: 'P17の要点を1枚に整理', boss: 'P17は行先D73、受付R91。要約はよくできているけど、今日は原本を全部引き取る日なんだ。', player: '内容を短くするほうの「まとめる」じゃなかった……。', explanation: `${PROOF}\n実行したのは「${DOCUMENT_ACTIONS.A}」だった。` },
  B: { title: 'きれいな6部。でも、原本は？', subtitle: 'P17を6人分の配布セットに整理', boss: 'P17は行先D73、受付R91。配布するんじゃなくて、原本を一括で回収するんだ。複製が増えてる！', player: '配る準備だけ、完璧にできてしまった……。', explanation: `${PROOF}\n実行したのは「${DOCUMENT_ACTIONS.B}」だった。` },
  C: { title: 'その一束、まるごと受領。', subtitle: 'P17の原本全量を一括回収', boss: 'P17、行先D73の受付R91で受領。原本、全部そろっているね！ ……クリップまで特大だ。', player: '全部まとめて、一括搬出です！', explanation: PROOF },
};

const COPY: Record<string, string> = {
  ...COMMON_COPY,
  stageTitle: '資料、まとめといて', stageNumber: 'STAGE 05',
  introBoss: '明日使う資料、まとめといて。対象はP17ね。', introThought: '',
  introInstruction: '制限時間2:00。資料準備室を調べて、今回のまとめ方を決めよう。',
  exploreButton: '資料準備室を調べる', decisionHeading: '資料を、どうまとめる？',
  decisionNote: '集めた手がかりをもとに、今回の資料のまとめ方を決めよう。',
  choiceA: DOCUMENT_ACTIONS.A, choiceB: DOCUMENT_ACTIONS.B, choiceC: DOCUMENT_ACTIONS.C,
  timedOut: '時間です。集めた手がかりから、資料のまとめ方を決めよう。',
  cinematicA: '資料P17の要点を、A4の1枚に整理する。',
  cinematicB: '資料P17をページ順にそろえ、6人分の配布セットを作る。',
  cinematicC: '資料P17の原本全240ページを束ね、巨大クリップで留めて台車で運ぶ。',
  cinematicLabel: '資料を、まとめ中。', worldLocation: 'よしなに資料準備室', worldClock: '16:40',
  worldLabel: '同じ資料でも、\nまとめ方は？', reviewHeading: '資料と、受け渡しの条件',
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
