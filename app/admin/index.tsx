import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SortFilterBar } from '../../components/SortFilterBar';
import { GroupedSections } from '../../components/GroupedSections';
import { CATEGORY_ORDER, SortKey, categoryOf, sortAndFilter } from '../../lib/adminCategories';
import { Screen, H, T, Card, Btn } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { RESOURCES } from '../../lib/resources';

export default function AdminHome() {
  const { can, session, signOut } = useApp();
  const r = useRouter();
  const [query, setQuery] = useState(''); const [sort, setSort] = useState<SortKey>('group'); const [category, setCategory] = useState('all');
  const items = [
    ...(can('users.manage') ? [{ href: '/admin/users', title: 'Users & accounts' }] : []),
    ...(can('roles.manage') ? [{ href: '/admin/roles', title: 'Roles & permissions' }] : []),
    ...(can('notifications.manage') ? [{ href: '/admin/notifications', title: 'Send notifications' }] : []),
    ...((can('lineups.manage') || can('training.manage')) ? [{ href: '/admin/coach', title: "Coaches' area (lineups, availability, formations, training)" }] : []),
    ...(can('settings.manage') || can('chat.moderate') ? [{ href: '/admin/chat', title: 'Chat (settings, stickers, reports)' }] : []),
    ...(can('settings.manage') ? [{ href: '/admin/assistant', title: 'Team assistant (chat helper)' }] : []),
    ...(can('settings.manage') ? [{ href: '/admin/header-footer', title: 'Header & footer (texts, pictures, links)' }] : []),
    ...(can('settings.manage') ? [{ href: '/admin/website', title: 'Website (home banner, contact, social links, sponsors)' }] : []),
    ...(can('news.manage') ? [{ href: '/admin/news', title: 'News (AI drafts, pictures & picture links)' }] : []),
    ...(can('shop.manage') ? [{ href: '/admin/manage/promotions', title: 'Promotions & discount codes' }, { href: '/admin/spin', title: 'Spin wheel (prizes & odds)' }] : []),
    ...(can('shop.manage') ? [{ href: '/admin/inventory', title: 'Inventory (stock, colours, bulk updates)' }] : []),
    ...(can('reports.view') || can('settings.manage') ? [{ href: '/admin/analytics', title: 'Analytics (visits, sign-ups, sales)' }] : []),
    ...(['players.manage', 'orders.manage', 'fees.manage', 'families.manage', 'kit.manage', 'training.manage', 'matches.manage'].some((p) => can(p)) ? [{ href: '/admin/export', title: 'Export data (CSV spreadsheets)' }] : []),
    ...(can('families.manage') ? [{ href: '/admin/families', title: 'Families (guardians and link codes)' }, { href: '/admin/consents', title: 'Consent forms and waivers' }] : []),
    ...(can('fees.manage') ? [{ href: '/admin/fees', title: 'Fees (invoices and receipts)' }] : []),
    ...(can('kit.manage') ? [{ href: '/admin/kit', title: 'Kit (issue and collect)' }] : []),
    ...(can('rotas.manage') ? [{ href: '/admin/rotas', title: 'Rotas (volunteers and transport)' }] : []),
    ...(can('settings.manage') ? [{ href: '/admin/seo', title: 'Search visibility (SEO: get found on Google)' }, { href: '/admin/legal', title: 'Legal documents (Terms, Privacy, Cookies)' }, { href: '/admin/legal-evidence', title: 'Acceptance & consent records' }, { href: '/admin/manage/ads', title: 'Ads (place, schedule & rotate adverts)' }, { href: '/admin/ad-report', title: 'Ad report (views and clicks)' }] : []),
    ...(can('settings.manage') ? [{ href: '/admin/sponsor-report', title: 'Sponsor report (views and clicks)' }] : []),
    ...(can('news.manage') ? [{ href: '/admin/polls', title: 'Polls (ask fans a question)' }] : []),
    ...(can('comments.moderate') ? [{ href: '/admin/comments', title: 'Comments (approve, hide, report queue)' }] : []),
    ...(can('settings.manage') ? [{ href: '/admin/referrals', title: 'Referrals (invite-a-friend rewards)' }] : []),
    ...(can('development.manage') ? [{ href: '/admin/development', title: 'Player development (ratings, injuries, notes)' }] : []),
    ...(can('lineups.manage') ? [{ href: '/admin/tactics', title: 'Tactics board (team shape, players & tactics)' }] : []),
    ...(can('settings.manage') ? [{ href: '/admin/security', title: 'Security (auto sign-out, new-device codes)' }] : []),
    ...(can('settings.manage') ? [{ href: '/admin/nav-appearance', title: 'Navigation look (theme & background)' }, { href: '/admin/favicon', title: 'Favicon (browser tab icon)' }] : []),
    ...(can('settings.manage') ? [{ href: '/admin/hero', title: 'Hero slider (home page pictures, up to 20)' }, { href: '/admin/branding', title: 'Logo & branding (header and footer logo)' }] : []),
    ...(can('reports.view') ? [{ href: '/admin/season-report', title: 'Season report (attendance, awards, scorers, shop sales)' }] : []),
    ...(can('payments.manage') ? [{ href: '/admin/payments', title: 'Payments (online, refunds, connections)' }] : []),
    ...(can('orders.manage') ? [{ href: '/admin/orders', title: 'Shop orders' }] : []),
    ...(can('emails.manage') ? [{ href: '/admin/email-design', title: 'Email design (colors, fonts, sender)' }, { href: '/admin/email-send', title: 'Send an email (individual / bulk)' }, { href: '/admin/email-log', title: 'Email log' }] : []),
    ...(can('codes.manage') ? [{ href: '/admin/codes', title: 'Team codes (player sign-up)' }] : []),
    ...(can('audit.view') ? [{ href: '/admin/audit', title: 'Audit log' }] : []),
    ...(can('registrations.manage') ? [{ href: '/admin/registrations', title: 'Player registrations' }] : []),
    ...(can('media.manage') ? [{ href: '/admin/media', title: 'Upload photos & videos' }] : []),
    ...Object.entries(RESOURCES).filter(([k, v]) => k !== 'news' && can(v.permission)).map(([k, v]) => ({ href: `/admin/manage/${k}`, title: v.title })),
  ];
  const cats = CATEGORY_ORDER.filter((c) => items.some((i) => categoryOf(i.href) === c));
  const shown = sortAndFilter(items, { query, sort, category, title: (i) => i.title, cat: (i) => categoryOf(i.href) });
  return (
    <Screen>
      <H>Admin panel</H>
      <T muted>Signed in as {session?.user.email}</T>
      {!can('admin.access') && <Card><T>Your account doesn't have admin access yet. Ask an Admin to assign you a role.</T></Card>}
      {can('admin.access') && <SortFilterBar query={query} onQuery={setQuery} sort={sort} onSort={setSort} category={category} onCategory={setCategory} shown={shown.length} total={items.length}
        sortOptions={[{ value: 'group', label: 'By group' }, { value: 'az', label: 'A → Z' }, { value: 'za', label: 'Z → A' }]}
        categories={[{ value: 'all', label: `All (${items.length})` }, ...cats.map((c) => ({ value: c, label: `${c} (${items.filter((i) => categoryOf(i.href) === c).length})` }))]}
        onClear={() => { setQuery(''); setSort('group'); setCategory('all'); }} />}
      {can('admin.access') && shown.length === 0 ? <T muted>Nothing matches. Try another word or clear the filter.</T> : null}
      {can('admin.access') && <GroupedSections items={shown} grouped={sort === 'group'} getCat={(i) => categoryOf(i.href)} render={(list) => (
        <View style={{ gap: 12 }}>{list.map((i) => (
          <Link key={i.href} href={i.href as any} asChild><Pressable><Card><T style={{ fontWeight: '700' }}>{i.title}</T>{sort === 'group' ? null : <T muted style={{ fontSize: 12 }}>{categoryOf(i.href)}</T>}</Card></Pressable></Link>
        ))}</View>)} />}
      <Btn title="Back to site" kind="ghost" onPress={() => r.replace('/')} />
      <Btn title="Sign out" kind="ghost" onPress={async () => { await signOut(); r.replace('/'); }} />
    </Screen>
  );
}
