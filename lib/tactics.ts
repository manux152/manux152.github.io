export type Tactics = { style?: string; line?: string; width?: string; tempo?: string; press?: string; instructions?: string };
export const TACTIC_OPTIONS: { key: keyof Tactics; label: string; options: { value: string; label: string }[] }[] = [
  { key: 'style', label: 'Style of play', options: ['Possession', 'Counter-attack', 'High press', 'Direct', 'Balanced'].map((v) => ({ value: v, label: v })) },
  { key: 'line', label: 'Defensive line', options: ['Low', 'Medium', 'High'].map((v) => ({ value: v, label: v })) },
  { key: 'width', label: 'Width', options: ['Narrow', 'Balanced', 'Wide'].map((v) => ({ value: v, label: v })) },
  { key: 'tempo', label: 'Tempo', options: ['Slow', 'Steady', 'Fast'].map((v) => ({ value: v, label: v })) },
  { key: 'press', label: 'Pressing', options: ['Low', 'Medium', 'High'].map((v) => ({ value: v, label: v })) },
];
/** Which natural positions suit each pitch spot, best first (used by "Auto-fill"). */
const SUITS: Record<string, string[]> = {
  GK: ['Goalkeeper'], CB: ['Defender'], LB: ['Defender'], RB: ['Defender'], LWB: ['Defender', 'Midfielder'], RWB: ['Defender', 'Midfielder'],
  DM: ['Midfielder', 'Defender'], CM: ['Midfielder'], AM: ['Midfielder', 'Forward'], LM: ['Midfielder', 'Forward'], RM: ['Midfielder', 'Forward'],
  LW: ['Forward', 'Midfielder'], RW: ['Forward', 'Midfielder'], ST: ['Forward', 'Midfielder'],
};
export function autoFill(slots: { key: string; label: string }[], players: { id: string; positions?: { name?: string } | null; shirt_number?: number | null }[], current: Record<string, string>) {
  const next = { ...current }; const used = new Set(Object.values(next));
  const pool = [...players].sort((a, b) => (a.shirt_number ?? 999) - (b.shirt_number ?? 999));
  for (const s of slots) {
    if (next[s.key]) continue;
    for (const nat of SUITS[s.label] ?? ['Midfielder']) {
      const p = pool.find((x) => !used.has(x.id) && x.positions?.name === nat);
      if (p) { next[s.key] = p.id; used.add(p.id); break; }
    }
  }
  return next;
}
export const tacticChips = (t?: Tactics | null) => TACTIC_OPTIONS.filter((o) => t?.[o.key]).map((o) => ({ label: o.label, value: String(t![o.key]) }));
