import { COPY as COMMON_COPY } from './stage01.ts';
import type { Choice, Clue, Ending, StageDefinition } from '../game/types.ts';

const CLUES: Clue[] = [
  { id: 'C01', symbol: '01', title: '買い出しの封筒', category: 'カウンター / 預かり物', body: '買い出し代\n10月15日\n午後の打ち合わせ用のお茶と菓子\n預かった現金：5,000円', x: -1, z: 0.1, radius: 1.6 },
  { id: 'C02', symbol: '02', title: 'レシート', category: 'レジ / 購入記録', body: '10月15日\nよしなに売店\n購入合計：3,200円\nお預かり：5,000円\n釣銭：1,800円', x: 1, z: -0.4, radius: 1.6 },
  { id: 'C03', symbol: '03', title: '買い出し前のチャット', category: '端末 / メッセージ', body: '上司「午後の打ち合わせ用のお茶と菓子、買ってきてもらえる？ みんなから集めたお金を、この封筒に入れてあるよ」\nあなた「はい。買ってきます」', x: -4.8, z: -2, radius: 1.6 },
  { id: 'C04', symbol: '04', title: '依頼時のやりとり', category: '掲示板 / メモ', body: '買い出し前のグループチャット\n同僚「使い切らなかった分は、売店の本棚づくりの募金箱に入れるのはどう？」\n参加者全員「賛成です」\n上司「じゃあ、それでお願いしよう」', x: -4.9, z: 1.6, radius: 1.6 },
  { id: 'C05', symbol: '05', title: '店の募金箱', category: '売店 / 受付', body: '地域の本棚づくり募金\n集まった寄付で、地域の読書スペースに本を届けます。\nよしなに売店', x: 4.5, z: -1.9, radius: 1.6 },
  { id: 'C06', symbol: '06', title: 'お買い物メモ', category: '売店 / 買い物かご', body: '午後の打ち合わせ用のお茶と菓子\n合計：3,200円\n商品は受け取り済み。\n持ち帰り用の袋：1枚', x: 3.4, z: 1.6, radius: 1.6 },
  { id: 'C07', symbol: '07', title: '上司からの返信', category: '作業台 / メッセージ', body: 'あなた「買ってきました。残りは1,800円です」\n上司「買い出しありがとう。お釣りはいいよ」', x: 0.1, z: -2.8, radius: 1.6 },
];

const PROOF = 'みんなで出したお金の残りは、募金に回す約束だった。「いいよ」は、上司に返さず約束どおり募金してよいという意味。';
const ENDINGS: Record<Choice, Ending> = {
  A: { title: '経理さんも、受け取れない。', subtitle: '会社経理へ1,800円を返却', boss: '残り1,800円のことだけど……。みんなで出し合ったお金だよ。余った分は本棚づくりの募金に、と全員で決めていたんだ。', player: '「いいよ」の前に、どんな話をしていたか思い出せばよかった……。', explanation: PROOF },
  B: { title: 'お礼だと、思ったけれど。', subtitle: '残り1,800円を自分の財布へ', boss: '残り1,800円のことだけど……。私に返さなくていい、とは言ったけど、君へのお礼ではないんだ。みんなで募金に回すと決めていたよね。', player: '「いいよ」の前に、どんな話をしていたか思い出せばよかった……。', explanation: PROOF },
  C: { title: 'そのお釣り、約束の行き先へ。', subtitle: '本棚づくりへ1,800円', boss: '残り1,800円、募金してくれたんだね。みんなで決めたとおりだ。ありがとう！', player: '買い出しも、募金も完了です！', explanation: PROOF },
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
  cinematicC: '残り1,800円を、店の募金箱へ入れる。',
  cinematicLabel: '残金を、精算中。', worldLocation: 'よしなに購買コーナー', worldClock: '15:20',
  worldLabel: '買い出しのあと、\n残ったお金は？',
  reviewHeading: '買い出し前の話を振り返る', correctChoice: 'C', successLabel: '意図が伝わった',
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
