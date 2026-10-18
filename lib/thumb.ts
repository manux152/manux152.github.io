// Small, compressed copy of a picture for grids. The ORIGINAL file is never touched or replaced:
// the grid shows this light version, the full-screen viewer always loads the untouched original.
// Works for pictures stored in Supabase Storage (uses its image resizer); any other URL is returned as-is.
export function thumbUrl(url: string, width = 480, quality = 70): string {
  const marker = '/storage/v1/object/public/';
  const i = url.indexOf(marker);
  if (i < 0) return url;
  const base = url.slice(0, i) + '/storage/v1/render/image/public/' + url.slice(i + marker.length).split('?')[0];
  return `${base}?width=${width}&quality=${quality}&resize=cover`;
}
