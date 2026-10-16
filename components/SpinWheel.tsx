import { Animated, View } from 'react-native';
import { TrText as Text } from './TrText';
import { readableOn } from '../lib/theme';

export type WheelSegment = { label: string; color: string };

/** The wheel itself, drawn with plain views (no extra libraries). Slices are equal in size; the odds are set on the server. */
export function SpinWheel({ segments, size, rotation }: { segments: WheelSegment[]; size: number; rotation: Animated.AnimatedInterpolation<string> | string }) {
  const n = Math.max(3, segments.length); const R = size / 2; const step = 360 / n; const hb = R * Math.tan(Math.PI / n);
  return (
    <View accessible accessibilityLabel={`Prize wheel with ${segments.length} segments: ${segments.map((s) => s.label).join(', ')}`} style={{ width: size + 24, alignItems: 'center' }}>
      {/* pointer */}
      <View style={{ zIndex: 5, width: 0, height: 0, borderLeftWidth: 14, borderRightWidth: 14, borderTopWidth: 26, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FFD400', marginBottom: -14 }} />
      <Animated.View style={{ width: size, height: size, borderRadius: R, overflow: 'hidden', borderWidth: 6, borderColor: '#1B1F24', backgroundColor: '#1B1F24', transform: [{ rotate: rotation as any }] }}>
        <View style={{ width: size - 12, height: size - 12 }}>
          {segments.map((s, i) => {
            const r = (size - 12) / 2; const h = r * Math.tan(Math.PI / n);
            return (
              <View key={i} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size - 12, height: size - 12, transform: [{ rotate: `${i * step + step / 2}deg` }] }}>
                <View style={{ position: 'absolute', left: r - h, top: 0, width: 0, height: 0, borderLeftWidth: h, borderRightWidth: h, borderTopWidth: r, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: s.color }} />
                <View style={{ position: 'absolute', left: r - 46, top: r * 0.1, width: 92, alignItems: 'center' }}>
                  <Text numberOfLines={2} style={{ color: readableOn(s.color), fontWeight: '800', fontSize: Math.max(10, Math.min(15, size / 24)), textAlign: 'center' }}>{s.label}</Text>
                </View>
              </View>
            );
          })}
          <View style={{ position: 'absolute', left: (size - 12) / 2 - 16, top: (size - 12) / 2 - 16, width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', borderWidth: 4, borderColor: '#1B1F24' }} />
        </View>
      </Animated.View>
    </View>
  );
}
