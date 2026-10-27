import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useApp } from '../lib/app-context';
import { supabase } from '../lib/supabase';
import { IDLE_KEY, LAST_ACTIVE_KEY } from '../lib/device';
import { T } from './ui';

let last = Date.now(); let lastWrite = 0;
/** Call on any tap, key press or mouse move. */
export function markActive() {
  const now = Date.now(); last = now;
  if (now - lastWrite > 5000) { lastWrite = now; AsyncStorage.setItem(LAST_ACTIVE_KEY, String(now)).catch(() => {}); }
}

/** Signs the person out after the number of idle minutes set in Admin → Security (0 = off). Shows a countdown for the last minute. */
export function IdleLogout() {
  const { session, settings } = useApp(); const router = useRouter();
  const mins = Number(settings.idle_logout_minutes ?? 10);
  const limit = Number.isFinite(mins) && mins > 0 ? Math.min(mins, 1440) * 60000 : 0;
  const warn = Math.min(60000, limit / 2);
  const [left, setLeft] = useState<number | null>(null);
  const started = useRef(false); const busy = useRef(false);

  const expire = async () => {
    if (busy.current) return; busy.current = true;
    try { await AsyncStorage.setItem(IDLE_KEY, String(Math.round(limit / 60000))); await AsyncStorage.removeItem(LAST_ACTIVE_KEY); await supabase.auth.signOut({ scope: 'local' }); } catch { /* already signed out */ }
    setLeft(null); router.replace('/login'); setTimeout(() => { busy.current = false; }, 2000);
  };

  // Opening the app after being away longer than the limit signs out straight away.
  useEffect(() => {
    if (started.current) return; started.current = true;
    AsyncStorage.getItem(LAST_ACTIVE_KEY).then((v) => { if (session && limit && v && Date.now() - Number(v) > limit) expire(); else markActive(); }).catch(() => markActive());
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!session || !limit) { setLeft(null); if (!session) AsyncStorage.removeItem(LAST_ACTIVE_KEY).catch(() => {}); return; }
    markActive();
    const onAct = () => markActive();
    const w: any = Platform.OS === 'web' ? globalThis : null;
    const evs = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart'];
    if (w?.addEventListener) evs.forEach((e) => w.addEventListener(e, onAct, { passive: true, capture: true }));
    let n = 0;
    const tick = async () => {
      if (n++ % 5 === 0) { let shared = 0; try { shared = Number(await AsyncStorage.getItem(LAST_ACTIVE_KEY)) || 0; } catch { /* ignore */ } if (shared > last) last = shared; }   // activity in another tab counts too
      const idle = Date.now() - last;
      if (idle >= limit) expire(); else setLeft(limit - idle <= warn ? Math.ceil((limit - idle) / 1000) : null);
    };
    const id = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') tick(); });
    return () => { clearInterval(id); sub.remove(); if (w?.removeEventListener) evs.forEach((e) => w.removeEventListener(e, onAct, { capture: true })); };
  }, [session, limit]); // eslint-disable-line

  if (left == null || !session) return null;
  return (
    <View accessibilityLiveRegion="assertive" accessibilityRole="alert" pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: 16, zIndex: 1000, alignItems: 'center' }}>
      <View style={{ backgroundColor: '#1F2937', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, maxWidth: 420, width: '100%', gap: 8 }}>
        <T style={{ color: '#fff', fontWeight: '700' }}>You'll be signed out in {left} seconds because you've been inactive.</T>
        <Pressable accessibilityRole="button" onPress={() => { markActive(); setLeft(null); }} style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}><T style={{ color: '#111', fontWeight: '800' }}>Stay signed in</T></Pressable>
      </View>
    </View>
  );
}
