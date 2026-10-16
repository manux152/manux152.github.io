import { View } from 'react-native';
import { T } from './ui';
import type { Badge } from '../lib/development';

/** Small pills such as "🔥 10 goals". Training badges are only returned to staff and to the player, so they never reach other viewers. */
export function BadgeRow({ badges }: { badges: Badge[] }) {
  if (!badges.length) return null;
  return (
    <View accessibilityRole="list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {badges.map((b) => (
        <View key={b.key} accessible accessibilityLabel={`${b.label}. ${b.detail}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#C9CED6', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
          <T style={{ fontSize: 16 }}>{b.icon}</T><T style={{ fontWeight: '700', fontSize: 13 }}>{b.label}</T>
        </View>))}
    </View>
  );
}
