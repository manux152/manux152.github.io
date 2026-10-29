import { Image as RNImage } from 'react-native';

// expo-image-manipulator does the cropping and shrinking. It is loaded optionally, like in lib/upload.ts.
let Manip: any = null;
try { Manip = require('expo-image-manipulator'); } catch { Manip = null; }

export const LEADER_PHOTO_SIZE = 600;   // every leadership photo is saved at exactly this many pixels wide and high

const sizeOf = (uri: string) => new Promise<{ width: number; height: number }>((res, rej) => RNImage.getSize(uri, (width, height) => res({ width, height }), rej));

/** Crops a picture to a square and shrinks it to exactly size × size pixels (JPEG), so every photo ends up identical in size.
 *  Portrait photos are cropped a little above the middle so faces stay in the picture. Without the manipulator module the picture is returned unchanged. */
export async function makeUniformPhoto(uri: string, size = LEADER_PHOTO_SIZE): Promise<{ uri: string; width?: number; height?: number; mimeType: string }> {
  if (!Manip) return { uri, mimeType: 'image/jpeg' };
  const { width, height } = await sizeOf(uri); const side = Math.min(width, height);
  const out = await Manip.manipulateAsync(uri, [
    { crop: { originX: Math.round((width - side) / 2), originY: Math.round((height - side) * (height > width ? 0.2 : 0.5)), width: side, height: side } },
    { resize: { width: size, height: size } },
  ], { compress: 0.82, format: Manip.SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height, mimeType: 'image/jpeg' };
}
