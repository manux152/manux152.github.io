import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { Card, T, Btn, Err } from './ui';
import { supabase } from '../lib/supabase';
import { passkeysSupported, passkeyError } from '../lib/passkey';
import { translate } from '../lib/i18n';

const ask = (title: string, msg: string, ok: string) => new Promise<boolean>((res) => {
  if (Platform.OS === 'web') return res(window.confirm(`${translate(title)}\n\n${translate(msg)}`));
  Alert.alert(translate(title), translate(msg), [{ text: translate('Cancel'), style: 'cancel', onPress: () => res(false) }, { text: translate(ok), style: 'destructive', onPress: () => res(true) }]);
});

/** Optional biometric sign-in (Face ID, fingerprint, Windows Hello). Each device you add can sign in without typing a password. */
export function PasskeyCard() {
  const [list, setList] = useState<{ id: string; friendly_name?: string | null; created_at?: string }[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const pk = (supabase.auth as any).passkey;

  const load = useCallback(async () => { try { const { data } = await pk.list(); setList(data ?? []); } catch { setList([]); } }, []);
  useEffect(() => { if (passkeysSupported()) load(); }, [load]);
  if (!passkeysSupported()) return null;

  const add = async () => {
    setErr(null); setMsg(null); setBusy(true);
    try { const { error } = await (supabase.auth as any).registerPasskey(); if (error) throw error; setMsg('Done. Next time, tap "Sign in with Face ID / fingerprint" on the sign-in page.'); await load(); }
    catch (e: any) { setErr(passkeyError(e)); }
    setBusy(false);
  };
  const remove = async (id: string) => {
    if (!(await ask('Remove this device?', 'It will no longer be able to sign in with Face ID or fingerprint. Your password still works.', 'Remove'))) return;
    setErr(null); try { await pk.delete({ passkeyId: id }); await load(); } catch (e: any) { setErr(e?.message ?? 'Could not remove it'); }
  };

  return (
    <Card>
      <T style={{ fontWeight: '700' }}>Face ID / fingerprint sign-in</T>
      <T muted>Sign in with your face, fingerprint or device PIN instead of typing a password. Add each phone or computer you use.</T>
      {list.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <T>{p.friendly_name || 'This device'}{p.created_at ? ` · ${new Date(p.created_at).toLocaleDateString()}` : ''}</T>
          <Btn title="Remove" kind="ghost" onPress={() => remove(p.id)} />
        </View>
      ))}
      <Btn title={list.length ? 'Add another device' : 'Set up Face ID / fingerprint'} onPress={add} disabled={busy} />
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
    </Card>
  );
}
