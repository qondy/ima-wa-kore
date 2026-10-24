import { addDays, parseKey } from './dates';
import { Period } from './types';

/** 期間の最終日 */
export const periodEnd = (p: Period): string => addDays(p.startDate, p.days - 1);

/** 開始日から数えて何日目か（開始日=1） */
export function dayNumber(p: Period, today: string): number {
  const diff = Math.round((parseKey(today).getTime() - parseKey(p.startDate).getTime()) / 86400000);
  return diff + 1;
}

export const isOver = (p: Period, today: string): boolean => today > periodEnd(p);

/** 期間内のすべての日付 */
export function periodDates(p: Period): string[] {
  return Array.from({ length: p.days }, (_, i) => addDays(p.startDate, i));
}

/** 評価の対象になる日数（進行中なら今日まで、終わっていれば期間全体） */
export function elapsedDays(p: Period, today: string): number {
  return Math.min(Math.max(dayNumber(p, today), 0), p.days);
}

/** その候補に手をつけた日数 */
export function doneDays(p: Period, optionId: string): number {
  let n = 0;
  p.checks.forEach((ids, date) => {
    if (date >= p.startDate && date <= periodEnd(p) && ids.has(optionId)) n++;
  });
  return n;
}

/** 達成率（%）。見直し済みの期間は見直した日まで（途中で見直した場合も含む）を分母にする */
export function rate(p: Period, optionId: string, today: string): number {
  const base = p.status === 'reviewed' ? elapsedDays(p, p.reviewedDate ?? periodEnd(p)) : elapsedDays(p, today);
  if (base <= 0) return 0;
  return Math.round((doneDays(p, optionId) / base) * 100);
}

/** 期間全体の平均達成率 */
export function periodRate(p: Period, today: string): number {
  if (!p.focus.length) return 0;
  const sum = p.focus.reduce((s, f) => s + rate(p, f.id, today), 0);
  return Math.round(sum / p.focus.length);
}

export function shortLabel(key: string): string {
  const d = parseKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
