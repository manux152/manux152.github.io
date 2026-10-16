import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { TrText as Text } from './TrText';
import { trackSponsor, type Placement } from '../lib/clubops';
import { safeUrl } from './Logo';
import { useTheme } from '../lib/theme';
import { useColor } from './ui';

type Sponsor = { id: string; name: string; logo_url?: string | null; link_url?: string | null; tier?: string | null };

/**
 * Sponsors as a slide show: one partner per slide, swipe (or use the arrows / dots) to move on, and it advances by itself every few seconds.
 * Auto-play stops while someone is touching it, and never runs when "reduce motion" is on. Views are counted when a slide is shown.
 */
export function SponsorSlider({ list, placement, dark = false, intervalMs = 4000 }: { list: Sponsor[]; placement: Placement; dark?: boolean; intervalMs?: number }) {
  const { colors, prefs, fs } = useTheme(); const brand = useColor();
  const [w, setW] = useState(0); const [i, setI] = useState(0);
  const ref = useRef<ScrollView>(null); const paused = useRef(false); const resume = useRef<any>(null);
  const n = list.length;
  const go = (k: number, animated = true) => { const t = ((k % n) + n) % n; setI(t); ref.current?.scrollTo({ x: t * w, animated }); };
  useEffect(() => { if (n && list[Math.min(i, n - 1)]) trackSponsor(list[Math.min(i, n - 1)].id, placement, 'view'); }, [i, n]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (n < 2 || !w || prefs.reduceMotion) return;
    const t = setInterval(() => { if (!paused.current) go(i + 1); }, intervalMs);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, w, i, prefs.reduceMotion, intervalMs]);
  useEffect(() => { if (i >= n && n) setI(0); }, [n, i]);
  const hold = () => { paused.current = true; if (resume.current) clearTimeout(resume.current); resume.current = setTimeout(() => { paused.current = false; }, 6000); };
  const open = (id: string, url: string) => { trackSponsor(id, placement, 'click'); if (Platform.OS === 'web') (globalThis as any).open?.(url, '_blank', 'noopener,noreferrer'); else Linking.openURL(url); };
  if (!n) return null;
  const txt = dark ? '#fff' : colors.text; const arrow = dark ? 'rgba(255,255,255,0.8)' : colors.muted;
  return (
    <View accessibilityRole="none" accessibilityLabel={`${n} partner${n === 1 ? '' : 's'}`} style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {n > 1 && Platform.OS === 'web' ? <Pressable accessibilityRole="button" accessibilityLabel="Previous partner" onPress={() => { hold(); go(i - 1); }} style={{ width: 28, height: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: arrow, fontSize: fs(22) }}>‹</Text></Pressable> : null}
        <View style={{ flex: 1, overflow: 'hidden' }} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
          {w > 0 ? (
            <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
              onTouchStart={hold} onScrollBeginDrag={hold}
              onMomentumScrollEnd={(e) => { const k = Math.round(e.nativeEvent.contentOffset.x / w); if (k !== i) setI(Math.max(0, Math.min(n - 1, k))); }}>
              {list.map((s) => {
                const u = safeUrl(s.link_url); const logo = safeUrl(s.logo_url);
                const face = (
                  <View style={{ width: w - (n > 1 && Platform.OS === 'web' ? 0 : 0), alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 8 }}>
                    {logo ? <View style={{ backgroundColor: '#fff', borderRadius: 10, padding: 10 }}><Image source={{ uri: logo }} accessibilityLabel={s.name} style={{ width: Math.min(220, Math.max(120, w - 80)), height: 70 }} contentFit="contain" /></View> : null}
                    <Text style={{ color: txt, fontWeight: '800', fontSize: fs(logo ? 14 : 20), textAlign: 'center' }}>{s.name}</Text>
                  </View>);
                return u
                  ? <Pressable key={s.id} accessibilityRole="link" accessibilityLabel={`${s.name} (opens their website)`} onPress={() => open(s.id, u)} style={{ width: w }}>{face}</Pressable>
                  : <View key={s.id} style={{ width: w }}>{face}</View>;
              })}
            </ScrollView>
          ) : <View style={{ height: 100 }} />}
        </View>
        {n > 1 && Platform.OS === 'web' ? <Pressable accessibilityRole="button" accessibilityLabel="Next partner" onPress={() => { hold(); go(i + 1); }} style={{ width: 28, height: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: arrow, fontSize: fs(22) }}>›</Text></Pressable> : null}
      </View>
      {n > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 4 }}>
          {list.map((s, k) => (
            <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Show partner ${k + 1} of ${n}`} accessibilityState={{ selected: k === i }} onPress={() => { hold(); go(k); }} style={{ padding: 8 }}>
              <View style={{ width: k === i ? 18 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? brand : (dark ? 'rgba(255,255,255,0.4)' : colors.border) }} />
            </Pressable>))}
        </View>) : null}
    </View>
  );
}
