import { View } from 'react-native';
import { T } from './ui';

export const WIN = '#2E9E5B', DRAW = '#2F7FD8', LOSS = '#D64545';

export function PredictionBar({ p, compact }: { p: any; compact?: boolean }) {
  const seg = (flex: number, color: string) => <View style={{ flex: Math.max(flex, 0), backgroundColor: color }} />;
  const leg = (label: string, pct: number, color: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <T style={{ fontSize: 13, fontWeight: '700' }}>{label} {pct}%</T>
    </View>
  );
  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      <View style={{ flexDirection: 'row', height: compact ? 10 : 16, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E6E8EC' }}>
        {seg(p.win_pct, WIN)}{seg(p.draw_pct, DRAW)}{seg(p.loss_pct, LOSS)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        {leg('Win', p.win_pct, WIN)}{leg('Draw', p.draw_pct, DRAW)}{leg('Loss', p.loss_pct, LOSS)}
      </View>
    </View>
  );
}
