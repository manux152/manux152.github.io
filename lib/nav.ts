// Tab files that exist in app/(tabs). Any other visible nav item appears under "More".
export const TAB_ROUTES = ['/', '/matches', '/table', '/news', '/players', '/stats', '/media', '/calendar', '/awards', '/tryouts', '/shop'];

export function splitNav(nav: any[], can: (p: string) => boolean, max: number) {
  const visible = nav.filter((n) => n.is_visible && (!n.required_permission || can(n.required_permission)));
  const tabs = visible.filter((n) => TAB_ROUTES.includes(n.route)).slice(0, max);
  const ids = new Set(tabs.map((n) => n.id));
  return { tabs, more: visible.filter((n) => !ids.has(n.id)) };
}
