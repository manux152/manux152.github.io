import { useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import { TrText as Text } from './TrText';
import { Image } from 'expo-image';

export type Slot = { key: string; label: string; x: number; y: number };
export type SlotInfo = { name?: string; photo?: string | null; number?: number | null; warn?: boolean; captain?: 'C' | 'VC' | null; yellow?: number; red?: boolean };

type TokenProps = {
  slot: Slot; info?: SlotInfo; active: boolean; size: number; showRole: boolean; mode: 'static' | 'tap' | 'drag';
  onPress?: () => void; onDrop?: (dx: number, dy: number) => void;
};
function Token({ slot, info, active, size, showRole, mode, onPress, onDrop }: TokenProps) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const latest = useRef(({ mode, onPress, onDrop } as Pick<TokenProps, 'mode' | 'onPress' | 'onDrop'>)); latest.current = { mode, onPress, onDrop };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => latest.current.mode !== 'static',
    onMoveShouldSetPanResponder: () => latest.current.mode === 'drag',
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_e, g) => { if (latest.current.mode === 'drag' && Math.hypot(g.dx, g.dy) > 6) setDrag({ dx: g.dx, dy: g.dy }); },
    onPanResponderRelease: (_e, g) => { setDrag(null); if (Math.hypot(g.dx, g.dy) > 10 && latest.current.mode === 'drag') latest.current.onDrop?.(g.dx, g.dy); else latest.current.onPress?.(); },
    onPanResponderTerminate: () => setDrag(null),
  })).current;

  const filled = !!info?.name;
  const circle = (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: filled ? '#fff' : 'rgba(255,255,255,0.25)', borderWidth: active ? 3 : 2,
      borderColor: active ? '#FFD400' : info?.warn ? '#D64545' : '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {info?.photo ? <Image source={{ uri: info.photo }} style={{ width: size, height: size }} contentFit="cover" accessibilityLabel={info.name ?? ''} />
        : <Text style={{ fontWeight: '800', color: filled ? '#0B6E4F' : '#fff', fontSize: Math.max(11, size * 0.28) }}>{info?.number != null ? info.number : slot.label}</Text>}
    </View>
  );
  const badges = (
    <>
      {info?.captain ? (
        <View accessibilityLabel={info.captain === 'C' ? 'Captain' : 'Vice-captain'} style={{ position: 'absolute', left: -2, bottom: -2, backgroundColor: '#FFD400', borderRadius: 4, borderWidth: 1, borderColor: '#000', paddingHorizontal: 4, minWidth: 18, alignItems: 'center' }}>
          <Text style={{ color: '#000', fontWeight: '900', fontSize: Math.max(9, size * 0.24) }}>{info.captain}</Text>
        </View>) : null}
      {info?.red ? <View accessibilityLabel="Red card" style={{ position: 'absolute', right: 0, top: -2, width: 10, height: 14, borderRadius: 2, backgroundColor: '#D64545', borderWidth: 1, borderColor: '#fff' }} />
        : info?.yellow ? <View accessibilityLabel="Yellow card" style={{ position: 'absolute', right: 0, top: -2, width: 10, height: 14, borderRadius: 2, backgroundColor: '#FFD400', borderWidth: 1, borderColor: '#fff' }} /> : null}
    </>
  );
  const label = (
    <>
      <Text numberOfLines={1} style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2, textShadowColor: '#0008', textShadowRadius: 3, maxWidth: 76 }}>{info?.name ?? slot.label}</Text>
      {showRole && filled ? <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 6, marginTop: 1 }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{slot.label}</Text></View> : null}
    </>
  );
  const circleWithBadges = <View style={{ width: size, height: size }}>{circle}{badges}</View>;
  const pos: any = { position: 'absolute', left: `${slot.x}%`, top: `${slot.y}%`, width: 80, marginLeft: -40, marginTop: -size / 2 - 4, alignItems: 'center', zIndex: drag || active ? 10 : 1,
    ...(drag ? { transform: [{ translateX: drag.dx }, { translateY: drag.dy }], opacity: 0.92 } : {}) };
  if (mode === 'static') return <View pointerEvents="none" style={pos} accessible accessibilityLabel={`${info?.name ?? 'Empty'}, ${slot.label}`}>{circleWithBadges}{label}</View>;
  return (
    <View {...pan.panHandlers} accessible accessibilityRole="button" accessibilityLabel={`${slot.label}: ${info?.name ?? 'empty'}`} style={[pos, mode === 'drag' ? ({ touchAction: 'none', cursor: 'grab' } as any) : null]}>
      {circleWithBadges}{label}
    </View>
  );
}

// Football pitch with players placed by percentage coordinates (y = 0 opponent goal, 100 own goal).
// No handlers = a read-only display. onPress = tap to choose. onSwap = players can also be dragged onto another spot.
export function Pitch({ positions, info = {}, active, onPress, onSwap, width = '100%', tokenSize = 44, showRole = false }: {
  positions: Slot[]; info?: Record<string, SlotInfo>; active?: string | null; onPress?: (key: string) => void; onSwap?: (from: string, to: string) => void; width?: any; tokenSize?: number; showRole?: boolean }) {
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const line = { position: 'absolute' as const, borderColor: 'rgba(255,255,255,0.55)', borderWidth: 2 };
  const mode: 'static' | 'tap' | 'drag' = onSwap ? 'drag' : onPress ? 'tap' : 'static';
  const drop = (from: Slot, dx: number, dy: number) => {
    if (!onSwap || !box.w) return;
    const cx = (from.x / 100) * box.w + dx, cy = (from.y / 100) * box.h + dy;
    let best: Slot | null = null, bd = Math.max(40, tokenSize);
    for (const s of positions) { if (s.key === from.key) continue; const d = Math.hypot((s.x / 100) * box.w - cx, (s.y / 100) * box.h - cy); if (d < bd) { bd = d; best = s; } }
    if (best) onSwap(from.key, best.key);
  };
  return (
    <View onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={{ width, aspectRatio: 0.72, backgroundColor: '#2E8B57', borderRadius: 12, overflow: 'hidden', alignSelf: 'center', maxWidth: 420 }}>
      <View style={{ ...line, left: 8, right: 8, top: 8, bottom: 8 }} />
      <View style={{ ...line, left: 8, right: 8, top: '50%', borderWidth: 0, borderTopWidth: 2 }} />
      <View style={{ ...line, left: '35%', right: '35%', top: '42%', height: '16%', borderRadius: 999 }} />
      <View style={{ ...line, left: '25%', right: '25%', top: 8, height: '14%', borderTopWidth: 0 }} />
      <View style={{ ...line, left: '25%', right: '25%', bottom: 8, height: '14%', borderBottomWidth: 0 }} />
      {positions.map((p) => (
        <Token key={p.key} slot={p} info={info[p.key]} active={active === p.key} size={tokenSize} showRole={showRole} mode={mode}
          onPress={() => onPress?.(p.key)} onDrop={(dx, dy) => drop(p, dx, dy)} />
      ))}
    </View>
  );
}
