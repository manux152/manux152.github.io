import { createElement, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useApp } from '../lib/app-context';
import { useTheme } from '../lib/theme';

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (loading) return loading;
  loading = new Promise<void>((res, rej) => {
    const g: any = globalThis;
    if (g.turnstile) return res();
    const s = g.document.createElement('script');
    s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => res();
    s.onerror = () => { loading = null; rej(new Error('Could not load the CAPTCHA')); };
    g.document.head.appendChild(s);
  });
  return loading;
}

/**
 * Cloudflare Turnstile "I am not a robot" check (website only). The public site key comes from site_settings.turnstile_site_key;
 * with no key set, nothing is shown. Calls onToken with the one-time token (or '' when it expires or fails).
 * A token works once, so give the component a new `key` after each submit to get a fresh check.
 */
export function Turnstile({ onToken, action }: { onToken: (t: string) => void; action?: string }) {
  const { settings } = useApp(); const { isDark } = useTheme();
  const siteKey = typeof settings.turnstile_site_key === 'string' ? settings.turnstile_site_key.trim() : '';
  const box = useRef<any>(null); const widget = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !siteKey || !box.current) return;
    let dead = false;
    load().then(() => {
      if (dead || !box.current) return;
      widget.current = (globalThis as any).turnstile.render(box.current, {
        sitekey: siteKey, action, theme: isDark ? 'dark' : 'light',
        callback: (t: string) => onToken(t), 'expired-callback': () => onToken(''), 'error-callback': () => onToken(''),
      });
    }).catch(() => onToken(''));
    return () => { dead = true; try { if (widget.current != null) (globalThis as any).turnstile.remove(widget.current); } catch { /* ignore */ } };
  }, [siteKey]);   // eslint-disable-line
  if (Platform.OS !== 'web' || !siteKey) return null;
  return createElement('div', { ref: box, style: { minHeight: 65 } });
}
