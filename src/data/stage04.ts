import { COPY as COMMON_COPY } from './stage01.ts';
import type { Choice, Clue, Ending, StageDefinition } from '../game/types.ts';

const CLUES: Clue[] = [
  { id: 'C01', symbol: '01', title: '今回の依頼票', category: '作業台 / 依頼', body: '本日：10月15日\n依頼番号：R17\n用件：催事の立替金\n伝言「1万円弱を封筒に入れて持ってきて」', x: -1, z: 0.1, radius: 1.6 },
  { id: 'C02', symbol: '02', title: '当日の担当表', category: '掲示板 / 担当', body: '催事立替金の担当記録\n10月15日／R42 → 担当S68\n10月14日／R17 → 担当S68\n10月15日／R17 → 担当S23\n10月15日／R58 → 担当S91', x: -4.8, z: -2, radius: 1.6 },
  { id: 'C03', symbol: '03', title: '過去の発言記録', category: '書庫 / 支払記録', body: '発言と支払実額の保存記録\n10月13日／担当S68\n発言「5,000円弱」／支払実額4,900円\n10月14日／担当S23\n発言「20,000円弱」／支払実額20,300円\n10月13日／担当S91\n発言「3,000円弱」／支払実額2,900円\n10月13日／担当S23\n発言「5,000円弱」／支払実額5,200円\n10月14日／担当S91\n発言「15,000円弱」／支払実額14,700円\n10月14日／担当S68\n発言「8,000円弱」／支払実額7,800円', x: -4.9, z: 1.6, radius: 1.6 },
  { id: 'C04', symbol: '04', title: '用意された封筒', category: '金庫台 / 現金', body: '立替金用の封筒\n封筒A：9,800円\n封筒B：10,300円\nどちらも未開封。依頼番号欄は空欄。', x: 1, z: -0.4, radius: 1.6 },
  { id: 'C05', symbol: '05', title: '現金受取の案内', category: '受取窓口 / 案内', body: '催事立替金の受取窓口\n封筒は一通ずつ受け付けます。\n依頼番号を受付票に記入してください。\n金額を確認後、担当者へお渡しします。', x: 4.5, z: -1.9, radius: 1.6 },
  { id: 'C06', symbol: '06', title: '前日の受付メモ', category: '保管棚 / 受付記録', body: '10月14日／R17\nこの日の担当：S68\n催事立替金の精算は完了。\n記録者：準備室受付', x: 3.4, z: 1.6, radius: 1.6 },
  { id: 'C07', symbol: '07', title: '校正メモ', category: 'デスク / 用語', body: '社内文書の校正メモ\n金額につく「弱」は、基準額より少し少ないこと。\n「強」は、基準額より少し多いこと。\n参照：小学館『デジタル大辞泉』', x: 0.1, z: -2.8, radius: 1.6 },
];

const PROOF = '辞書上、金額につく「弱」は基準より少し少ない意味。「1万円弱」は1万円を少し下回る額を表す。\n今回の依頼は10月15日のR17。担当表ではR17 → 担当S23。\nS23の過去の記録では「5,000円弱」が5,200円、「20,000円弱」が20,300円。どちらも基準額より多かった。\nこの担当者は「弱」を取り違えて使っていたため、今回の意図として予測できたのは1万円を少し超える10,300円。言葉本来の意味が変わったわけではない。';
const UNUSED: Ending = { title: '封筒を選び直す。', subtitle: '今回の選択肢はA・Bの二つ', boss: '用意した二通から選んでね。', player: '依頼を確認します。', explanation: PROOF };
const ENDINGS: Record<Choice, Ending> = {
  A: { title: '言葉どおり。でも、用意は足りず。', subtitle: '9,800円を届けた', boss: 'R17は10,300円のつもりだったんだ。ごめん、「弱」の使い方を取り違えていたね。君の日本語の解釈は合っているよ。', player: '次は金額そのものを確認させてください。', explanation: `${PROOF}\n選んだ9,800円は、今回担当者が想定していた10,300円より500円少なかった。` },
  B: { title: 'その言い方、そういうつもり！？', subtitle: '10,300円を届けた', boss: 'R17の10,300円、ありがとう。あ、ごめん、少し超えるつもりで「弱」と言ってたね。正しくは「強」だった。', player: '記録から予測はできました。次は金額でお願いします！', explanation: PROOF },
  C: UNUSED,
};

const COPY: Record<string, string> = {
  ...COMMON_COPY,
  stageTitle: '1万円弱でお願い', stageNumber: 'STAGE 04',
  introBoss: '催事の立替金、1万円弱を封筒に入れて持ってきて。依頼番号R17でお願い。', introThought: '',
  introInstruction: '制限時間2:00。催事準備室を調べて、今回届ける封筒を決めよう。',
  exploreButton: '催事準備室を調べる', decisionHeading: '今回、いくら届ける？',
  decisionNote: '集めた手がかりをもとに、今回の担当者の意図を予測しよう。',
  choiceA: '1万円未満（9,800円）', choiceB: '1万円を少し超える（10,300円）', choiceC: '',
  timedOut: '時間です。集めた手がかりから、届ける封筒を決めよう。',
  cinematicA: '9,800円の封筒に依頼番号R17を記入し、受取窓口へ届ける。',
  cinematicB: '10,300円の封筒に依頼番号R17を記入し、受取窓口へ届ける。', cinematicC: '',
  cinematicLabel: '立替金を、お届け中。', worldLocation: 'よしなに催事準備室', worldClock: '11:40',
  worldLabel: '言葉の意味と、\nこの人のつもり。',
  reviewHeading: '依頼と、担当者の言葉づかい', correctChoice: 'B', successLabel: '今回の意図を予測',
  fallbackHeading: '催事準備室を表示できませんでした。',
};

export const STAGE04: StageDefinition = {
  id: 'stage04', number: '04', title: COPY.stageTitle, seconds: 120,
  start: { x: 0, z: 3 }, clues: CLUES, endings: ENDINGS, copy: COPY,
  choiceIds: ['A', 'B'],
  choices: {
    A: { label: COPY.choiceA, description: '9,800円の封筒を届ける。' },
    B: { label: COPY.choiceB, description: '10,300円の封筒を届ける。' },
    C: { label: '', description: '' },
  },
  cinematicSeconds: { A: 10, B: 10, C: 10 },
};
