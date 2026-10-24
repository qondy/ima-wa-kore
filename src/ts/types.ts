/** pool=候補 / hold=いまはやらない（保留） / dropped=やめた */
export type OptionStatus = 'pool' | 'hold' | 'dropped';

/** 集中先を選ぶための5つの観点 */
export type ScoreKey = 'importance' | 'urgency' | 'excitement' | 'impact' | 'fit';

export type Scores = Record<ScoreKey, number>;

/** users/{uid}/options/{id} */
export interface FocusOption {
  id: string;
  title: string;
  category: string;
  memo: string;
  status: OptionStatus;
  /** 各観点 1〜5 */
  scores: Scores;
  createdAt: number;
}

/** continue=続ける / swap=入れ替える（候補に戻す） / stop=やめる */
export type Decision = 'continue' | 'swap' | 'stop';

export interface FocusRef {
  id: string;
  /** 期間を始めた時点のタイトル（候補を削除しても履歴に残すため） */
  title: string;
}

/** users/{uid}/periods/{id} */
export interface Period {
  id: string;
  /** 開始日 YYYY-MM-DD */
  startDate: string;
  /** 期間の日数 */
  days: number;
  focus: FocusRef[];
  /** 日付 YYYY-MM-DD → 手をつけた候補IDの集合 */
  checks: Map<string, Set<string>>;
  /** 保留にした候補のタイトル（手放したことを見える形で残す） */
  heldTitles: string[];
  status: 'active' | 'reviewed';
  decisions: Partial<Record<string, Decision>>;
  note: string;
  reviewedDate: string | null;
  createdAt: number;
}
