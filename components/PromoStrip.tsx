import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { TrText as Text } from './TrText';
import { Link } from 'expo-router';
import { useApp } from '../lib/app-context';
import { useTable } from '../lib/useQuery';
import { useTheme, readableOn } from '../lib/theme';
import { NavLook } from '../lib/navTheme';

const pad = (n: number) => String(n).padStart(2, '0');
export const countdown = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); return `${d > 0 ? d + 'd ' : ''}${pad(h)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };

type Item = { id: string; text: string; href: string; ends?: number };

/** Thin strip above the menu with running offers (and the spin wheel). Taps lead to the shop / wheel. */
export function PromoStrip({ look, gutter, maxWidth }: { look: NavLook; gutter: number; maxWidth: number }) {
  const { settings } = useApp(); const { prefs } = useTheme();
  const promos = useTable('promotions', (q) => q.eq('show_banner', true).order('created_at', { ascending: false }));
  const [i, setI] = useState(0); const [now, setNow] = useState(Date.now()); const [hidden, setHidden] = useState(false);
  const shopOn = settings.shop_enabled !== false; const spinOn = settings.spin_enabled !== false && settings.spin_enabled !== 'false';
  const items: Item[] = [
    ...(promos.data as any[]).filter((p) => (!p.starts_at || new Date(p.starts_at).getTime() <= now) && (!p.ends_at || new Date(p.ends_at).getTime() > now))
      .map((p) => ({ id: p.id, text: [p.title, p.message].filter(Boolean).join(' — '), href: '/shop', ends: p.ends_at ? new Date(p.ends_at).getTime() : undefined })),
    ...(spinOn ? [{ id: 'spin', text: '🎡 Spin the wheel for a chance to win a discount', href: '/spin' }] : []),
  ];
  const cur = items.length ? items[i % items.length] : null;
  const soon = !!cur?.ends && cur.ends - now < 72 * 3600 * 1000;
  useEffect(() => { if (!soon) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [soon, i]);
  useEffect(() => { if (items.length < 2 || prefs.reduceMotion) return; const t = setInterval(() => setI((x) => x + 1), 6500); return () => clearInterval(t); }, [items.length, prefs.reduceMotion]);
  if (!shopOn || hidden || !cur) return null;
  const bg = look.accent; const fg = readableOn(bg);
  return (
    <View style={{ backgroundColor: bg }}>
      <View style={{ width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: gutter, flexDirection: 'row', alignItems: 'center', minHeight: 36 }}>
        <Link href={cur.href as any} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={cur.text} style={{ flex: 1, paddingVertical: 8 }}>
            <Text numberOfLines={2} style={{ color: fg, fontWeight: '700', fontSize: 13, textAlign: 'center' }}>
              {cur.text}{soon && cur.ends ? `  ·  ends in ${countdown(cur.ends - now)}` : ''}
            </Text>
          </Pressable>
        </Link>
        {items.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel="Next offer" onPress={() => setI((x) => x + 1)} style={{ padding: 8 }}><Text style={{ color: fg, fontWeight: '800' }}>›</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Hide offers" onPress={() => setHidden(true)} style={{ padding: 8 }}><Text style={{ color: fg, fontWeight: '800' }}>✕</Text></Pressable>
      </View>
    </View>
  );
}
