import { View } from 'react-native';
import { T } from './ui';

export function BarList({ rows, color = '#0B6E4F', suffix = '' }: { rows: { label: string; value: number; sub?: string }[]; color?: string; suffix?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T style={{ fontWeight: '600' }}>{r.label}</T><T style={{ fontWeight: '800' }}>{r.value}{suffix}</T></View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: '#E6E8EC', overflow: 'hidden' }}><View style={{ width: `${(r.value / max) * 100}%`, height: 8, backgroundColor: color }} /></View>
          {r.sub ? <T muted style={{ fontSize: 12 }}>{r.sub}</T> : null}
        </View>
      ))}
    </View>
  );
}
