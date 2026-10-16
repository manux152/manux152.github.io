import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useApp } from '../lib/app-context';

/** Web only: swaps the browser-tab icon for the picture chosen in Admin → Favicon. */
export function Favicon() {
  const { settings } = useApp();
  const url = typeof settings.favicon_url === 'string' && /^https?:\/\//i.test(settings.favicon_url) ? settings.favicon_url : null;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !url) return;
    document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((n) => n.parentNode?.removeChild(n));
    const add = (rel: string) => { const l = document.createElement('link'); l.rel = rel; l.href = url; document.head.appendChild(l); };
    add('icon'); add('apple-touch-icon');
  }, [url]);
  return null;
}
