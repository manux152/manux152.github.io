import { mix, readableOn } from './theme';

export type NavPreset = { key: string; label: string; bg: string; bg2: string; text: string; accent: string; border: string };
export const NAV_STYLES = [
  { value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' },
  { value: 'pitch', label: 'Pitch stripes' }, { value: 'image', label: 'Picture' },
];
// "brand" follows the club colour set in Site settings; the others are fixed, classic palettes.
export const NAV_PRESETS: NavPreset[] = [
  { key: 'brand', label: 'Club colours', bg: '#0B6E4F', bg2: '#08503A', text: '#FFFFFF', accent: '#F2C94C', border: 'rgba(255,255,255,0.18)' },
  { key: 'navy', label: 'Navy & gold', bg: '#0F2742', bg2: '#173B63', text: '#F4F1E8', accent: '#D4AF37', border: 'rgba(212,175,55,0.35)' },
  { key: 'midnight', label: 'Midnight', bg: '#111418', bg2: '#1D242C', text: '#F2F4F7', accent: '#5CC8F5', border: 'rgba(255,255,255,0.14)' },
  { key: 'ivory', label: 'Ivory', bg: '#FBF8F1', bg2: '#EEE6D2', text: '#1D2A24', accent: '#0B6E4F', border: '#D9D0BB' },
  { key: 'burgundy', label: 'Burgundy', bg: '#5B1424', bg2: '#7A2236', text: '#FBEFF1', accent: '#E8B76A', border: 'rgba(232,183,106,0.35)' },
  { key: 'forest', label: 'Forest', bg: '#123524', bg2: '#1C4D36', text: '#EAF3EC', accent: '#9BD67A', border: 'rgba(155,214,122,0.3)' },
];

export type NavLook = {
  preset: string; style: string; bg: string; bg2: string; text: string; accent: string; border: string;
  image: string | null; overlay: number; light: boolean; allowPersonalise: boolean;
};
const HEX = /^#[0-9a-f]{6}$/i;
const str = (v: any) => (typeof v === 'string' ? v : null);

/** Works out how the navigation looks: your own choice (Settings) beats the club default (Admin → Navigation look). */
export function resolveNavLook(settings: Record<string, any>, prefs: { navTheme: string; navBg: string; highContrast: boolean }, isDark: boolean): NavLook {
  const allow = settings.nav_allow_personalise !== false && settings.nav_allow_personalise !== 'false';
  const key = allow && prefs.navTheme !== 'site' ? prefs.navTheme : (str(settings.nav_theme) ?? 'brand');
  const base = NAV_PRESETS.find((p) => p.key === key) ?? NAV_PRESETS[0];
  let p = { ...base };
  if (p.key === 'brand') { const c = str(settings.primary_color); if (c && HEX.test(c)) { p.bg = c; p.bg2 = mix(c, '#000000', 0.3); p.text = readableOn(c); } }
  const custom = str(settings.nav_bg_color);
  if (!(allow && prefs.navTheme !== 'site') && custom && HEX.test(custom)) { p.bg = custom; p.bg2 = mix(custom, '#000000', 0.25); p.text = readableOn(custom); p.border = 'rgba(128,128,128,0.35)'; }
  let style = allow && prefs.navBg !== 'site' ? prefs.navBg : (str(settings.nav_bg_style) ?? 'solid');
  const image = str(settings.nav_bg_image) && /^https?:\/\//i.test(settings.nav_bg_image) ? settings.nav_bg_image : null;
  if (style === 'image' && !image) style = 'gradient';
  const overlay = Math.min(0.85, Math.max(0, Number(settings.nav_bg_overlay ?? 0.4) || 0));
  if (prefs.highContrast) return { preset: 'contrast', style: 'solid', bg: isDark ? '#000000' : '#000000', bg2: '#000000', text: '#FFFFFF', accent: '#FFFFFF', border: '#FFFFFF', image: null, overlay: 0, light: false, allowPersonalise: allow };
  const onImage = style === 'image';
  const text = onImage ? '#FFFFFF' : p.text;
  return { preset: p.key, style, bg: p.bg, bg2: p.bg2, text, accent: onImage ? '#FFFFFF' : p.accent, border: onImage ? 'rgba(255,255,255,0.3)' : p.border, image: onImage ? image : null, overlay, light: !onImage && readableOn(p.bg) === '#111111', allowPersonalise: allow };
}

/** Web-only CSS background for gradient / stripes; phones fall back to the solid colour. */
export function webBackground(look: NavLook): any {
  if (look.style === 'gradient') return { backgroundImage: `linear-gradient(135deg, ${look.bg} 0%, ${look.bg2} 100%)` };
  if (look.style === 'pitch') return { backgroundImage: `repeating-linear-gradient(90deg, ${look.bg} 0px, ${look.bg} 56px, ${look.bg2} 56px, ${look.bg2} 112px)` };
  return {};
}
