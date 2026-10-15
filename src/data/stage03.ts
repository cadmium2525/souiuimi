import { COPY as COMMON_COPY } from './stage01.ts';
import type { Choice, Clue, Ending, StageDefinition } from '../game/types.ts';

const AGREEMENTS = '上司とのチャット\n上司「私の差し入れ、買い出しの余りはお礼にしてね」\nあなた「ありがとうございます」\n\n有志のグループ\n同僚「参加費の余りは、今回も本棚づくりの募金へ？」\n参加者全員「賛成！」';

const CLUES: Clue[] = [
  { id: 'C01', symbol: '01', title: '買い出しの封筒', category: '休憩室の机 / 預かり物', body: '買い出し代\n10月15日\n昼のお茶\n預かった現金：5,000円', x: -1, z: 0.1, radius: 1.6 },
  { id: 'C02', symbol: '02', title: '持ち帰ったレシート', category: '休憩室の机 / 購入記録', body: '10月15日\nよしなに売店\n緑茶 6本\n購入合計：3,200円\nお預かり：5,000円\n釣銭：1,800円', x: 1, z: -0.4, radius: 1.6 },
  { id: 'C03', symbol: '03', title: '出発前のチャット', category: '共有PC / 業務チャット', body: '上司「買い出しは二つね。昼のお茶は、参加するみんなで出し合ったお金。夕方のお菓子は、私からの差し入れだよ」\nあなた「それぞれの封筒で買ってきます」', x: -4.8, z: -2, radius: 1.6 },
  { id: 'C04', symbol: '04', title: '自分のスマホ', category: '自分のスマホ / これまでのやりとり', body: AGREEMENTS, x: -4.9, z: 1.6, radius: 1.6 },
  { id: 'C05', symbol: '05', title: '社内の募金箱', category: '休憩室 / 社員有志の活動', body: '地域の本棚づくり募金\n社員有志で集めた寄付を、地域の読書スペースの本に。\n募金期間：今月末まで', x: 4.5, z: -1.9, radius: 1.6 },
  { id: 'C06', symbol: '06', title: '次の買い物メモ', category: '休憩室の机 / 未使用の袋', body: '夕方のお菓子\nまだ買っていない。\n空の買い物袋と、未開封の封筒が置かれている。', x: 3.4, z: 1.6, radius: 1.6 },
  { id: 'C07', symbol: '07', title: '上司からの返信', category: '共有端末 / メッセージ', body: 'あなた「一つ目、買ってきました。残りは1,800円です」\n上司「買い出しありがとう。お釣りはいいよ」', x: 0.1, z: -2.8, radius: 1.6 },
];

const PROOF = '済ませたのは、みんなで出し合った「昼のお茶」の買い出し。参加費の余りは募金へ、と全員で決めていた。';
const ENDINGS: Record<Choice, Ending> = {
  A: { title: '経理さんも、受け取れない。', subtitle: '会社経理へ1,800円を返却', boss: '残り1,800円は昼のお茶の分だね。会社のお金ではなく、有志で集めた参加費だったよ。', player: 'どの買い出しの残りか、確かめればよかった……。', explanation: PROOF },
  B: { title: 'お礼だと、思ったけれど。', subtitle: '残り1,800円を自分の財布へ', boss: '残り1,800円は昼のお茶の分だね。私の差し入れではなく、有志の参加費だから、決めたとおり募金へお願い。', player: 'どの買い出しの残りか、確かめればよかった……。', explanation: PROOF },
  C: { title: 'そのお釣り、約束の行き先へ。', subtitle: '本棚づくりへ1,800円', boss: '残り1,800円、社内の募金箱へ入れてくれたんだね。有志のみんなにも伝えておくよ！', player: '一つ目の買い出し、完了です！', explanation: PROOF },
};

const COPY: Record<string, string> = {
  ...COMMON_COPY,
  stageTitle: 'お釣りはいいよ', stageNumber: 'STAGE 03',
  introBoss: '買い出しありがとう。お釣りはいいよ。', introThought: '',
  introInstruction: '制限時間2:00。買い出しから社内へ戻った。休憩室を調べて、残ったお金の扱いを決めよう。',
  exploreButton: '休憩室を調べる',
  decisionHeading: 'お釣りを、どうする？',
  decisionNote: '集めた手がかりをもとに、上司の真意を決めよう。',
  choiceA: '会社経理へ返却する', choiceB: '自分が受け取る', choiceC: '社内の募金箱へ入れる',
  timedOut: '時間です。集めた手がかりから、お釣りの扱いを決めよう。',
  cinematicA: '残り1,800円を、会社の経理窓口へ返却する。',
  cinematicB: '残り1,800円を、自分の財布にしまう。',
  cinematicC: '残り1,800円を、社内の募金箱へ入れる。',
  cinematicLabel: '残金を、精算中。', worldLocation: 'よしなに社内休憩室', worldClock: '10:20',
  worldLabel: '買い出しから戻った。\n残ったお金は？',
  reviewHeading: '買い出し前の話を振り返る', correctChoice: 'C', successLabel: '意図が伝わった',
  fallbackHeading: '社内休憩室を表示できませんでした。',
};

export const STAGE03: StageDefinition = {
  id: 'stage03', number: '03', title: COPY.stageTitle, seconds: 120,
  start: { x: 0, z: 3 }, clues: CLUES, endings: ENDINGS, copy: COPY,
  choices: {
    A: { label: '会社経理へ返却する', description: '残ったお金を、経理窓口に渡す。' },
    B: { label: '自分が受け取る', description: '残ったお金を、自分の財布にしまう。' },
    C: { label: '社内の募金箱へ入れる', description: '残ったお金を、社内の募金箱へ入れる。' },
  },
  cinematicSeconds: { A: 10, B: 10, C: 10 },
};
