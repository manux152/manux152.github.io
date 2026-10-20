import { Image as RNImage, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { uploadAsset } from './upload';

// expo-image-manipulator powers rotate / flip / crop / resize. It is loaded optionally so the app still runs if it isn't installed yet
// (install with: npx expo install expo-image-manipulator).
let Manip: any = null;
try { Manip = require('expo-image-manipulator'); } catch { Manip = null; }
export const canEditImages = !!Manip;

export const BRANDING_BUCKET = 'branding';
export const MAX_HERO_SLIDES = 20;
export type Asset = { uri: string; width?: number; height?: number; mimeType?: string };

export const imageSize = (uri: string) => new Promise<{ width: number; height: number }>((res, rej) => RNImage.getSize(uri, (width, height) => res({ width, height }), rej));

export async function pickImages(limit: number): Promise<ImagePicker.ImagePickerAsset[]> {
  if (limit <= 0) return [];
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: limit > 1, selectionLimit: limit, quality: 1 });
  return r.canceled ? [] : r.assets.slice(0, limit);
}

export type EditOp =
  | { type: 'rotate'; deg: 90 | -90 | 180 }
  | { type: 'flip'; dir: 'h' | 'v' }
  | { type: 'crop'; aspect: number; zoom: number; fx: number; fy: number };

/** Applies edits and returns a JPEG (max 1600px wide). Without the manipulator module the image is returned unchanged. */
export async function editImage(uri: string, ops: EditOp[], format: 'jpeg' | 'png' = 'jpeg'): Promise<Asset> {
  const fmt = format === 'png' ? Manip?.SaveFormat?.PNG : Manip?.SaveFormat?.JPEG; const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  if (!Manip) return { uri };
  let cur: Asset = { uri, ...(await imageSize(uri)) };
  for (const op of ops) {
    let actions: any[] = [];
    if (op.type === 'rotate') actions = [{ rotate: op.deg }];
    else if (op.type === 'flip') actions = [{ flip: op.dir === 'h' ? Manip.FlipType.Horizontal : Manip.FlipType.Vertical }];
    else {
      const w = cur.width!, h = cur.height!; let cw: number, ch: number;
      if (w / h > op.aspect) { ch = h; cw = h * op.aspect; } else { cw = w; ch = w / op.aspect; }
      cw = Math.floor(cw / op.zoom); ch = Math.floor(ch / op.zoom);
      actions = [{ crop: { originX: Math.round((w - cw) * op.fx), originY: Math.round((h - ch) * op.fy), width: cw, height: ch } }];
    }
    const out = await Manip.manipulateAsync(cur.uri, actions, { compress: 0.8, format: fmt });
    cur = { uri: out.uri, width: out.width, height: out.height, mimeType };
  }
  if ((cur.width ?? 0) > 1600) {
    const out = await Manip.manipulateAsync(cur.uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: fmt });
    cur = { uri: out.uri, width: out.width, height: out.height, mimeType };
  }
  return { ...cur, mimeType };
}

export type BrandingFolder = 'hero' | 'logo' | 'favicon' | 'nav' | 'header' | 'footer' | 'sticker';
export const uploadBranding = (folder: BrandingFolder, a: Asset) => uploadAsset(BRANDING_BUCKET, folder, a as any);

/** Best-effort delete of a file we uploaded (ignored if the URL points elsewhere). */
export async function removeBranding(url?: string | null) {
  if (!url) return;
  const marker = `/storage/v1/object/public/${BRANDING_BUCKET}/`; const i = url.indexOf(marker); if (i < 0) return;
  try { await supabase.storage.from(BRANDING_BUCKET).remove([decodeURIComponent(url.slice(i + marker.length))]); } catch { /* ignore */ }
}

/** Centre-crops to a square and shrinks to `size` px (for favicons). Without the manipulator module the picture is returned unchanged. */
export async function makeSquareIcon(uri: string, size = 256): Promise<Asset> {
  if (!Manip) return { uri, mimeType: 'image/png' };
  const { width, height } = await imageSize(uri); const side = Math.min(width, height);
  const out = await Manip.manipulateAsync(uri, [
    { crop: { originX: Math.round((width - side) / 2), originY: Math.round((height - side) / 2), width: side, height: side } },
    { resize: { width: Math.min(size, side) } },
  ], { compress: 1, format: Manip.SaveFormat.PNG });
  return { uri: out.uri, width: out.width, height: out.height, mimeType: 'image/png' };
}

/** True when the address is a normal web picture link (https or http). */
export const isWebUrl = (u: string) => /^https?:\/\/[^\s]+$/i.test(u.trim());
/** Checks that a picture link really loads as an image. */
export const checkImageUrl = (u: string) => imageSize(u.trim()).then(() => true, () => false);
export const NEWS_BUCKET = 'news';
export const uploadNewsPicture = (a: Asset) => uploadAsset(NEWS_BUCKET, 'posts', a as any);

// ───────── Videos for the hero slider (stored in the "hero" bucket) ─────────
export const HERO_BUCKET = 'hero';
export const MAX_VIDEO_MB = 50;
export async function pickVideo() {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false, quality: 1 });
  return r.canceled ? null : r.assets[0];
}
export async function uploadHeroVideo(a: ImagePicker.ImagePickerAsset): Promise<string> {
  if (a.fileSize && a.fileSize > MAX_VIDEO_MB * 1048576) throw new Error(`That video is over ${MAX_VIDEO_MB} MB. Trim or compress it first, or paste a link to a video file instead.`);
  const mime = a.mimeType ?? 'video/mp4'; const sub = mime.split('/')[1] ?? 'mp4'; const ext = sub === 'quicktime' ? 'mov' : sub.replace(/[^a-z0-9]/gi, '') || 'mp4';
  const path = `videos/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  let body: any;
  if (Platform.OS === 'web') body = await (await fetch(a.uri)).blob();
  else { body = new FormData(); body.append('file', { uri: a.uri, name: path.split('/').pop(), type: mime } as any); }
  const up = await supabase.storage.from(HERO_BUCKET).upload(path, body, { contentType: mime, cacheControl: '31536000' });
  if (up.error) throw new Error(/bucket not found/i.test(up.error.message) ? 'The video storage is not set up yet. Run migration 018_hero_video.sql in Supabase.' : up.error.message);
  return supabase.storage.from(HERO_BUCKET).getPublicUrl(path).data.publicUrl;
}
/** Best-effort delete of any file we uploaded to one of our buckets (ignored for outside links). */
export async function removeAsset(url?: string | null) {
  if (!url) return; const m = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/); if (!m) return;
  try { await supabase.storage.from(m[1]).remove([decodeURIComponent(m[2])]); } catch { /* ignore */ }
}
