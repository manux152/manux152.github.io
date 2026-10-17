import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TrText as Text } from './TrText';
import { Btn } from './ui';
import { useApp } from '../lib/app-context';
import { useTheme } from '../lib/theme';
import { acceptAll, closeCookieSettings, isCrawler, rejectOptional, saveConsent, useConsent, type Choice } from '../lib/consent';

const CATS: { key: keyof Choice | 'necessary'; title: string; text: string }[] = [
  { key: 'necessary', title: 'Strictly necessary', text: 'Keep you signed in, hold your cart and remember these choices. The Service cannot work without them.' },
  { key: 'preferences', title: 'Preferences', text: 'Remember your language, theme, text size and accessibility settings between visits.' },
  { key: 'analytics', title: 'Analytics', text: 'Anonymous page counts and advert views and clicks, so the club can see what works. Nothing that identifies you.' },
  { key: 'marketing', title: 'Marketing', text: 'Would allow third-party advertising tools. None are used today; if added, they only run with your permission.' },
];

/** Cookie choices. Shown on every visit (Admin can change this) and any time from "Cookie settings". Optional cookies stay off until chosen. */
export function CookieBanner() {
  const { loaded, saved, decidedThisVisit, panelOpen } = useConsent();
  const { settings } = useApp(); const { colors, fs, isDark } = useTheme(); const router = useRouter();
  const [manage, setManage] = useState(false);
  const [c, setC] = useState<Choice>({ preferences: false, analytics: false, marketing: false });
  useEffect(() => { if (saved) setC({ preferences: saved.preferences, analytics: saved.analytics, marketing: saved.marketing }); }, [saved?.at]);   // eslint-disable-line
  useEffect(() => { if (panelOpen) setManage(true); }, [panelOpen]);
  const every = settings.consent_every_visit !== false && settings.consent_every_visit !== 'false';
  const visible = loaded && !isCrawler() && (panelOpen || (!decidedThisVisit && (every || !saved)));
  if (!visible) return null;
  const color = settings.primary_color ?? '#0B6E4F';
  const read = (slug: string) => { closeCookieSettings(); router.push(`/legal/${slug}` as any); };
  const link = (label: string, slug: string) => <Pressable accessibilityRole="link" onPress={() => read(slug)}><Text style={{ color, fontWeight: '700', fontSize: fs(13), textDecorationLine: 'underline' }}>{label}</Text></Pressable>;

  return (
    <View pointerEvents="box-none" style={{ position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', padding: 12, zIndex: 9999 }}>
      <View accessibilityRole={'alert' as any} accessibilityLabel="Cookie choices" style={{ width: '100%', maxWidth: 720, maxHeight: '88%' as any, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12, shadowColor: '#000', shadowOpacity: isDark ? 0.5 : 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12 }}>
        <ScrollView bounces={false} contentContainerStyle={{ gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: colors.heading, fontSize: fs(18), fontWeight: '800' }}>Your privacy choices</Text>
          <Text style={{ color: colors.text, fontSize: fs(14), lineHeight: fs(21) }}>We use cookies and similar technologies. Strictly necessary ones are always on. You decide whether we use the others. You can change your mind at any time.</Text>
          {manage ? (
            <View style={{ gap: 10 }}>
              {CATS.map((k) => {
                const locked = k.key === 'necessary'; const on = locked ? true : c[k.key as keyof Choice];
                return (
                  <View key={k.key} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: colors.heading, fontWeight: '700', fontSize: fs(14) }}>{k.title}{locked ? '  ·  Always on' : ''}</Text>
                      <Text style={{ color: colors.muted, fontSize: fs(13), lineHeight: fs(19) }}>{k.text}</Text>
                    </View>
                    <Switch value={on} disabled={locked} accessibilityLabel={k.title} onValueChange={(v) => setC((cur) => ({ ...cur, [k.key]: v }))} trackColor={{ true: color, false: colors.border }} />
                  </View>);
              })}
            </View>) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{link('Cookie Policy', 'cookies')}{link('Privacy Policy', 'privacy')}</View>
          <View style={{ gap: 8 }}>
            {manage
              ? <><Btn title="Save my choices" onPress={() => saveConsent(c, 'custom')} /><Btn title="Accept all" kind="ghost" onPress={acceptAll} /></>
              : <><Btn title="Accept all" onPress={acceptAll} /><Btn title="Reject optional cookies" kind="ghost" onPress={rejectOptional} /><Btn title="Choose settings" kind="ghost" onPress={() => setManage(true)} /></>}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
