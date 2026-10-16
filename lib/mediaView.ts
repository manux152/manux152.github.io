// Shared filter / sort for albums and the photos & videos inside them.
export type MediaType = 'all' | 'image' | 'video';
export type ItemSort = 'newest' | 'oldest' | 'az' | 'za';
export type AlbumSort = ItemSort | 'most';
export const ITEM_SORTS = [{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'az', label: 'Caption A → Z' }, { value: 'za', label: 'Caption Z → A' }];
export const ALBUM_SORTS = [{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'az', label: 'Title A → Z' }, { value: 'za', label: 'Title Z → A' }, { value: 'most', label: 'Most items' }];
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
const time = (d?: string | null) => (d ? new Date(d).getTime() : 0);

export function filterItems<T extends { kind: string; caption?: string | null }>(items: T[], type: MediaType, q: string): T[] {
  const t = q.trim().toLowerCase();
  return items.filter((m) => (type === 'all' || m.kind === type) && (!t || String(m.caption ?? '').toLowerCase().includes(t)));
}
export function sortItems<T extends { caption?: string | null; created_at?: string | null; sort_order?: number }>(items: T[], sort: ItemSort): T[] {
  const out = [...items];
  if (sort === 'oldest') out.sort((a, b) => time(a.created_at) - time(b.created_at));
  else if (sort === 'az' || sort === 'za') out.sort((a, b) => { const x = String(a.caption ?? ''), y = String(b.caption ?? ''); if (!x !== !y) return x ? -1 : 1; return sort === 'az' ? byText(x, y) : byText(y, x); });   // pictures without a caption go last
  else out.sort((a, b) => time(b.created_at) - time(a.created_at));
  return out;
}
export function sortAlbums<T extends { title: string; created_at?: string | null }>(albums: T[], sort: AlbumSort, count: (a: T) => number): T[] {
  const out = [...albums];
  if (sort === 'oldest') out.sort((a, b) => time(a.created_at) - time(b.created_at));
  else if (sort === 'az') out.sort((a, b) => byText(a.title, b.title));
  else if (sort === 'za') out.sort((a, b) => byText(b.title, a.title));
  else if (sort === 'most') out.sort((a, b) => count(b) - count(a) || byText(a.title, b.title));
  else out.sort((a, b) => time(b.created_at) - time(a.created_at));
  return out;
}
