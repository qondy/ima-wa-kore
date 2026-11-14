import { Period, Decision } from './types';
import { doneDays, elapsedDays, periodEnd } from './stats';

/** これまでに集中したこと（候補ごとにまとめたもの） */
export interface JourneyItem {
  id: string;
  /** 最初に集中したときのタイトル */
  title: string;
  /** 初めて集中した日 */
  firstStart: string;
  /** 最後に集中した期間の最終日 */
  lastEnd: string;
  /** 集中した期間の数 */
  periods: number;
  /** 手をつけた日の合計 */
  done: number;
  /** 対象になった日数の合計 */
  days: number;
  /** いまの期間で集中中か */
  active: boolean;
  /** 最後の見直しで決めたこと（見直し前なら null） */
  lastDecision: Decision | null;
}

const baseDays = (p: Period, today: string): number =>
  (p.status === 'reviewed' ? elapsedDays(p, p.reviewedDate ?? periodEnd(p)) : elapsedDays(p, today));

/** 古い順に並べた期間 */
export const chronological = (periods: Period[]): Period[] =>
  [...periods].sort((a, b) => (a.startDate === b.startDate ? a.createdAt - b.createdAt : a.startDate.localeCompare(b.startDate)));

/** 期間をまたいで、集中したことを候補ごとにまとめる（初めて集中した順） */
export function buildJourney(periods: Period[], today: string): JourneyItem[] {
  const map = new Map<string, JourneyItem>();
  chronological(periods).forEach((p) => {
    const base = Math.max(baseDays(p, today), 0);
    p.focus.forEach((f) => {
      let item = map.get(f.id);
      if (!item) {
        item = {
          id: f.id, title: f.title, firstStart: p.startDate, lastEnd: periodEnd(p),
          periods: 0, done: 0, days: 0, active: false, lastDecision: null,
        };
        map.set(f.id, item);
      }
      item.periods += 1;
      item.done += doneDays(p, f.id);
      item.days += base;
      item.lastEnd = periodEnd(p);
      if (p.status === 'active') {
        item.active = true;
      } else {
        item.active = false;
        item.lastDecision = p.decisions[f.id] ?? null;
      }
    });
  });
  return [...map.values()];
}

/** 期間の日数（開始日と最終日を含む） */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}
