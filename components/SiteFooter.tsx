import { Linking, Pressable, View, useWindowDimensions } from 'react-native';
import { TrText as Text } from './TrText';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useApp } from '../lib/app-context';
import { useTheme } from '../lib/theme';
import { Logo, safeUrl } from './Logo';
import { SponsorSlider } from './SponsorSlider';
import { AdSlot } from './AdSlot';

const safe = (u?: string | null) => (u && /^(https?:\/\/|mailto:|tel:)/i.test(u) ? u : null);
const SOCIAL_ICON: Record<string, string> = { instagram: '📸', facebook: '👍', twitter: '🐦', x: '✖', youtube: '▶', tiktok: '🎵', whatsapp: '💬', linkedin: '💼' };

// Website footer (web only): logo, grouped quick links, contact, social links, sponsors and legal pages.
// Logo: Admin → Logo & branding. Contact / social / sponsors / info pages: Admin → Website.
export function SiteFooter() {
  const { settings, pages, sponsors, session } = useApp();
  const { colors, fs, prefs } = useTheme(); const router = useRouter();
  const { width: screenW } = useWindowDimensions(); const narrow = screenW < 720;      // phones: stack everything so nothing runs off the screen
  const social: { label: string; url: string }[] = Array.isArray(settings.social_links) ? settings.social_links : [];
  const open = (u: string) => Linking.openURL(u);
  const shopOn = settings.shop_enabled !== false;
  const accent = '#9fe0bd';
  const Txt = ({ children, style }: any) => <Text style={[{ flexShrink: 1, color: colors.footerText, fontSize: fs(14), lineHeight: fs(21) }, style]}>{children}</Text>;
  const Head = ({ children }: any) => <Text accessibilityRole="header" style={{ color: '#fff', fontWeight: '800', fontSize: fs(13), letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>{children}</Text>;
  const Row = ({ label, onPress, icon }: { label: string; onPress: () => void; icon?: string }) => (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress}
      style={(s: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32, paddingVertical: 4, opacity: s.pressed ? 0.7 : 1, transform: [{ translateX: s.hovered ? 3 : 0 }] })}>
      <Text style={{ color: accent, fontSize: fs(14) }}>{icon ?? '›'}</Text><View style={{ flex: 1 }}><Txt style={prefs.underlineLinks ? { textDecorationLine: 'underline' } : undefined}>{label}</Txt></View>
    </Pressable>);
  const go = (r: string) => () => router.push(r as any);
  const web = (u: any) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
  const bgImg = web(settings.footer_bg_image); const banner = web(settings.footer_banner_image);
  const overlay = Math.min(0.85, Math.max(0, Number(settings.footer_bg_overlay ?? 0.55) || 0));
  const custom: { label: string; url: string }[] = (Array.isArray(settings.footer_links) ? settings.footer_links : []).filter((l: any) => l?.label && l?.url);
  const openAny = (u: string) => (u.startsWith('/') ? router.push(u as any) : Linking.openURL(u));

  const groups: { title: string; links: [string, string][] }[] = [
    { title: 'Matches', links: [['Fixtures & results', '/matches'], ['League table', '/table'], ['Statistics', '/stats'], ['Awards', '/awards']] },
    { title: 'The club', links: [['Squad', '/players'], ['News', '/news'], ['Photos & videos', '/media'], ['Calendar', '/calendar'], ['Season review', '/season-review']] },
    { title: 'Get involved', links: [['Tryouts', '/tryouts'], ...(shopOn ? [['Shop', '/shop'] as [string, string]] : []), ['Join the team', '/register'], ['Search', '/search']] },
  ];
  const mine: [string, string][] = [...(session ? [['My dashboard', '/dashboard'] as [string, string], ['My profile', '/profile'] as [string, string]] : [['Sign in', '/login'] as [string, string]]), ['Settings & accessibility', '/settings']];

  return (
    <View accessibilityRole="none" style={{ backgroundColor: colors.footerBg, marginTop: 32, overflow: 'hidden' }}>
      {bgImg ? <><Image source={{ uri: bgImg }} accessibilityLabel="" contentFit="cover" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} /><View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${overlay})` }} /></> : null}
      <View style={{ height: 4, backgroundColor: settings.primary_color ?? '#0B6E4F' }} />
      {banner ? <View style={{ width: '100%', height: 190 }}><Image source={{ uri: banner }} accessibilityLabel={String(settings.footer_banner_caption ?? 'Team picture')} contentFit="cover" style={{ width: '100%', height: 190 }} />{settings.footer_banner_caption ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10 }}><Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: fs(14) }}>{String(settings.footer_banner_caption)}</Text></View> : null}</View> : null}
      <View style={{ paddingTop: 36, paddingBottom: 36, paddingHorizontal: narrow ? 16 : 20 }}>
        <View style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', gap: 32 }}>
          <View style={{ flexDirection: narrow ? 'column' : 'row', flexWrap: 'wrap', gap: narrow ? 28 : 36 }}>
            <View style={narrow ? { width: '100%', gap: 12 } : { flexGrow: 1, flexBasis: 280, maxWidth: 380, gap: 12 }}>
              <Logo />
              {settings.footer_text ? <Txt style={{ color: colors.footerMuted }}>{settings.footer_text}</Txt> : null}
              <View style={{ gap: 2, marginTop: 4 }}>
                {settings.contact_email ? <Row icon="✉" label={settings.contact_email} onPress={() => open(`mailto:${settings.contact_email}`)} /> : null}
                {settings.contact_phone ? <Row icon="☎" label={settings.contact_phone} onPress={() => open(`tel:${String(settings.contact_phone).replace(/\s/g, '')}`)} /> : null}
                {settings.contact_address ? <View style={{ flexDirection: 'row', gap: 8, paddingRight: 4 }}><Text style={{ color: accent }}>📍</Text><View style={{ flex: 1 }}><Txt>{settings.contact_address}</Txt></View></View> : null}
              </View>
              {social.filter((x) => safe(x.url)).length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {social.filter((x) => safe(x.url)).map((x) => (
                    <Pressable key={x.label} accessibilityRole="link" accessibilityLabel={x.label} onPress={() => open(x.url)}
                      style={(s: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: s.hovered ? '#fff' : colors.footerBorder, backgroundColor: s.hovered ? 'rgba(255,255,255,0.1)' : 'transparent' })}>
                      <Text style={{ fontSize: fs(14) }}>{SOCIAL_ICON[x.label.trim().toLowerCase()] ?? '🔗'}</Text><Txt>{x.label}</Txt>
                    </Pressable>))}
                </View>)}
            </View>
            <View style={narrow ? { width: '100%', flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 24 } : { flexGrow: 3, flexBasis: 560, flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 28 }}>
              {groups.map((g) => (
                <View key={g.title} accessibilityRole="none" style={narrow ? { width: '47%', flexGrow: 1, minWidth: 130, gap: 2 } : { flexGrow: 1, flexBasis: 150, gap: 2 }}>
                  <Head>{g.title}</Head>
                  {g.links.map(([l, r]) => <Row key={r} label={l} onPress={go(r)} />)}
                </View>))}
              <View style={narrow ? { width: '47%', flexGrow: 1, minWidth: 130, gap: 2 } : { flexGrow: 1, flexBasis: 150, gap: 2 }}>
                <Head>My area</Head>
                {mine.map(([l, r]) => <Row key={r} label={l} onPress={go(r)} />)}
                {custom.length > 0 && <View style={{ marginTop: 14, gap: 2 }}><Head>{settings.footer_links_title || 'Links'}</Head>{custom.map((l, i) => <Row key={i} label={l.label} onPress={() => openAny(l.url)} />)}</View>}
                {pages.length > 0 && <View style={{ marginTop: 14, gap: 2 }}><Head>Information</Head>{pages.map((p) => <Row key={p.id} label={p.title} onPress={go(`/page/${p.slug}`)} />)}</View>}
              </View>
            </View>
          </View>
          <AdSlot placement="footer" />
          {sponsors.some((s) => s.show_footer) && (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.footerBorder, paddingTop: 22 }}>
              <Head>Our partners</Head>
              <SponsorSlider list={sponsors.filter((s) => s.show_footer)} placement="footer" dark />
            </View>)}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.footerBorder, paddingTop: 16, flexDirection: narrow ? 'column' : 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, paddingBottom: narrow ? 16 : 0 }}>
            <Text style={{ flexShrink: 1, color: colors.footerMuted, fontSize: fs(12) }}>{settings.footer_copyright || `© ${new Date().getFullYear()} ${settings.team_name}. All rights reserved.`}</Text>
            <Pressable accessibilityRole="link" onPress={go('/settings')}><Text style={{ color: colors.footerMuted, fontSize: fs(12), textDecorationLine: 'underline' }}>Accessibility & display settings</Text></Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
