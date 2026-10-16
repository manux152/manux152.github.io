// Turns a pasted video link into something that can play INSIDE the app: a direct video file (played natively) or a provider's embed player.
export type EmbedOpts = { autoplay?: boolean; mute?: boolean; loop?: boolean; controls?: boolean; start?: number; end?: number };
export type EmbedInfo =
  | { kind: 'file' }
  | { kind: 'embed'; provider: string; id: string; aspect: number; src: (o?: EmbedOpts) => string; thumb?: string }
  | { kind: 'link' };

const FILE = /\.(mp4|webm|mov|m4v|m3u8)(\?.*)?$/i;
const q = (o: Record<string, string | number | undefined | false>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== false).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export function embedInfo(raw: string): EmbedInfo {
  const url = (raw ?? '').trim(); if (!/^https?:\/\//i.test(url)) return { kind: 'link' };
  if (FILE.test(url) || url.includes('/storage/v1/object/public/')) return { kind: 'file' };
  let m: RegExpMatchArray | null;
  if ((m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/i))) {
    const id = m[1]; const vertical = /\/shorts\//i.test(url);
    return { kind: 'embed', provider: 'YouTube', id, aspect: vertical ? 9 / 16 : 16 / 9, thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      src: (o = {}) => `https://www.youtube-nocookie.com/embed/${id}?${q({ rel: 0, playsinline: 1, modestbranding: 1, autoplay: o.autoplay ? 1 : undefined, mute: o.mute ? 1 : undefined, controls: o.controls === false ? 0 : undefined, loop: o.loop ? 1 : undefined, playlist: o.loop ? id : undefined, start: o.start ? Math.floor(o.start) : undefined, end: o.end ? Math.floor(o.end) : undefined })}` };
  }
  if ((m = url.match(/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)(?:\/([0-9a-f]+))?/i))) {
    const id = m[1], h = m[2] ?? url.match(/[?&]h=([0-9a-f]+)/i)?.[1];
    return { kind: 'embed', provider: 'Vimeo', id, aspect: 16 / 9, src: (o = {}) => `https://player.vimeo.com/video/${id}?${q({ h, autoplay: o.autoplay ? 1 : undefined, muted: o.mute ? 1 : undefined, loop: o.loop ? 1 : undefined, controls: o.controls === false ? 0 : undefined, playsinline: 1, dnt: 1 })}` };
  }
  if ((m = url.match(/(?:dailymotion\.com\/(?:embed\/)?video\/|dai\.ly\/)([a-z0-9]+)/i))) {
    const id = m[1]; return { kind: 'embed', provider: 'Dailymotion', id, aspect: 16 / 9, src: (o = {}) => `https://www.dailymotion.com/embed/video/${id}?${q({ autoplay: o.autoplay ? 1 : undefined, mute: o.mute ? 1 : undefined, controls: o.controls === false ? 0 : undefined })}` };
  }
  if ((m = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/i))) { const id = m[1]; return { kind: 'embed', provider: 'Google Drive', id, aspect: 16 / 9, src: () => `https://drive.google.com/file/d/${id}/preview` }; }
  if ((m = url.match(/streamable\.com\/(?:e\/)?([a-z0-9]+)/i))) { const id = m[1]; return { kind: 'embed', provider: 'Streamable', id, aspect: 16 / 9, src: (o = {}) => `https://streamable.com/e/${id}?${q({ autoplay: o.autoplay ? 1 : undefined, muted: o.mute ? 1 : undefined, loop: o.loop ? 1 : undefined })}` }; }
  if ((m = url.match(/tiktok\.com\/@[\w.-]+\/video\/(\d+)/i))) { const id = m[1]; return { kind: 'embed', provider: 'TikTok', id, aspect: 9 / 16, src: () => `https://www.tiktok.com/embed/v2/${id}` }; }
  if ((m = url.match(/instagram\.com\/(reel|reels|p|tv)\/([\w-]+)/i))) { const id = m[2]; return { kind: 'embed', provider: 'Instagram', id, aspect: 0.62, src: () => `https://www.instagram.com/${m![1] === 'reels' ? 'reel' : m![1]}/${id}/embed` }; }
  if (/facebook\.com\/.+\/videos\/|facebook\.com\/watch|facebook\.com\/reel\/|fb\.watch\//i.test(url)) {
    return { kind: 'embed', provider: 'Facebook', id: url, aspect: 16 / 9, src: (o = {}) => `https://www.facebook.com/plugins/video.php?${q({ href: url, show_text: 0, autoplay: o.autoplay ? 1 : undefined, mute: o.mute ? 1 : undefined })}` };
  }
  return { kind: 'link' };
}
export const providerName = (url: string) => { const i = embedInfo(url); return i.kind === 'embed' ? i.provider : i.kind === 'file' ? 'Video file' : null; };
