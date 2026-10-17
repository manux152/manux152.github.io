import { Pressable, View } from 'react-native';
import { TrText as Text } from './TrText';
import { useNavArrows } from '../lib/navHistory';

/** ← appears once there is a page to go back to; → appears after going back. Hidden otherwise. */
export function NavArrows({ color, size = 24 }: { color: string; size?: number }) {
  const { canBack, canForward, back, forward } = useNavArrows();
  if (!canBack && !canForward) return null;
  const btn = (label: string, glyph: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}
      style={(st: any) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: st.pressed || st.hovered ? 'rgba(255,255,255,0.18)' : 'transparent' })}>
      <Text style={{ color, fontSize: size, fontWeight: '700', lineHeight: size + 4 }}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
      {canBack ? btn('Go back', '←', back) : null}
      {canForward ? btn('Go forward', '→', forward) : null}
    </View>
  );
}
