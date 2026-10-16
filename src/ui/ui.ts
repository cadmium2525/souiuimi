import { getStage, STAGE_LIST } from '../data/stages';
import type { Choice, Clue, Phase, Snapshot, StageDefinition, UIAction } from '../game/types';

const icons = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/></svg>',
  inspect: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>',
  pause: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  office: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 28V8l11-4 11 4v20H5ZM11 11h2m6 0h2m-10 6h2m6 0h2m-7 11v-6h4v6"/></svg>',
};

const escape = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const clock = (seconds: number): string => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
const button = (action: UIAction, label: string, className = 'button', extra = ''): string => `<button type="button" class="${className}" data-action="${action}" ${extra}>${label}</button>`;
const pause = '<span class="pause-badge">' + icons.pause + 'タイマー停止中</span>';
const number = (clue: Clue): string => clue.id.replace('C', '').padStart(2, '0');
const bossImage = `${import.meta.env.BASE_URL}characters/boss.png`;

export class GameUI {
  private stage: StageDefinition = getStage('stage01');
  private phase: Phase | null = null;
  private signature = '';
  private error: HTMLElement | null = null;
  private touchButtons = new Map<number, { button: HTMLButtonElement; x: number; y: number; moved: boolean }>();
  private suppressedTouch: { until: number; x: number; y: number } | null = null;
  private lastPointerType = '';

  constructor(private root: HTMLElement, private onAction: (action: UIAction, detail?: string) => void, private getCurrentStage?: () => StageDefinition) {
    const actionButton = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLButtonElement>('button[data-action]') : null;
    root.addEventListener('pointerdown', (event) => {
      this.lastPointerType = event.pointerType;
      if (event.pointerType !== 'touch') { this.suppressedTouch = null; return; }
      const target = actionButton(event.target);
      if (!target || !root.contains(target) || target.disabled) return;
      this.touchButtons.set(event.pointerId, { button: target, x: event.clientX, y: event.clientY, moved: false });
    });
    root.addEventListener('pointermove', (event) => {
      const touch = this.touchButtons.get(event.pointerId);
      if (touch && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 12) touch.moved = true;
    });
    root.addEventListener('pointerup', (event) => {
      const touch = this.touchButtons.get(event.pointerId);
      if (!touch) return;
      this.touchButtons.delete(event.pointerId);
      // Secondary fingers do not consistently synthesize clicks. Activate each
      // valid touch release, then ignore its browser compatibility click.
      this.suppressedTouch = { until: performance.now() + 900, x: event.clientX, y: event.clientY };
      const releasedOn = actionButton(document.elementFromPoint(event.clientX, event.clientY));
      if (touch.moved || Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 12 || releasedOn !== touch.button || !root.contains(touch.button) || touch.button.disabled || touch.button.hidden) return;
      event.preventDefault();
      this.onAction(touch.button.dataset.action as UIAction, touch.button.dataset.detail);
    });
    root.addEventListener('pointercancel', (event) => {
      const touch = this.touchButtons.get(event.pointerId);
      if (touch) this.suppressedTouch = { until: performance.now() + 900, x: touch.x, y: touch.y };
      this.touchButtons.delete(event.pointerId);
    });
    window.addEventListener('blur', () => this.touchButtons.clear());
    root.addEventListener('click', (event) => {
      const target = actionButton(event.target);
      if (!target || !root.contains(target) || target.disabled) return;
      const touchClick = event as MouseEvent & { pointerType?: string; sourceCapabilities?: { firesTouchEvents?: boolean } | null };
      const fromTouch = touchClick.pointerType === 'touch' || touchClick.sourceCapabilities?.firesTouchEvents === true;
      const recentTouch = this.suppressedTouch && performance.now() < this.suppressedTouch.until;
      const compatibilityClick = event.detail > 0 && this.lastPointerType === 'touch' && this.suppressedTouch && Math.hypot(event.clientX - this.suppressedTouch.x, event.clientY - this.suppressedTouch.y) < 32;
      // A scene rebuild can delay the compatibility click beyond the timeout.
      // Touch releases are already handled above, even when the DOM changes.
      if (fromTouch || (recentTouch && compatibilityClick)) { event.preventDefault(); event.stopPropagation(); return; }
      this.onAction(target.dataset.action as UIAction, target.dataset.detail);
    });
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || this.phase === 'EXPLORE' || this.phase === 'CINEMATIC') return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]):not([hidden]), summary, a[href]')).filter((el) => el.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  render(snapshot: Snapshot): void {
    this.stage = this.getCurrentStage?.() ?? getStage(snapshot.stageId);
    if (this.error) { this.error.remove(); this.error = null; }
    const signature = [snapshot.mode, snapshot.stageId, snapshot.caseSeed ?? 'fixture', snapshot.phase, snapshot.music, snapshot.run?.current, snapshot.run?.completed.length, ...(snapshot.phase === 'EXPLORE' ? [] : [snapshot.inspected, snapshot.choice, snapshot.sound, snapshot.lowQuality, snapshot.found.join(','), snapshot.timedOut])].join('|');
    if (this.signature === signature) { this.updateHUD(snapshot); return; }
    const changedPhase = this.phase !== snapshot.phase;
    this.touchButtons.clear();
    const active = document.activeElement instanceof HTMLButtonElement && this.root.contains(document.activeElement) ? { action: document.activeElement.dataset.action, detail: document.activeElement.dataset.detail } : undefined;
    this.phase = snapshot.phase;
    this.signature = signature;
    this.root.dataset.phase = snapshot.phase.toLowerCase();
    this.root.dataset.stage = snapshot.stageId;
    switch (snapshot.phase) {
      case 'TITLE': this.root.innerHTML = this.title(snapshot); break;
      case 'INTRO': this.root.innerHTML = this.intro(snapshot); break;
      case 'EXPLORE': this.root.innerHTML = this.explore(snapshot); break;
      case 'INSPECT': this.root.innerHTML = this.inspect(snapshot); break;
      case 'MENU': this.root.innerHTML = this.menu(snapshot); break;
      case 'JOURNAL': this.root.innerHTML = this.journal(snapshot); break;
      case 'DECISION': this.root.innerHTML = this.decision(snapshot); break;
      case 'CINEMATIC': this.root.innerHTML = this.cinematic(snapshot); break;
      case 'ENDING': this.root.innerHTML = this.ending(snapshot); break;
      case 'RESULTS': this.root.innerHTML = this.results(snapshot); break;
    }
    this.updateHUD(snapshot);
    if (snapshot.phase === 'TITLE') {
      const picker = this.root.querySelector<HTMLElement>('.stage-picker');
      const selected = picker?.querySelector<HTMLElement>('.is-selected');
      if (picker && selected && picker.scrollWidth > picker.clientWidth) {
        const offset = selected.getBoundingClientRect().left - picker.getBoundingClientRect().left + picker.scrollLeft;
        picker.scrollLeft = Math.max(0, offset - (picker.clientWidth - selected.clientWidth) / 2);
      }
      if (picker && selected && picker.scrollHeight > picker.clientHeight) {
        const offset = selected.getBoundingClientRect().top - picker.getBoundingClientRect().top + picker.scrollTop;
        picker.scrollTop = Math.max(0, offset - (picker.clientHeight - selected.clientHeight) / 2);
      }
    }
    if (changedPhase && snapshot.phase !== 'EXPLORE' && snapshot.phase !== 'CINEMATIC') {
      const heading = this.root.querySelector<HTMLElement>('[data-focus]');
      heading?.focus({ preventScroll: true });
    } else if (active) {
      this.root.querySelector<HTMLButtonElement>(`button[data-action="${active.action}"]${active.detail ? `[data-detail="${active.detail}"]` : ''}`)?.focus({ preventScroll: true });
    }
  }

  updateHUD(snapshot: Snapshot): void {
    const stage = this.getCurrentStage?.() ?? this.stage;
    const timer = this.root.querySelector<HTMLElement>('#timer-value');
    if (timer) { timer.textContent = clock(snapshot.remaining); timer.parentElement?.classList.toggle('timer-urgent', snapshot.remaining <= 60); }
    const count = this.root.querySelector<HTMLElement>('#clue-count');
    if (count) count.textContent = `${snapshot.found.length}/${stage.clues.length}`;
    const progress = this.root.querySelector<HTMLElement>('[data-run-progress]');
    if (progress && snapshot.run) progress.textContent = `依頼 ${snapshot.run.current}/${snapshot.run.total}`;
    const inspect = this.root.querySelector<HTMLButtonElement>('#inspect-button');
    if (inspect) { inspect.hidden = !snapshot.nearest; inspect.disabled = !snapshot.nearest; }
    const context = this.root.querySelector<HTMLElement>('#context-name');
    if (context) {
      const clue = stage.clues.find((item) => item.id === snapshot.nearest);
      context.textContent = clue ? (snapshot.found.includes(clue.id) ? `記録済み · ${clue.title}` : '近くのものを調べる') : '';
      context.hidden = !clue;
    }
  }

  showError(message: string): void {
    const panel = document.createElement('section');
    panel.className = 'error-panel';
    panel.setAttribute('role', 'alert');
    const title = document.createElement('h2');
    title.textContent = this.stage.copy.fallbackHeading;
    const body = document.createElement('p');
    body.textContent = message;
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'button button-primary'; retry.textContent = 'ページを読み直す';
    retry.addEventListener('click', () => location.reload());
    panel.append(title, body, retry);
    this.error?.remove(); this.error = panel; this.root.append(panel);
  }

  private title(snapshot: Snapshot): string {
    const stage = this.stage;
    const single = snapshot.mode === 'single';
    const picker = `<nav class="stage-picker" aria-label="遊ぶ業務を選ぶ">${STAGE_LIST.map((item) => button('stage', `<span>CASE ${item.number}</span><strong>${escape(item.title)}</strong>`, `stage-pick ${snapshot.stageId === item.id ? 'is-selected' : ''}`, `data-detail="${item.id}" aria-pressed="${snapshot.stageId === item.id}"`)).join('')}</nav>${STAGE_LIST.length > 4 ? '<p class="stage-picker-hint">スクロールで、ほかの業務へ ↕</p>' : ''}<div class="stage-preview"><span class="stage-number">${stage.number}</span><div><span class="eyebrow">本日の業務</span><h2>「${escape(stage.title)}」</h2></div><span class="duration">約${Math.ceil(stage.seconds / 60)}分</span></div>`;
    return `<main class="title-screen${single ? `${STAGE_LIST.length > 3 ? ' has-many-cases' : ''}${STAGE_LIST.length > 4 ? ' has-case-overflow' : ''}` : ' title-run'}">
      <div class="title-paper"></div>
      <header class="title-header"><div class="company-mark">${icons.office}<span>株式会社<br><strong>よしなに</strong></span></div><span class="edition-label">曖昧指示、解読係。<br>OFFICE COMEDY / ${STAGE_LIST.length} CASES</span></header>
      <section class="title-copy"><p class="eyebrow"><span class="tiny-dot"></span> ${single ? `${Math.ceil(stage.seconds / 60)}分で遊べる、3D探索コメディ` : '日常のひと言を解く、3D探索コメディ'}</p>
        <h1 class="game-title" tabindex="-1" data-focus><span>そういう</span><span>意味じゃない<span class="title-exclamation">！</span></span></h1>
        <div class="title-sticker"><span>上司のひと言、</span><strong>どういう意味？</strong><span class="sticker-star">✳</span></div>
        <p class="title-description">${single ? this.copy('titleTagline', 'その解釈、絶対おかしい。\n……え、正解なの！？') : 'ことばは、同じ。意図は、いろいろ。<br>手がかりを集めて、上司の真意を見抜こう。'}</p>
      </section>
      <section class="title-start">${single ? picker : `<div class="run-invitation"><span class="run-invitation-number">${STAGE_LIST.length}</span><div><p class="eyebrow">本日の業務</p><h2>${STAGE_LIST.length}つの依頼を、<br>ランダムな順番で。</h2></div><span class="run-invitation-note">各ケース<br>探索2分</span></div>`}
        ${button('start', `<span>${single ? '出勤する' : 'ゲームスタート'}</span>` + icons.arrow, 'button button-primary start-button')}
        ${single ? `<p class="title-footnote">同じ舞台でも、依頼は毎回変わる<span>効果音 ${snapshot.sound ? 'ON' : 'OFF'} でスタート</span></p>` : '<p class="title-footnote run-footnote">5つ終えたら、今日のすれ違いを振り返ろう。</p>'}
        <div class="title-music"><span>BGM</span>${this.musicToggle(snapshot)}<a class="music-credit" href="${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.md#music" target="_blank" rel="noopener">BGMクレジット ↗</a></div>
        <div class="title-world-label"><span>${single ? this.copy('worldLabel', 'いつものオフィス。\nいつもの、無茶ぶり。') : '今日も、ひと言に\nふりまわされる。'}</span><span class="hand-arrow">↘</span></div>
      </section>
      <div class="world-tag"><span class="tiny-dot"></span> ${this.copy('worldLocation', '株式会社よしなに')} <span class="world-tag-time">${this.copy('worldClock', '14:55')}</span></div>
      <div class="title-index">THINK. EXPLORE. MISUNDERSTAND.</div>
      <div class="orientation-note">縦持ちで遊ぶと、ちょうどいい。</div>
    </main>`;
  }

  private intro(snapshot: Snapshot): string {
    return this.modal(`<div class="modal-kicker"><span>${this.runProgress(snapshot)}本日の業務 / ${this.stage.number}</span><span class="small-clock">${clock(this.stage.seconds)}</span></div>
      <h1 class="modal-title" tabindex="-1" data-focus>指示が、<br>届きました。</h1>
      <div class="intro-conversation"><div class="boss-portrait-frame"><img class="boss-portrait" src="${bossImage}" alt="上司のイラスト"/><span>株式会社よしなに / 部長</span></div><div class="boss-dialogue"><div class="message-head"><div><strong>上司</strong><span>たった今</span></div><span class="message-status">指示</span></div><blockquote class="boss-message">${this.copy('introBoss', '')}</blockquote></div></div>
      <div class="intro-rule"><span class="rule-number">?</span><p>${this.copy('introInstruction', `制限時間${clock(this.stage.seconds)}。上司の真意を推理しよう。`)}</p></div>
      <div class="intro-controls"><span><b>左</b>で移動</span><span><b>右</b>で視点</span><span>近づいて<b>調べる</b></span></div>`,
      button('explore', `<span>${this.copy('exploreButton', '探索をはじめる')}</span>` + icons.arrow, 'button button-primary'), 'intro-panel');
  }

  private explore(snapshot: Snapshot): string {
    return `<div class="explore-ui"><div id="look-area" aria-label="ドラッグして視点を動かす"></div>
      <header class="hud"><div class="hud-status"><div class="timer-chip"><span class="timer-label">${snapshot.run ? `<span class="hud-run-progress" data-run-progress>依頼 ${snapshot.run.current}/${snapshot.run.total}</span>` : ''}残り時間</span><strong id="timer-value">${clock(this.stage.seconds)}</strong></div>
      ${button('journal', icons.book + `<span class="clue-label">手がかり</span><strong id="clue-count">0/${this.stage.clues.length}</strong>`, 'hud-notebook', 'aria-label="調査ノートを開く"')}</div>
      ${button('menu', icons.menu, 'icon-button hud-menu', 'aria-label="メニューを開く"')}</header>
      <div class="explore-objective">「${escape(this.stage.title)}」<span>上司の真意を推理しよう</span></div>
      <div class="move-controls"><div id="joystick" role="group" aria-label="移動用ジョイスティック"><span class="joystick-tick tick-top"></span><span class="joystick-tick tick-right"></span><span class="joystick-tick tick-bottom"></span><span class="joystick-tick tick-left"></span><div id="joystick-knob"><span>移動</span></div></div><span class="touch-hint">右側をスワイプで視点</span><span class="desktop-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動 <span>ドラッグで視点</span></span></div>
      <div class="context-actions"><p id="context-name" hidden></p>${button('inspect', icons.inspect + '<span>調べる</span><kbd>E</kbd>', 'button button-primary inspect-button', 'id="inspect-button" hidden')}${button('decision', '<span>判断する</span>' + icons.arrow, 'button decision-button')}</div>
      <span class="game-case">CASE ${this.stage.number} — ${this.copy('worldLocation', '株式会社よしなに')}</span>
      <div class="orientation-note">縦持ちで遊ぶと、ちょうどいい。</div></div>`;
  }

  private inspect(snapshot: Snapshot): string {
    const clue = this.stage.clues.find((item) => item.id === snapshot.inspected);
    if (!clue) return this.modal('<h1 class="modal-title" tabindex="-1" data-focus>調べるものを選ぼう</h1>', button('close', '閉じる', 'button button-primary'));
    return this.modal(`<div class="modal-kicker"><span>調査記録 / ${number(clue)}</span>${pause}</div>
      <div class="evidence-heading"><span class="evidence-number">${number(clue)}</span><div><p class="eyebrow">${escape(clue.category)}</p><h1 class="modal-title" tabindex="-1" data-focus>${escape(clue.title)}</h1></div></div>
      <article class="evidence-document"><span class="document-pin"></span><span class="document-label">EVIDENCE / CASE ${this.stage.number}</span><p>${escape(clue.body)}</p><span class="document-bottom">株式会社よしなに — 現場記録</span></article>
      <p class="recorded-label">${icons.check} 調査ノートに記録しました <span>${snapshot.found.length}/${this.stage.clues.length}</span></p>`, button('close', '<span>探索に戻る</span>' + icons.arrow, 'button button-primary'), 'inspect-panel');
  }

  private menu(snapshot: Snapshot): string {
    return this.modal(`<div class="modal-kicker"><span>BREAK TIME</span>${pause}</div><h1 class="modal-title" tabindex="-1" data-focus>ひと休み。</h1>
      <div class="settings-list"><div class="setting-row"><div><strong>BGM</strong><p>音楽のオン・オフ</p></div>${this.musicToggle(snapshot)}</div>
      <div class="setting-row"><div><strong>効果音</strong><p>音がなくても、すべて遊べます</p></div>${button('sound', `<span>${snapshot.sound ? 'ON' : 'OFF'}</span><i></i>`, `toggle-button ${snapshot.sound ? 'is-on' : ''}`, `aria-label="効果音を${snapshot.sound ? 'オフ' : 'オン'}にする" aria-pressed="${snapshot.sound}"`)}</div>
      <div class="setting-row"><div><strong>描画品質</strong><p>動きが重いときは「軽量」へ</p></div>${button('quality', snapshot.lowQuality ? '軽量' : '標準', 'quality-button', `aria-label="描画品質を${snapshot.lowQuality ? '標準' : '軽量'}に切り替える"`)}</div></div>
      ${button('camera', '<span>視点をリセット</span>↺', 'button button-subtle camera-button')}
      <a class="music-credit menu-music-credit" href="${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.md#music" target="_blank" rel="noopener">BGMクレジット ↗</a>
      <div class="control-guide"><h2>操作のメモ</h2><div><span>スマートフォン</span><p>左のスティックで移動<br>画面の右側をスワイプで視点</p></div><div><span>PC</span><p>WASD / 矢印キーで移動<br>マウスをドラッグで視点、Eで調べる</p></div></div>`,
      button('close', '<span>探索に戻る</span>' + icons.arrow, 'button button-primary') + button('title', 'タイトルへ', 'button button-text'), 'menu-panel');
  }

  private journal(snapshot: Snapshot): string {
    const rows = this.stage.clues.filter((clue) => snapshot.found.includes(clue.id))
      .map((clue) => `<article class="journal-entry"><div class="journal-entry-heading"><span>${number(clue)}</span><div><p class="eyebrow">${escape(clue.category)}</p><h2>${escape(clue.title)}</h2></div>${icons.check}</div><p>${escape(clue.body)}</p></article>`).join('')
      || '<p class="empty-note">調べたものが、ここに記録されます。</p>';
    return `<div class="overlay drawer-overlay"><section class="panel journal-panel" role="dialog" aria-modal="true" aria-labelledby="journal-title"><header class="drawer-header"><div><p class="eyebrow">FIELD NOTES / ${this.stage.number}</p><h1 id="journal-title" tabindex="-1" data-focus>調査ノート<span>${snapshot.found.length}<small>/${this.stage.clues.length}</small></span></h1></div>${button('close', icons.close, 'icon-button', 'aria-label="調査ノートを閉じる"')}</header><div class="journal-meta">${pause}<span>見たものから、考えよう。</span></div><div class="panel-scroll journal-scroll">${rows}</div><footer class="panel-footer">${button('close', '戻る' + icons.arrow, 'button button-primary')}</footer></section></div>`;
  }

  private decision(snapshot: Snapshot): string {
    const choices = (this.stage.choiceIds ?? ['A', 'B', 'C'] as Choice[]).map((id) => ({ id, ...this.stage.choices[id] }));
    return this.modal(`<div class="modal-kicker"><span>YOUR INTERPRETATION / ${this.stage.number}</span>${pause}</div><h1 class="modal-title" tabindex="-1" data-focus>${this.copy('decisionHeading', 'どう「片付ける」？')}</h1><p class="decision-intro">${snapshot.timedOut ? this.copy('timedOut', '時間です。集めた手がかりから、決めよう。') : this.copy('decisionNote', '上司の指示を、あなたなりに解釈しよう。')}</p><blockquote class="decision-message"><span>上司のメッセージ</span>${this.copy('introBoss', '')}</blockquote>
      <div class="choices${choices.length === 2 ? ' choices-two' : ''}">${choices.map(({ id, label, description }) => button('choose', `<span class="choice-letter">${id}</span><span class="choice-copy"><strong>${escape(label)}</strong><small>${escape(description)}</small></span>${icons.arrow}`, 'choice-button', `data-detail="${id}"`)).join('')}</div><p class="choice-note">どの解釈でも、物語は続きます。</p>`,
      button('journal', icons.book + `手がかりを確認 <span>${snapshot.found.length}/${this.stage.clues.length}</span>`, 'button button-subtle') + (snapshot.timedOut ? '' : button('back', 'もう少し調べる', 'button button-text')), 'decision-panel');
  }

  private cinematic(snapshot: Snapshot): string {
    const choice = snapshot.choice ?? 'A';
    return `<section class="cinematic-ui" aria-live="polite"><div class="cinematic-label"><span class="tiny-dot"></span> ${this.copy('cinematicLabel', 'お仕事、実行中。')}</div><div class="cinematic-caption"><span>あなたの解釈 / ${choice}</span><p>${this.copy(`cinematic${choice}`, '指示どおりに、実行する。')}</p></div></section>`;
  }

  private ending(snapshot: Snapshot): string {
    const choice = snapshot.choice ?? 'A';
    const ending = this.stage.endings[choice];
    const clues = this.stage.clues;
    const found = clues.filter((clue) => snapshot.found.includes(clue.id));
    const missed = clues.filter((clue) => !snapshot.found.includes(clue.id));
    const correct = choice === this.stage.copy.correctChoice;
    const generated = snapshot.caseSeed != null;
    const generatedReview = 'evidenceChain' in this.stage && Array.isArray(this.stage.evidenceChain) ? this.stage.evidenceChain as string[] : [];
    const reviewIds = generated ? generatedReview : this.stage.id === 'stage01' ? ['C03', 'C05', 'C06'] : this.stage.id === 'stage03' ? ['C03', 'C04', 'C07'] : this.stage.id === 'stage05' ? ['C02', 'C03', 'C06'] : this.stage.id === 'stage04' ? ['C01', 'C02', 'C03'] : ['C03', 'C06', 'C07'];
    const highlighted = !generated && this.stage.id === 'stage01' && choice === 'A'
      ? ['C03', 'C05', 'C06', 'C04', 'C07', 'C02', 'C01'].map((id) => missed.find((clue) => clue.id === id)).filter((clue): clue is Clue => Boolean(clue)).slice(0, 2)
      : reviewIds.map((id) => clues.find((clue) => clue.id === id)).filter((clue): clue is Clue => Boolean(clue));
    const evidenceTitles = (items: Clue[], empty: string) => items.length ? `<ul>${items.map((clue) => `<li><span>${number(clue)}</span>${escape(clue.title)}</li>`).join('')}</ul>` : `<p class="empty-note">${empty}</p>`;
    const running = snapshot.mode === 'run' && snapshot.run != null;
    const runActions = button('newcase', `<span>${snapshot.run?.completed.length === snapshot.run?.total ? 'リザルトを見る' : '次の依頼へ'}</span>` + icons.arrow, 'button button-primary next-stage-button new-case-button') + button('title', 'タイトルへ', 'button button-text');
    const singleActions = (generated ? button('newcase', '<span>次の依頼を受ける</span>' + icons.arrow, 'button button-primary next-stage-button new-case-button') : this.stage.id === 'stage01' ? button('next', '<span>次の業務へ</span>' + icons.arrow, 'button button-primary next-stage-button') : '') + button('retry', `<span>${generated ? '同じ依頼をやり直す' : 'もう一度'}</span>↺`, `button ${generated || this.stage.id === 'stage01' ? 'button-subtle' : 'button-primary'}`) + button('title', 'タイトルへ', 'button button-subtle');
    return this.modal(`<div class="modal-kicker"><span>${this.runProgress(snapshot)}CASE ${this.stage.number} / ENDING ${choice}</span><span class="ending-stamp ${correct ? 'ending-stamp-c' : ''}">${correct ? this.copy('successLabel', '大正解') : 'おつかれさまでした'}</span></div>
      <p class="ending-subtitle">${escape(ending.subtitle)}</p><h1 class="modal-title ending-title" tabindex="-1" data-focus>${escape(ending.title)}</h1>
      <div class="ending-conversation"><div class="ending-line"><img class="boss-portrait ending-boss-portrait" src="${bossImage}" alt="上司のイラスト"/><div><span>上司 / 部長</span><blockquote>${escape(ending.boss)}</blockquote></div></div><div class="ending-line player-line"><div><span>あなた</span><blockquote>${escape(ending.player)}</blockquote></div><span class="player-avatar">私</span></div></div>
      <p class="ending-explanation">${escape(ending.explanation)}</p>
      <section class="evidence-account"><div><h2>${icons.check} 見つけた手がかり <span>${found.length}/${clues.length}</span></h2>${evidenceTitles(found, '今回は、直感で決めた。')}</div><div><h2>${icons.inspect} 見逃した手がかり <span>${missed.length}/${clues.length}</span></h2>${evidenceTitles(missed, 'すべての手がかりを見つけました。')}</div></section>
      ${highlighted.length ? `<details class="ending-review"><summary>${this.copy('reviewHeading', '手がかりを振り返る')}<span>＋</span></summary><div>${highlighted.map((clue) => `<article><div><span class="review-number">${number(clue)}</span><h3>${escape(clue.title)}</h3><span class="review-status">${snapshot.found.includes(clue.id) ? '発見済み' : '見逃し'}</span></div><p>${escape(clue.body)}</p></article>`).join('')}</div></details>` : ''}`,
      running ? runActions : singleActions, `ending-panel${running ? ' run-ending-panel' : ''}`);
  }

  private results(snapshot: Snapshot): string {
    const completed = snapshot.run?.completed ?? [];
    const correct = completed.filter((result) => result.correct).length;
    const found = completed.reduce((sum, result) => sum + result.found, 0);
    const totalClues = completed.reduce((sum, result) => sum + getStage(result.stageId).clues.length, 0);
    const elapsed = completed.reduce((sum, result) => sum + result.elapsed, 0);
    const rows = completed.map((result, index) => `<li class="result-row ${result.correct ? 'result-correct' : ''}"><span class="result-order">${String(index + 1).padStart(2, '0')}</span><div class="result-case"><h2>「${escape(getStage(result.stageId).title)}」</h2><p><span>あなたの解釈</span>${escape(result.choiceLabel)}</p>${result.timedOut ? '<small class="result-timeout">時間切れで判断</small>' : ''}</div><span class="result-status">${result.correct ? icons.check + '意図が伝わった' : 'すれ違い'}</span></li>`).join('');
    return this.modal(`<div class="modal-kicker"><span>株式会社よしなに / 業務報告書</span><span class="result-filed">全${completed.length}件 完了</span></div><h1 class="modal-title results-title" tabindex="-1" data-focus>本日の、<br>お仕事報告。</h1><div class="result-score"><span class="result-score-number">${correct}<small>/${snapshot.run?.total ?? STAGE_LIST.length}</small></span><div><strong>意図が伝わった</strong><p>最後の依頼まで、おつかれさまでした。</p></div></div><dl class="result-stats"><div><dt>集めた手がかり</dt><dd>${found}<small>/${totalClues}</small></dd></div><div><dt>探索した時間</dt><dd>${clock(elapsed)}</dd></div></dl><div class="result-list-heading"><h2>今日の依頼</h2><span>プレイした順番</span></div><ol class="result-list">${rows}</ol>`, button('start', '<span>もう一度ゲームスタート</span>' + icons.arrow, 'button button-primary') + button('title', 'タイトルへ', 'button button-text'), 'results-panel');
  }

  private runProgress(snapshot: Snapshot): string {
    return snapshot.run ? `<span class="run-progress">依頼 ${snapshot.run.current}/${snapshot.run.total}</span>` : '';
  }

  private musicToggle(snapshot: Snapshot): string {
    return button('music', `<span>${snapshot.music ? 'ON' : 'OFF'}</span><i></i>`, `toggle-button ${snapshot.music ? 'is-on' : ''}`, `aria-label="BGMを${snapshot.music ? 'オフ' : 'オン'}にする" aria-pressed="${snapshot.music}"`);
  }

  private modal(content: string, actions: string, className = ''): string {
    return `<div class="overlay"><section class="panel ${className}" role="dialog" aria-modal="true" aria-label="ゲーム画面"><div class="panel-scroll">${content}</div><footer class="panel-footer">${actions}</footer></section></div>`;
  }

  private copy(key: string, fallback: string): string { return escape(this.stage.copy[key] ?? fallback); }
}
