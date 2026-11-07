import { ScoreKey, Scores, Decision, SlotTime, SlotResult } from './types';

export const CATEGORIES = ['仕事', '学び', '健康', 'お金', '趣味', '暮らし', '人間関係', 'その他'];

export interface ScoreAxis {
  key: ScoreKey;
  label: string;
  desc: string;
}

export const SCORE_AXES: ScoreAxis[] = [
  { key: 'importance', label: '大事さ', desc: '自分にとって大事なことか' },
  { key: 'urgency', label: '期限の近さ', desc: 'いまやらないと困ることか' },
  { key: 'excitement', label: 'ワクワク', desc: '考えるとやる気が出るか' },
  { key: 'impact', label: '効果の大きさ', desc: 'やると他のことも変わる・ラクになるか' },
  { key: 'fit', label: 'いまの自分に合う', desc: '時間・体力・お金の面で、いま取り組めるか' },
];

export const SCORE_MAX = SCORE_AXES.length * 5;

export const defaultScores = (): Scores => ({
  importance: 3, urgency: 3, excitement: 3, impact: 3, fit: 3,
});

export const totalScore = (s: Scores): number =>
  SCORE_AXES.reduce((sum, a) => sum + s[a.key], 0);

export const PERIOD_OPTIONS: { days: number; label: string }[] = [
  { days: 7, label: '1週間' },
  { days: 14, label: '2週間' },
  { days: 30, label: '1か月' },
];

export const MAX_FOCUS = 3;

export const DECISION_LABEL: Record<Decision, string> = {
  continue: '続ける',
  swap: '入れ替える',
  stop: 'やめる',
};

export const DECISION_DESC: Record<Decision, string> = {
  continue: '次の期間も集中する',
  swap: 'いったん候補に戻す',
  stop: 'もう追いかけない',
};

/** 思いつかないときのヒント */
export const HINTS = [
  '資格の勉強', '副業を始める', '運動習慣', '部屋の片づけ', '英語の勉強',
  '読書', '家計の見直し', '転職の準備', 'ブログ・発信', '睡眠を整える',
  '新しいスキルを学ぶ', '家族との時間', '趣味の作品づくり', '人脈づくり',
];

export const SLOT_TIMES: { key: SlotTime; label: string }[] = [
  { key: 'morning', label: '朝' },
  { key: 'noon', label: '昼' },
  { key: 'evening', label: '夕方' },
  { key: 'night', label: '夜' },
  { key: 'allday', label: 'まる1日' },
];

export const SLOT_RESULT_LABEL: Record<SlotResult, string> = {
  kept: '空けておけた',
  filled: '予定が入った',
};

/** 空きスロットに入ってきたことの例（入力のヒント） */
export const FOUND_EXAMPLES = [
  'ふらっと本屋に寄った', '昔の友だちから連絡がきた', 'ぼーっとしていたら案を思いついた', '近所を散歩して新しい店を見つけた',
];

/** 保留がこの件数以上たまったら、リセットをすすめる */
export const RESET_SUGGEST_COUNT = 5;
