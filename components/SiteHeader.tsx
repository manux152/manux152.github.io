import { useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { TrText as Text } from './TrText';
import { Link, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../lib/app-context';
import { useCart } from '../lib/cart';
import { useLayout } from '../lib/layout';
import { splitNav } from '../lib/nav';
import { useTheme } from '../lib/theme';
import { useNavLook } from '../lib/useNavLook';
import { Logo } from './Logo';
import { NavAppearancePicker } from './NavAppearancePicker';
import { NavBackground } from './NavBackground';
import { Avatar, T } from './ui';
import { PromoStrip } from './PromoStrip';
import { useChatUnread } from '../lib/chat';

// Classic masthead: logo and quick links on top, a ruled main-menu row underneath (wide screens);
// logo + menu button on phones, with the full menu in a sheet.
export function SiteHeader() {
  const { nav, settings, session, can, pages, profile, signOut } = useApp(); const { count } = useCart(); const { wide, maxWidth, width, gutter, navPadV, navPadH, navFont, logoH, avatar } = useLayout();
  const { colors, fs, accentFor } = useTheme(); const look = useNavLook(); const path = usePathname(); const insets = useSafeAreaInsets(); const router = useRouter();
  const [menu, setMenu] = useState<null | 'more' | 'all' | 'look' | 'account'>(null); const [headH, setHeadH] = useState(110); const [openGroups, setOpenGroups] = useState<string[]>([]);
  const { tabs, more } = splitNav(nav, can, 99);
  const shopOn = settings.shop_enabled !== false;
  const top = Platform.OS === 'web' ? 0 : insets.top;
  const active = (r: string) => (r === '/' ? path === '/' : path === r || path.startsWith(r + '/'));
  // Show as many menu links as fit the current width; the rest go under "More".
  const room = Math.min(width, maxWidth) - gutter * 2 - (navFont * 4 + navPadH * 2 + 16);
  let used = 0; let fit = 0;
  for (const n of tabs) { const w = n.label.length * navFont * 0.66 + navPadH * 2 + 4; if (used + w > room) break; used += w; fit++; }
  const mainItems = tabs.slice(0, Math.max(1, fit)); const overflow = [...tabs.slice(Math.max(1, fit)), ...more];
  const tx = { color: look.text, fontSize: fs(navFont), fontWeight: '600' as const };
  const notice = typeof settings.header_notice_text === 'string' && settings.header_notice_text.trim() ? settings.header_notice_text.trim() : null;
  const noticeLink = typeof settings.header_notice_link === 'string' && /^(\/|https?:\/\/)/i.test(settings.header_notice_link.trim()) ? settings.header_notice_link.trim() : null;
  const tagline = typeof settings.header_tagline === 'string' && settings.header_tagline.trim() ? settings.header_tagline.trim() : null;
  const chatOn = !!session && settings.chat_enabled !== false && settings.chat_enabled !== 'false'; const unread = useChatUnread(chatOn);
  const initialName = profile?.full_name || session?.user.email || 'Account';

  const util = (label: string, href: string, a11y?: string) => (
    <Link key={href} href={href as any} asChild><Pressable accessibilityRole="link" accessibilityLabel={a11y ?? label} style={{ paddingVertical: 8, paddingHorizontal: Math.max(4, navPadH * 0.5) }}><Text style={tx}>{label}</Text></Pressable></Link>
  );
  const utilities = [
    util('Search', '/search'),
    ...(shopOn ? [util(count > 0 ? `Cart (${count})` : 'Cart', '/cart', 'Shopping cart')] : []),
    ...(session ? [util('Dashboard', '/dashboard')] : []),
    ...(chatOn ? [util(unread > 0 ? `Messages (${unread > 99 ? '99+' : unread})` : 'Messages', '/chat', unread > 0 ? `Messages, ${unread} unread` : 'Messages')] : []),
    util('Settings', '/settings', 'Settings and accessibility'),
    ...(can('admin.access') ? [util('Admin', '/admin')] : []),
  ];
  const closeAnd = () => setMenu(null);
  const go = (href: string) => { setMenu(null); router.push(href as any); };
  const row = (label: string, href: string) => (
    <Pressable key={href + label} accessibilityRole="link" onPress={() => go(href)} style={{ paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}><T style={{ fontWeight: active(href) ? '800' : '600', fontSize: 16 }}>{label}</T></Pressable>
  );
  // Mobile menu: every link sits in a named group that expands and collapses.
  const ROUTE_GROUP: Record<string, string> = {
    '/matches': 'Competition', '/table': 'Competition', '/calendar': 'Competition', '/stats': 'Competition', '/head-to-head': 'Competition',
    '/players': 'Team', '/formations': 'Team', '/training': 'Team', '/awards': 'Team', '/development': 'Team',
    '/news': 'Club', '/media': 'Club', '/season-review': 'Club', '/about': 'Club',
    '/fans': 'Fans', '/assistant': 'Fans', '/spin': 'Fans', '/predictor': 'Fans',
    '/tryouts': 'Join & Support', '/friendly': 'Join & Support', '/shop': 'Join & Support',
  };
  const GROUP_ORDER = ['Competition', 'Team', 'Club', 'Fans', 'Join & Support', 'Account', 'Legal'];
  const LEGAL_SLUGS = ['privacy', 'terms', 'cookies'];
  const menuGroups = () => {
    const g: Record<string, { label: string; href: string; badge?: number }[]> = {};
    const add = (k: string, label: string, href: string, badge?: number) => { const list = (g[k] = g[k] || []); if (!list.some((x) => x.href === href)) list.push({ label, href, badge }); };
    let home: { label: string; href: string } | null = null;
    for (const n of [...tabs, ...more]) { if (n.route === '/') home = { label: n.label, href: n.route }; else add(ROUTE_GROUP[n.route] ?? 'Club', n.label, n.route); }
    for (const p of pages) add(LEGAL_SLUGS.includes(p.slug) ? 'Legal' : 'Club', p.title, LEGAL_SLUGS.includes(p.slug) ? `/legal/${p.slug}` : `/page/${p.slug}`);
    add('Fans', 'Ask the assistant', '/assistant');
    if (shopOn && settings.spin_enabled !== false) add('Fans', 'Spin the wheel', '/spin');
    if (session) add('Account', 'My account', '/account');
    if (session) add('Account', 'Dashboard', '/dashboard');
    if (chatOn) add('Account', 'Messages', '/chat', unread);
    add('Account', 'Settings', '/settings');
    if (can('admin.access')) add('Account', 'Admin', '/admin');
    return { home, groups: GROUP_ORDER.filter((k) => g[k]?.length).map((k) => ({ key: k, items: g[k] })) };
  };
  const groupedMenu = () => {
    const { home, groups } = menuGroups();
    const gold = accentFor(look.accent);
    const toggle = (k: string) => setOpenGroups((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
    return (
      <>
        {home ? row(home.label, home.href) : null}
        {groups.map((gr) => {
          const open = openGroups.includes(gr.key) || gr.items.some((i) => active(i.href));
          const total = gr.items.reduce((a, i) => a + (i.badge || 0), 0);
          return (
            <View key={gr.key} style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${gr.key}, ${open ? 'collapse' : 'expand'}`} onPress={() => toggle(gr.key)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 8 }}>
                <T style={{ fontWeight: '800', fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color: gold }}>{gr.key}{total > 0 ? ` (${total > 99 ? '99+' : total})` : ''}</T>
                <T style={{ fontSize: 14, color: gold }}>{open ? '▴' : '▾'}</T>
              </Pressable>
              {open ? (
                <View style={{ paddingLeft: 12, paddingBottom: 6 }}>
                  {gr.items.map((i) => (
                    <Pressable key={i.href + i.label} accessibilityRole="link" onPress={() => go(i.href)} style={{ paddingVertical: 11, paddingHorizontal: 8 }}>
                      <T style={{ fontWeight: active(i.href) ? '800' : '600', fontSize: 16 }}>{i.label}{i.badge ? ` (${i.badge > 99 ? '99+' : i.badge})` : ''}</T>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        {!session ? row('Sign in', '/login') : null}
      </>
    );
  };
  const sheet = (title: string, body: React.ReactNode) => (
    <Modal transparent animationType="fade" visible onRequestClose={closeAnd}>
      <Pressable accessibilityLabel="Close menu" onPress={closeAnd} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: wide ? 'flex-start' : 'flex-end', alignItems: wide ? 'flex-end' : 'stretch', paddingTop: wide ? headH : 0, paddingRight: wide ? gutter : 0 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderRadius: wide ? 12 : 0, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, width: wide ? 340 : '100%', maxHeight: '80%', borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <T style={{ fontWeight: '800', fontSize: 18 }}>{title}</T>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeAnd} style={{ padding: 8 }}><T style={{ fontSize: 18 }}>✕</T></Pressable>
          </View>
          <ScrollView>{body}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
  // Profile picture, always the top-right corner of the header (a Sign in button when logged out)
  const me = session ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Your account menu" onPress={() => setMenu('account')} style={{ marginLeft: 6, borderRadius: 999, borderWidth: 2, borderColor: look.accent, padding: 1 }}>
      <Avatar url={profile?.avatar_url} name={initialName} size={avatar} />
    </Pressable>
  ) : (
    <Link href="/login" asChild><Pressable accessibilityRole="link" accessibilityLabel="Sign in" style={{ marginLeft: 6, paddingVertical: 8, paddingHorizontal: navPadH, borderRadius: 999, borderWidth: 1, borderColor: look.accent }}><Text style={{ ...tx, color: look.text }}>Sign in</Text></Pressable></Link>
  );

  return (
    <View onLayout={(e) => setHeadH(Math.round(e.nativeEvent.layout.height))} style={[{ paddingTop: top, zIndex: 20 }, Platform.OS === 'web' ? ({ position: 'sticky', top: 0 } as any) : null]}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' }}><NavBackground look={look} /></View>
      {notice ? (
        <Pressable accessibilityRole={noticeLink ? 'link' : 'text'} disabled={!noticeLink} onPress={() => (noticeLink!.startsWith('/') ? router.push(noticeLink as any) : Linking.openURL(noticeLink!))} style={{ backgroundColor: 'rgba(0,0,0,0.35)', paddingVertical: 7, paddingHorizontal: gutter }}>
          <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 13 }}>{notice}</Text>
        </Pressable>
      ) : null}
      <PromoStrip look={look} gutter={gutter} maxWidth={maxWidth} />
      <View style={{ width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: gutter }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: logoH + 24, paddingVertical: 8, gap: 8 }}>
          {wide ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1 }}><Link href="/" asChild><Pressable accessibilityRole="link" accessibilityLabel="Home"><Logo height={logoH} nameSize={Math.round(logoH * 0.45)} nameColor={look.text} /></Pressable></Link>{tagline && width >= 1000 ? <Text numberOfLines={2} style={{ color: look.text, opacity: 0.85, fontStyle: 'italic', fontSize: fs(13), maxWidth: 240, borderLeftWidth: 1, borderLeftColor: look.border, paddingLeft: 14 }}>{tagline}</Text> : null}</View>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {utilities}
                {look.allowPersonalise ? <Pressable accessibilityRole="button" accessibilityLabel="Change navigation appearance" onPress={() => setMenu('look')} style={{ marginLeft: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: look.border }}><Text style={tx}>Appearance</Text></Pressable> : null}
                {me}
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><Pressable accessibilityRole="button" accessibilityLabel="Open menu" onPress={() => setMenu('all')} style={{ padding: 8 }}><Text style={{ ...tx, fontSize: 24 }}>☰</Text></Pressable></View>
              <Link href="/" asChild><Pressable accessibilityRole="link" accessibilityLabel="Home" style={{ flexShrink: 1 }}><Logo height={Math.min(logoH, 34)} nameSize={15} nameColor={look.text} /></Pressable></Link>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Link href="/search" asChild><Pressable accessibilityRole="link" accessibilityLabel="Search" style={{ padding: 8 }}><Text style={{ ...tx, fontSize: 18 }}>🔍</Text></Pressable></Link>
                {chatOn ? <Link href="/chat" asChild><Pressable accessibilityRole="link" accessibilityLabel={unread > 0 ? `Messages, ${unread} unread` : 'Messages'} style={{ padding: 8 }}><Text style={{ ...tx, fontSize: 18 }}>💬{unread > 0 ? ` ${unread > 99 ? '99+' : unread}` : ''}</Text></Pressable></Link> : null}
                {shopOn ? <Link href="/cart" asChild><Pressable accessibilityRole="link" accessibilityLabel="Shopping cart" style={{ padding: 8 }}><Text style={{ ...tx, fontSize: 18 }}>🛒{count > 0 ? ` ${count}` : ''}</Text></Pressable></Link> : null}
                {me}
              </View>
            </>
          )}
        </View>
      </View>
      {wide ? (
        <View style={{ borderTopWidth: 1, borderTopColor: look.border, backgroundColor: look.light ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.18)' }}>
          <View accessibilityRole="menubar" style={{ width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: Math.max(0, gutter - navPadH), flexDirection: 'row', alignItems: 'stretch' }}>
            {mainItems.map((n) => {
              const on = active(n.route);
              return (
                <Link key={n.id} href={n.route as any} asChild>
                  <Pressable accessibilityRole="link" accessibilityState={{ selected: on }} style={(st: any) => ({ paddingVertical: navPadV, paddingHorizontal: navPadH, borderBottomWidth: 3, borderBottomColor: on ? look.accent : 'transparent', opacity: st.hovered && !on ? 0.8 : 1 })}>
                    <Text numberOfLines={1} style={{ color: look.text, fontSize: fs(navFont), fontWeight: on ? '800' : '600', letterSpacing: 0.4, paddingHorizontal: 28 }}>{n.label}</Text>
                  </Pressable>
                </Link>
              );
            })}
            {overflow.length + pages.length > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="More pages" onPress={() => setMenu('more')} style={{ paddingVertical: navPadV, paddingHorizontal: navPadH, borderBottomWidth: 3, borderBottomColor: 'transparent' }}>
                <Text style={{ color: look.text, fontSize: fs(navFont), fontWeight: '600', letterSpacing: 0.4, paddingHorizontal: 28 }}>More ▾</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      <View pointerEvents="none" style={{ height: 1, backgroundColor: look.border }} />

      {menu === 'more' ? sheet('More', <>{overflow.map((n) => row(n.label, n.route))}{pages.map((p) => row(p.title, `/page/${p.slug}`))}</>) : null}
      {menu === 'look' ? sheet('Navigation appearance', <NavAppearancePicker />) : null}
      {menu === 'account' ? sheet(initialName, <>
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
          <Avatar url={profile?.avatar_url} name={initialName} size={72} />
          <T muted style={{ fontSize: 13 }}>{session?.user.email}</T>
        </View>
        {row('My account', '/account')}{row('Edit profile & photo', '/profile')}
        {chatOn ? row(`Messages${unread > 0 ? ` (${unread})` : ''}`, '/chat') : null}
        {row('Ask the assistant', '/assistant')}
        {shopOn ? row('My orders', '/orders') : null}
        {shopOn && settings.spin_enabled !== false ? row('Spin the wheel', '/spin') : null}
        {row('Dashboard', '/dashboard')}{row('Settings', '/settings')}
        {can('admin.access') ? row('Admin panel', '/admin') : null}
        <Pressable accessibilityRole="button" onPress={async () => { setMenu(null); await signOut(); router.replace('/'); }} style={{ paddingVertical: 12, paddingHorizontal: 8 }}><T style={{ fontWeight: '700', color: colors.danger }}>Sign out</T></Pressable>
      </>) : null}
      {menu === 'all' ? sheet('Menu', <>
        {groupedMenu()}
        {look.allowPersonalise ? <View style={{ marginTop: 14, gap: 6 }}><T style={{ fontWeight: '800' }}>Navigation appearance</T><NavAppearancePicker /></View> : null}
      </>) : null}
    </View>
  );
}
