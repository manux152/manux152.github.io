import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useApp } from '../lib/app-context';

/** Web only: links the app manifest (so the site can be installed) and registers the offline service worker. */
export function PwaSetup() {
  const { settings } = useApp();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const d = (globalThis as any).document; const n = (globalThis as any).navigator; if (!d || !n) return;
    if (!d.querySelector('link[rel="manifest"]')) { const l = d.createElement('link'); l.rel = 'manifest'; l.href = '/manifest.webmanifest'; d.head.appendChild(l); }
    if ('serviceWorker' in n && (globalThis as any).location?.hostname !== 'localhost') n.serviceWorker.register('/sw.js').catch(() => {});   // not while developing
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const d = (globalThis as any).document; if (!d) return;
    let m = d.querySelector('meta[name="theme-color"]'); if (!m) { m = d.createElement('meta'); m.name = 'theme-color'; d.head.appendChild(m); }
    m.content = typeof settings.primary_color === 'string' ? settings.primary_color : '#0B6E4F';
  }, [settings.primary_color]);
  return null;
}
