import { STAGE03 } from './stage03.ts';
import type { CaseInstance, Choice, Ending, MoneyCaseFacts, StageDefinition } from '../game/types.ts';

const CHOICES: Choice[] = ['A', 'B', 'C'];
const ACTIONS: Record<Choice, string> = {
  A: '会社経理へ返却する', B: '自分が受け取る', C: '社内の募金箱へ入れる',
};
export const MONEY_PURPOSES = ['昼のお茶', '夕方のお菓子'] as const;
type MoneySource = MoneyCaseFacts['errands'][number]['source'];
const SOURCES: MoneySource[] = ['company-advance', 'boss-private', 'group-fund'];
const SOURCE_SPEECH: Record<MoneySource, string> = {
  'company-advance': '会社の仮払い',
  'boss-private': '私からの差し入れ',
  'group-fund': '参加するみんなで出し合ったお金',
};
const SOURCE_CHOICE: Record<MoneySource, Choice> = {
  'company-advance': 'A', 'boss-private': 'B', 'group-fund': 'C',
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

/** Identify the completed errand before applying the owner's separate agreement. */
export function solveMoneyFacts(facts: MoneyCaseFacts): Choice | null {
  if (!Array.isArray(facts.errands) || facts.errands.length !== 2) return null;
  if (facts.errands.some(errand => !MONEY_PURPOSES.includes(errand.purpose as typeof MONEY_PURPOSES[number]) || !SOURCES.includes(errand.source))) return null;
  if (new Set(facts.errands.map(errand => errand.purpose)).size !== 2 || new Set(facts.errands.map(errand => errand.source)).size !== 2) return null;
  const completed = facts.errands.filter(errand => errand.purpose === facts.occasion);
  return completed.length === 1 ? SOURCE_CHOICE[completed[0].source] : null;
}

/** The actual observed text, also audited as complete cards across all twelve contexts. */
export function moneyClueBodies(facts: MoneyCaseFacts): Record<string, string> {
  const change = formatMoney(facts.paidYen - facts.purchaseYen);
  const errands = facts.errands?.length === 2 ? facts.errands : [
    { purpose: MONEY_PURPOSES[0], source: 'company-advance' as const },
    { purpose: MONEY_PURPOSES[1], source: 'boss-private' as const },
  ];
  const next = errands.find(errand => errand.purpose !== facts.occasion)?.purpose ?? MONEY_PURPOSES[1];
  return {
    C01: `${facts.envelopeName}\n${facts.today}\n${facts.occasion}\n預かった現金：${formatMoney(facts.paidYen)}`,
    C02: `${facts.today}\nよしなに売店\n${facts.occasion === MONEY_PURPOSES[0] ? '緑茶 6本' : '焼き菓子 1箱'}\n購入合計：${formatMoney(facts.purchaseYen)}\nお預かり：${formatMoney(facts.paidYen)}\n釣銭：${change}`,
    C03: `上司「買い出しは二つね。${errands[0].purpose}は、${SOURCE_SPEECH[errands[0].source]}。${errands[1].purpose}は、${SOURCE_SPEECH[errands[1].source]}だよ」\nあなた「それぞれの封筒で買ってきます」`,
    C04: STAGE03.clues.find(clue => clue.id === 'C04')!.body,
    C05: STAGE03.clues.find(clue => clue.id === 'C05')!.body,
    C06: `${next}\nまだ買っていない。\n空の買い物袋と、未開封の封筒が置かれている。`,
    C07: `あなた「一つ目、買ってきました。残りは${change}です」\n上司「買い出しありがとう。お釣りはいいよ」`,
  };
}

function presentation(facts: MoneyCaseFacts) {
  const changeYen = facts.paidYen - facts.purchaseYen;
  const money = formatMoney(changeYen);
  const correct = solveMoneyFacts(facts);
  const choice = correct ?? 'A';
  const proof: Record<Choice, string> = {
    A: `済ませたのは、会社の仮払いを預かった「${facts.occasion}」の買い出し。上司へ手渡す必要はなく、経理へ精算する残金だった。`,
    B: `済ませたのは、上司の差し入れの「${facts.occasion}」の買い出し。私費の余りはお礼にする、と本人から言われていた。`,
    C: `済ませたのは、みんなで出し合った「${facts.occasion}」の買い出し。参加費の余りは募金へ、と全員で決めていた。`,
  };
  const success: Record<Choice, Ending> = {
    A: { title: '会社のお金は、経理へ。', subtitle: `仮払いの残り${money}、精算完了`, boss: `残り${money}、経理で受け付けたって。私を待たずに済ませてくれて助かったよ！`, player: '一つ目の買い出し、精算まで完了です！', explanation: proof[choice] },
    B: { title: 'そのお釣りは、ありがとうの分。', subtitle: `買い出しへのお礼${money}`, boss: `残り${money}は、お使いのお礼に受け取って。私の差し入れ、届けてくれてありがとう！`, player: 'ありがとうございます。一つ目、完了です！', explanation: proof[choice] },
    C: { title: 'そのお釣り、約束の行き先へ。', subtitle: `本棚づくりへ${money}`, boss: `残り${money}、社内の募金箱へ入れてくれたんだね。有志のみんなにも伝えておくよ！`, player: '一つ目の買い出し、完了です！', explanation: proof[choice] },
  };
  const wrongBoss: Record<Choice, Record<Choice, string>> = {
    A: { A: '', B: '今回済ませたのは、会社の仮払いの買い出しだよ。私への手渡しは要らないから、経理へお願い。', C: '今回済ませたのは、会社の仮払いの買い出しだよ。有志の参加費と一緒にはできないんだ。' },
    B: { A: '今回は、私からの差し入れの買い出しだよ。余りはお礼にする、と君に伝えていたね。', B: '', C: '今回は、私からの差し入れの買い出しだよ。有志の参加費とは別だから、君がお礼に受け取って。' },
    C: { A: '今回は、有志で出し合った参加費の買い出しだよ。会社の経費とは別なんだ。', B: '今回は、有志の参加費の買い出しだよ。私からの差し入れとは別で、みんなで募金に決めていたね。', C: '' },
  };
  const endings = Object.fromEntries(CHOICES.map(action => [action, action === correct ? success[action] : {
    title: action === 'A' ? '経理さんも、受け取れない。' : action === 'B' ? 'お礼だと、思ったけれど。' : '善意だけでは、決められない。',
    subtitle: `残り${money}を${ACTIONS[action]}`,
    boss: `残り${money}のことだけど……。${wrongBoss[choice][action]}`,
    player: 'どの買い出しの残りか、確かめればよかった……。',
    explanation: proof[choice],
  }])) as Record<Choice, Ending>;
  const signage: Record<string, string> = {
    envelope: `${facts.envelopeName}\n${formatMoney(facts.paidYen)}`,
    receipt: `レシート\n合計 ${formatMoney(facts.purchaseYen)}\n釣銭 ${money}`,
    ledger: '共有PC\n業務チャット',
    rules: '自分のスマホ\nメッセージ',
    donationBox: '本棚づくり\n社内募金箱',
    order: '次の買い物\n未使用の袋',
    oldMemo: '上司からの\n返信',
  };
  return { bodies: moneyClueBodies(facts), endings, signage };
}

export function createMoneyCase(inputSeed: number): CaseInstance {
  if (!Number.isFinite(inputSeed)) throw new RangeError('case seed must be finite');
  const seed = inputSeed >>> 0;
  const random = new Random(seed);
  const firstSource = random.pick(SOURCES);
  const secondSource = random.pick(SOURCES.filter(source => source !== firstSource));
  const occasion = random.pick(MONEY_PURPOSES);
  const paidYen = random.pick([1000, 2000, 3000, 5000]);
  const changeYen = random.int(2, Math.min(18, paidYen / 50 - 2)) * 50;
  const facts: MoneyCaseFacts = {
    kind: 'money', today: `10月${random.int(2, 28)}日`,
    envelopeName: random.pick(['買い出し代', 'おつかい代', '今日の買い物代']),
    occasion, paidYen, purchaseYen: paidYen - changeYen,
    errands: [{ purpose: MONEY_PURPOSES[0], source: firstSource }, { purpose: MONEY_PURPOSES[1], source: secondSource }],
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
      cinematicC: `残り${money}を、社内の募金箱へ入れる。`,
    },
  };
  return {
    ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C01', 'C03', 'C04'], facts,
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
