// Hero slider slides: pictures AND videos, with non-destructive edits (fit, zoom, move, rotate, flip, filters, trim, speed…).
export type Fx = { brightness?: number; contrast?: number; saturate?: number; grayscale?: number; sepia?: number; blur?: number; hue?: number };
export type Slide = {
  url: string; alt?: string; caption?: string; link?: string; focus?: 'top' | 'center' | 'bottom'; dim?: number;
  kind?: 'image' | 'video';
  fit?: 'cover' | 'contain';                 // cover = fill the banner (crops); contain = show the whole picture
  zoom?: number; panX?: number; panY?: number; // 0.5–3, and -1..1 of half the banner
  rotate?: 0 | 90 | 180 | 270; flipH?: boolean; flipV?: boolean;
  fx?: Fx; bg?: 'black' | 'white' | 'blur' | 'brand';
  original?: string;                         // picture before "apply permanently", so it can be restored
  poster?: string; mute?: boolean; loop?: boolean; start?: number; end?: number; speed?: number; // video only
};

export const FX_DEFAULT: Required<Fx> = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0, hue: 0 };
export const FX_RANGE: Record<keyof Fx, { label: string; min: number; max: number; step: number; unit: string }> = {
  brightness: { label: 'Brightness', min: 40, max: 200, step: 10, unit: '%' },
  contrast: { label: 'Contrast', min: 40, max: 200, step: 10, unit: '%' },
  saturate: { label: 'Colour strength', min: 0, max: 250, step: 10, unit: '%' },
  grayscale: { label: 'Black & white', min: 0, max: 100, step: 10, unit: '%' },
  sepia: { label: 'Warm / sepia tone', min: 0, max: 100, step: 10, unit: '%' },
  blur: { label: 'Soften (blur)', min: 0, max: 10, step: 1, unit: 'px' },
  hue: { label: 'Colour shift', min: -180, max: 180, step: 15, unit: '°' },
};
export const FX_PRESETS: { key: string; label: string; fx: Fx }[] = [
  { key: 'none', label: 'Original', fx: {} },
  { key: 'vivid', label: 'Vivid', fx: { saturate: 140, contrast: 110 } },
  { key: 'warm', label: 'Warm', fx: { sepia: 25, saturate: 120, brightness: 105 } },
  { key: 'cool', label: 'Cool', fx: { hue: -15, saturate: 110, brightness: 102 } },
  { key: 'bw', label: 'Black & white', fx: { grayscale: 100, contrast: 110 } },
  { key: 'sepia', label: 'Sepia', fx: { sepia: 80 } },
  { key: 'vintage', label: 'Vintage', fx: { sepia: 35, contrast: 90, brightness: 105, saturate: 85 } },
  { key: 'fade', label: 'Faded', fx: { contrast: 85, brightness: 110, saturate: 80 } },
  { key: 'drama', label: 'Dramatic', fx: { contrast: 135, brightness: 90, saturate: 110 } },
  { key: 'soft', label: 'Soft glow', fx: { blur: 2, brightness: 105 } },
];
export const fxFull = (fx?: Fx): Required<Fx> => ({ ...FX_DEFAULT, ...(fx ?? {}) });
export const fxIsDefault = (fx?: Fx) => (Object.keys(FX_DEFAULT) as (keyof Fx)[]).every((k) => fxFull(fx)[k] === FX_DEFAULT[k]);
export const activePreset = (fx?: Fx) => FX_PRESETS.find((p) => (Object.keys(FX_DEFAULT) as (keyof Fx)[]).every((k) => fxFull(p.fx)[k] === fxFull(fx)[k]))?.key ?? null;
/** CSS filter text (also used when baking onto a canvas). Undefined when nothing is changed. */
export const cssFilter = (fx?: Fx): string | undefined => {
  if (fxIsDefault(fx)) return undefined; const f = fxFull(fx);
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) blur(${f.blur}px) hue-rotate(${f.hue}deg)`;
};
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const VIDEO_EXT = /\.(mp4|webm|mov|m4v|m3u8)(\?.*)?$/i;
export const isWeb = (u?: string | null) => !!u && /^https?:\/\//i.test(u);

/** Size of the (unrotated) picture box so that, after rotating, it covers / fits the banner. */
export function fitBox(cw: number, ch: number, iw: number, ih: number, rotate: number, fit: 'cover' | 'contain') {
  const swap = rotate === 90 || rotate === 270; const vw = swap ? ih : iw, vh = swap ? iw : ih;
  const s = fit === 'cover' ? Math.max(cw / vw, ch / vh) : Math.min(cw / vw, ch / vh);
  return { bw: iw * s, bh: ih * s, s };
}

const num = (v: any, d: number, lo: number, hi: number) => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : d);
/** Cleans a slide read from settings or about to be saved (drops unknown or default values). */
export function cleanSlide(s: any): Slide | null {
  if (!s || !isWeb(s.url)) return null;
  const out: Slide = { url: s.url };
  if (typeof s.alt === 'string' && s.alt.trim()) out.alt = s.alt.trim();
  if (typeof s.caption === 'string' && s.caption.trim()) out.caption = s.caption.trim();
  if (typeof s.link === 'string' && s.link.trim()) out.link = s.link.trim();
  out.focus = s.focus === 'top' || s.focus === 'bottom' ? s.focus : 'center';
  out.dim = num(s.dim, 40, 0, 80);
  if (s.kind === 'video') out.kind = 'video';
  if (s.fit === 'contain') out.fit = 'contain';
  const zoom = num(s.zoom, 1, 0.5, 3); if (zoom !== 1) out.zoom = Math.round(zoom * 100) / 100;
  const px = num(s.panX, 0, -1, 1), py = num(s.panY, 0, -1, 1); if (px) out.panX = Math.round(px * 100) / 100; if (py) out.panY = Math.round(py * 100) / 100;
  if ([90, 180, 270].includes(s.rotate)) out.rotate = s.rotate;
  if (s.flipH) out.flipH = true; if (s.flipV) out.flipV = true;
  if (s.fx && typeof s.fx === 'object' && !fxIsDefault(s.fx)) { const f = fxFull(s.fx); const fx: Fx = {}; (Object.keys(FX_DEFAULT) as (keyof Fx)[]).forEach((k) => { const v = clamp(Number(f[k]), FX_RANGE[k].min, FX_RANGE[k].max); if (v !== FX_DEFAULT[k]) fx[k] = v; }); out.fx = fx; }
  if (['black', 'white', 'blur', 'brand'].includes(s.bg)) out.bg = s.bg;
  if (isWeb(s.original)) out.original = s.original;
  if (isWeb(s.poster)) out.poster = s.poster;
  if (out.kind === 'video') {
    if (s.mute === false) out.mute = false; if (s.loop) out.loop = true;
    const st = num(s.start, 0, 0, 36000), en = num(s.end, 0, 0, 36000); if (st > 0) out.start = Math.round(st * 10) / 10; if (en > st && en > 0) out.end = Math.round(en * 10) / 10;
    const sp = num(s.speed, 1, 0.25, 3); if (sp !== 1) out.speed = sp;
  }
  return out;
}
