export type Variant = {
  id: string; label: string; color_name?: string | null; color_hex?: string | null; size_label?: string | null; image_url?: string | null;
  stock: number | null; is_active: boolean; price_delta: number | string;
};
/** Stock rule used everywhere: blank stock = unlimited, 0 or less = sold out. */
export const isSold = (v: { stock: number | null }) => v.stock != null && v.stock <= 0;
export const HEX = /^#[0-9a-f]{6}$/i;
export const safeHex = (h?: string | null) => (h && HEX.test(h) ? h : '#9AA3AE');
export const webUrl = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export type ColorGroup = { key: string; name: string; hex: string; image: string | null; variants: Variant[]; sold: boolean; left: number | null };
export function colorGroups(vs: Variant[]): ColorGroup[] {
  const map = new Map<string, ColorGroup>();
  for (const v of vs) {
    const name = (v.color_name ?? '').trim(); if (!name) continue;
    const key = name.toLowerCase(); let g = map.get(key);
    if (!g) { g = { key, name, hex: safeHex(v.color_hex), image: null, variants: [], sold: true, left: 0 }; map.set(key, g); }
    g.variants.push(v); if (!g.image && webUrl(v.image_url)) g.image = v.image_url!;
    if (!isSold(v)) g.sold = false;
    g.left = g.left == null || v.stock == null ? null : g.left + Math.max(0, v.stock);
  }
  return [...map.values()];
}
export const uncolored = (vs: Variant[]) => vs.filter((v) => !(v.color_name ?? '').trim());
export const productInStock = (p: any) => {
  const vs: Variant[] = (p.product_variants ?? []).filter((v: Variant) => v.is_active);
  return vs.length ? vs.some((v) => !isSold(v)) : !(p.stock != null && p.stock <= 0);
};
/** How many can be bought right now (null = no limit). */
export const availableOf = (p: any, v?: Variant | null) => (v ? v.stock : p.stock) as number | null;

export const COMMON_COLORS = [
  { name: 'Black', hex: '#111111' }, { name: 'White', hex: '#FFFFFF' }, { name: 'Grey', hex: '#8A9099' }, { name: 'Red', hex: '#D32F2F' },
  { name: 'Orange', hex: '#F57C00' }, { name: 'Yellow', hex: '#FBC02D' }, { name: 'Green', hex: '#2E9E5B' }, { name: 'Navy', hex: '#14284B' },
  { name: 'Blue', hex: '#1E88E5' }, { name: 'Sky blue', hex: '#6EC6FF' }, { name: 'Purple', hex: '#7B1FA2' }, { name: 'Pink', hex: '#EC6FA6' },
];
export const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const variantLabel = (color?: string | null, size?: string | null) => [color?.trim(), size?.trim()].filter(Boolean).join(' / ');

/** Percentage off when a product has a "was" price above its price (null when not on sale). */
export const salePct = (p: { price: number | string; compare_at_price?: number | string | null }) => {
  const was = Number(p.compare_at_price ?? 0); const now = Number(p.price);
  return was > now && now >= 0 ? Math.max(1, Math.round((1 - now / was) * 100)) : null;
};
