import { User } from 'firebase/auth';
import { onAuthChange, loginWithGoogle, logout } from './auth';
import { showToast, openOverlay, closeOverlay, textEl, button, iconEl } from './ui';
import { submitFeedback } from './feedback';
import { todayKey, labelOf } from './dates';
import {
  CATEGORIES, SCORE_AXES, SCORE_MAX, PERIOD_OPTIONS, MAX_FOCUS, DECISION_LABEL, DECISION_DESC, HINTS,
  defaultScores, totalScore,
} from './options';
import {
  subscribeOptions, subscribePeriods, createOption, updateOption, setOptionStatus, deleteOption,
  startPeriod, setCheck, reviewPeriod, deletePeriod,
} from './store';
import { periodEnd, dayNumber, isOver, periodDates, doneDays, elapsedDays, rate, periodRate, shortLabel } from './stats';
import { FocusOption, Period, Decision, Scores, OptionStatus } from './types';
import { initClickTracking } from './analytics';

initClickTracking();

// ============================================================
// DOM refs
// ============================================================
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const loginScreen = $('login-screen');
const appEl = $('app');
const userInfo = $('user-info');
const userAvatar = $<HTMLImageElement>('user-avatar');
const userName = $('user-name');
const btnGoogleLogin = $<HTMLButtonElement>('btn-google-login');
const btnLogout = $<HTMLButtonElement>('btn-logout');

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs__btn'));
const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));
const countPool = $('count-pool');

const todayDateEl = $('today-date');
const nowContent = $('now-content');
const sortChips = $('sort-chips');
const poolList = $('pool-list');
const holdList = $('hold-list');
const droppedList = $('dropped-list');
const countHold = $('count-hold');
const countDropped = $('count-dropped');
const historyList = $('history-list');
const statPeriods = $('stat-periods');
const statFocus = $('stat-focus');
const statRate = $('stat-rate');

const btnFab = $<HTMLButtonElement>('btn-fab');
const btnAddInline = $<HTMLButtonElement>('btn-add-inline');

const optionOverlay = $('option-modal-overlay');
const optionForm = $<HTMLFormElement>('option-form');
const optionModalTitle = $('option-modal-title');
const inputTitle = $<HTMLInputElement>('input-title');
const inputMemo = $<HTMLTextAreaElement>('input-memo');
const hintBox = $<HTMLDetailsElement>('hint-box');
const hintChips = $('hint-chips');
const categoryChips = $('category-chips');
const scoreFields = $('score-fields');
const scoreTotalEl = $('score-total');
const btnOptionSubmit = $<HTMLButtonElement>('btn-option-submit');

const startOverlay = $('start-modal-overlay');
const startLead = $('start-lead');
const startOptions = $('start-options');
const periodOptions = $('period-options');
const inputHoldRest = $<HTMLInputElement>('input-hold-rest');
const btnStartSave = $<HTMLButtonElement>('btn-start-save');

const reviewOverlay = $('review-modal-overlay');
const reviewSummary = $('review-summary');
const reviewItems = $('review-items');
const inputReviewNote = $<HTMLTextAreaElement>('input-review-note');
const btnReviewSave = $<HTMLButtonElement>('btn-review-save');

const confirmOverlay = $('confirm-dialog-overlay');
const confirmTitle = $('confirm-dialog-title');
const confirmText = $('confirm-dialog-text');
const btnConfirmCancel = $<HTMLButtonElement>('btn-confirm-cancel');
const btnConfirmOk = $<HTMLButtonElement>('btn-confirm-ok');

const feedbackBtn = $<HTMLButtonElement>('feedback-btn');
const feedbackOverlay = $('feedback-modal-overlay');
const inputFeedbackMessage = $<HTMLTextAreaElement>('input-feedback-message');
const btnFeedbackClose = $<HTMLButtonElement>('btn-feedback-close');
const btnFeedbackSend = $<HTMLButtonElement>('btn-feedback-send');

// ============================================================
// State
// ============================================================
type Tab = 'now' | 'pool' | 'history';
type Sort = 'score' | 'new';

interface State {
  uid: string | null;
  unsubscribers: (() => void)[];
  options: FocusOption[];
  periods: Period[];
  optionsLoaded: boolean;
  periodsLoaded: boolean;
  tab: Tab;
  sort: Sort;
  editingId: string | null;
  formCategory: string;
  formScores: Scores;
  pickIds: string[];
  pickDays: number;
  reviewId: string | null;
  reviewDecisions: Record<string, Decision>;
  pending: Set<string>;
  confirmAction: (() => Promise<void>) | null;
}

const state: State = {
  uid: null,
  unsubscribers: [],
  options: [],
  periods: [],
  optionsLoaded: false,
  periodsLoaded: false,
  tab: 'now',
  sort: 'score',
  editingId: null,
  formCategory: CATEGORIES[0],
  formScores: defaultScores(),
  pickIds: [],
  pickDays: 7,
  reviewId: null,
  reviewDecisions: {},
  pending: new Set(),
  confirmAction: null,
};

const FOCUS_ICON = '<svg width="56" height="56" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 24 V12 H24"/><path d="M40 12 H52 V24"/><path d="M52 40 V52 H40"/><path d="M24 52 H12 V40"/><circle cx="32" cy="32" r="9"/><circle cx="32" cy="32" r="2.4" fill="currentColor" stroke="none"/></svg>';

// ============================================================
// Helpers
// ============================================================
const findOption = (id: string | null): FocusOption | undefined =>
  (id ? state.options.find((o) => o.id === id) : undefined);

const findPeriod = (id: string | null): Period | undefined =>
  (id ? state.periods.find((p) => p.id === id) : undefined);

const activePeriod = (): Period | undefined => state.periods.find((p) => p.status === 'active');

const reviewedPeriods = (): Period[] => state.periods.filter((p) => p.status === 'reviewed');

const byStatus = (s: OptionStatus): FocusOption[] => state.options.filter((o) => o.status === s);

const byScore = (list: FocusOption[]): FocusOption[] =>
  [...list].sort((a, b) => totalScore(b.scores) - totalScore(a.scores) || b.createdAt - a.createdAt);

/** 期間中の候補なら、いまのタイトル（なければ始めたときのタイトル） */
const focusTitle = (ref: { id: string; title: string }): string => findOption(ref.id)?.title ?? ref.title;

/** 同じキーの処理が進行中なら何もしない（二重送信防止） */
async function withLock(key: string, fn: () => Promise<void>, errorMessage = '保存に失敗しました。通信環境を確認してください'): Promise<boolean> {
  if (state.pending.has(key)) return false;
  state.pending.add(key);
  renderAll();
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(err);
    showToast(errorMessage);
    return false;
  } finally {
    state.pending.delete(key);
    renderAll();
  }
}

function askConfirm(title: string, text: string, okLabel: string, action: () => Promise<void>): void {
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  btnConfirmOk.textContent = okLabel;
  state.confirmAction = action;
  openOverlay(confirmOverlay);
}

function emptyState(text: string): HTMLElement {
  return textEl('p', 'empty-state', text);
}

function scoreBar(o: FocusOption): HTMLElement {
  const total = totalScore(o.scores);
  const wrap = document.createElement('div');
  wrap.className = 'score-bar';
  const track = document.createElement('div');
  track.className = 'score-bar__track';
  const fill = document.createElement('div');
  fill.className = 'score-bar__fill';
  fill.style.width = `${Math.round((total / SCORE_MAX) * 100)}%`;
  track.appendChild(fill);
  wrap.append(track, textEl('span', 'score-bar__value', `${total} / ${SCORE_MAX}点`));
  return wrap;
}

// ============================================================
// Render: いま
// ============================================================
function toggleCheck(p: Period, date: string, optionId: string): void {
  if (!state.uid) return;
  const uid = state.uid;
  const on = !(p.checks.get(date)?.has(optionId) ?? false);
  void withLock(`check:${p.id}:${date}:${optionId}`, async () => {
    await setCheck(uid, p.id, date, optionId, on);
    if (on && date === todayKey()) showToast('手をつけた！ いまはこれでOK');
  });
}

function renderNow(): void {
  const today = todayKey();
  todayDateEl.textContent = labelOf(today);
  nowContent.innerHTML = '';
  if (!state.optionsLoaded || !state.periodsLoaded) {
    nowContent.appendChild(emptyState('読み込み中…'));
    return;
  }

  const p = activePeriod();
  if (!p) {
    const box = document.createElement('div');
    box.className = 'empty-cta';
    box.appendChild(iconEl(FOCUS_ICON, 'empty-cta__icon'));
    const candidates = state.options.filter((o) => o.status !== 'dropped');
    if (candidates.length === 0) {
      box.appendChild(textEl('p', 'empty-cta__text', 'まずは、気になっていること・やりたいことを全部書き出してみましょう。数が多くても大丈夫です。'));
      box.appendChild(button('＋ 候補を書き出す', 'btn btn--primary btn--lg', () => openOptionModal(null)));
    } else {
      box.appendChild(textEl('p', 'empty-cta__text', `候補が${candidates.length}件あります。この期間は何に集中しますか？ 1〜3つに絞りましょう。`));
      box.appendChild(button('集中することを選ぶ', 'btn btn--primary btn--lg', () => openStartModal([])));
    }
    nowContent.appendChild(box);
    return;
  }

  const end = periodEnd(p);
  const over = isOver(p, today);
  const dayNo = Math.min(dayNumber(p, today), p.days);
  const left = Math.max(p.days - dayNo, 0);

  // 期間の見出し
  const head = document.createElement('div');
  head.className = 'period-card';
  head.appendChild(textEl('p', 'period-card__label', over ? '期間が終わりました' : `${PERIOD_LABEL(p.days)}の集中期間`));
  head.appendChild(textEl('p', 'period-card__range', `${labelOf(p.startDate)} 〜 ${labelOf(end)}`));
  const bar = document.createElement('div');
  bar.className = 'period-card__bar';
  const fill = document.createElement('div');
  fill.className = 'period-card__fill';
  fill.style.width = `${Math.round((dayNo / p.days) * 100)}%`;
  bar.appendChild(fill);
  head.appendChild(bar);
  const meta = document.createElement('div');
  meta.className = 'period-card__meta';
  meta.append(
    textEl('span', '', over ? `${p.days}日間おつかれさまでした` : `${dayNo}日目 / ${p.days}日`),
    textEl('span', '', over ? 'ふりかえって、次を決めましょう' : (left === 0 ? '今日が最終日' : `あと${left}日`)),
  );
  head.appendChild(meta);
  if (over) head.appendChild(button('見直す', 'btn btn--primary btn--block', () => openReviewModal(p.id)));
  nowContent.appendChild(head);

  // 集中していること
  const list = document.createElement('div');
  list.className = 'card-list';
  const dates = periodDates(p);
  p.focus.forEach((f) => {
    const card = document.createElement('div');
    card.className = 'item-card focus-card';
    const body = document.createElement('div');
    body.className = 'item-card__body';
    const opt = findOption(f.id);
    if (opt) body.appendChild(textEl('span', 'item-card__badge', opt.category));
    body.appendChild(textEl('p', 'item-card__title', focusTitle(f)));
    const done = doneDays(p, f.id);
    const base = elapsedDays(p, today);
    body.appendChild(textEl('p', 'item-card__meta', `手をつけた日 ${done} / ${base}日（${rate(p, f.id, today)}%）`));
    const dots = document.createElement('div');
    dots.className = 'focus-card__dots';
    dates.forEach((d) => {
      const on = p.checks.get(d)?.has(f.id) ?? false;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `day-dot${on ? ' is-done' : ''}${d === today ? ' is-today' : ''}`;
      dot.disabled = d > today || state.pending.has(`check:${p.id}:${d}:${f.id}`);
      dot.title = shortLabel(d);
      dot.setAttribute('aria-label', `${labelOf(d)} ${on ? '手をつけた' : 'まだ'}`);
      dot.setAttribute('aria-pressed', String(on));
      if (d <= today) dot.addEventListener('click', () => toggleCheck(p, d, f.id));
      dots.appendChild(dot);
    });
    body.appendChild(dots);
    card.appendChild(body);

    if (!over) {
      const side = document.createElement('div');
      side.className = 'item-card__side';
      const todayOn = p.checks.get(today)?.has(f.id) ?? false;
      const b = button(todayOn ? 'できた' : '今日は？', `check-btn${todayOn ? ' is-done' : ''}`, () => toggleCheck(p, today, f.id));
      b.setAttribute('aria-pressed', String(todayOn));
      b.disabled = state.pending.has(`check:${p.id}:${today}:${f.id}`);
      side.appendChild(b);
      card.appendChild(side);
    }
    list.appendChild(card);
  });
  nowContent.appendChild(list);

  if (!over) {
    const early = document.createElement('p');
    early.className = 'section__desc';
    early.style.marginTop = '12px';
    early.style.textAlign = 'right';
    early.appendChild(button('期間の途中で見直す', 'text-btn', () => openReviewModal(p.id)));
    nowContent.appendChild(early);
  }

  // 手放していること
  if (p.heldTitles.length) {
    const held = document.createElement('div');
    held.className = 'held-box';
    held.appendChild(textEl('p', 'held-box__title', `いまはやらないこと（${p.heldTitles.length}件）`));
    held.appendChild(textEl('p', 'section__desc', '選ばなかったことは、この期間は気にしなくて大丈夫です。'));
    const chips = document.createElement('div');
    chips.className = 'held-box__list';
    p.heldTitles.forEach((t) => chips.appendChild(textEl('span', 'held-box__item', t)));
    held.appendChild(chips);
    nowContent.appendChild(held);
  }
}

const PERIOD_LABEL = (days: number): string =>
  PERIOD_OPTIONS.find((o) => o.days === days)?.label ?? `${days}日間`;

// ============================================================
// Render: 候補
// ============================================================
function optionCard(o: FocusOption, rank: number | null, focusIds: Set<string>): HTMLElement {
  const card = document.createElement('div');
  card.className = 'item-card item-card--idea';
  const top = document.createElement('div');
  top.style.display = 'flex';
  top.style.gap = '12px';
  top.style.alignItems = 'flex-start';
  if (rank !== null) top.appendChild(textEl('span', 'rank', String(rank)));
  const body = document.createElement('div');
  body.className = 'item-card__body';
  const head = document.createElement('div');
  head.className = 'item-card__head';
  head.appendChild(textEl('span', 'item-card__badge', o.category));
  if (focusIds.has(o.id)) head.appendChild(textEl('span', 'status-pill', 'いま集中中'));
  body.appendChild(head);
  body.appendChild(textEl('p', 'item-card__title', o.title));
  body.appendChild(scoreBar(o));
  if (o.memo) body.appendChild(textEl('p', 'item-card__memo', o.memo));
  top.appendChild(body);
  card.appendChild(top);

  const actions = document.createElement('div');
  actions.className = 'item-card__actions';
  const busy = state.pending.has(`option:${o.id}`);
  const edit = button('編集', 'btn btn--ghost btn--sm', () => openOptionModal(o.id));
  actions.appendChild(edit);
  if (o.status === 'pool') {
    const hold = button('いまはやらない', 'btn btn--ghost btn--sm', () => changeStatus(o, 'hold', '「いまはやらない」に移しました'));
    hold.disabled = busy;
    actions.appendChild(hold);
  } else {
    const back = button('候補に戻す', 'btn btn--ghost btn--sm', () => changeStatus(o, 'pool', '候補に戻しました'));
    back.disabled = busy;
    actions.appendChild(back);
  }
  const del = button('削除', 'btn btn--ghost btn--sm is-danger', () => {
    askConfirm('候補を削除しますか？', `「${o.title}」を削除します。見直し履歴に残っている記録は消えません。元に戻せません。`, '削除する', async () => {
      if (!state.uid) return;
      const uid = state.uid;
      const ok = await withLock(`option:${o.id}`, () => deleteOption(uid, o.id), '削除に失敗しました');
      if (ok) showToast('削除しました');
    });
  });
  del.disabled = busy;
  actions.appendChild(del);
  card.appendChild(actions);
  return card;
}

function changeStatus(o: FocusOption, status: OptionStatus, message: string): void {
  if (!state.uid) return;
  const uid = state.uid;
  void withLock(`option:${o.id}`, async () => {
    await setOptionStatus(uid, o.id, status);
    showToast(message);
  });
}

function renderPool(): void {
  const pool = byStatus('pool');
  countPool.textContent = pool.length ? String(pool.length) : '';

  sortChips.innerHTML = '';
  ([['score', '点数が高い順'], ['new', '新しい順']] as [Sort, string][]).forEach(([key, label]) => {
    const c = button(label, `chip${state.sort === key ? ' is-active' : ''}`, () => {
      state.sort = key;
      renderPool();
    });
    c.setAttribute('role', 'radio');
    c.setAttribute('aria-checked', String(state.sort === key));
    sortChips.appendChild(c);
  });
  sortChips.classList.toggle('hidden', pool.length < 2);

  const focusIds = new Set((activePeriod()?.focus ?? []).map((f) => f.id));

  poolList.innerHTML = '';
  if (!state.optionsLoaded) {
    poolList.appendChild(emptyState('読み込み中…'));
  } else if (!pool.length) {
    poolList.appendChild(emptyState('まだ候補がありません。気になっていることを、思いつくだけ書き出してみましょう。'));
  } else {
    const sorted = state.sort === 'score' ? byScore(pool) : pool;
    sorted.forEach((o, i) => poolList.appendChild(optionCard(o, state.sort === 'score' ? i + 1 : null, focusIds)));
  }

  const hold = byStatus('hold');
  countHold.textContent = hold.length ? `（${hold.length}）` : '';
  holdList.innerHTML = '';
  if (!hold.length) holdList.appendChild(emptyState('保留にしているものはありません。'));
  else byScore(hold).forEach((o) => holdList.appendChild(optionCard(o, null, focusIds)));

  const dropped = byStatus('dropped');
  countDropped.textContent = dropped.length ? `（${dropped.length}）` : '';
  droppedList.innerHTML = '';
  droppedList.closest('.section')?.classList.toggle('hidden', dropped.length === 0);
  dropped.forEach((o) => droppedList.appendChild(optionCard(o, null, focusIds)));
}

// ============================================================
// Render: 見直し履歴
// ============================================================
function renderHistory(): void {
  const today = todayKey();
  const list = reviewedPeriods();
  statPeriods.textContent = String(list.length);
  statFocus.textContent = String(list.reduce((s, p) => s + p.focus.length, 0));
  statRate.textContent = list.length
    ? `${Math.round(list.reduce((s, p) => s + periodRate(p, today), 0) / list.length)}%`
    : '-';

  historyList.innerHTML = '';
  if (!state.periodsLoaded) {
    historyList.appendChild(emptyState('読み込み中…'));
    return;
  }
  if (!list.length) {
    historyList.appendChild(emptyState('まだ見直した期間はありません。集中期間が終わったら、ここにふりかえりが並びます。'));
    return;
  }
  list.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'item-card item-card--record';
    const body = document.createElement('div');
    body.className = 'item-card__body';
    body.appendChild(textEl('span', 'item-card__badge', PERIOD_LABEL(p.days)));
    body.appendChild(textEl('p', 'item-card__title', `${labelOf(p.startDate)} 〜 ${labelOf(periodEnd(p))}`));
    body.appendChild(textEl('p', 'item-card__meta', `平均 ${periodRate(p, today)}% の日で手をつけました`));
    const rows = document.createElement('div');
    rows.className = 'history-focus';
    p.focus.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'history-focus__row';
      row.appendChild(textEl('span', 'history-focus__title', focusTitle(f)));
      row.appendChild(textEl('span', 'history-focus__rate', `${rate(p, f.id, today)}%`));
      const d = p.decisions[f.id];
      if (d) row.appendChild(textEl('span', `decision-pill decision-pill--${d}`, DECISION_LABEL[d]));
      rows.appendChild(row);
    });
    body.appendChild(rows);
    if (p.note) body.appendChild(textEl('p', 'item-card__memo', p.note));
    card.appendChild(body);
    const actions = document.createElement('div');
    actions.className = 'item-card__actions';
    const del = button('削除', 'btn btn--ghost btn--sm is-danger', () => {
      askConfirm('この見直しを削除しますか？', 'この期間の記録とふりかえりを削除します。元に戻せません。', '削除する', async () => {
        if (!state.uid) return;
        const uid = state.uid;
        const ok = await withLock(`period:${p.id}`, () => deletePeriod(uid, p.id), '削除に失敗しました');
        if (ok) showToast('削除しました');
      });
    });
    del.disabled = state.pending.has(`period:${p.id}`);
    actions.appendChild(del);
    card.appendChild(actions);
    historyList.appendChild(card);
  });
}

function renderTabs(): void {
  tabButtons.forEach((b) => {
    const on = b.dataset.tab === state.tab;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
  });
  panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== state.tab));
}

function renderAll(): void {
  renderTabs();
  renderNow();
  renderPool();
  renderHistory();
  if (startOverlay.classList.contains('is-open')) renderStartModal();
  if (reviewOverlay.classList.contains('is-open')) renderReviewModal();
}

// ============================================================
// 候補の登録・編集モーダル
// ============================================================
function renderCategoryChips(): void {
  categoryChips.innerHTML = '';
  CATEGORIES.forEach((c) => {
    const chip = button(c, `chip${state.formCategory === c ? ' is-active' : ''}`, () => {
      state.formCategory = c;
      renderCategoryChips();
    });
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(state.formCategory === c));
    categoryChips.appendChild(chip);
  });
}

function renderScoreFields(): void {
  scoreFields.innerHTML = '';
  SCORE_AXES.forEach((axis) => {
    const field = document.createElement('div');
    field.className = 'score-field';
    const head = document.createElement('div');
    head.className = 'score-field__head';
    head.append(textEl('span', 'score-field__label', axis.label), textEl('span', 'score-field__desc', axis.desc));
    field.appendChild(head);
    const steps = document.createElement('div');
    steps.className = 'score-field__steps';
    steps.setAttribute('role', 'radiogroup');
    steps.setAttribute('aria-label', axis.label);
    for (let n = 1; n <= 5; n++) {
      const on = state.formScores[axis.key] === n;
      const b = button(String(n), `score-field__step${on ? ' is-active' : ''}`, () => {
        state.formScores[axis.key] = n;
        renderScoreFields();
      });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(on));
      steps.appendChild(b);
    }
    field.appendChild(steps);
    scoreFields.appendChild(field);
  });
  scoreTotalEl.textContent = String(totalScore(state.formScores));
}

function renderHints(): void {
  hintChips.innerHTML = '';
  HINTS.forEach((h) => {
    hintChips.appendChild(button(h, 'chip', () => {
      inputTitle.value = h;
      hintBox.open = false;
      inputTitle.focus();
    }));
  });
}

function openOptionModal(id: string | null): void {
  const o = findOption(id);
  state.editingId = o ? o.id : null;
  optionModalTitle.textContent = o ? '候補を編集' : '候補を書き出す';
  btnOptionSubmit.textContent = o ? '保存する' : '候補に入れる';
  inputTitle.value = o?.title ?? '';
  inputMemo.value = o?.memo ?? '';
  state.formCategory = o?.category ?? CATEGORIES[0];
  state.formScores = o ? { ...o.scores } : defaultScores();
  hintBox.open = false;
  hintBox.classList.toggle('hidden', Boolean(o));
  renderCategoryChips();
  renderScoreFields();
  openOverlay(optionOverlay);
  window.setTimeout(() => inputTitle.focus(), 50);
}

optionForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.uid) return;
  const uid = state.uid;
  const title = inputTitle.value.trim();
  if (!title) {
    showToast('気になっていることを入力してください');
    return;
  }
  const input = {
    title,
    category: state.formCategory,
    memo: inputMemo.value.trim(),
    scores: { ...state.formScores },
  };
  const editingId = state.editingId;
  btnOptionSubmit.disabled = true;
  void withLock('option-form', async () => {
    if (editingId) await updateOption(uid, editingId, input);
    else await createOption(uid, input);
    closeOverlay(optionOverlay);
    showToast(editingId ? '保存しました' : '候補に入れました');
  }).finally(() => { btnOptionSubmit.disabled = false; });
});

const closeOptionModal = (): void => closeOverlay(optionOverlay);
$('btn-option-close').addEventListener('click', closeOptionModal);
$('btn-option-cancel').addEventListener('click', closeOptionModal);

// ============================================================
// 集中期間を始めるモーダル
// ============================================================
function openStartModal(preselect: string[], lead?: string): void {
  if (activePeriod()) {
    showToast('いまの集中期間を見直してから、次を選びましょう');
    return;
  }
  const candidates = state.options.filter((o) => o.status !== 'dropped');
  if (!candidates.length) {
    showToast('まずは候補を書き出しましょう');
    openOptionModal(null);
    return;
  }
  const valid = new Set(candidates.map((o) => o.id));
  state.pickIds = preselect.filter((id) => valid.has(id)).slice(0, MAX_FOCUS);
  state.pickDays = state.pickDays || 7;
  startLead.textContent = lead ?? `点数が高い順に並んでいます。この期間に集中することを、1〜${MAX_FOCUS}つまで選んでください。`;
  inputHoldRest.checked = true;
  renderStartModal();
  openOverlay(startOverlay);
}

function renderStartModal(): void {
  const candidates = byScore(state.options.filter((o) => o.status !== 'dropped'));
  const full = state.pickIds.length >= MAX_FOCUS;
  startOptions.innerHTML = '';
  candidates.forEach((o) => {
    const checked = state.pickIds.includes(o.id);
    const label = document.createElement('label');
    label.className = `pick-item${checked ? ' is-checked' : ''}${!checked && full ? ' is-disabled' : ''}`;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.disabled = !checked && full;
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (state.pickIds.length < MAX_FOCUS) state.pickIds.push(o.id);
      } else {
        state.pickIds = state.pickIds.filter((id) => id !== o.id);
      }
      renderStartModal();
    });
    const body = document.createElement('span');
    body.className = 'pick-item__body';
    body.append(
      textEl('span', 'pick-item__title', o.title),
      textEl('span', 'pick-item__meta', o.status === 'hold' ? `${o.category}・いまはやらない中` : o.category),
    );
    body.querySelector('.pick-item__meta')?.setAttribute('style', 'display:block');
    label.append(cb, body, textEl('span', 'pick-item__score', `${totalScore(o.scores)}点`));
    startOptions.appendChild(label);
  });

  periodOptions.innerHTML = '';
  PERIOD_OPTIONS.forEach((opt) => {
    const on = state.pickDays === opt.days;
    const b = button(opt.label, `segmented__btn${on ? ' is-active' : ''}`, () => {
      state.pickDays = opt.days;
      renderStartModal();
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(on));
    periodOptions.appendChild(b);
  });

  const n = state.pickIds.length;
  btnStartSave.disabled = n === 0 || state.pending.has('start');
  btnStartSave.textContent = n ? `${n}つに集中して始める` : '今日から集中する';
}

btnStartSave.addEventListener('click', () => {
  if (!state.uid || !state.pickIds.length) return;
  if (activePeriod()) {
    showToast('すでに集中期間が始まっています');
    closeOverlay(startOverlay);
    return;
  }
  const uid = state.uid;
  const picked = state.pickIds.map((id) => findOption(id)).filter((o): o is FocusOption => Boolean(o));
  const pickedIds = new Set(picked.map((o) => o.id));
  const rest = state.options.filter((o) => o.status !== 'dropped' && !pickedIds.has(o.id));
  const holdRest = inputHoldRest.checked;
  const held = holdRest ? rest : rest.filter((o) => o.status === 'hold');
  const input = {
    startDate: todayKey(),
    days: state.pickDays,
    focus: picked.map((o) => ({ id: o.id, title: o.title })),
    holdIds: holdRest ? rest.filter((o) => o.status === 'pool').map((o) => o.id) : [],
    heldTitles: byScore(held).map((o) => o.title),
    restoreIds: picked.filter((o) => o.status === 'hold').map((o) => o.id),
  };
  void withLock('start', async () => {
    await startPeriod(uid, input);
    closeOverlay(startOverlay);
    state.tab = 'now';
    showToast(`${PERIOD_LABEL(input.days)}、いまはこれに集中！`);
  });
});

const closeStartModal = (): void => closeOverlay(startOverlay);
$('btn-start-close').addEventListener('click', closeStartModal);
$('btn-start-cancel').addEventListener('click', closeStartModal);

// ============================================================
// 見直しモーダル
// ============================================================
function openReviewModal(periodId: string): void {
  const p = findPeriod(periodId);
  if (!p) return;
  state.reviewId = p.id;
  state.reviewDecisions = {};
  inputReviewNote.value = '';
  renderReviewModal();
  openOverlay(reviewOverlay);
}

function renderReviewModal(): void {
  const p = findPeriod(state.reviewId);
  if (!p) {
    closeOverlay(reviewOverlay);
    return;
  }
  const today = todayKey();
  reviewSummary.textContent = isOver(p, today)
    ? `${labelOf(p.startDate)}からの${PERIOD_LABEL(p.days)}、おつかれさまでした。それぞれ次はどうしますか？`
    : `まだ期間の途中（${Math.min(dayNumber(p, today), p.days)}日目）ですが、ここで見直します。それぞれ次はどうしますか？`;
  reviewItems.innerHTML = '';
  p.focus.forEach((f) => {
    const item = document.createElement('div');
    item.className = 'review-item';
    item.appendChild(textEl('p', 'review-item__title', focusTitle(f)));
    item.appendChild(textEl('p', 'review-item__meta', `手をつけた日 ${doneDays(p, f.id)} / ${elapsedDays(p, today)}日`));
    const opts = document.createElement('div');
    opts.className = 'decision-options';
    opts.setAttribute('role', 'radiogroup');
    (['continue', 'swap', 'stop'] as Decision[]).forEach((d) => {
      const on = state.reviewDecisions[f.id] === d;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `decision-btn decision-btn--${d}${on ? ' is-active' : ''}`;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(on));
      b.append(textEl('span', 'decision-btn__label', DECISION_LABEL[d]), textEl('span', 'decision-btn__desc', DECISION_DESC[d]));
      b.addEventListener('click', () => {
        state.reviewDecisions[f.id] = d;
        renderReviewModal();
      });
      opts.appendChild(b);
    });
    item.appendChild(opts);
    reviewItems.appendChild(item);
  });
  const allSet = p.focus.every((f) => state.reviewDecisions[f.id]);
  btnReviewSave.disabled = !allSet || state.pending.has(`review:${p.id}`);
}

btnReviewSave.addEventListener('click', () => {
  const p = findPeriod(state.reviewId);
  if (!state.uid || !p) return;
  if (!p.focus.every((f) => state.reviewDecisions[f.id])) return;
  const uid = state.uid;
  const decisions = { ...state.reviewDecisions };
  const continueIds = p.focus.filter((f) => decisions[f.id] === 'continue').map((f) => f.id);
  const input = {
    decisions,
    note: inputReviewNote.value.trim(),
    reviewedDate: todayKey(),
    dropIds: p.focus.filter((f) => decisions[f.id] === 'stop' && findOption(f.id)).map((f) => f.id),
  };
  void withLock(`review:${p.id}`, async () => {
    await reviewPeriod(uid, p.id, input);
    closeOverlay(reviewOverlay);
    state.reviewId = null;
    showToast('見直しを記録しました');
  }).then((ok) => {
    if (!ok) return;
    // そのまま次の期間を選べるようにする（「続ける」を選んだものは最初から選択しておく）
    window.setTimeout(() => openStartModal(continueIds, '見直しおつかれさまでした。次の期間は何に集中しますか？「続ける」にしたものは選択済みです。'), 300);
  });
});

const closeReviewModal = (): void => {
  closeOverlay(reviewOverlay);
  state.reviewId = null;
};
$('btn-review-close').addEventListener('click', closeReviewModal);
$('btn-review-cancel').addEventListener('click', closeReviewModal);

// ============================================================
// 確認ダイアログ
// ============================================================
btnConfirmCancel.addEventListener('click', () => {
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
});

btnConfirmOk.addEventListener('click', () => {
  const action = state.confirmAction;
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
  if (action) void action();
});

// ============================================================
// フィードバック
// ============================================================
feedbackBtn.addEventListener('click', () => {
  openOverlay(feedbackOverlay);
  window.setTimeout(() => inputFeedbackMessage.focus(), 50);
});
btnFeedbackClose.addEventListener('click', () => closeOverlay(feedbackOverlay));

btnFeedbackSend.addEventListener('click', async () => {
  const message = inputFeedbackMessage.value.trim();
  if (!message) {
    showToast('内容を入力してください');
    return;
  }
  if (btnFeedbackSend.disabled) return;
  btnFeedbackSend.disabled = true;
  btnFeedbackSend.textContent = '送信中…';
  const ok = await submitFeedback(message);
  btnFeedbackSend.disabled = false;
  btnFeedbackSend.textContent = '送信する';
  if (ok) {
    inputFeedbackMessage.value = '';
    closeOverlay(feedbackOverlay);
    showToast('送信しました。ありがとうございます！');
  } else {
    showToast('送信に失敗しました。時間をおいて再度お試しください');
  }
});

// オーバーレイの背景クリックで閉じる（確認ダイアログは誤操作防止のため除外）
[optionOverlay, startOverlay, reviewOverlay, feedbackOverlay].forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    closeOverlay(overlay);
    if (overlay === reviewOverlay) state.reviewId = null;
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  [optionOverlay, startOverlay, reviewOverlay, feedbackOverlay, confirmOverlay].forEach((o) => closeOverlay(o));
  state.reviewId = null;
  state.confirmAction = null;
});

// ============================================================
// Tabs / buttons
// ============================================================
tabButtons.forEach((b) => b.addEventListener('click', () => {
  state.tab = (b.dataset.tab as Tab) || 'now';
  renderTabs();
  window.scrollTo({ top: 0 });
}));

btnFab.addEventListener('click', () => openOptionModal(null));
btnAddInline.addEventListener('click', () => openOptionModal(null));

// ============================================================
// Auth
// ============================================================
btnGoogleLogin.addEventListener('click', async () => {
  if (btnGoogleLogin.disabled) return;
  btnGoogleLogin.disabled = true;
  try {
    await loginWithGoogle();
  } catch (err) {
    console.error(err);
    const code = (err as { code?: string }).code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      showToast('ログインに失敗しました。もう一度お試しください');
    }
  } finally {
    btnGoogleLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await logout();
  } catch (err) {
    console.error(err);
    showToast('ログアウトに失敗しました');
  }
});

function stopSubscriptions(): void {
  state.unsubscribers.forEach((u) => u());
  state.unsubscribers = [];
}

onAuthChange((user: User | null) => {
  stopSubscriptions();
  if (!user) {
    state.uid = null;
    state.options = [];
    state.periods = [];
    state.optionsLoaded = false;
    state.periodsLoaded = false;
    loginScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
    userInfo.classList.add('hidden');
    return;
  }
  state.uid = user.uid;
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userAvatar.src = user.photoURL ?? '';
  userAvatar.classList.toggle('hidden', !user.photoURL);
  userName.textContent = user.displayName ?? '';
  renderAll();

  const onError = (err: Error): void => {
    console.error(err);
    showToast('データの読み込みに失敗しました。再読み込みしてください');
  };
  state.unsubscribers.push(subscribeOptions(user.uid, (items) => {
    state.options = items;
    state.optionsLoaded = true;
    renderAll();
  }, onError));
  state.unsubscribers.push(subscribePeriods(user.uid, (items) => {
    state.periods = items;
    state.periodsLoaded = true;
    renderAll();
  }, onError));
});

renderHints();

// 日付が変わったら「今日」の表示を更新する
let lastDay = todayKey();
window.setInterval(() => {
  const t = todayKey();
  if (t !== lastDay) {
    lastDay = t;
    renderAll();
  }
}, 60 * 1000);
