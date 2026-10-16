import { Pressable, View } from 'react-native';
import { T } from './ui';
import { ColorGroup } from '../lib/shop';
import { useTheme } from '../lib/theme';
import { useAccent } from './ui';

/** Grid of colour swatches: one tap picks a colour. Sold-out colours are crossed out. */
export function ColorGrid({ groups, selected, onSelect, size = 48 }: { groups: ColorGroup[]; selected: string | null; onSelect: (key: string) => void; size?: number }) {
  const { colors } = useTheme(); const accent = useAccent();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {groups.map((g) => {
        const on = selected === g.key;
        return (
          <Pressable key={g.key} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${g.name}${g.sold ? ', sold out' : ''}`} onPress={() => onSelect(g.key)} style={{ width: size + 12, alignItems: 'center', gap: 4 }}>
            <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: g.hex, borderWidth: on ? 4 : 1, borderColor: on ? accent : colors.border, overflow: 'hidden', opacity: g.sold ? 0.5 : 1, alignItems: 'center', justifyContent: 'center' }}>
              {on ? <T style={{ color: '#fff', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 3 } as any}>✓</T> : null}
              {g.sold ? <View style={{ position: 'absolute', width: size * 1.5, height: 2, backgroundColor: '#D64545', transform: [{ rotate: '-45deg' }] }} /> : null}
            </View>
            <T style={{ fontSize: 12, fontWeight: on ? '800' : '500', textAlign: 'center' }} numberOfLines={2}>{g.name}</T>
          </Pressable>
        );
      })}
    </View>
  );
}
