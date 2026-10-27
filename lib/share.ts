import { Platform, Share } from 'react-native';

type Opts = { url?: string; title?: string };

// Copies text to the clipboard (explicit "Copy" buttons). Returns a short status message.
export async function copyText(message: string): Promise<string> {
  const g: any = globalThis;
  try { await g.navigator.clipboard.writeText(message); return 'Copied to clipboard'; } catch { /* try the older way */ }
  try {
    const ta = g.document.createElement('textarea');
    ta.value = message; ta.style.position = 'fixed'; ta.style.opacity = '0';
    g.document.body.appendChild(ta); ta.select();
    const ok = g.document.execCommand('copy'); ta.remove();
    if (ok) return 'Copied to clipboard';
  } catch { /* fall through */ }
  return 'Could not copy — select and copy manually';
}

// Opens the real share menu: the phone share sheet in the app, and the browser's own share menu on the web
// (Messages, WhatsApp, Mail, AirDrop, etc.). Browsers that have no share menu (e.g. Firefox on desktop) get the text copied instead.
// Pass the page link as `url` (not inside the text) so apps show a proper link preview.
export async function shareText(message: string, opts: Opts = {}): Promise<string | null> {
  const { url, title } = opts;
  if (Platform.OS === 'web') {
    const nav = (globalThis as any).navigator;
    if (nav?.share) {
      const data: any = { text: message };
      if (title) data.title = title;
      if (url) data.url = url;
      try {
        if (!nav.canShare || nav.canShare(data)) { await nav.share(data); return null; }
      } catch (e: any) {
        if (e?.name === 'AbortError') return null;   // person closed the share menu
      }
    }
    const r = await copyText(url && !message.includes(url) ? `${message} ${url}`.trim() : message);
    return r === 'Copied to clipboard' ? 'Copied — your browser has no share menu' : r;
  }
  try {
    const full = url && !message.includes(url) ? `${message} ${url}` : message;
    await Share.share(Platform.OS === 'ios' && url ? { message, url, title } : { message: full, title });
  } catch { /* cancelled */ }
  return null;
}

// Link to a page on the site: uses the site address from settings, otherwise the page the person is on (web).
export function pageLink(siteUrl: unknown, path: string): string | undefined {
  const base = String(siteUrl ?? '').replace(/\/$/, '');
  if (base) return base + path;
  return Platform.OS === 'web' ? (globalThis as any).location?.href : undefined;
}
