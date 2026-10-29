// Groups for the admin panel and dashboard, used by the search / sort / filter bar.
export const CATEGORY_ORDER = ['My area', 'People', 'Matches & team', 'Content', 'Shop', 'Communication', 'Site design', 'Reports & logs', 'Other'] as const;
const GROUPS: Record<string, string[]> = {
  'My area': ['profile', 'orders-me', 'training', 'formations', 'calendar', 'settings-me', 'family-me', 'rotas-me', 'development-me', 'predictor-me', 'invite-me'],
  People: ['users', 'roles', 'security', 'registrations', 'codes', 'players', 'staff', 'playerPrivate', 'families', 'consents', 'registrationFields', 'tryouts', 'tryoutFields', 'positions'],
  'Matches & team': ['coach', 'tactics', 'matches', 'opponents', 'competitions', 'apiProviders', 'seasons', 'events', 'eventTypes', 'trainingSessions', 'awards', 'awardTypes', 'attendance', 'live', 'match-report', 'ratings', 'development', 'kit', 'rotas'],
  Content: ['news', 'media', 'albums', 'announcements', 'pages', 'about', 'hero', 'website', 'header-footer', 'sponsors', 'sponsor-report', 'ads', 'ad-report', 'seo', 'seoPages', 'legal', 'legal-evidence', 'polls', 'video'],
  Shop: ['inventory', 'promotions', 'spin', 'orders', 'payments', 'fees', 'products', 'productCategories', 'paymentProviders'],
  Communication: ['newsletters', 'fans', 'comments', 'referrals', 'assistant', 'chat', 'notifications', 'email-send', 'email-log', 'email-design', 'emailTemplates', 'notificationRules'],
  'Site design': ['branding', 'nav-appearance', 'favicon', 'settings', 'nav'],
  'Reports & logs': ['season-report', 'analytics', 'export', 'audit'],
};
const PERSONAL: Record<string, string> = { '/profile': 'profile', '/orders': 'orders-me', '/training': 'training', '/formations': 'formations', '/calendar': 'calendar', '/settings': 'settings-me', '/family': 'family-me', '/rotas': 'rotas-me', '/development': 'development-me', '/predictor': 'predictor-me', '/invite': 'invite-me' };
const LOOKUP = new Map(Object.entries(GROUPS).flatMap(([g, keys]) => keys.map((k) => [k, g] as const)));

/** Which group a screen belongs to, from its address (/admin/inventory, /admin/manage/products, /profile …). */
export function categoryOf(href: string): string {
  if (PERSONAL[href]) return LOOKUP.get(PERSONAL[href]) ?? 'My area';
  const m = href.match(/^\/admin\/manage\/([^/]+)/); const key = m ? m[1] : href.replace(/^\/admin\/?/, '').split('/')[0];
  return LOOKUP.get(key) ?? 'Other';
}

export type SortKey = 'group' | 'az' | 'za' | 'waiting';
export function sortAndFilter<T>(items: T[], o: { query: string; sort: SortKey; category: string; title: (t: T) => string; text?: (t: T) => string; cat: (t: T) => string; waiting?: (t: T) => number; onlyWaiting?: boolean }): T[] {
  const q = o.query.trim().toLowerCase();
  let out = items.filter((t) => (o.category === 'all' || o.cat(t) === o.category) && (!q || `${o.title(t)} ${o.text?.(t) ?? ''}`.toLowerCase().includes(q)) && (!o.onlyWaiting || (o.waiting?.(t) ?? 0) > 0));
  const az = (a: T, b: T) => o.title(a).localeCompare(o.title(b), undefined, { sensitivity: 'base' });
  if (o.sort === 'az') out = [...out].sort(az);
  else if (o.sort === 'za') out = [...out].sort((a, b) => az(b, a));
  else if (o.sort === 'group') out = [...out].sort((a, b) => CATEGORY_ORDER.indexOf(o.cat(a) as any) - CATEGORY_ORDER.indexOf(o.cat(b) as any));   // stable: keeps the original order inside each group
  else if (o.sort === 'waiting') out = [...out].sort((a, b) => (o.waiting?.(b) ?? 0) - (o.waiting?.(a) ?? 0) || az(a, b));
  return out;
}
