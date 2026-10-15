import { STAGE04 } from './stage04.ts';
import type { AmountCaseFacts, CaseInstance, Choice, Ending, StageDefinition } from '../game/types.ts';

const ACTIVE: Choice[] = ['A', 'B'];
const ALL: Choice[] = ['A', 'B', 'C'];
/** A speaker's mistaken usage does not change the definition. */
export const WEAK_DEFINITION = '「1万円弱」は本来、1万円より少し少ない額。';
const DICTIONARY_MEMO = '社内文書の校正メモ\n金額につく「弱」は、基準額より少し少ないこと。\n「強」は、基準額より少し多いこと。\n参照：小学館『デジタル大辞泉』';
const COUNTER = '催事立替金の受取窓口\n封筒に用途を書いてお持ちください。\n金額を確認して、準備した品をお渡しします。\n余った現金はその場でお返しします。';
const PURPOSES = ['備品代', '会場代', '印刷代', '装飾代', '案内板代', '展示台代'] as const;
const PAST_OCCASIONS = ['春の展示会', '先月の説明会', '先週の商談会', '前回の交流会', '夏の見学会', '先日の発表会'] as const;
const PAST_TERMS = ['weak', 'strong'] as const;

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
  pick<T>(items: readonly T[]): T { return items[this.int(0, items.length - 1)]; }
}

export function amountYen(value: number): string { return `${value.toLocaleString('ja-JP')}円`; }

/** Combine one past request with its separate, approved payment record. */
export function solveAmountFacts(facts: AmountCaseFacts): Choice | null {
  if (!/^10月([1-9]|[12]\d|3[01])日$/.test(facts.today) || !facts.purpose || facts.speakerName !== '部長') return null;
  if (!Number.isInteger(facts.baseYen) || !Number.isInteger(facts.lowerYen) || !Number.isInteger(facts.upperYen)
      || facts.lowerYen <= 0 || facts.lowerYen >= facts.baseYen || facts.upperYen <= facts.baseYen) return null;
  if (facts.history.length !== 1) return null;
  if (facts.history.some(row => !row.occasion || !Number.isInteger(row.baseYen) || !Number.isInteger(row.actualYen)
      || row.baseYen <= 0 || row.actualYen <= 0 || row.actualYen === row.baseYen || !PAST_TERMS.includes(row.term))) return null;
  const previous = facts.history[0];
  const usedAsDefined = (previous.term === 'weak') === (previous.actualYen < previous.baseYen);
  return usedAsDefined ? 'A' : 'B';
}

function clueBodies(facts: AmountCaseFacts): Record<string, string> {
  const previous = facts.history[0];
  return {
    C01: `${facts.today}・${facts.speakerName}からの伝言\n「今日の${facts.purpose}、1万円弱を封筒に入れて持ってきて」`,
    C02: `${previous.occasion}のチャット\n${facts.speakerName}「${amountYen(previous.baseYen)}${previous.term === 'weak' ? '弱' : '強'}を持ってきて」`,
    C03: `${previous.occasion}・立替金の受取控え\n受取額：${amountYen(previous.actualYen)}\n確認欄：${facts.speakerName}「この金額でお願いします」\n受渡済み。`,
    C04: `立替金用の封筒\n封筒A：${amountYen(facts.lowerYen)}\n封筒B：${amountYen(facts.upperYen)}\nどちらも未開封。用途の欄は空欄。`,
    C05: COUNTER,
    C06: `経理からの連絡\n「${facts.speakerName}からは『1万円弱』と聞いています。\n現金は二通り用意しました。使わなかった封筒は、そのまま戻してください」`,
    C07: DICTIONARY_MEMO,
  };
}

function proofFor(facts: AmountCaseFacts, answer: Choice): string {
  const reading = answer === 'A'
    ? `依頼と受取額もその意味に合い、今回は${amountYen(facts.lowerYen)}のつもりだった。`
    : `依頼と受取額では「弱・強」が逆で、今回は${amountYen(facts.upperYen)}のつもりだった。`;
  return `${WEAK_DEFINITION}${reading}`;
}

export function createAmountCase(inputSeed: number): CaseInstance {
  if (!Number.isFinite(inputSeed)) throw new RangeError('case seed must be finite');
  const seed = inputSeed >>> 0;
  const random = new Random(seed);
  const today = `10月${random.int(3, 28)}日`;
  const purpose = random.pick(PURPOSES);
  const usage = random.pick(ACTIVE);
  const occasion = random.pick(PAST_OCCASIONS);
  const pastBaseYen = random.pick([3000, 5000, 8000]);
  const difference = random.pick([100, 200]);
  const term = random.pick(PAST_TERMS);
  // Either side of a past amount can mean either current answer: the request's
  // word and the separate receipt must be read together, including at bank edges.
  const actualIsLower = (term === 'weak') === (usage === 'A');
  const history = [{ occasion, baseYen: pastBaseYen, actualYen: pastBaseYen + (actualIsLower ? -difference : difference), term }];
  const baseYen = 10000, lowerYen = random.int(93, 99) * 100, upperYen = random.int(101, 107) * 100;
  const facts: AmountCaseFacts = { kind: 'amount', today, purpose, speakerName: '部長', baseYen, lowerYen, upperYen, requiredYen: 0, history };
  const correctChoice = solveAmountFacts(facts)!;
  facts.requiredYen = correctChoice === 'A' ? lowerYen : upperYen;
  const proof = proofFor(facts, correctChoice), required = amountYen(facts.requiredYen);
  const success: Record<'A' | 'B', Ending> = {
    A: { title: '言葉と、記録のとおりに。', subtitle: `${required}を届けた`, boss: `${purpose}の${required}、ありがとう。1万円より少し少ない額でお願いしたつもりだったよ。`, player: '前の依頼と受取控えが参考になりました。', explanation: proof },
    B: { title: 'その言い方、そういうつもり！？', subtitle: `${required}を届けた`, boss: `${purpose}の${required}、ありがとう。あ、ごめん、少し超えるつもりで「弱」と言ってたね。正しくは「強」だった。`, player: '前のやりとりで予測はできました。次は金額でお願いします！', explanation: proof },
  };
  const endings = Object.fromEntries(ALL.map(choice => {
    if (choice === correctChoice) return [choice, success[choice as 'A' | 'B']];
    if (choice === 'C') return [choice, { title: '封筒を選び直す。', subtitle: '今回の選択肢はA・Bの二つ', boss: `${purpose}のお金は、用意した二通から選んでね。`, player: '頼まれたことを確認します。', explanation: proof }];
    const delivered = choice === 'A' ? lowerYen : upperYen;
    const boss = correctChoice === 'B'
      ? `${purpose}は${required}のつもりだったんだ。ごめん、「弱」の使い方を取り違えていたね。君の日本語の解釈は合っているよ。`
      : `${purpose}は${required}のつもりだったんだ。「弱」は少し少ない意味で使っていたよ。余った分は戻しておくね。`;
    return [choice, {
      title: choice === 'A' ? '言葉どおり。でも、用意は足りず。' : '少し多め。でも、今回は未満。',
      subtitle: `${amountYen(delivered)}を届けた`, boss,
      player: choice === 'A' ? '次は金額そのものを確認させてください。' : '前の依頼と受取控えを、もう一度見直します。',
      explanation: proof,
    }];
  })) as Record<Choice, Ending>;
  const choices = {
    A: { label: `1万円未満（${amountYen(lowerYen)}）`, description: `${amountYen(lowerYen)}の封筒を届ける。` },
    B: { label: `1万円を少し超える（${amountYen(upperYen)}）`, description: `${amountYen(upperYen)}の封筒を届ける。` },
    C: { label: '', description: '' },
  };
  const bodies = clueBodies(facts);
  const stage: StageDefinition = {
    ...STAGE04, start: { ...STAGE04.start }, choiceIds: [...ACTIVE], choices,
    clues: STAGE04.clues.map(clue => ({ ...clue, body: bodies[clue.id], title: clue.id === 'C02' ? `${occasion}のチャット` : clue.title })), endings,
    cinematicSeconds: { ...STAGE04.cinematicSeconds },
    copy: {
      ...STAGE04.copy, correctChoice, successLabel: '今回の意図を予測',
      introBoss: `今日の${purpose}、1万円弱を封筒に入れて持ってきて。`,
      worldLocation: 'よしなに催事準備室', choiceA: choices.A.label, choiceB: choices.B.label,
      cinematicA: `${amountYen(lowerYen)}の封筒に「${purpose}」と書き、受取窓口へ届ける。`,
      cinematicB: `${amountYen(upperYen)}の封筒に「${purpose}」と書き、受取窓口へ届ける。`,
    },
  };
  return {
    ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C02', 'C03'], facts,
    amountPlan: {
      baseYen, lowerYen, upperYen, requiredYen: facts.requiredYen, requestId: purpose,
      signage: {
        request: `${today}\n${purpose}\n部長の伝言`,
        assignments: `${history[0].occasion}\n部長とのチャット`,
        history: `${occasion}\n立替金の受取控え`,
        envelopes: `A ${amountYen(lowerYen)}\nB ${amountYen(upperYen)}`,
        counter: '催事立替金\n受取窓口', oldMemo: '経理から\n封筒のご案内', dictionary: '校正メモ\n弱・強',
      },
    },
  };
}

/** Check what the player reads as well as the speaker's inferred usage. */
export function validateAmountCase(instance: CaseInstance): string[] {
  if (instance.facts.kind !== 'amount') return ['not an amount case'];
  const errors: string[] = [], facts = instance.facts, plan = instance.amountPlan;
  const solved = solveAmountFacts(facts);
  if (!solved || solved !== instance.correctChoice) errors.push('amount facts do not produce the declared unique answer');
  if (instance.id !== 'stage04' || instance.copy.correctChoice !== instance.correctChoice) errors.push('amount identity or copy answer differs');
  if (instance.seconds !== 120 || instance.cinematicSeconds.A !== 10 || instance.cinematicSeconds.B !== 10 || instance.clues.length !== 7) errors.push('amount duration or clue count differs');
  if (instance.copy.introThought !== '' || !instance.copy.introBoss.includes(facts.purpose)) errors.push('amount introduction differs from request');
  if (instance.choiceIds?.join('') !== 'AB') errors.push('amount case requires exactly A and B');
  if (!ACTIVE.includes(instance.correctChoice)) errors.push('amount answer must be A or B');
  if (facts.baseYen !== 10000 || facts.lowerYen < 9300 || facts.lowerYen > 9900 || facts.upperYen < 10100 || facts.upperYen > 10700) errors.push('amount candidate range invalid');
  if (!plan || plan.baseYen !== facts.baseYen || plan.lowerYen !== facts.lowerYen || plan.upperYen !== facts.upperYen || plan.requiredYen !== facts.requiredYen || plan.requestId !== facts.purpose) errors.push('amount plan differs from facts');
  if (solved && facts.requiredYen !== (solved === 'A' ? facts.lowerYen : facts.upperYen)) errors.push('amount required amount contradicts inferred usage');
  if (facts.history.length === 1) {
    const bodies = clueBodies(facts);
    for (const clue of instance.clues) if (clue.body !== bodies[clue.id]) errors.push(`${clue.id} text contradicts amount facts`);
    if (instance.clues.find(clue => clue.id === 'C02')?.title !== `${facts.history[0].occasion}のチャット`
        || instance.clues.find(clue => clue.id === 'C03')?.title !== '立替金の受取控え') errors.push('amount evidence roles differ');
  }
  if (plan && (!plan.signage.request?.includes(facts.purpose) || !plan.signage.envelopes?.includes(amountYen(facts.lowerYen)) || !plan.signage.envelopes?.includes(amountYen(facts.upperYen)))) errors.push('amount signage differs from facts');
  if (solved) {
    const proof = proofFor(facts, solved);
    for (const choice of ALL) {
      if (instance.endings[choice].explanation !== proof || proof.length > 120) errors.push(`amount ending ${choice} proof contradicts records or dictionary`);
      if (choice !== 'C' && (!instance.endings[choice].boss.includes(facts.purpose) || !instance.endings[choice].boss.includes(amountYen(facts.requiredYen)))) errors.push(`amount ending ${choice} dialogue contradicts facts`);
    }
    if (solved === 'B' && (!instance.endings.B.boss.includes('少し超えるつもりで「弱」と言ってた') || !instance.endings.A.boss.includes('君の日本語の解釈は合っている'))) errors.push('amount mistaken usage must be acknowledged by its speaker');
  }
  for (const choice of ACTIVE) {
    const amount = amountYen(choice === 'A' ? facts.lowerYen : facts.upperYen);
    if (!instance.choices[choice].label.includes(amount) || !instance.copy[`cinematic${choice}`].includes(amount) || !instance.copy[`cinematic${choice}`].includes(facts.purpose)) errors.push(`amount choice ${choice} amount differs from facts`);
  }
  const text = [instance.copy.introBoss, ...instance.clues.map(c => `${c.title}\n${c.body}`), ...Object.values(plan?.signage ?? {}), ...ALL.flatMap(c => Object.values(instance.endings[c]))].join('\n');
  if (/\b[A-Z]{1,3}\d{2,}\b|依頼番号|担当表|担当者|担当記録/.test(text)) errors.push('amount text must not require administrative code lookup');
  if (instance.clues.some(clue => Object.hasOwn(clue, 'thought') || /正解|予感|思う|必要そう/.test(clue.body))) errors.push('amount clues must contain observations only');
  return errors;
}
