import { COPY as COMMON_COPY } from './stage01.ts';
import type { Choice, Clue, Ending, StageDefinition } from '../game/types.ts';

const CLUES: Clue[] = [
  { id: 'C01', symbol: '01', title: '部長の伝言', category: '作業台 / 伝言', body: '10月15日・部長からの伝言\n「今日の備品代、1万円弱を封筒に入れて持ってきて」', x: -1, z: 0.1, radius: 1.6 },
  { id: 'C02', symbol: '02', title: '展示会のチャット', category: '掲示板 / 過去の依頼', body: '春の展示会のチャット\n部長「5,000円強を持ってきて」', x: -4.8, z: -2, radius: 1.6 },
  { id: 'C03', symbol: '03', title: '立替金の受取控え', category: '書庫 / 受取記録', body: '春の展示会・立替金の受取控え\n受取額：4,800円\n確認欄：部長「この金額でお願いします」\n受渡済み。', x: -4.9, z: 1.6, radius: 1.6 },
  { id: 'C04', symbol: '04', title: '用意された封筒', category: '金庫台 / 現金', body: '立替金用の封筒\n封筒A：9,800円\n封筒B：10,300円\nどちらも未開封。用途の欄は空欄。', x: 1, z: -0.4, radius: 1.6 },
  { id: 'C05', symbol: '05', title: '現金受取の案内', category: '受取窓口 / 案内', body: '催事立替金の受取窓口\n封筒に用途を書いてお持ちください。\n金額を確認して、準備した品をお渡しします。\n余った現金はその場でお返しします。', x: 4.5, z: -1.9, radius: 1.6 },
  { id: 'C06', symbol: '06', title: '経理からの連絡', category: '保管棚 / 連絡', body: '経理からの連絡\n「部長からは『1万円弱』と聞いています。\n現金は二通り用意しました。使わなかった封筒は、そのまま戻してください」', x: 3.4, z: 1.6, radius: 1.6 },
  { id: 'C07', symbol: '07', title: '校正メモ', category: 'デスク / 用語', body: '社内文書の校正メモ\n金額につく「弱」は、基準額より少し少ないこと。\n「強」は、基準額より少し多いこと。\n参照：小学館『デジタル大辞泉』', x: 0.1, z: -2.8, radius: 1.6 },
];

const PROOF = '「1万円弱」は本来、1万円より少し少ない額。依頼と受取額では「弱・強」が逆で、今回は10,300円のつもりだった。';
const UNUSED: Ending = { title: '封筒を選び直す。', subtitle: '今回の選択肢はA・Bの二つ', boss: '用意した二通から選んでね。', player: '頼まれたことを確認します。', explanation: PROOF };
const ENDINGS: Record<Choice, Ending> = {
  A: { title: '言葉どおり。でも、用意は足りず。', subtitle: '9,800円を届けた', boss: '備品代は10,300円のつもりだったんだ。ごめん、「弱」の使い方を取り違えていたね。君の日本語の解釈は合っているよ。', player: '次は金額そのものを確認させてください。', explanation: PROOF },
  B: { title: 'その言い方、そういうつもり！？', subtitle: '10,300円を届けた', boss: '備品代の10,300円、ありがとう。あ、ごめん、少し超えるつもりで「弱」と言ってたね。正しくは「強」だった。', player: '前のやりとりで予測はできました。次は金額でお願いします！', explanation: PROOF },
  C: UNUSED,
};

const COPY: Record<string, string> = {
  ...COMMON_COPY,
  stageTitle: '1万円弱でお願い', stageNumber: 'STAGE 04',
  introBoss: '今日の備品代、1万円弱を封筒に入れて持ってきて。', introThought: '',
  introInstruction: '制限時間2:00。催事準備室を調べて、今回届ける封筒を決めよう。',
  exploreButton: '催事準備室を調べる', decisionHeading: '今回、いくら届ける？',
  decisionNote: '部長の言葉と、これまでのやりとりから判断しよう。',
  choiceA: '1万円未満（9,800円）', choiceB: '1万円を少し超える（10,300円）', choiceC: '',
  timedOut: '時間です。集めた手がかりから、届ける封筒を決めよう。',
  cinematicA: '9,800円の封筒に「備品代」と書き、受取窓口へ届ける。',
  cinematicB: '10,300円の封筒に「備品代」と書き、受取窓口へ届ける。', cinematicC: '',
  cinematicLabel: '立替金を、お届け中。', worldLocation: 'よしなに催事準備室', worldClock: '11:40',
  worldLabel: '言葉の意味と、\nこの人のつもり。',
  reviewHeading: '部長の言葉と、これまでのやりとり', correctChoice: 'B', successLabel: '今回の意図を予測',
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
