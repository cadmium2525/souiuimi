import { COPY as COMMON_COPY } from './stage01.ts';
import type { Choice, Clue, Ending, StageDefinition } from '../game/types.ts';

const CLUES: Clue[] = [
  { id: 'C01', symbol: '01', title: '今回の封筒', category: 'カウンター / 預かり物', body: '本日：10月15日\n封筒番号：E17\n買い出し用の現金：5,000円', x: -1, z: 0.1, radius: 1.6 },
  { id: 'C02', symbol: '02', title: '領収書', category: 'レジ / 購入記録', body: '10月15日／封筒E17\n購入合計：3,200円\nお預かり：5,000円\n釣銭：1,800円', x: 1, z: -0.4, radius: 1.6 },
  { id: 'C03', symbol: '03', title: '出納台帳', category: '経理窓口 / 記録', body: '10月15日／E17 → F27\n10月15日／E16 → F81\n10月15日／E73 → F54', x: -4.8, z: -2, radius: 1.6 },
  { id: 'C04', symbol: '04', title: '精算ルール', category: '掲示板 / 取扱い', body: 'よしなに購買コーナーの取扱い\nF81：会社の仮払金。残額は会社経理へ返却。上司個人への返還は不要。\nF54：上司私費の依頼。残額は買い出し担当者への謝礼とする。\nF27：寄付同意付き資金。購入後の残額は店の募金箱D01へ入れる。', x: -4.9, z: 1.6, radius: 1.6 },
  { id: 'C05', symbol: '05', title: '店の募金箱', category: '売店 / 受付', body: '募金箱D01\n地域の本棚づくり基金\n寄付同意付き資金の残額を受け付けています。', x: 4.5, z: -1.9, radius: 1.6 },
  { id: 'C06', symbol: '06', title: '注文票', category: '売店 / 注文記録', body: '10月15日／封筒E17\n会議用の飲み物・文具\n合計：3,200円\n商品は引渡し済み。', x: 3.4, z: 1.6, radius: 1.6 },
  { id: 'C07', symbol: '07', title: '過去の精算メモ', category: '作業台 / 保存記録', body: '10月14日／封筒E16\nこの日の精算は完了。\n記録者：購買コーナー担当', x: 0.1, z: -2.8, radius: 1.6 },
];

const PROOF = '今回の封筒はE17。10月15日の台帳ではE17 → F27。\nF27は寄付同意付き資金で、購入後の残額を募金箱D01へ入れる取扱い。5,000円 − 3,200円 = 1,800円。\n今回の「お釣りはいいよ」は、上司に返さず、同意済みの寄付へ回すという意図だった。';
const ENDINGS: Record<Choice, Ending> = {
  A: { title: '返却先を、もう一度。', subtitle: '会社経理へ1,800円を返却', boss: 'E17はF27の資金だよ。残り1,800円は、同意していた募金箱へお願い！', player: '出どころと、今回の取扱いを確認するんだった……。', explanation: `${PROOF}\n実行したのは「会社経理へ返却」だった。` },
  B: { title: '自分のお金、ではなかった。', subtitle: '残り1,800円を自分の財布へ', boss: 'E17はF27。今回は謝礼じゃなくて、1,800円を募金する取扱いだったよ。', player: '「いいよ」のあとが、資金によって違うんだ……。', explanation: `${PROOF}\n実行したのは「自分が受け取る」だった。` },
  C: { title: 'その1,800円、約束の行き先へ。', subtitle: '同意済みの寄付、完了', boss: 'E17の1,800円、募金箱D01に入れてくれたんだね。ありがとう！', player: '買い出しも、残金の処理も完了です！', explanation: PROOF },
};

const COPY: Record<string, string> = {
  ...COMMON_COPY,
  stageTitle: 'お釣りはいいよ', stageNumber: 'STAGE 03',
  introBoss: '買い出しありがとう。お釣りはいいよ。', introThought: '',
  introInstruction: '制限時間2:00。購買コーナーを調べて、残ったお金の扱いを決めよう。',
  exploreButton: '購買コーナーを調べる',
  decisionHeading: 'お釣りを、どうする？',
  decisionNote: '集めた手がかりをもとに、上司の真意を決めよう。',
  choiceA: '会社経理へ返却する', choiceB: '自分が受け取る', choiceC: '店の募金箱へ入れる',
  timedOut: '時間です。集めた手がかりから、お釣りの扱いを決めよう。',
  cinematicA: '残り1,800円を、会社の経理窓口へ返却する。',
  cinematicB: '残り1,800円を、自分の財布にしまう。',
  cinematicC: '残り1,800円を、店の募金箱D01へ入れる。',
  cinematicLabel: '残金を、精算中。', worldLocation: 'よしなに購買コーナー', worldClock: '15:20',
  worldLabel: '買い出しのあと、\n残ったお金は？',
  reviewHeading: '封筒と、残金の行き先', correctChoice: 'C', successLabel: '取扱いどおり',
  fallbackHeading: '購買コーナーを表示できませんでした。',
};

export const STAGE03: StageDefinition = {
  id: 'stage03', number: '03', title: COPY.stageTitle, seconds: 120,
  start: { x: 0, z: 3 }, clues: CLUES, endings: ENDINGS, copy: COPY,
  choices: {
    A: { label: '会社経理へ返却する', description: '残ったお金を、経理窓口に渡す。' },
    B: { label: '自分が受け取る', description: '残ったお金を、自分の財布にしまう。' },
    C: { label: '店の募金箱へ入れる', description: '残ったお金を、募金箱へ入れる。' },
  },
  cinematicSeconds: { A: 10, B: 10, C: 10 },
};
