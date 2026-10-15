import { STAGE03 } from './stage03.ts';
import type { CaseInstance, Choice, Ending, MoneyCaseFacts, StageDefinition } from '../game/types.ts';

const CHOICES: Choice[] = ['A', 'B', 'C'];
const SOURCES: Record<Choice, string> = {
  A: '会社の買い出し用仮払金',
  B: '上司私費の買い出し依頼',
  C: '寄付同意付き共同購入資金',
};
const CONDITIONS: Record<Choice, string> = {
  A: '残額は会社経理へ返却。上司個人への返還は不要。',
  B: '依頼時の合意：購入後の残額は、買い出し担当者への謝礼とする。',
  C: '参加者全員の同意：購入後の残額は、店の募金箱D01へ入れる。',
};
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
  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

function identifiers(random: Random, prefix: string): string[] {
  const values = new Set<string>();
  while (values.size < 3) values.add(`${prefix}${random.int(10, 99)}`);
  return [...values];
}

export function formatMoney(yen: number): string { return `${yen.toLocaleString('ja-JP')}円`; }

/** The current date and envelope identify one ledger row, then one fund rule. */
export function solveMoneyFacts(facts: MoneyCaseFacts): Choice | null {
  const rows = facts.assignments.filter(row => row.date === facts.today && row.envelope === facts.envelopeId);
  if (rows.length !== 1) return null;
  const funds = facts.funds.filter(fund => fund.id === rows[0].fund);
  return funds.length === 1 && CHOICES.includes(funds[0].requirement) ? funds[0].requirement : null;
}

/** Generates the ledger first. The answer is solved from its relations, never its row or ID. */
export function createMoneyCase(inputSeed: number): CaseInstance {
  if (!Number.isFinite(inputSeed)) throw new RangeError('case seed must be finite');
  const seed = inputSeed >>> 0;
  const random = new Random(seed);
  const day = random.int(2, 28);
  const today = `10月${day}日`;
  const envelopes = identifiers(random, 'E');
  const fundIds = identifiers(random, 'F');
  const requirements = random.shuffle(CHOICES);
  const funds = random.shuffle(fundIds.map((id, i) => ({
    id, source: SOURCES[requirements[i]], requirement: requirements[i], condition: CONDITIONS[requirements[i]],
  })));
  const currentAssignments = envelopes.map((envelope, i) => ({ date: today, envelope, fund: fundIds[i] }));
  const envelopeId = random.pick(envelopes);
  const oldNote = { date: `10月${day - 1}日`, envelope: random.pick(envelopes) };
  const previousFund = random.pick(fundIds.filter(id => id !== currentAssignments.find(row => row.envelope === oldNote.envelope)!.fund));
  const assignments = random.shuffle([...currentAssignments, { ...oldNote, fund: previousFund }]);
  const paidYen = random.pick([1000, 2000, 3000, 5000]);
  const changeYen = random.int(2, Math.min(18, paidYen / 50 - 2)) * 50;
  const purchaseYen = paidYen - changeYen;
  const facts: MoneyCaseFacts = { kind: 'money', today, envelopeId, paidYen, purchaseYen, assignments, funds, oldNote };
  const correctChoice = solveMoneyFacts(facts)!;
  const assignment = assignments.find(row => row.date === today && row.envelope === envelopeId)!;
  const fund = funds.find(row => row.id === assignment.fund)!;
  const money = formatMoney(changeYen);
  const proof = `今回の封筒は${envelopeId}。${today}の台帳では${envelopeId} → ${fund.id}。\n${fund.id}の資金は「${fund.source}」。${fund.condition}\n${formatMoney(paidYen)} − ${formatMoney(purchaseYen)} = ${money}。必要だった処理は「${ACTIONS[correctChoice]}」。`;
  const bodies: Record<string, string> = {
    C01: `本日：${today}\n封筒番号：${envelopeId}\n買い出し用の現金：${formatMoney(paidYen)}`,
    C02: `${today}／封筒${envelopeId}\n購入合計：${formatMoney(purchaseYen)}\nお預かり：${formatMoney(paidYen)}\n釣銭：${money}`,
    C03: `出納台帳（記録抜粋）\n${assignments.map(row => `${row.date}／${row.envelope} → ${row.fund}`).join('\n')}`,
    C04: `よしなに購買コーナーの取扱い\n${funds.map(row => `${row.id}：${row.source}\n${row.condition}`).join('\n\n')}`,
    C05: '募金箱D01\n地域の本棚づくり基金\n寄付同意付き資金の残額を受け付けています。',
    C06: `${today}／封筒${envelopeId}\n会議用の飲み物・文具\n合計：${formatMoney(purchaseYen)}\n商品は引渡し済み。`,
    C07: `${oldNote.date}／封筒${oldNote.envelope}\nこの日の区分：${previousFund}\nこの日の精算は完了。\n記録者：購買コーナー担当`,
  };
  const success: Record<Choice, Ending> = {
    A: { title: '会社のお金は、経理へ。', subtitle: `仮払金の残額${money}、返却完了`, boss: `${envelopeId}の${money}、経理で受け付けたって。私のところへは返さなくて大丈夫！`, player: '買い出しも、仮払金の精算も完了です！', explanation: proof },
    B: { title: 'そのお釣りは、ありがとうの分。', subtitle: `買い出しへの謝礼${money}`, boss: `${envelopeId}は私からの依頼。約束どおり、残り${money}はお礼に受け取って！`, player: 'ありがとうございます。買い出し完了です！', explanation: proof },
    C: { title: 'そのお釣り、約束の行き先へ。', subtitle: `同意済みの寄付${money}、完了`, boss: `${envelopeId}の${money}、募金箱D01に入れてくれたんだね。みんなとの約束どおりだ！`, player: '買い出しも、残金の処理も完了です！', explanation: proof },
  };
  const wrongBoss: Record<Choice, Record<Choice, string>> = {
    A: { A: '', B: 'その残額は会社の仮払金だよ。経理へ返してね。', C: 'この仮払金には寄付の取扱いがないよ。経理へ返す分だったんだ。' },
    B: { A: '今回は私の私費だよ。残額は君への謝礼にする約束だったんだ。', B: '', C: '今回は君への謝礼だったんだ。募金に回す約束はしていなかったよ。' },
    C: { A: 'この資金は、残額を募金箱D01へ入れる合意になっているよ。', B: 'この残額は謝礼じゃなくて、みんなで同意していた寄付の分だよ。', C: '' },
  };
  const endings = Object.fromEntries(CHOICES.map(choice => [choice, choice === correctChoice ? success[choice] : {
    title: choice === 'A' ? '返した先は、この取扱い？' : choice === 'B' ? '受け取る前に、資金の確認を。' : 'その寄付は、同意のあるお金？',
    subtitle: `実行：${money}を${ACTIONS[choice]}`,
    boss: `${envelopeId}は${fund.id}。${money}の処理を確認して！ ${wrongBoss[correctChoice][choice]}`,
    player: '同じ「いいよ」でも、今回の資金と取扱いまで読むんだった……。',
    explanation: `${proof}\n実行したのは「${ACTIONS[choice]}」だった。`,
  }])) as Record<Choice, Ending>;
  const stage: StageDefinition = {
    ...STAGE03, start: { ...STAGE03.start },
    clues: STAGE03.clues.map(clue => ({ ...clue, body: bodies[clue.id] })), endings,
    choices: Object.fromEntries(CHOICES.map(choice => [choice, { ...STAGE03.choices[choice] }])) as StageDefinition['choices'],
    cinematicSeconds: { ...STAGE03.cinematicSeconds },
    copy: {
      ...STAGE03.copy, correctChoice, successLabel: '取扱いどおり',
      worldLocation: `よしなに購買コーナー / ${envelopeId}`,
      cinematicA: `残り${money}を、会社の経理窓口へ返却する。`,
      cinematicB: `残り${money}を、自分の財布にしまう。`,
      cinematicC: `残り${money}を、店の募金箱D01へ入れる。`,
    },
  };
  return {
    ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C01', 'C03', 'C04'], facts,
    moneyPlan: {
      changeYen, paidYen, purchaseYen, envelopeId,
      signage: {
        envelope: `${today}\n封筒 ${envelopeId}\n${formatMoney(paidYen)}`,
        receipt: `領収書／${envelopeId}\n合計 ${formatMoney(purchaseYen)}\n釣銭 ${money}`,
        ledger: '出納台帳\n日付・封筒・区分',
        rules: '購買コーナー\n精算ルール',
        donationBox: '募金箱 D01\n本棚づくり基金',
        order: `注文票／${envelopeId}\n${formatMoney(purchaseYen)}\n引渡し済み`,
        oldMemo: `保存記録\n${oldNote.date}\n封筒 ${oldNote.envelope}`,
      },
    },
  };
}

export function validateMoneyCase(instance: CaseInstance): string[] {
  const errors: string[] = [];
  if (instance.facts.kind !== 'money') return ['not a money case'];
  const facts = instance.facts;
  const plan = instance.moneyPlan;
  const bodyHas = (id: string, parts: string[]) => {
    const body = instance.clues.find(clue => clue.id === id)?.body ?? '';
    if (parts.some(part => !body.includes(part))) errors.push(`${id} text contradicts facts`);
  };
  if (solveMoneyFacts(facts) !== instance.correctChoice) errors.push('money facts do not produce the declared unique answer');
  if (instance.copy.correctChoice !== instance.correctChoice) errors.push('money copy answer differs from facts');
  const assignment = facts.assignments.find(row => row.date === facts.today && row.envelope === facts.envelopeId);
  const fund = facts.funds.find(row => row.id === assignment?.fund);
  if (!plan || plan.paidYen !== facts.paidYen || plan.purchaseYen !== facts.purchaseYen || plan.envelopeId !== facts.envelopeId || plan.changeYen !== facts.paidYen - facts.purchaseYen || plan.changeYen <= 0) errors.push('money plan amount or envelope differs from facts');
  if (facts.paidYen <= facts.purchaseYen || facts.purchaseYen <= 0 || !Number.isInteger(facts.paidYen) || !Number.isInteger(facts.purchaseYen)) errors.push('money amount invalid');
  const todayRows = facts.assignments.filter(row => row.date === facts.today);
  if (todayRows.length !== 3 || new Set(todayRows.map(row => row.envelope)).size !== 3 || new Set(todayRows.map(row => row.fund)).size !== 3) errors.push('money current ledger must contain three independent envelopes and funds');
  if (facts.funds.length !== 3 || new Set(facts.funds.map(row => row.id)).size !== 3 || new Set(facts.funds.map(row => row.requirement)).size !== 3) errors.push('money rules must contain each unique action once');
  for (const row of facts.assignments) {
    if (!facts.funds.some(entry => entry.id === row.fund)) errors.push('money ledger has an unknown fund');
    bodyHas('C03', [`${row.date}／${row.envelope} → ${row.fund}`]);
  }
  for (const row of facts.funds) {
    if (row.source !== SOURCES[row.requirement] || row.condition !== CONDITIONS[row.requirement]) errors.push('money fund condition differs from action');
    bodyHas('C04', [`${row.id}：${row.source}`, row.condition]);
  }
  const change = formatMoney(facts.paidYen - facts.purchaseYen);
  bodyHas('C01', [facts.today, facts.envelopeId, formatMoney(facts.paidYen)]);
  bodyHas('C02', [facts.today, facts.envelopeId, `購入合計：${formatMoney(facts.purchaseYen)}`, `お預かり：${formatMoney(facts.paidYen)}`, `釣銭：${change}`]);
  bodyHas('C05', ['募金箱D01', '地域の本棚づくり基金']);
  bodyHas('C06', [facts.today, facts.envelopeId, formatMoney(facts.purchaseYen)]);
  bodyHas('C07', [facts.oldNote.date, facts.oldNote.envelope]);
  if (facts.oldNote.date === facts.today) errors.push('money past memo must be a different date');
  if (fund) for (const choice of CHOICES) {
    const ending = instance.endings[choice];
    if (![facts.envelopeId, fund.id, fund.condition, change, ACTIONS[instance.correctChoice]].every(part => ending.explanation.includes(part))) errors.push(`money ending ${choice} proof contradicts facts`);
    if (!ending.boss.includes(facts.envelopeId) || !ending.boss.includes(change)) errors.push(`money ending ${choice} dialogue contradicts facts`);
  }
  return errors;
}
