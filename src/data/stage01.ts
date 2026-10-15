import type { Choice, Clue, Ending, StageDefinition } from '../game/types.ts';

export const STAGE_SECONDS = 120;

/** The stage script is the source of truth; clue order is not a progression gate. */
export const CLUES: Clue[] = [
  {
    id: 'C01', title: '散乱した書類', category: 'デスク / 現場の様子', symbol: '01',
    body: '机の上には紙くずとコーヒーの染みがある。床にも紙が落ちている。',
    x: -3.5, z: -1.8, radius: 1.8,
  },
  {
    id: 'C02', title: '明日の利用相談', category: '受付 / 相談', symbol: '02',
    body: '明日の利用について届いた相談\n田中さん「明日、この部屋で打ち合わせを。今ある机を囲んで、4人で話せれば助かります」\n佐藤さん「海辺の現場には、まだ部屋がなくて。今の机の配置を崩さず、明日朝から仕事を再開したいです」',
    x: 0.6, z: -2, radius: 1.8,
  },
  {
    id: 'C03', title: '巨大コンテナ', category: '廊下 / 搬出設備', symbol: '03',
    body: 'コンテナには「移動式オフィス収納ユニット」と書かれている。',
    x: 8, z: 2.8, radius: 1.8,
  },
  {
    id: 'C04', title: '部長からの返信', category: '壁 / 連絡', symbol: '04',
    body: '部長からの連絡\n「佐藤さんに、明日の件を引き受けると返事しました。もう一方には今回は見送ると連絡済みです。片付け、今日中によろしく」',
    x: 3.1, z: -4.1, radius: 1.8,
  },
  {
    id: 'C05', title: '窓の外のクレーン', category: '窓 / 外の様子', symbol: '05',
    body: '大型クレーン車。車体には「建物ごと運びます」の文字。',
    x: 5.4, z: -2.7, radius: 1.8,
  },
  {
    id: 'C06', title: '社内紹介ページ', category: 'PC / 会社のこと', symbol: '06',
    body: '会社紹介\n当社のオフィスは移動式。建物を組み立てたまま、別の場所へ運ぶことができます。',
    x: 0.8, z: 1.5, radius: 1.8,
  },
  {
    id: 'C07', title: '上司の付箋', category: 'デスク / 伝言', symbol: '07',
    body: '上司の付箋\n「机の上の備品は会社のものだから、捨てないでね。紙くずだけはゴミ箱へ！」',
    x: -3.4, z: 1.8, radius: 1.8,
  },
];

export const ENDINGS: Record<Choice, Ending> = {
  A: {
    title: '掃除は完璧。意味が違う。',
    subtitle: 'ENDING A / ピカピカの事務所',
    boss: '明日は海辺の現場で仕事をするんだ。あっちには部屋がまだなくて……！',
    player: 'そんなの普通わかりませんって！',
    explanation: '部屋のない次の現場で、同じ席から仕事を再開する。今回の「片付ける」は、移動式オフィスを建物ごと運ぶこと。',
  },
  B: {
    title: '中身は空っぽ。外側はそのまま。',
    subtitle: 'ENDING B / がらんとした事務所',
    boss: '机の配置も残して、部屋ごと運びたかったんだよ。いつもの席がばらばらだ！',
    player: '外側って言い方、初めて聞きましたけど！？',
    explanation: '部屋のない次の現場で、同じ席から仕事を再開する。今回の「片付ける」は、移動式オフィスを建物ごと運ぶこと。',
  },
  C: {
    title: 'そういう意味だったの！？',
    subtitle: 'ENDING C / まさかの大正解',
    boss: 'そうそう、このオフィスごと運びたかったんだ。明日も、いつもの席で仕事ができる！',
    player: '……本当にこれでよかったの！？',
    explanation: '部屋のない次の現場で、同じ席から仕事を再開する。今回の「片付ける」は、移動式オフィスを建物ごと運ぶこと。',
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
