import { Image as RNImage, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

// Keeps Supabase bandwidth (egress) low on the free plan: photos are shrunk before upload and files are cached by browsers for a year.
// expo-image-manipulator is optional: without it, photos upload unchanged.
let Manip: any = null;
try { Manip = require('expo-image-manipulator'); } catch { Manip = null; }

export const CACHE_1Y = '31536000';          // every uploaded file has a unique name, so long caching is safe
export const MAX_PHOTO_W = 1600;             // plenty sharp for full-screen viewing on phones and laptops
export const THUMB_W = 480;                  // grid thumbnails

const sizeOf = (uri: string) => new Promise<{ width: number; height: number }>((res, rej) => RNImage.getSize(uri, (width, height) => res({ width, height }), rej));
const nameOf = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Re-encodes a picture as a JPEG no wider than `width`. Never enlarges. Returns the original if the manipulator isn't installed. */
export async function shrink(uri: string, width: number, quality: number, knownW?: number): Promise<{ uri: string; mimeType: string; changed: boolean }> {
  if (!Manip) return { uri, mimeType: 'image/jpeg', changed: false };
  const w = knownW ?? (await sizeOf(uri)).width;
  const out = await Manip.manipulateAsync(uri, w > width ? [{ resize: { width } }] : [], { compress: quality, format: Manip.SaveFormat.JPEG });
  return { uri: out.uri, mimeType: 'image/jpeg', changed: true };
}

async function put(bucket: string, path: string, uri: string, mime: string) {
  let body: any;
  if (Platform.OS === 'web') body = await (await fetch(uri)).blob();
  else { body = new FormData(); body.append('file', { uri, name: path.split('/').pop(), type: mime } as any); }
  const up = await supabase.storage.from(bucket).upload(path, body, { contentType: mime, cacheControl: CACHE_1Y });
  if (up.error) throw new Error(up.error.message);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// Uploads a picked image to a storage bucket and returns its public URL. Photos are shrunk first (PNG logos keep their transparency).
export async function uploadAsset(bucket: string, folder: string, a: ImagePicker.ImagePickerAsset): Promise<string> {
  let uri = a.uri; let mime = a.mimeType ?? 'image/jpeg';
  if (mime !== 'image/png' && Manip && !((a.width ?? 99999) <= MAX_PHOTO_W && (a.fileSize ?? 0) < 400000)) {
    const s = await shrink(uri, MAX_PHOTO_W, 0.8, a.width); uri = s.uri; mime = s.mimeType;
  }
  const ext = mime.split('/')[1] === 'png' ? 'png' : mime.split('/')[1] === 'webp' ? 'webp' : 'jpg';
  return put(bucket, `${folder}/${nameOf()}.${ext}`, uri, mime);
}

/** Album photos: uploads a 1600px full version (name ends _f.jpg) and a small 480px thumbnail (_t.jpg) for the grid. */
export async function uploadPhotoWithThumb(bucket: string, folder: string, uri: string, knownW?: number): Promise<string> {
  const base = `${folder}/${nameOf()}`;
  const full = await shrink(uri, MAX_PHOTO_W, 0.8, knownW);
  const url = await put(bucket, `${base}_f.jpg`, full.uri, 'image/jpeg');
  try { const t = await shrink(uri, THUMB_W, 0.7, knownW); await put(bucket, `${base}_t.jpg`, t.uri, 'image/jpeg'); } catch { /* grid falls back to the full photo */ }
  return url;
}

export async function pickImage(square = false) {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: square, aspect: square ? [1, 1] : undefined });
  return res.canceled ? null : res.assets[0];
}
