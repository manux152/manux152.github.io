import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen, H, T, Btn, Err } from '../components/ui';
import { supabase } from '../lib/supabase';

// Module-level so a remount can't redeem the one-time link twice.
const redeemed = new Map<string, Promise<{ ok: boolean; msg?: string }>>();
const TYPES = ['signup', 'magiclink', 'email'] as const;

export default function ConfirmEmail() {
  const r = useRouter(); const url = Linking.useURL();
  const [state, setState] = useState<'checking' | 'done' | 'failed'>('checking'); const [err, setErr] = useState<string | null>(null);
  const seen = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const href = url ?? (Platform.OS === 'web' ? (globalThis as any).location?.href : null);
      if (!href) return;
      const p = new URLSearchParams((href.split('#')[0].split('?')[1]) ?? '');
      const token = p.get('token_hash'); const type = (TYPES as readonly string[]).includes(p.get('type') ?? '') ? (p.get('type') as typeof TYPES[number]) : 'signup';
      if (!token) { const { data } = await supabase.auth.getSession(); if (data.session) { setState('done'); } else if (seen.current === null) { setState('failed'); setErr('This confirmation link is incomplete. Open the link from your latest email.'); } return; }
      if (seen.current === token) return; seen.current = token;
      if (!redeemed.has(token)) redeemed.set(token, supabase.auth.verifyOtp({ token_hash: token, type }).then(({ error }) => ({ ok: !error, msg: error?.message })));
      const res = await redeemed.get(token)!;
      let ok = res.ok;
      if (!ok) { const { data } = await supabase.auth.getSession(); ok = !!data.session; }   // already confirmed a moment ago
      if (ok) { setState('done'); if (Platform.OS === 'web') (globalThis as any).history?.replaceState?.(null, '', '/confirm-email'); }
      else { setState('failed'); setErr(`This link has expired or was already used. Go to Sign in and try to sign in: you can ask for a new confirmation email there.${res.msg ? ` (${res.msg})` : ''}`); }
    })();
  }, [url]);

  return (
    <Screen><H>{state === 'done' ? 'Email confirmed' : 'Confirming your email'}</H>
      {state === 'checking' ? <T muted>Checking your link…</T> : null}
      {state === 'done' ? (<><T>Thanks, your email is confirmed and you are signed in.</T><Btn title="Continue" onPress={() => r.replace('/')} /></>) : null}
      {state === 'failed' ? <Btn title="Go to sign in" kind="ghost" onPress={() => r.replace('/login')} /> : null}
      <Err msg={err} />
    </Screen>
  );
}
