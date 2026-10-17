import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen, H, T, Input, Btn, Err } from '../components/ui';
import { supabase } from '../lib/supabase';

const EXPIRED = 'This link has expired or was already used. Go back to Sign in and tap “Forgot password?” to get a new one.';

// Pulls whatever the email link carried: ?token_hash=…  (our email), ?code=… (PKCE), #access_token=… (older style) or an error.
function readParams(url: string) {
  const out = new URLSearchParams();
  const [beforeHash, hash = ''] = url.split('#');
  const q = beforeHash.split('?')[1] ?? '';
  new URLSearchParams(q).forEach((v, k) => out.set(k, v));
  new URLSearchParams(hash).forEach((v, k) => out.set(k, v));
  return out;
}

export default function ResetPassword() {
  const r = useRouter();
  const url = Linking.useURL();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const used = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const href = url ?? (Platform.OS === 'web' ? (globalThis as any).location?.href : null);
      if (!href) return;
      const p = readParams(href);
      const key = p.get('token_hash') ?? p.get('code') ?? p.get('access_token') ?? p.get('error_code') ?? '';
      if (key && used.current === key) return;      // a one-time link must only be redeemed once
      if (key) used.current = key;

      if (p.get('error') || p.get('error_code')) { setChecking(false); return setErr(EXPIRED); }

      let ok = false;
      if (p.get('token_hash')) {
        // Redeemed here (not by the email app opening the link), so mail scanners can't use it up first.
        const { error } = await supabase.auth.verifyOtp({ token_hash: p.get('token_hash')!, type: 'recovery' });
        ok = !error;
      } else if (p.get('code')) {
        const { error } = await supabase.auth.exchangeCodeForSession(p.get('code')!);
        ok = !error;
      } else if (p.get('access_token') && p.get('refresh_token')) {
        const { error } = await supabase.auth.setSession({ access_token: p.get('access_token')!, refresh_token: p.get('refresh_token')! });
        ok = !error;
      } else {
        const { data } = await supabase.auth.getSession();
        ok = !!data.session;
      }
      setChecking(false);
      if (ok) {
        setReady(true); setErr(null);
        if (Platform.OS === 'web') (globalThis as any).history?.replaceState?.(null, '', '/reset-password'); // don't leave the token in the address bar
      } else if (key) setErr(EXPIRED);
    })();
  }, [url]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((e) => { if (e === 'PASSWORD_RECOVERY') { setReady(true); setChecking(false); setErr(null); } });
    return () => sub.subscription.unsubscribe();
  }, []);

  const save = async () => {
    setErr(null);
    if (pw.length < 8) return setErr('Use at least 8 characters.');
    if (pw !== pw2) return setErr('The two passwords do not match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    supabase.functions.invoke('send-email', { body: { self_notice: 'password_changed' } }).catch(() => {});
    r.replace('/');
  };

  return (
    <Screen><H>Choose a new password</H>
      {!ready ? (
        <>
          <T muted>{checking && !err ? 'Checking your reset link…' : 'Open the reset link from your latest reset email. If it doesn’t work, request a new one from the sign-in screen.'}</T>
          {!checking || err ? <Btn title="Back to sign in" kind="ghost" onPress={() => r.replace('/login')} /> : null}
        </>
      ) : (<>
        <Input label="New password" secureTextEntry value={pw} onChangeText={setPw} />
        <Input label="Repeat new password" secureTextEntry value={pw2} onChangeText={setPw2} />
        <Btn title="Save password" onPress={save} disabled={busy} />
      </>)}
      <Err msg={err} />
    </Screen>
  );
}
