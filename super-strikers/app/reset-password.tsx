import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen, H, T, Input, Btn, Err } from '../components/ui';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const r = useRouter();
  const url = Linking.useURL();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (url && url.includes('access_token')) {
        const frag = url.includes('#') ? url.split('#')[1] : (url.split('?')[1] ?? '');
        const p = new URLSearchParams(frag);
        const at = p.get('access_token'), rt = p.get('refresh_token');
        if (at && rt) {
          const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
          return error ? setErr('This link has expired or was already used. Please request a new one.') : setReady(true);
        }
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) setReady(true);
    })();
  }, [url]);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((e) => { if (e === 'PASSWORD_RECOVERY') setReady(true); });
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
      {!ready ? <T muted>Open the reset link from your email on this device. If it doesn't work, request a new one from the sign-in screen.</T> : (<>
        <Input label="New password" secureTextEntry value={pw} onChangeText={setPw} />
        <Input label="Repeat new password" secureTextEntry value={pw2} onChangeText={setPw2} />
        <Btn title="Save password" onPress={save} disabled={busy} />
      </>)}
      <Err msg={err} />
    </Screen>
  );
}
