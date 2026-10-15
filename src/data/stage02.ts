import type { Choice, Clue, Ending, StageDefinition } from '../game/types.ts';
import { COPY as COMMON_COPY } from './stage01.ts';

const CLUES: Clue[] = [
  { id: 'C01', symbol: '01', title: 'イベントポスター', category: '掲示板 / イベント', body: '開始10:10／受付開始10:00', x: -3.6, z: -1.9, radius: 1.8 },
  { id: 'C02', symbol: '02', title: '同僚の過去メモ', category: 'ベンチ / メモ', body: '先週のイベント：開始14:00、会場到着13:55', x: 0.5, z: -2.7, radius: 1.8 },
  { id: 'C03', symbol: '03', title: 'シャトル時刻表', category: '案内板 / 交通', body: '09:55発→10:08会場着／次便10:15発→10:28着', x: 4.7, z: -2.4, radius: 1.8 },
  { id: 'C04', symbol: '04', title: '上司の過去記録', category: 'カフェ前 / 記録', body: '昨日の会議：開始10:00／部長の入室09:49', x: -5.1, z: 1.4, radius: 1.8 },
  { id: 'C05', symbol: '05', title: '天気予報', category: '街頭モニター / 天気', body: '10:00から雨', x: 3.7, z: 1.8, radius: 1.8 },
  { id: 'C06', symbol: '06', title: '資料箱の荷札', category: '資料箱 / 配送', body: '会場へ納品／受取時間10:08〜10:10', x: -0.8, z: 0.6, radius: 1.8 },
  { id: 'C07', symbol: '07', title: '乗り場案内', category: '案内標識 / 交通', body: 'シャトル乗り場まで徒歩2分', x: 6.8, z: 2.4, radius: 1.8 },
];

const ENDINGS: Record<Choice, Ending> = {
  A: {
    title: '10時の、10分前。', subtitle: 'ENDING A / 間に合った資料',
    boss: 'お、9時50分ぴったり！ 9時55分のシャトルに乗れば、資料の受取時間に間に合うね。',
    player: 'よかった、シャトルに間に合いました！',
    explanation: '9時55分のシャトルで資料を届ける予定だった。今回、部長が意図した集合時刻は「10時の10分前」の9時50分。',
  },
  B: {
    title: '5分前行動、行き先違い。', subtitle: 'ENDING B / 発車済みのシャトル',
    boss: '10時の10分前、9時50分に集合のつもりだったんだ。シャトルはもう出ちゃったよ……。',
    player: '10時10分の少し前かと……',
    explanation: '9時55分のシャトルで資料を届ける予定だった。今回、部長が意図した集合時刻は「10時の10分前」の9時50分。',
  },
  C: {
    title: '10時10分。会場は開始。', subtitle: 'ENDING C / 駅前にひとり',
    boss: '今、会場でイベントが始まったよ。集合は10時の10分前だったんだ……。',
    player: '“前”も大事でした……',
    explanation: '9時55分のシャトルで資料を届ける予定だった。今回、部長が意図した集合時刻は「10時の10分前」の9時50分。',
  },
};

const COPY: Record<string, string> = {
  ...COMMON_COPY,
  stageTitle: '10時10分前集合', stageNumber: 'STAGE 02',
  introBoss: '駅前で、10時10分前集合ね。会場に届ける資料もよろしく！',
  introThought: '',
  introInstruction: '制限時間2:00。駅前広場を調べて、集合時刻を決めよう。',
  exploreButton: '駅前広場を調べる',
  decisionHeading: '何時に集合する？',
  decisionNote: '集めた手がかりをもとに、駅前への集合時刻を決めよう。',
  timedOut: '時間です。集めた手がかりから、集合時刻を決めよう。',
  cinematicA: '9時50分に駅前へ。資料箱を持ち、9時55分のシャトルで会場へ向かう。',
  cinematicB: '10時05分に駅前へ。資料箱を持って乗り場へ向かう。',
  cinematicC: '10時10分に駅前へ。会場ではイベントの開始時刻を迎える。',
  cinematicLabel: '集合場所へ、移動中。',
  worldLocation: 'よしなに駅前広場', worldClock: '09:47',
  worldLabel: '駅前で、待ち合わせ。\nさて、何時に？',
  reviewHeading: '集合時刻と、シャトルの時刻',
  correctChoice: 'A', successLabel: '時間どおり',
  fallbackHeading: '駅前広場を表示できませんでした。',
};

export const STAGE02: StageDefinition = {
  id: 'stage02', number: '02', title: COPY.stageTitle, seconds: 120,
  start: { x: 0, z: 3 }, clues: CLUES, endings: ENDINGS, copy: COPY,
  choices: {
    A: { label: '09:50に集合する', description: '10時の10分前、と受け取る。' },
    B: { label: '10:05に集合する', description: '10時10分の、少し前と受け取る。' },
    C: { label: '10:10に集合する', description: '10時10分、という時刻で受け取る。' },
  },
  cinematicSeconds: { A: 8, B: 8, C: 8 },
};
