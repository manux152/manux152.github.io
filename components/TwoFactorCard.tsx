import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { Image } from 'expo-image';
import { Card, T, Btn, Input, Err } from './ui';
import { supabase } from '../lib/supabase';
import { translate } from '../lib/i18n';

const ask = (title: string, msg: string, ok: string) => new Promise<boolean>((res) => {
  if (Platform.OS === 'web') return res(window.confirm(`${translate(title)}\n\n${translate(msg)}`));
  Alert.alert(translate(title), translate(msg), [{ text: translate('Cancel'), style: 'cancel', onPress: () => res(false) }, { text: translate(ok), style: 'destructive', onPress: () => res(true) }]);
});

/** Optional two-step sign-in (authenticator app). Anyone can turn it on or off from their Account page. */
export function TwoFactorCard() {
  const [factorId, setFactorId] = useState<string | null>(null);          // the verified factor, when 2FA is on
  const [setup, setSetup] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp?.find((f) => f.status === 'verified')?.id ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setErr(null); setMsg(null); setBusy(true);
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of (all?.all ?? []).filter((x) => x.factor_type === 'totp' && x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id }); // clear half-finished setups
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Super Strikers ${Date.now()}` });
    setBusy(false);
    if (error || !data) return setErr(error?.message ?? 'Could not start 2FA setup.');
    setSetup({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret }); setCode('');
  };
  const confirm = async () => {
    if (!setup) return; setErr(null); setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.id, code: code.replace(/\s/g, '') });
    setBusy(false);
    if (error) return setErr(/invalid|expired/i.test(error.message) ? 'That code is not right. Check your authenticator app and try the newest code.' : error.message);
    setSetup(null); setCode(''); setMsg('Two-step sign-in is on. You will be asked for a code each time you sign in.'); load();
  };
  const cancel = async () => { if (setup) await supabase.auth.mfa.unenroll({ factorId: setup.id }); setSetup(null); setCode(''); setErr(null); };
  const turnOff = async () => {
    if (!factorId) return; setErr(null);
    if (!(await ask('Turn off two-step sign-in?', 'Your account will be protected by your password only.', 'Turn off'))) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return setErr(error.message);
    setMsg('Two-step sign-in is off.'); load();
  };

  return (
    <Card>
      <T style={{ fontWeight: '700' }}>Two-step sign-in (2FA)</T>
      {setup ? (
        <View style={{ gap: 10 }}>
          <T muted>1. Open an authenticator app (Google Authenticator, Authy, Microsoft Authenticator, 1Password). 2. Scan this code, or type the key below. 3. Enter the 6-digit number it shows.</T>
          <View style={{ alignSelf: 'center', backgroundColor: '#fff', padding: 8, borderRadius: 10 }}>
            <Image source={{ uri: setup.qr }} accessibilityLabel="QR code for your authenticator app" style={{ width: 180, height: 180 }} contentFit="contain" />
          </View>
          <T selectable style={{ fontSize: 13, textAlign: 'center' }}>Key: {setup.secret}</T>
          <Input label="6-digit code" keyboardType="number-pad" maxLength={7} autoComplete="one-time-code" value={code} onChangeText={setCode} />
          <Btn title="Turn on 2FA" onPress={confirm} disabled={busy || code.replace(/\s/g, '').length < 6} />
          <Btn title="Cancel" kind="ghost" onPress={cancel} />
        </View>
      ) : factorId ? (
        <><T>✓ On. You enter a 6-digit code from your authenticator app when you sign in.</T><Btn title="Turn off 2FA" kind="ghost" onPress={turnOff} /></>
      ) : (
        <><T muted>Optional. Adds a 6-digit code from your phone when you sign in, so a stolen password alone is not enough.</T><Btn title="Set up 2FA" onPress={start} disabled={busy} /></>
      )}
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
    </Card>
  );
}
