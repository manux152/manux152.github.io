// Grid thumbnail for a photo. New album photos are saved as "<name>_f.jpg" (full) plus "<name>_t.jpg" (small, ~480px, ~40 KB).
// Older photos have no small copy, so they are returned unchanged (use Admin → Photos & videos → "Shrink existing photos" once to give them one).
// Note: Supabase's on-the-fly image resizer is a paid (Pro) feature, so this deliberately does not use it.
export function thumbUrl(url: string): string {
  return /_f\.jpg$/i.test(url) ? url.replace(/_f\.jpg$/i, '_t.jpg') : url;
}
