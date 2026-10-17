import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen, H, T, Input, Btn, Err } from '../components/ui';
import { supabase } from '../lib/supabase';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { checkPassword, PASSWORD_ERROR } from '../lib/password';

// One-time links must only be redeemed once, even if the screen remounts. Results are remembered per link.
const redeemed = new Map<string, Promise<{ ok: boolean; msg?: string }>>();
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
  const [email, setEmail] = useState(''); const [sent, setSent] = useState<string | null>(null);
  const resend = async () => {
    setErr(null); setSent(null);
    if (!email.trim()) return setErr('Enter your email first.');
    setBusy(true);
    const { error } = await supabase.functions.invoke('password-reset', { body: { email: email.trim() } });
    setBusy(false);
    if (error) return setErr(error.message);
    setSent('If an account exists for that email, we\'ve sent a new link. Use only the newest email, and tap the button once.');
  };

  useEffect(() => {
    (async () => {
      const href = url ?? (Platform.OS === 'web' ? (globalThis as any).location?.href : null);
      if (!href) return;
      const p = readParams(href);
      const key = p.get('token_hash') ?? p.get('code') ?? p.get('access_token') ?? p.get('error_code') ?? '';
      if (key && used.current === key) return;      // a one-time link must only be redeemed once
      if (key) used.current = key;

      if (p.get('error') || p.get('error_code')) { setChecking(false); return setErr(EXPIRED); }

      let ok = false; let detail = '';
      const redeem = (k: string, fn: () => Promise<{ error: any }>) => {
        if (!redeemed.has(k)) redeemed.set(k, fn().then(({ error }) => ({ ok: !error, msg: error?.message })));
        return redeemed.get(k)!;
      };
      if (p.get('token_hash')) {
        // Redeemed here (not by the email app opening the link), so mail scanners can't use it up first.
        const res = await redeem(p.get('token_hash')!, () => supabase.auth.verifyOtp({ token_hash: p.get('token_hash')!, type: 'recovery' }));
        ok = res.ok; detail = res.msg ?? '';
      } else if (p.get('code')) {
        const res = await redeem(p.get('code')!, () => supabase.auth.exchangeCodeForSession(p.get('code')!));
        ok = res.ok; detail = res.msg ?? '';
      } else if (p.get('access_token') && p.get('refresh_token')) {
        const { error } = await supabase.auth.setSession({ access_token: p.get('access_token')!, refresh_token: p.get('refresh_token')! });
        ok = !error; detail = error?.message ?? '';
      } else {
        const { data } = await supabase.auth.getSession();
        ok = !!data.session;
      }
      // If the link was already redeemed a moment ago (second tap / reload) the person is still signed in for recovery: let them continue.
      if (!ok) { const { data } = await supabase.auth.getSession(); if (data.session) ok = true; }
      setChecking(false);
      if (ok) {
        setReady(true); setErr(null);
        if (Platform.OS === 'web') (globalThis as any).history?.replaceState?.(null, '', '/reset-password'); // don't leave the token in the address bar
      } else if (key) setErr(`${EXPIRED}${detail ? ` (${detail})` : ''}`);
    })();
  }, [url]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((e) => { if (e === 'PASSWORD_RECOVERY') { setReady(true); setChecking(false); setErr(null); } });
    return () => sub.subscription.unsubscribe();
  }, []);

  const save = async () => {
    setErr(null);
    if (!checkPassword(pw).valid) return setErr(PASSWORD_ERROR);
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
          {!checking || err ? (<>
            <Input label="Your email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <Btn title="Send me a new link" onPress={resend} disabled={busy} />
            {sent ? <T>{sent}</T> : null}
            <Btn title="Back to sign in" kind="ghost" onPress={() => r.replace('/login')} />
          </>) : null}
        </>
      ) : (<>
        <Input label="New password" secureTextEntry value={pw} onChangeText={setPw} />
        <PasswordChecklist password={pw} />
        <Input label="Repeat new password" secureTextEntry value={pw2} onChangeText={setPw2} />
        {pw2 ? <T style={{ fontSize: 13, color: pw === pw2 ? '#1B7F3B' : '#B3261E', fontWeight: '700' }}>{pw === pw2 ? '✓ Passwords match' : '✗ Passwords do not match'}</T> : null}
        <Btn title="Save password" onPress={save} disabled={busy} />
      </>)}
      <Err msg={err} />
    </Screen>
  );
}
