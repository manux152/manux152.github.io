import { Platform } from 'react-native';
import { cssFilter, fitBox, Slide } from './slides';

/** Web only: draws the picture with the slide's fit / zoom / move / rotate / flip / filters into a new JPEG (default 16:9). */
export const canBake = Platform.OS === 'web' && typeof document !== 'undefined';

export async function bakeSlide(slide: Slide, brand: string, aspect = 16 / 9, width = 1920): Promise<{ uri: string; mimeType: string; filtersApplied: boolean }> {
  if (!canBake) throw new Error('Applying edits permanently is available in the web admin.');
  const blob = await (await fetch(slide.url)).blob(); const bmp = await createImageBitmap(blob);
  const W = width, H = Math.round(width / aspect); const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!; const supportsFilter = 'filter' in ctx;
  const fit = slide.fit ?? 'cover'; const rot = slide.rotate ?? 0; const { bw, bh } = fitBox(W, H, bmp.width, bmp.height, rot, fit);
  // background behind the picture
  ctx.fillStyle = slide.bg === 'white' ? '#ffffff' : slide.bg === 'brand' ? brand : '#000000'; ctx.fillRect(0, 0, W, H);
  if (slide.bg === 'blur' && supportsFilter) { const c = fitBox(W, H, bmp.width, bmp.height, 0, 'cover'); (ctx as any).filter = 'blur(30px)'; ctx.drawImage(bmp, (W - c.bw) / 2, (H - c.bh) / 2, c.bw, c.bh); (ctx as any).filter = 'none'; }
  const f = cssFilter(slide.fx); if (f && supportsFilter) (ctx as any).filter = f;
  ctx.save();
  ctx.translate(W / 2 + (slide.panX ?? 0) * (W / 2), H / 2 + (slide.panY ?? 0) * (H / 2));
  ctx.rotate((rot * Math.PI) / 180); const z = slide.zoom ?? 1; ctx.scale((slide.flipH ? -1 : 1) * z, (slide.flipV ? -1 : 1) * z);
  ctx.drawImage(bmp, -bw / 2, -bh / 2, bw, bh); ctx.restore();
  const out: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the picture'))), 'image/jpeg', 0.92));
  return { uri: URL.createObjectURL(out), mimeType: 'image/jpeg', filtersApplied: !f || supportsFilter };
}
