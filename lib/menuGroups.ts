// One place that decides which group every menu link belongs to, so the side menu and the "More" page always match.
export type MenuItem = { label: string; href: string; badge?: number };
export type MenuGroup = { key: string; items: MenuItem[] };

const ROUTE_GROUP: Record<string, string> = {
  '/matches': 'Competition', '/table': 'Competition', '/calendar': 'Competition', '/stats': 'Competition', '/head-to-head': 'Competition',
  '/players': 'Team', '/formations': 'Team', '/training': 'Team', '/awards': 'Team', '/development': 'Team',
  '/news': 'Club', '/media': 'Club', '/season-review': 'Club', '/about': 'Club',
  '/fans': 'Fans', '/assistant': 'Fans', '/spin': 'Fans', '/predictor': 'Fans',
  '/tryouts': 'Join & Support', '/friendly': 'Join & Support', '/shop': 'Join & Support',
};
const GROUP_ORDER = ['Competition', 'Team', 'Club', 'Fans', 'Join & Support', 'Account', 'Legal'];
const LEGAL_SLUGS = ['privacy', 'terms', 'cookies'];

export function buildMenuGroups(o: {
  navItems: { label: string; route: string }[]; pages: { title: string; slug: string }[];
  signedIn: boolean; chatOn: boolean; unread: number; spinOn: boolean; isAdmin: boolean;
}): { home: MenuItem | null; groups: MenuGroup[] } {
  const g: Record<string, MenuItem[]> = {};
  const add = (k: string, label: string, href: string, badge?: number) => { const list = (g[k] = g[k] || []); if (!list.some((x) => x.href === href)) list.push({ label, href, badge }); };
  let home: MenuItem | null = null;
  for (const n of o.navItems) { if (n.route === '/') home = { label: n.label, href: n.route }; else add(ROUTE_GROUP[n.route] ?? 'Club', n.label, n.route); }
  add('Club', 'About', '/about');
  for (const p of o.pages) { const legal = LEGAL_SLUGS.includes(p.slug); add(legal ? 'Legal' : 'Club', p.title, legal ? `/legal/${p.slug}` : `/page/${p.slug}`); }
  add('Fans', 'Ask the assistant', '/assistant');
  if (o.spinOn) add('Fans', 'Spin the wheel', '/spin');
  if (o.signedIn) { add('Account', 'My account', '/account'); add('Account', 'Dashboard', '/dashboard'); }
  if (o.chatOn) add('Account', 'Messages', '/chat', o.unread);
  add('Account', 'Settings', '/settings');
  if (o.isAdmin) add('Account', 'Admin', '/admin');
  return { home, groups: GROUP_ORDER.filter((k) => g[k]?.length).map((k) => ({ key: k, items: g[k] })) };
}

// Profile-picture menu: the same expandable look, with groups for the signed-in person.
export function buildAccountGroups(o: { chatOn: boolean; unread: number; shopOn: boolean; spinOn: boolean }): MenuGroup[] {
  const account: MenuItem[] = [{ label: 'My account', href: '/account' }, { label: 'Edit profile & photo', href: '/profile' }];
  if (o.shopOn) account.push({ label: 'My orders', href: '/orders' });
  account.push({ label: 'Settings', href: '/settings' });
  const activity: MenuItem[] = [{ label: 'Dashboard', href: '/dashboard' }];
  if (o.chatOn) activity.push({ label: 'Messages', href: '/chat', badge: o.unread });
  activity.push({ label: 'Ask the assistant', href: '/assistant' });
  if (o.spinOn) activity.push({ label: 'Spin the wheel', href: '/spin' });
  return [{ key: 'Account', items: account }, { key: 'Activity', items: activity }];
}
