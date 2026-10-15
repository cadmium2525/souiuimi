import { STAGE03 } from './stage03.ts';
import type { CaseInstance, Choice, Ending, MoneyCaseFacts, StageDefinition } from '../game/types.ts';

const CHOICES: Choice[] = ['A', 'B', 'C'];
const ACTIONS: Record<Choice, string> = {
  A: '会社経理へ返却する', B: '自分が受け取る', C: '店の募金箱へ入れる',
};

class Random {
  private value: number;
  constructor(seed: number) { this.value = seed >>> 0; }
  next(): number {
    this.value = (this.value + 0x6d2b79f5) >>> 0;
    let n = this.value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  pick<T>(values: readonly T[]): T { return values[this.int(0, values.length - 1)]; }
}

export function formatMoney(yen: number): string { return `${yen.toLocaleString('ja-JP')}円`; }

/** One current errand: whose money it is and what was agreed before shopping. */
export function solveMoneyFacts(facts: MoneyCaseFacts): Choice | null {
  if (facts.source === 'company-advance' && facts.arrangement === 'settle-company') return 'A';
  if (facts.source === 'boss-private' && facts.arrangement === 'personal-thanks') return 'B';
  if (facts.source === 'group-fund' && facts.arrangement === 'agreed-donation') return 'C';
  return null;
}

function presentation(facts: MoneyCaseFacts) {
  const changeYen = facts.paidYen - facts.purchaseYen;
  const money = formatMoney(changeYen);
  const correct = solveMoneyFacts(facts);
  const before: Record<Choice, string> = {
    A: `上司「${facts.occasion}、買ってきてもらえる？ 会社の仮払いを受け取ってきたから、この封筒を使って」\nあなた「はい。レシートももらってきます」`,
    B: `上司「${facts.occasion}、買ってきてもらえる？ 今日は私のおごり。私の財布から出すね」\nあなた「では、この封筒を預かります」`,
    C: `上司「${facts.occasion}、買ってきてもらえる？ みんなから集めたお金を、この封筒に入れてあるよ」\nあなた「はい。買ってきます」`,
  };
  const arrangement: Record<Choice, string> = {
    A: '経理からのお知らせ\n仮払いの精算は、レシートと使わなかったお金を一緒に、経理の精算トレーへ。\n\n上司「私は午後ずっと外。お釣りを手渡すために、私を待たなくて大丈夫だよ」',
    B: '上司「急な買い出しで、駆け回ってもらうからね。余った分は、君へのお礼にするよ」\nあなた「ありがとうございます。それでは、行ってきます」',
    C: '買い出し前のグループチャット\n同僚「使い切らなかった分は、売店の本棚づくりの募金箱に入れるのはどう？」\n参加者全員「賛成です」\n上司「じゃあ、それでお願いしよう」',
  };
  const intention: Record<Choice, string> = {
    A: '会社の仮払いなので、残りは経理で精算するお金だった。「いいよ」は、外出中の上司への手渡しは不要という意味。',
    B: '上司の私費で、残りは買い出しのお礼にする約束だった。「いいよ」は、そのまま受け取ってよいという意味。',
    C: 'みんなで出したお金の残りは、募金に回す約束だった。「いいよ」は、上司に返さず約束どおり募金してよいという意味。',
  };
  // Invalid facts are reported by validation. These fallbacks keep diagnostics readable.
  const choice = correct ?? 'A';
  const proof = intention[choice];
  const bodies: Record<string, string> = {
    C01: `${facts.envelopeName}\n${facts.today}\n${facts.occasion}\n預かった現金：${formatMoney(facts.paidYen)}`,
    C02: `${facts.today}\nよしなに売店\n購入合計：${formatMoney(facts.purchaseYen)}\nお預かり：${formatMoney(facts.paidYen)}\n釣銭：${money}`,
    C03: before[choice],
    C04: arrangement[choice],
    C05: '地域の本棚づくり募金\n集まった寄付で、地域の読書スペースに本を届けます。\nよしなに売店',
    C06: `${facts.occasion}\n合計：${formatMoney(facts.purchaseYen)}\n商品は受け取り済み。\n持ち帰り用の袋：1枚`,
    C07: `あなた「買ってきました。残りは${money}です」\n上司「買い出しありがとう。お釣りはいいよ」`,
  };
  const success: Record<Choice, Ending> = {
    A: { title: '会社のお金は、経理へ。', subtitle: `仮払いの残り${money}、精算完了`, boss: `残り${money}、経理で受け付けたって。私を待たずに済ませてくれて助かったよ！`, player: '買い出しも、精算も完了です！', explanation: proof },
    B: { title: 'そのお釣りは、ありがとうの分。', subtitle: `買い出しへのお礼${money}`, boss: `約束どおり、残り${money}はお礼に受け取って。買い出し、助かったよ！`, player: 'ありがとうございます。買い出し完了です！', explanation: proof },
    C: { title: 'そのお釣り、約束の行き先へ。', subtitle: `本棚づくりへ${money}`, boss: `残り${money}、募金してくれたんだね。みんなで決めたとおりだ。ありがとう！`, player: '買い出しも、募金も完了です！', explanation: proof },
  };
  const wrongBoss: Record<Choice, Record<Choice, string>> = {
    A: { A: '', B: '私に手渡さなくていい、というつもりだったんだ。会社から預かったお金だから、経理へ精算をお願い。', C: '私を待たなくていい、というつもりだったんだ。会社の仮払いを、私の判断で募金にはできないよ。' },
    B: { A: '今回は私の財布から出したお金だよ。余った分は君へのお礼にする、と出発前に話したよね。', B: '', C: '君へのお礼に受け取って、というつもりだったんだ。募金に回す約束はしていなかったよ。' },
    C: { A: 'みんなで出し合ったお金だよ。余った分は本棚づくりの募金に、と全員で決めていたんだ。', B: '私に返さなくていい、とは言ったけど、君へのお礼ではないんだ。みんなで募金に回すと決めていたよね。', C: '' },
  };
  const endings = Object.fromEntries(CHOICES.map(action => [action, action === correct ? success[action] : {
    title: action === 'A' ? '経理さんも、受け取れない。' : action === 'B' ? 'お礼だと、思ったけれど。' : '善意だけでは、決められない。',
    subtitle: `残り${money}を${ACTIONS[action]}`,
    boss: `残り${money}のことだけど……。${wrongBoss[choice][action]}`,
    player: '「いいよ」の前に、どんな話をしていたか思い出せばよかった……。',
    explanation: proof,
  }])) as Record<Choice, Ending>;
  const signage: Record<string, string> = {
    envelope: `${facts.envelopeName}\n${formatMoney(facts.paidYen)}`,
    receipt: `レシート\n合計 ${formatMoney(facts.purchaseYen)}\n釣銭 ${money}`,
    ledger: '買い出し前の\nチャット',
    rules: '依頼時の\nやりとり',
    donationBox: '本棚づくり\n募金箱',
    order: `お買い物メモ\n${formatMoney(facts.purchaseYen)}\n受け取り済み`,
    oldMemo: '上司からの\n返信',
  };
  return { bodies, endings, signage };
}

export function createMoneyCase(inputSeed: number): CaseInstance {
  if (!Number.isFinite(inputSeed)) throw new RangeError('case seed must be finite');
  const seed = inputSeed >>> 0;
  const random = new Random(seed);
  const choice = random.pick(CHOICES);
  const paidYen = random.pick([1000, 2000, 3000, 5000]);
  const changeYen = random.int(2, Math.min(18, paidYen / 50 - 2)) * 50;
  const source: Record<Choice, MoneyCaseFacts['source']> = { A: 'company-advance', B: 'boss-private', C: 'group-fund' };
  const arrangement: Record<Choice, MoneyCaseFacts['arrangement']> = { A: 'settle-company', B: 'personal-thanks', C: 'agreed-donation' };
  const facts: MoneyCaseFacts = {
    kind: 'money', today: `10月${random.int(2, 28)}日`,
    envelopeName: random.pick(['買い出し代', 'おつかい代', '今日の買い物代']),
    occasion: random.pick(['午後の打ち合わせ用のお茶と菓子', '差し入れの飲み物', '休憩室で分けるお菓子', 'イベント準備の軽食', '歓迎会用の紙皿と飲み物', '休憩時間のお茶とクッキー']),
    paidYen, purchaseYen: paidYen - changeYen, source: source[choice], arrangement: arrangement[choice],
  };
  const correctChoice = solveMoneyFacts(facts)!;
  const { bodies, endings, signage } = presentation(facts);
  const money = formatMoney(changeYen);
  const stage: StageDefinition = {
    ...STAGE03, start: { ...STAGE03.start },
    clues: STAGE03.clues.map(clue => ({ ...clue, body: bodies[clue.id] })), endings,
    choices: Object.fromEntries(CHOICES.map(action => [action, { ...STAGE03.choices[action] }])) as StageDefinition['choices'],
    cinematicSeconds: { ...STAGE03.cinematicSeconds },
    copy: {
      ...STAGE03.copy, correctChoice, successLabel: '意図が伝わった',
      cinematicA: `残り${money}を、会社の経理窓口へ返却する。`,
      cinematicB: `残り${money}を、自分の財布にしまう。`,
      cinematicC: `残り${money}を、店の募金箱へ入れる。`,
    },
  };
  return {
    ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C03', 'C04', 'C07'], facts,
    moneyPlan: { changeYen, paidYen, purchaseYen: facts.purchaseYen, envelopeId: facts.envelopeName, signage },
  };
}

export function validateMoneyCase(instance: CaseInstance): string[] {
  const errors: string[] = [];
  if (instance.facts.kind !== 'money') return ['not a money case'];
  const facts = instance.facts;
  const plan = instance.moneyPlan;
  const solved = solveMoneyFacts(facts);
  if (!solved || solved !== instance.correctChoice) errors.push('money context does not produce the declared unique answer');
  if (instance.copy.correctChoice !== instance.correctChoice) errors.push('money copy answer differs from facts');
  if (!facts.today.trim() || !facts.envelopeName.trim() || !facts.occasion.trim()) errors.push('money context must describe this errand');
  if (!plan || plan.paidYen !== facts.paidYen || plan.purchaseYen !== facts.purchaseYen || plan.envelopeId !== facts.envelopeName || plan.changeYen !== facts.paidYen - facts.purchaseYen || plan.changeYen <= 0) errors.push('money plan amount or envelope differs from facts');
  if (facts.paidYen <= facts.purchaseYen || facts.purchaseYen <= 0 || !Number.isInteger(facts.paidYen) || !Number.isInteger(facts.purchaseYen)) errors.push('money amount invalid');
  const expected = presentation(facts);
  for (const clue of STAGE03.clues) {
    const actual = instance.clues.find(entry => entry.id === clue.id);
    if (actual?.body !== expected.bodies[clue.id]) errors.push(`${clue.id} text contradicts the current errand`);
    if (actual?.title !== clue.title || actual?.category !== clue.category) errors.push(`${clue.id} description differs from observation`);
  }
  if (instance.clues.length !== STAGE03.clues.length || new Set(instance.clues.map(clue => clue.id)).size !== STAGE03.clues.length) errors.push('money evidence must describe seven current observations');
  if (JSON.stringify(plan?.signage) !== JSON.stringify(expected.signage)) errors.push('money signage contradicts the current errand');
  const money = formatMoney(facts.paidYen - facts.purchaseYen);
  for (const choice of CHOICES) {
    if (JSON.stringify(instance.endings[choice]) !== JSON.stringify(expected.endings[choice])) errors.push(`money ending ${choice} proof or dialogue contradicts the context`);
    if (!instance.copy[`cinematic${choice}`]?.includes(money)) errors.push(`money cinematic ${choice} amount contradicts facts`);
  }
  return errors;
}
