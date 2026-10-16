import { View } from 'react-native';
import { T, useColor } from './ui';

export function StandingsTable({ rows, compact }: { rows: any[]; compact?: boolean }) {
  const color = useColor();
  const cols: [string, string, number][] = compact ? [['P', 'played', 28], ['Pts', 'points', 34]]
    : [['P', 'played', 26], ['W', 'won', 24], ['D', 'drawn', 24], ['L', 'lost', 24], ['GD', 'goal_diff', 32], ['Pts', 'points', 34]];
  return (
    <View>
      <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderColor: '#8884' }}>
        <T muted style={{ width: 26, fontSize: 12 }}>#</T><T muted style={{ flex: 1, fontSize: 12 }}>Team</T>
        {cols.map(([h, , w]) => <T key={h} muted style={{ width: w, textAlign: 'center', fontSize: 12 }}>{h}</T>)}
      </View>
      {rows.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', paddingVertical: 7, alignItems: 'center', backgroundColor: r.is_own_team ? color + '1F' : 'transparent', borderRadius: 6 }}>
          <T style={{ width: 26, fontSize: 13, fontWeight: '700' }}>{r.position}</T>
          <T style={{ flex: 1, fontSize: 14, fontWeight: r.is_own_team ? '800' : '500' }}>{r.team_name}</T>
          {cols.map(([h, k, w]) => <T key={h} style={{ width: w, textAlign: 'center', fontSize: 13, fontWeight: k === 'points' ? '800' : '400' }}>{r[k]}</T>)}
        </View>
      ))}
    </View>
  );
}
