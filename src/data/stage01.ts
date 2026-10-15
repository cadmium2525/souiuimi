import type { Choice, Clue, Ending, StageDefinition } from '../game/types.ts';

export const STAGE_SECONDS = 120;

/** The stage script is the source of truth; clue order is not a progression gate. */
export const CLUES: Clue[] = [
  {
    id: 'C01', title: '散乱した書類', category: 'デスク / 現場の様子', symbol: '01',
    body: '机の上には紙くずとコーヒーの染みがある。',
    x: -3.5, z: -1.8, radius: 1.8,
  },
  {
    id: 'C02', title: '来客予定表', category: '受付 / スケジュール', symbol: '02',
    body: '本日15:00 来客：新拠点の設置確認',
    x: 0.6, z: -2, radius: 1.8,
  },
  {
    id: 'C03', title: '巨大コンテナ', category: '廊下 / 搬出設備', symbol: '03',
    body: 'コンテナには『移動式オフィス収納ユニット』と書かれている。',
    x: 8, z: 2.8, radius: 1.8,
  },
  {
    id: 'C04', title: '業務連絡', category: '壁 / お知らせ', symbol: '04',
    body: '本日をもって現オフィスの使用を終了します。移設作業にご協力ください。',
    x: 3.1, z: -4.1, radius: 1.8,
  },
  {
    id: 'C05', title: '窓の外のクレーン', category: '窓 / 外の様子', symbol: '05',
    body: '大型クレーン車。車体には『建物ごと運びます』の文字。',
    x: 5.4, z: -2.7, radius: 1.8,
  },
  {
    id: 'C06', title: '社内紹介ページ', category: 'PC / 会社のこと', symbol: '06',
    body: '当社の売り：ユニットごと移設可能なオフィス',
    x: 0.8, z: 1.5, radius: 1.8,
  },
  {
    id: 'C07', title: '上司の付箋', category: 'デスク / 伝言', symbol: '07',
    body: '『中身だけじゃなく、箱まで頼む！』',
    x: -3.4, z: 1.8, radius: 1.8,
  },
];

export const ENDINGS: Record<Choice, Ending> = {
  A: {
    title: '掃除は完璧。意味が違う。',
    subtitle: 'ENDING A / ピカピカの事務所',
    boss: 'いや、掃除じゃなくて“オフィスを片付けて”って……今日移設だよ？',
    player: 'そんなの普通わかりませんって！',
    explanation: '今日は移動式オフィスの移設日だった。今回の「片付ける」は、家具を残して建物ごと新拠点へ運ぶこと。',
  },
  B: {
    title: '中身は空っぽ。外側はそのまま。',
    subtitle: 'ENDING B / がらんとした事務所',
    boss: '中身だけ運んでどうするの！ 外側も！',
    player: '外側って言い方、初めて聞きましたけど！？',
    explanation: '今日は移動式オフィスの移設日だった。今回の「片付ける」は、家具を残して建物ごと新拠点へ運ぶこと。',
  },
  C: {
    title: 'そういう意味だったの！？',
    subtitle: 'ENDING C / まさかの大正解',
    boss: 'おお、ちゃんと片付いてる！ 助かった！',
    player: '……本当にこれでよかったの！？',
    explanation: '今日は移動式オフィスの移設日だった。今回の「片付ける」は、家具を残して建物ごと新拠点へ運ぶこと。',
  },
};

export const COPY: Record<string, string> = {
  gameTitle: 'そういう意味じゃない！',
  titleTagline: 'その解釈、絶対おかしい。……え、正解なの！？',
  stageTitle: '適当に片付けといて',
  stageNumber: 'STAGE 01',
  company: '株式会社よしなに',
  introBoss: '今日、お客さん来るからさ。オフィス、適当に片付けといて',
  introThought: '掃除しておけばいいのかな……',
  introInstruction: '制限時間2:00。事務所を調べて、上司の真意を推理しよう。',
  duration: '2分',
  startingClock: '2:00',
  start: 'はじめる',
  explore: '探索をはじめる',
  inspect: '調べる',
  decision: '判断する',
  remaining: '残り時間',
  clues: '手がかり',
  journal: '手がかり帳',
  close: '閉じる',
  retry: 'もう一度',
  title: 'タイトルへ',
  menu: 'メニュー',
  pause: '調査中はタイマー停止',
  foundEvidence: '見つけた証拠',
  missedEvidence: '見逃した証拠',
  choiceA: '机と床を掃除する',
  choiceB: '家具と備品を運び出す',
  choiceC: 'オフィスそのものを巨大な箱に収納する',
  decisionHeading: 'どう「片付ける」？',
  decisionNote: '集めた手がかりをもとに、上司の真意を決めよう。',
  timedOut: '時間切れ。さあ、どう片付ける？',
  back: '探索に戻る',
  cinematicA: 'モップで床を拭き、机の上の紙くずも片付ける。',
  cinematicB: '片付けも終盤。残った家具と備品を、オフィスの外へ運び出す。',
  cinematicC: 'クレーンがオフィスを丸ごと持ち上げ、巨大な箱の中へ。',
  soundOn: '音 ON',
  soundOff: '音 OFF',
  qualityNormal: '画質 標準',
  qualityLow: '画質 軽量',
  rotate: '縦持ちでのプレイがおすすめです',
  webglError: '3D表示を開始できませんでした。WebGLに対応したブラウザで開き、ブラウザのハードウェアアクセラレーションを有効にしてください。',
  contextLost: '3D描画が一時停止しました。ページを再読み込みして、もう一度お試しください。',
  fallbackHeading: 'オフィスを表示できませんでした。',
  reload: '再読み込み',
  exploreButton: 'オフィスを調べる',
  worldLocation: '株式会社よしなに',
  worldClock: '14:55',
  worldLabel: 'いつものオフィス。\nいつもの、無茶ぶり。',
  cinematicLabel: 'お仕事、実行中。',
  reviewHeading: '「片付ける」の意味を振り返る',
  correctChoice: 'C',
  successLabel: 'まさかの大正解',
};

export const STAGE01: StageDefinition = {
  id: 'stage01', number: '01', title: COPY.stageTitle, seconds: STAGE_SECONDS,
  start: { x: 0, z: -0.25 }, clues: CLUES, endings: ENDINGS, copy: COPY,
  choices: {
    A: { label: COPY.choiceA, description: '机の上と床をきれいにする。' },
    B: { label: COPY.choiceB, description: '中にあるものを、まとめて外へ。' },
    C: { label: COPY.choiceC, description: '建物ごと、コンテナの中へ。' },
  },
  cinematicSeconds: { A: 10, B: 16, C: 8 },
};
