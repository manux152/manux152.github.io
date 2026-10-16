import { useEffect, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen, H, T, Card, Avatar, Loading, fmtDate, useAccent } from '../components/ui';
import { useApp } from '../lib/app-context';
import { matchTitle } from '../lib/matchday';
import { useTheme } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { useAttention } from '../lib/clubops';
import { SortFilterBar } from '../components/SortFilterBar';
import { Toggle } from '../components/ui';
import { GroupedSections } from '../components/GroupedSections';
import { CATEGORY_ORDER, SortKey, categoryOf, sortAndFilter } from '../lib/adminCategories';

type Tile = { icon: string; title: string; desc: string; href: string; perm?: string[]; badge?: keyof Counts; show?: boolean };
type Counts = { drafts: number; needResult: number; pendingRegs: number; newApps: number; newOrders: number; members: number };
const EMPTY: Counts = { drafts: 0, needResult: 0, pendingRegs: 0, newApps: 0, newOrders: 0, members: 0 };

// A personal home for every signed-in member. What you see depends on the rights (roles) your account has.
export default function Dashboard() {
  const { session, can, settings } = useApp(); const { colors, fs, prefs } = useTheme(); const accent = useAccent();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<{ name: string; avatar: string | null; roles: string[]; isPlayer: boolean }>({ name: '', avatar: null, roles: [], isPlayer: false });
  const [next, setNext] = useState<any | null>(null); const [training, setTraining] = useState<any | null>(null);
  const [att, setAtt] = useState<Record<string, number> | null>(null);
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [query, setQuery] = useState(''); const [sort, setSort] = useState<SortKey>('group'); const [category, setCategory] = useState('all'); const [onlyWaiting, setOnlyWaiting] = useState(false);
  const uid = session?.user.id;
  const famAtt = useAttention(!!uid); const famTodo = famAtt.forms + famAtt.fees + famAtt.kit;   // things in My family that need attention

  useEffect(() => {
    if (!uid) return;
    let off = false;
    (async () => {
      const safe = async <R,>(p: PromiseLike<R>, d: R): Promise<R> => { try { return await p; } catch { return d; } };
      const head = (t: string, f: (q: any) => any, perm: string) => (can(perm) ? safe(f(supabase.from(t).select('id', { count: 'exact', head: true })).then((r: any) => r.count ?? 0), 0) : Promise.resolve(0));
      const nowIso = new Date().toISOString();
      const [prof, roles, player, nm, tr, drafts, needResult, pendingRegs, newApps, newOrders, members] = await Promise.all([
        safe(supabase.from('profiles').select('full_name,avatar_url').eq('id', uid).maybeSingle().then((r: any) => r.data), null),
        safe(supabase.from('user_roles').select('roles(name)').eq('user_id', uid).then((r: any) => r.data ?? []), [] as any[]),
        safe(supabase.from('players').select('id').eq('profile_id', uid).maybeSingle().then((r: any) => r.data), null),
        safe(supabase.from('matches').select('id,kickoff_at,venue,is_home,competition,opponents(name)').in('status', ['scheduled', 'live']).gte('kickoff_at', nowIso).order('kickoff_at').limit(1).maybeSingle().then((r: any) => r.data), null),
        safe(supabase.from('training_sessions').select('id,title,session_date,focus').gte('session_date', nowIso).order('session_date').limit(1).maybeSingle().then((r: any) => r.data), null),
        head('news_posts', (q) => q.is('published_at', null), 'news.manage'),
        head('matches', (q) => q.in('status', ['scheduled', 'live']).lt('kickoff_at', nowIso), 'matches.manage'),
        head('registrations', (q) => q.eq('status', 'pending'), 'registrations.manage'),
        head('tryout_applications', (q) => q.eq('status', 'applied'), 'registrations.manage'),
        head('orders', (q) => q.in('status', ['new', 'paid']), 'orders.manage'),
        head('profiles', (q) => q, 'users.manage'),
      ]);
      if (off) return;
      setMe({ name: (prof as any)?.full_name ?? '', avatar: (prof as any)?.avatar_url ?? null, roles: (roles as any[]).map((r) => r.roles?.name).filter(Boolean), isPlayer: !!player });
      setNext(nm); setTraining(tr); setCounts({ drafts, needResult, pendingRegs, newApps, newOrders, members });
      if (player) {
        const a = await safe(supabase.from('training_attendance').select('status').gte('marked_at', new Date(Date.now() - 90 * 864e5).toISOString()).then((r: any) => r.data ?? []), [] as any[]);
        const t: Record<string, number> = { present: 0, late: 0, excused: 0, absent: 0 }; (a as any[]).forEach((x) => { t[x.status] = (t[x.status] ?? 0) + 1; }); setAtt(t);
      }
      setReady(true);
    })();
    return () => { off = true; };
  }, [uid]); // eslint-disable-line
  if (!session) return <Redirect href="/login" />;
  if (!ready) return <Loading />;

  const shopOn = settings.shop_enabled !== false;
  const tiles: Tile[] = ([
    { icon: '👤', title: 'My profile', desc: 'Photo, details and bio', href: '/profile' },
    { icon: '🛍️', title: 'My orders', desc: 'Shop orders and payments', href: '/orders', show: shopOn },
    { icon: '🏋️', title: 'Training', desc: 'Sessions and plans', href: '/training' },
    { icon: '🎯', title: 'Predict the score', desc: 'Fan league and leaderboard', href: '/predictor', show: settings.fan_predictions_enabled !== false },
    { icon: '🤝', title: 'Invite friends', desc: 'Share your code, earn rewards', href: '/invite', show: settings.referral_enabled !== false },
    { icon: '💬', title: 'Comments', desc: 'Approve and hide comments', href: '/admin/comments', perm: ['comments.moderate'] },
    { icon: '📊', title: 'Polls', desc: 'Ask fans a question', href: '/admin/polls', perm: ['news.manage'] },
    { icon: '👨‍👩‍👧', title: 'My family', desc: famTodo ? `${famTodo} thing${famTodo === 1 ? '' : 's'} need${famTodo === 1 ? 's' : ''} attention` : 'Forms, fees and kit — or link your child', href: '/family' },
    { icon: '🙋', title: 'Volunteers & lifts', desc: 'Sign up to help on match days', href: '/rotas', show: settings.rotas_enabled !== false },
    { icon: '📈', title: 'Analytics', desc: 'Visits, sign-ups and sales', href: '/admin/analytics', perm: ['reports.view', 'settings.manage'] },
    { icon: '⬇️', title: 'Export data', desc: 'Download CSV spreadsheets', href: '/admin/export', perm: ['players.manage', 'orders.manage', 'fees.manage', 'families.manage', 'kit.manage', 'training.manage', 'matches.manage'] },
    { icon: '🧾', title: 'Fees', desc: 'Invoices and receipts', href: '/admin/fees', perm: ['fees.manage'] },
    { icon: '📝', title: 'Consent forms', desc: 'Waivers and who has signed', href: '/admin/consents', perm: ['families.manage'] },
    { icon: '👪', title: 'Families', desc: 'Link parents and guardians', href: '/admin/families', perm: ['families.manage'] },
    { icon: '👕', title: 'Kit', desc: 'Issue and collect kit', href: '/admin/kit', perm: ['kit.manage'] },
    { icon: '🚗', title: 'Rotas', desc: 'Volunteers and transport', href: '/admin/rotas', perm: ['rotas.manage'] },
    { icon: '🤝', title: 'Sponsor report', desc: 'Views and clicks', href: '/admin/sponsor-report', perm: ['settings.manage'] },
    { icon: '📈', title: 'My development', desc: 'Form, badges and coach feedback', href: '/development', show: me.isPlayer },
    { icon: '🩹', title: 'Player development', desc: 'Ratings, injuries and notes', href: '/admin/development', perm: ['development.manage'] },
    { icon: '🧩', title: 'Formations', desc: 'Team shapes and tactics', href: '/formations' },
    { icon: '♟️', title: 'Tactics board', desc: 'Set who plays where', href: '/admin/tactics', perm: ['lineups.manage'] },
    { icon: '📅', title: 'Calendar', desc: 'Matches, tryouts and events', href: '/calendar' },
    { icon: '⚙️', title: 'Settings', desc: 'Theme, text size, accessibility', href: '/settings' },
    { icon: '🛡️', title: "Coaches' area", desc: 'Lineups, availability, training', href: '/admin/coach', perm: ['lineups.manage', 'training.manage'] },
    { icon: '⚽', title: 'Fixtures & results', desc: 'Enter scores and events', href: '/admin/manage/matches', perm: ['matches.manage'], badge: 'needResult' },
    { icon: '📰', title: 'News', desc: 'Write (or AI-draft) and publish stories', href: '/admin/news', perm: ['news.manage'], badge: 'drafts' },
    { icon: '📝', title: 'Registrations', desc: 'Approve new players', href: '/admin/registrations', perm: ['registrations.manage'], badge: 'pendingRegs' },
    { icon: '📣', title: 'Send notifications', desc: 'Push messages to members', href: '/admin/notifications', perm: ['notifications.manage'] },
    { icon: '✉️', title: 'Email', desc: 'Send individual or bulk email', href: '/admin/email-send', perm: ['emails.manage'] },
    { icon: '📦', title: 'Shop orders', desc: 'Fulfil and track orders', href: '/admin/orders', perm: ['orders.manage'], badge: 'newOrders', show: shopOn },
    { icon: '💳', title: 'Payments', desc: 'Online payments and refunds', href: '/admin/payments', perm: ['payments.manage'] },
    { icon: '📊', title: 'Season report', desc: 'Attendance, awards, sales', href: '/admin/season-report', perm: ['reports.view'] },
    { icon: '🖼️', title: 'Photos & videos', desc: 'Upload to albums', href: '/admin/media', perm: ['media.manage'] },
    { icon: '🎞️', title: 'Hero slider', desc: 'Home page pictures', href: '/admin/hero', perm: ['settings.manage'] },
    { icon: '🧭', title: 'Navigation look', desc: 'Theme and background of the menu', href: '/admin/nav-appearance', perm: ['settings.manage'] },
    { icon: '⭐', title: 'Favicon', desc: 'Browser tab icon', href: '/admin/favicon', perm: ['settings.manage'] },
    { icon: '🏷️', title: 'Promotions', desc: 'Offers, codes and banners', href: '/admin/manage/promotions', perm: ['shop.manage'] },
    { icon: '🎡', title: 'Spin wheel', desc: 'Prizes, odds and cooldown', href: '/admin/spin', perm: ['shop.manage'] },
    { icon: '📦', title: 'Inventory', desc: 'Stock, colours, bulk updates', href: '/admin/inventory', perm: ['shop.manage'] },
    { icon: '🏷️', title: 'Logo & branding', desc: 'Logo shown in header and footer', href: '/admin/branding', perm: ['settings.manage'] },
    { icon: '💬', title: 'Chat', desc: 'Settings, stickers, reported messages', href: '/admin/chat', perm: ['settings.manage', 'chat.moderate'] },
    { icon: '🤖', title: 'Team assistant', desc: 'Chat helper: notes, questions, on/off', href: '/admin/assistant', perm: ['settings.manage'] },
    { icon: '🧱', title: 'Header & footer', desc: 'Texts, pictures and links of the top and bottom', href: '/admin/header-footer', perm: ['settings.manage'] },
    { icon: '🌐', title: 'Website', desc: 'Banner text, contact, social', href: '/admin/website', perm: ['settings.manage'] },
    { icon: '👥', title: 'Users & accounts', desc: 'Manage members', href: '/admin/users', perm: ['users.manage'], badge: 'members' },
    { icon: '🔐', title: 'Roles & permissions', desc: 'Control who can do what', href: '/admin/roles', perm: ['roles.manage'] },
    { icon: '🔑', title: 'Team codes', desc: 'Player sign-up codes', href: '/admin/codes', perm: ['codes.manage'] },
    { icon: '📜', title: 'Audit log', desc: 'Who changed what', href: '/admin/audit', perm: ['audit.view'] },
    { icon: '🧰', title: 'Admin panel', desc: 'Everything you can manage', href: '/admin', perm: ['admin.access'] },
  ] as Tile[]).filter((t) => t.show !== false && (!t.perm || t.perm.some((p) => can(p))));
  const waitingOf = (t: Tile) => (t.badge && t.badge !== 'members' ? counts[t.badge] : 0);
  const cats = CATEGORY_ORDER.filter((c) => tiles.some((t) => categoryOf(t.href) === c));
  const shownTiles = sortAndFilter(tiles, { query, sort, category, onlyWaiting, title: (t) => t.title, text: (t) => t.desc, cat: (t) => categoryOf(t.href), waiting: waitingOf });
  const attention = [
    { label: 'Posts waiting to be published', n: counts.drafts, href: '/admin/news' },
    { label: 'Matches awaiting a result', n: counts.needResult, href: '/admin/manage/matches' },
    { label: 'Registrations to review', n: counts.pendingRegs, href: '/admin/registrations' },
    { label: 'New tryout applications', n: counts.newApps, href: '/admin/manage/tryouts' },
    { label: 'Shop orders to handle', n: counts.newOrders, href: '/admin/orders' },
  ].filter((a) => a.n > 0);

  return (
    <Screen>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
        <Avatar url={me.avatar} name={me.name} size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <H>Hello{me.name ? `, ${me.name.split(' ')[0]}` : ''} 👋</H>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(me.roles.length ? me.roles : ['Member']).map((r) => <View key={r} style={{ borderWidth: 1, borderColor: accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}><T style={{ fontSize: 12, fontWeight: '700', color: accent }}>{r}</T></View>)}
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Card style={{ flexGrow: 1, flexBasis: 280 }}>
          <T muted style={{ fontWeight: '700' }}>Next match</T>
          {next ? (<>
            <T style={{ fontWeight: '800', fontSize: 18 }}>{matchTitle(next, settings.team_name)}</T>
            <T>{fmtDate(next.kickoff_at)}</T>{next.venue ? <T muted>{next.venue}</T> : null}
            <Link href={`/match/${next.id}` as any} asChild><Pressable accessibilityRole="link"><T style={{ color: accent, fontWeight: '700' }}>Match details →</T></Pressable></Link>
          </>) : <T muted>No upcoming match scheduled.</T>}
        </Card>
        <Card style={{ flexGrow: 1, flexBasis: 280 }}>
          <T muted style={{ fontWeight: '700' }}>Next training</T>
          {training ? (<><T style={{ fontWeight: '800', fontSize: 18 }}>{training.title}</T><T>{fmtDate(training.session_date)}</T>{training.focus ? <T muted>Focus: {training.focus}</T> : null}</>) : <T muted>No training session planned.</T>}
        </Card>
        {me.isPlayer && att ? (
          <Card style={{ flexGrow: 1, flexBasis: 280 }}>
            <T muted style={{ fontWeight: '700' }}>My attendance · last 90 days</T>
            <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
              {([['present', 'Present'], ['late', 'Late'], ['excused', 'Excused'], ['absent', 'Absent']] as const).map(([k, l]) => <View key={k}><T style={{ fontWeight: '900', fontSize: 24 }}>{att[k] ?? 0}</T><T muted style={{ fontSize: 13 }}>{l}</T></View>)}
            </View>
          </Card>) : null}
      </View>

      {attention.length > 0 && (
        <Card style={{ borderColor: accent, borderWidth: 2 }}>
          <T style={{ fontWeight: '800' }}>Needs your attention</T>
          {attention.map((a) => <Link key={a.href} href={a.href as any} asChild><Pressable accessibilityRole="link" accessibilityLabel={`${a.n} ${a.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
            <View style={{ minWidth: 32, paddingHorizontal: 8, height: 28, borderRadius: 14, backgroundColor: settings.primary_color ?? '#0B6E4F', alignItems: 'center', justifyContent: 'center' }}><T style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{a.n}</T></View>
            <T style={{ flex: 1 }}>{a.label}</T><T style={{ color: accent }}>→</T></Pressable></Link>)}
        </Card>)}

      <H>Shortcuts</H>
      <SortFilterBar query={query} onQuery={setQuery} sort={sort} onSort={setSort} category={category} onCategory={setCategory} shown={shownTiles.length} total={tiles.length}
        sortOptions={[{ value: 'group', label: 'By group' }, { value: 'az', label: 'A → Z' }, { value: 'za', label: 'Z → A' }, { value: 'waiting', label: 'Most waiting first' }]}
        categories={[{ value: 'all', label: `All (${tiles.length})` }, ...cats.map((c) => ({ value: c, label: `${c} (${tiles.filter((t) => categoryOf(t.href) === c).length})` }))]}
        extra={<Toggle label="Only show things with work waiting" value={onlyWaiting} onChange={setOnlyWaiting} />}
        onClear={() => { setQuery(''); setSort('group'); setCategory('all'); setOnlyWaiting(false); }} />
      {shownTiles.length === 0 ? <T muted>Nothing matches. Try another word or clear the filter.</T> : null}
      <GroupedSections items={shownTiles} grouped={sort === 'group'} getCat={(t) => categoryOf(t.href)} render={(list) => (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {list.map((t) => {
          const n = t.badge ? counts[t.badge] : 0;
          return (
            <Link key={t.href} href={t.href as any} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={`${t.title}. ${t.desc}${n ? `. ${n} waiting` : ''}`} style={(s: any) => ({ flexGrow: 1, flexBasis: 220, opacity: s.pressed ? 0.8 : 1, transform: [{ translateY: s.hovered ? -2 : 0 }] })}>
                <Card style={{ minHeight: 96, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <T style={{ fontSize: 26 }}>{t.icon}</T>
                    {n > 0 ? <View style={{ minWidth: 26, paddingHorizontal: 7, height: 24, borderRadius: 12, backgroundColor: settings.primary_color ?? '#0B6E4F', alignItems: 'center', justifyContent: 'center' }}><T style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{t.badge === 'members' ? n : n > 99 ? '99+' : n}</T></View> : null}
                  </View>
                  <T style={{ fontWeight: '800' }}>{t.title}</T><T muted style={{ fontSize: 13 }}>{t.desc}</T>
                </Card>
              </Pressable>
            </Link>);
        })}
      </View>)} />
    </Screen>
  );
}
