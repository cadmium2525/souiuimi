import { STAGE04 } from './stage04.ts';
import type { AmountCaseFacts, CaseInstance, Choice, Ending, StageDefinition } from '../game/types.ts';

const ACTIVE: Choice[] = ['A', 'B'];
const ALL: Choice[] = ['A', 'B', 'C'];
/** A fixed language fact; a speaker's mistaken usage does not change the definition. */
export const WEAK_DEFINITION = '辞書上、金額につく「弱」は基準より少し少ない意味。「1万円弱」は1万円を少し下回る額を表す。';
const DICTIONARY_MEMO = '社内文書の校正メモ\n金額につく「弱」は、基準額より少し少ないこと。\n「強」は、基準額より少し多いこと。\n参照：小学館『デジタル大辞泉』';
const COUNTER = '催事立替金の受取窓口\n封筒は一通ずつ受け付けます。\n依頼番号を受付票に記入してください。\n金額を確認後、担当者へお渡しします。';

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
  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

function ids(random: Random, prefix: string): string[] {
  const result = new Set<string>();
  while (result.size < 3) result.add(`${prefix}${random.int(10, 99)}`);
  return [...result];
}

export function amountYen(value: number): string { return `${value.toLocaleString('ja-JP')}円`; }

function octoberDay(date: string): number {
  const match = /^10月([1-9]|[12]\d|3[01])日$/.exec(date);
  return match ? Number(match[1]) : NaN;
}

/** Resolve today's request to its speaker, then compare that speaker's two past usages. */
export function solveAmountFacts(facts: AmountCaseFacts): Choice | null {
  const todayDay = octoberDay(facts.today);
  if (!Number.isFinite(todayDay)) return null;
  if (!Number.isInteger(facts.baseYen) || !Number.isInteger(facts.lowerYen) || !Number.isInteger(facts.upperYen)
      || facts.lowerYen <= 0 || facts.lowerYen >= facts.baseYen || facts.upperYen <= facts.baseYen) return null;
  const requests = facts.requests.filter(row => row.date === facts.today && row.id === facts.requestId);
  if (requests.length !== 1) return null;
  const history = facts.history.filter(row => row.speaker === requests[0].speaker);
  if (history.length !== 2 || new Set(history.map(row => row.date)).size !== 2) return null;
  if (history.some(row => !Number.isFinite(octoberDay(row.date)) || octoberDay(row.date) >= todayDay || !Number.isInteger(row.baseYen) || !Number.isInteger(row.actualYen)
      || row.baseYen <= 0 || row.actualYen <= 0 || row.actualYen === row.baseYen)) return null;
  if (history.every(row => row.actualYen < row.baseYen)) return 'A';
  if (history.every(row => row.actualYen > row.baseYen)) return 'B';
  return null;
}

function proofFor(facts: AmountCaseFacts, answer: Choice): string {
  const speaker = facts.requests.find(row => row.date === facts.today && row.id === facts.requestId)!.speaker;
  const history = facts.history.filter(row => row.speaker === speaker);
  const past = history.map(row => `「${amountYen(row.baseYen)}弱」が${amountYen(row.actualYen)}`).join('、');
  const specific = answer === 'A'
    ? `どちらも基準額より少なく、辞書の意味どおりの使い方だった。今回の意図として予測できたのは1万円未満の${amountYen(facts.lowerYen)}。`
    : `どちらも基準額より多かった。この担当者は「弱」を取り違えて使っていたため、今回の意図として予測できたのは1万円を少し超える${amountYen(facts.upperYen)}。言葉本来の意味が変わったわけではない。`;
  return `${WEAK_DEFINITION}\n今回の依頼は${facts.today}の${facts.requestId}。担当表では${facts.requestId} → 担当${speaker}。\n${speaker}の過去の記録では${past}。${specific}`;
}

/** All relations and amounts are generated before the answer is inferred from past records. */
export function createAmountCase(inputSeed: number): CaseInstance {
  if (!Number.isFinite(inputSeed)) throw new RangeError('case seed must be finite');
  const seed = inputSeed >>> 0;
  const random = new Random(seed);
  const day = random.int(3, 28);
  const today = `10月${day}日`;
  const requestIds = ids(random, 'R');
  const speakers = ids(random, 'S');
  const usages = random.shuffle<Choice>(['A', 'B', random.pick(ACTIVE)]);
  const current = requestIds.map((id, index) => ({ date: today, id, speaker: speakers[index] }));
  const selected = random.pick(current);
  const previousSpeaker = random.pick(speakers.filter(speaker => speaker !== selected.speaker));
  const requests = random.shuffle([...current, { date: `10月${day - 1}日`, id: selected.id, speaker: previousSpeaker }]);
  const history = random.shuffle(speakers.flatMap((speaker, index) => {
    const bases = random.shuffle([3000, 5000, 8000, 15000, 20000]).slice(0, 2);
    return bases.map((baseYen, offset) => {
      const difference = random.int(1, Math.min(5, baseYen / 1000)) * 100;
      return { date: `10月${day - 2 + offset}日`, speaker, baseYen, actualYen: baseYen + (usages[index] === 'A' ? -difference : difference) };
    });
  }));
  const baseYen = 10000;
  const lowerYen = random.int(93, 99) * 100;
  const upperYen = random.int(101, 107) * 100;
  const facts: AmountCaseFacts = { kind: 'amount', today, requestId: selected.id, baseYen, lowerYen, upperYen, requiredYen: 0, requests, history };
  const correctChoice = solveAmountFacts(facts)!;
  facts.requiredYen = correctChoice === 'A' ? lowerYen : upperYen;
  const proof = proofFor(facts, correctChoice);
  const previous = requests.find(row => row.date !== today)!;
  const bodies: Record<string, string> = {
    C01: `本日：${today}\n依頼番号：${selected.id}\n用件：催事の立替金\n伝言「1万円弱を封筒に入れて持ってきて」`,
    C02: `催事立替金の担当記録\n${requests.map(row => `${row.date}／${row.id} → 担当${row.speaker}`).join('\n')}`,
    C03: `発言と支払実額の保存記録\n${history.map(row => `${row.date}／担当${row.speaker}\n発言「${amountYen(row.baseYen)}弱」／支払実額${amountYen(row.actualYen)}`).join('\n')}`,
    C04: `立替金用の封筒\n封筒A：${amountYen(lowerYen)}\n封筒B：${amountYen(upperYen)}\nどちらも未開封。依頼番号欄は空欄。`,
    C05: COUNTER,
    C06: `${previous.date}／${previous.id}\nこの日の担当：${previous.speaker}\n催事立替金の精算は完了。\n記録者：準備室受付`,
    C07: DICTIONARY_MEMO,
  };
  const required = amountYen(facts.requiredYen);
  const success: Record<'A' | 'B', Ending> = {
    A: { title: '言葉と、記録のとおりに。', subtitle: `${required}を届けた`, boss: `${selected.id}の${required}、ありがとう。1万円より少し少ない額でお願いしたつもりだったよ。`, player: '今回の担当と、これまでの記録を確認できました。', explanation: proof },
    B: { title: 'その言い方、そういうつもり！？', subtitle: `${required}を届けた`, boss: `${selected.id}の${required}、ありがとう。あ、ごめん、少し超えるつもりで「弱」と言ってたね。正しくは「強」だった。`, player: '記録から予測はできました。次は金額でお願いします！', explanation: proof },
  };
  const endings = Object.fromEntries(ALL.map(choice => {
    if (choice === correctChoice) return [choice, success[choice as 'A' | 'B']];
    if (choice === 'C') return [choice, { title: '封筒を選び直す。', subtitle: '今回の選択肢はA・Bの二つ', boss: `${selected.id}の封筒は、用意した二通から選んでね。`, player: '依頼を確認します。', explanation: proof }];
    const delivered = choice === 'A' ? lowerYen : upperYen;
    const boss = correctChoice === 'B'
      ? `${selected.id}は${required}のつもりだったんだ。ごめん、「弱」の使い方を取り違えていたね。君の日本語の解釈は合っているよ。`
      : `${selected.id}は${required}のつもりだったんだ。「弱」は少し少ない意味で使っていたよ。余った分は戻しておくね。`;
    return [choice, {
      title: choice === 'A' ? '言葉どおり。でも、用意は足りず。' : '少し多め。でも、今回は未満。',
      subtitle: `${amountYen(delivered)}を届けた`, boss,
      player: choice === 'A' ? '次は金額そのものを確認させてください。' : '言葉と、この担当者の記録を合わせて読むんでした。',
      explanation: `${proof}\n選んだ${amountYen(delivered)}は、今回担当者が想定していた${required}より${amountYen(Math.abs(delivered - facts.requiredYen))}${delivered < facts.requiredYen ? '少なかった' : '多かった'}。`,
    }];
  })) as Record<Choice, Ending>;
  const choices = {
    A: { label: `1万円未満（${amountYen(lowerYen)}）`, description: `${amountYen(lowerYen)}の封筒を届ける。` },
    B: { label: `1万円を少し超える（${amountYen(upperYen)}）`, description: `${amountYen(upperYen)}の封筒を届ける。` },
    C: { label: '', description: '' },
  };
  const stage: StageDefinition = {
    ...STAGE04, start: { ...STAGE04.start }, choiceIds: [...ACTIVE], choices,
    clues: STAGE04.clues.map(clue => ({ ...clue, body: bodies[clue.id] })), endings,
    cinematicSeconds: { ...STAGE04.cinematicSeconds },
    copy: {
      ...STAGE04.copy, correctChoice, successLabel: '今回の意図を予測',
      introBoss: `催事の立替金、1万円弱を封筒に入れて持ってきて。依頼番号${selected.id}でお願い。`,
      worldLocation: `よしなに催事準備室 / ${selected.id}`,
      choiceA: choices.A.label, choiceB: choices.B.label,
      cinematicA: `${amountYen(lowerYen)}の封筒に依頼番号${selected.id}を記入し、受取窓口へ届ける。`,
      cinematicB: `${amountYen(upperYen)}の封筒に依頼番号${selected.id}を記入し、受取窓口へ届ける。`,
    },
  };
  return {
    ...stage, caseSeed: seed, correctChoice, evidenceChain: ['C01', 'C02', 'C03'], facts,
    amountPlan: {
      baseYen, lowerYen, upperYen, requiredYen: facts.requiredYen, requestId: selected.id,
      signage: {
        request: `${today}\n依頼 ${selected.id}\n催事の立替金`,
        assignments: '当日の担当表\n日付・依頼・担当',
        history: '発言と支払実額\n保存記録',
        envelopes: `A ${amountYen(lowerYen)}\nB ${amountYen(upperYen)}`,
        counter: '催事立替金\n受取窓口',
        oldMemo: `${previous.date}\n依頼 ${previous.id}\n担当 ${previous.speaker}`,
        dictionary: '校正メモ\n弱・強',
      },
    },
  };
}

/** Check rendered records as well as the inferred result; never repair a malformed instance. */
export function validateAmountCase(instance: CaseInstance): string[] {
  if (instance.facts.kind !== 'amount') return ['not an amount case'];
  const errors: string[] = [];
  const facts = instance.facts;
  const plan = instance.amountPlan;
  const bodyHas = (id: string, parts: string[]) => {
    const body = instance.clues.find(clue => clue.id === id)?.body ?? '';
    if (parts.some(part => !body.includes(part))) errors.push(`${id} text contradicts amount facts`);
  };
  const solved = solveAmountFacts(facts);
  if (!solved || solved !== instance.correctChoice) errors.push('amount facts do not produce the declared unique answer');
  if (instance.id !== 'stage04' || instance.copy.correctChoice !== instance.correctChoice) errors.push('amount identity or copy answer differs');
  if (instance.seconds !== 120 || instance.cinematicSeconds.A !== 10 || instance.cinematicSeconds.B !== 10 || instance.clues.length !== 7) errors.push('amount duration or clue count differs');
  if (instance.copy.introThought !== '' || !instance.copy.introBoss.includes(facts.requestId)) errors.push('amount introduction differs from request');
  if (instance.choiceIds?.join('') !== 'AB') errors.push('amount case requires exactly A and B');
  if (!ACTIVE.includes(instance.correctChoice)) errors.push('amount answer must be A or B');
  if (facts.baseYen !== 10000 || facts.lowerYen < 9300 || facts.lowerYen > 9900 || facts.upperYen < 10100 || facts.upperYen > 10700) errors.push('amount candidate range invalid');
  if (!plan || plan.baseYen !== facts.baseYen || plan.lowerYen !== facts.lowerYen || plan.upperYen !== facts.upperYen || plan.requiredYen !== facts.requiredYen || plan.requestId !== facts.requestId) errors.push('amount plan differs from facts');
  if (solved && facts.requiredYen !== (solved === 'A' ? facts.lowerYen : facts.upperYen)) errors.push('amount required amount contradicts inferred usage');
  const current = facts.requests.filter(row => row.date === facts.today);
  const speakers = new Set(current.map(row => row.speaker));
  if (current.length !== 3 || new Set(current.map(row => row.id)).size !== 3 || speakers.size !== 3) errors.push('amount requests need three distinct current relations');
  if (facts.requests.length !== 4 || facts.history.length !== 6 || facts.history.some(row => !speakers.has(row.speaker))) errors.push('amount history or old request count invalid');
  const usages = current.map(row => solveAmountFacts({ ...facts, requestId: row.id }));
  if (usages.includes(null) || !usages.includes('A') || !usages.includes('B')) errors.push('amount history must show both usages with two consistent records per speaker');
  const previous = facts.requests.filter(row => row.date !== facts.today);
  const target = current.find(row => row.id === facts.requestId);
  if (previous.length !== 1 || previous[0].id !== facts.requestId || previous[0].speaker === target?.speaker || !speakers.has(previous[0].speaker)
      || !Number.isFinite(octoberDay(previous[0].date)) || octoberDay(previous[0].date) >= octoberDay(facts.today)) errors.push('amount historical memo must refer to a different past assignment');
  if (plan && (!plan.signage.request?.includes(facts.requestId) || !plan.signage.envelopes?.includes(amountYen(facts.lowerYen)) || !plan.signage.envelopes?.includes(amountYen(facts.upperYen)))) errors.push('amount signage differs from facts');
  bodyHas('C01', [facts.today, facts.requestId, '1万円弱']);
  for (const row of facts.requests) bodyHas('C02', [`${row.date}／${row.id} → 担当${row.speaker}`]);
  for (const row of facts.history) bodyHas('C03', [`${row.date}／担当${row.speaker}\n発言「${amountYen(row.baseYen)}弱」／支払実額${amountYen(row.actualYen)}`]);
  bodyHas('C04', [`封筒A：${amountYen(facts.lowerYen)}`, `封筒B：${amountYen(facts.upperYen)}`, '依頼番号欄は空欄']);
  bodyHas('C05', [COUNTER]);
  if (previous.length === 1) bodyHas('C06', [previous[0].date, previous[0].id, previous[0].speaker]);
  bodyHas('C07', [DICTIONARY_MEMO]);
  if (solved && target) {
    const proof = proofFor(facts, solved);
    for (const choice of ALL) {
      if (!instance.endings[choice].explanation.startsWith(proof)) errors.push(`amount ending ${choice} proof contradicts records or dictionary`);
      if (choice !== 'C' && (!instance.endings[choice].boss.includes(facts.requestId) || !instance.endings[choice].boss.includes(amountYen(facts.requiredYen)))) errors.push(`amount ending ${choice} dialogue contradicts facts`);
    }
    if (solved === 'B' && (!instance.endings.B.boss.includes('少し超えるつもりで「弱」と言ってた') || !instance.endings.A.boss.includes('君の日本語の解釈は合っている'))) errors.push('amount mistaken usage must be acknowledged by its speaker');
  }
  for (const choice of ACTIVE) {
    const amount = amountYen(choice === 'A' ? facts.lowerYen : facts.upperYen);
    if (!instance.choices[choice].label.includes(amount) || !instance.copy[`cinematic${choice}`].includes(amount) || !instance.copy[`cinematic${choice}`].includes(facts.requestId)) errors.push(`amount choice ${choice} amount differs from facts`);
  }
  if (instance.clues.some(clue => Object.hasOwn(clue, 'thought') || /正解|予感|思う|必要そう/.test(clue.body))) errors.push('amount clues must contain observations only');
  return errors;
}
