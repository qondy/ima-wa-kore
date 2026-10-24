import {
  collection, doc, onSnapshot, setDoc, addDoc, deleteDoc, deleteField, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { FocusOption, OptionStatus, Period, Decision, Scores, FocusRef } from './types';
import { SCORE_AXES, CATEGORIES, defaultScores } from './options';

const STATUSES: OptionStatus[] = ['pool', 'hold', 'dropped'];
const DECISIONS: Decision[] = ['continue', 'swap', 'stop'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const millis = (v: unknown): number =>
  (v && typeof (v as { toMillis?: unknown }).toMillis === 'function'
    ? (v as { toMillis: () => number }).toMillis() : Date.now());

const optionsCol = (uid: string) => collection(db, 'users', uid, 'options');
const optionDoc = (uid: string, id: string) => doc(db, 'users', uid, 'options', id);
const periodsCol = (uid: string) => collection(db, 'users', uid, 'periods');
const periodDoc = (uid: string, id: string) => doc(db, 'users', uid, 'periods', id);

function parseScores(v: unknown): Scores {
  const s = defaultScores();
  if (v && typeof v === 'object') {
    SCORE_AXES.forEach(({ key }) => {
      const n = (v as Record<string, unknown>)[key];
      if (typeof n === 'number' && n >= 1 && n <= 5) s[key] = Math.round(n);
    });
  }
  return s;
}

// ============================================================
// 候補
// ============================================================
export function subscribeOptions(
  uid: string,
  onData: (items: FocusOption[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(optionsCol(uid), (snap) => {
    const list: FocusOption[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (typeof data.title !== 'string') return;
      list.push({
        id: d.id,
        title: data.title,
        category: CATEGORIES.includes(data.category) ? data.category : 'その他',
        memo: str(data.memo),
        status: STATUSES.includes(data.status) ? data.status : 'pool',
        scores: parseScores(data.scores),
        createdAt: millis(data.createdAt),
      });
    });
    list.sort((a, b) => b.createdAt - a.createdAt);
    onData(list);
  }, onError);
}

export interface OptionInput {
  title: string;
  category: string;
  memo: string;
  scores: Scores;
}

export async function createOption(uid: string, input: OptionInput): Promise<void> {
  await addDoc(optionsCol(uid), {
    ...input,
    status: 'pool',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateOption(uid: string, id: string, input: OptionInput): Promise<void> {
  return setDoc(optionDoc(uid, id), { ...input, updatedAt: serverTimestamp() }, { merge: true });
}

export function setOptionStatus(uid: string, id: string, status: OptionStatus): Promise<void> {
  return setDoc(optionDoc(uid, id), { status, updatedAt: serverTimestamp() }, { merge: true });
}

export function deleteOption(uid: string, id: string): Promise<void> {
  return deleteDoc(optionDoc(uid, id));
}

// ============================================================
// 集中期間
// ============================================================
export function subscribePeriods(
  uid: string,
  onData: (items: Period[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(periodsCol(uid), (snap) => {
    const list: Period[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (typeof data.startDate !== 'string' || !DATE_RE.test(data.startDate)) return;
      const focus: FocusRef[] = Array.isArray(data.focus)
        ? data.focus
          .filter((f: unknown) => f && typeof (f as FocusRef).id === 'string')
          .map((f: FocusRef) => ({ id: f.id, title: str(f.title) }))
        : [];
      const checks = new Map<string, Set<string>>();
      if (data.checks && typeof data.checks === 'object') {
        Object.entries(data.checks as Record<string, unknown>).forEach(([date, ids]) => {
          if (!DATE_RE.test(date) || !ids || typeof ids !== 'object') return;
          const set = new Set<string>();
          Object.entries(ids as Record<string, unknown>).forEach(([id, on]) => { if (on === true) set.add(id); });
          if (set.size) checks.set(date, set);
        });
      }
      const decisions: Partial<Record<string, Decision>> = {};
      if (data.decisions && typeof data.decisions === 'object') {
        Object.entries(data.decisions as Record<string, unknown>).forEach(([id, v]) => {
          if (DECISIONS.includes(v as Decision)) decisions[id] = v as Decision;
        });
      }
      list.push({
        id: d.id,
        startDate: data.startDate,
        days: typeof data.days === 'number' && data.days > 0 ? Math.floor(data.days) : 7,
        focus,
        checks,
        heldTitles: Array.isArray(data.heldTitles) ? data.heldTitles.filter((t: unknown) => typeof t === 'string') : [],
        status: data.status === 'reviewed' ? 'reviewed' : 'active',
        decisions,
        note: str(data.note),
        reviewedDate: typeof data.reviewedDate === 'string' && DATE_RE.test(data.reviewedDate) ? data.reviewedDate : null,
        createdAt: millis(data.createdAt),
      });
    });
    list.sort((a, b) => (b.startDate === a.startDate ? b.createdAt - a.createdAt : b.startDate.localeCompare(a.startDate)));
    onData(list);
  }, onError);
}

export interface StartInput {
  startDate: string;
  days: number;
  focus: FocusRef[];
  /** 保留に移す候補 */
  holdIds: string[];
  heldTitles: string[];
  /** 保留から候補に戻す（集中先に選ばれた保留中のもの） */
  restoreIds: string[];
}

/** 集中期間を始める。候補の状態変更とまとめて1回で書き込む */
export async function startPeriod(uid: string, input: StartInput): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(periodsCol(uid)), {
    startDate: input.startDate,
    days: input.days,
    focus: input.focus,
    heldTitles: input.heldTitles,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  input.holdIds.forEach((id) => batch.set(optionDoc(uid, id), { status: 'hold', updatedAt: serverTimestamp() }, { merge: true }));
  input.restoreIds.forEach((id) => batch.set(optionDoc(uid, id), { status: 'pool', updatedAt: serverTimestamp() }, { merge: true }));
  await batch.commit();
}

export function setCheck(uid: string, periodId: string, date: string, optionId: string, on: boolean): Promise<void> {
  return setDoc(periodDoc(uid, periodId), {
    checks: { [date]: { [optionId]: on ? true : deleteField() } },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export interface ReviewInput {
  decisions: Record<string, Decision>;
  note: string;
  reviewedDate: string;
  /** 「やめる」を選んだ候補（存在するものだけ） */
  dropIds: string[];
}

export async function reviewPeriod(uid: string, periodId: string, input: ReviewInput): Promise<void> {
  const batch = writeBatch(db);
  batch.set(periodDoc(uid, periodId), {
    status: 'reviewed',
    decisions: input.decisions,
    note: input.note,
    reviewedDate: input.reviewedDate,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  input.dropIds.forEach((id) => batch.set(optionDoc(uid, id), { status: 'dropped', updatedAt: serverTimestamp() }, { merge: true }));
  await batch.commit();
}

export function deletePeriod(uid: string, id: string): Promise<void> {
  return deleteDoc(periodDoc(uid, id));
}
