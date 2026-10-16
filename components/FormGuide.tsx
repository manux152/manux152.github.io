import { View } from 'react-native';
import { T, Card, useColor } from './ui';
import { result, type FormRow } from '../lib/development';

const RES: Record<string, string> = { W: '#2E9E5B', D: '#2F7FD8', L: '#D64545' };

/** Last matches at a glance: W/D/L chips, then goals and assists per match as small bars. Uses public results only. */
export function FormGuide({ rows }: { rows: FormRow[] }) {
  const c = useColor();
  if (!rows.length) return null;
  const ordered = [...rows].reverse();                        // oldest → newest, left → right
  const max = Math.max(1, ...ordered.map((r) => r.goals + r.assists));
  const g = rows.reduce((a, r) => a + r.goals, 0), a = rows.reduce((x, r) => x + r.assists, 0);
  return (
    <Card>
      <T style={{ fontWeight: '800', fontSize: 17 }}>Form · last {rows.length} {rows.length === 1 ? 'match' : 'matches'}</T>
      <T muted>{g} goal{g === 1 ? '' : 's'} · {a} assist{a === 1 ? '' : 's'}</T>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end', marginTop: 6 }}>
        {ordered.map((r) => (
          <View key={r.match_id} accessible accessibilityLabel={`${r.opponent}: ${r.goals} goals, ${r.assists} assists${r.motm ? ', Man of the Match' : ''}`} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={{ height: 52, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
              <View style={{ width: '60%', height: Math.max(3, ((r.goals + r.assists) / max) * 52), backgroundColor: r.goals + r.assists ? c : '#E6E8EC', borderRadius: 4 }} />
            </View>
            <View style={{ backgroundColor: RES[result(r)] ?? '#999', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}><T style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{result(r) || '–'}</T></View>
            {r.motm ? <T style={{ fontSize: 11 }}>⭐</T> : null}
          </View>))}
      </View>
    </Card>
  );
}
