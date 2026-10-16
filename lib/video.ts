export const TAGS = [
  { value: 'goal', label: 'Goal', icon: '⚽' }, { value: 'chance', label: 'Chance', icon: '❗' }, { value: 'save', label: 'Save (goalkeeper)', icon: '🧤' },
  { value: 'tackle', label: 'Tackle', icon: '🛡️' }, { value: 'assist', label: 'Assist', icon: '🎯' }, { value: 'skill', label: 'Skill', icon: '✨' },
  { value: 'card', label: 'Card', icon: '🟨' }, { value: 'mistake', label: 'Mistake', icon: '🔎' }, { value: 'other', label: 'Other', icon: '🎬' },
];
export const tagIcon = (t: string) => TAGS.find((x) => x.value === t)?.icon ?? '🎬';
export const tagLabel = (t: string) => TAGS.find((x) => x.value === t)?.label ?? t;
export const fmtClock = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.floor(s % 60); return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`; };
/** "83", "1:23" or "1:02:03" → seconds (null if it is not a time). */
export function parseClock(v: string): number | null {
  const p = v.trim().split(':'); if (p.length > 3 || p.some((x) => !/^\d{1,5}$/.test(x))) return null;
  const n = p.map(Number); const s = n.length === 1 ? n[0] : n.length === 2 ? n[0] * 60 + n[1] : n[0] * 3600 + n[1] * 60 + n[2];
  return s >= 0 && s <= 21600 ? s : null;
}
